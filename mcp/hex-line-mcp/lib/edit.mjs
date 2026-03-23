/**
 * Hash-verified file editing with diff output.
 *
 * Supports:
 * - set_line / replace_lines / insert_after / replace_between
 * - dry_run preview, noop detection, diff output
 * - optional revision-aware conservative auto-rebase
 */

import { statSync, writeFileSync } from "node:fs";
import { diffLines } from "diff";
import { fnv1a, lineTag, parseChecksum, parseRef, rangeChecksum } from "@levnikolaevich/hex-common/text-protocol/hash";
import { validatePath, normalizePath } from "./security.mjs";
import { getGraphDB, callImpact, getRelativePath } from "./graph-enrich.mjs";
import {
    buildRangeChecksum,
    computeChangedRanges,
    describeChangedRanges,
    getSnapshotByRevision,
    overlapsChangedRanges,
    readSnapshot,
    rememberSnapshot,
} from "./revisions.mjs";

/**
 * Restore indentation from original lines onto replacement lines.
 * Preserves relative indentation structure while matching the anchor's indent level.
 */
function restoreIndent(origLines, newLines) {
    if (!origLines.length || !newLines.length) return newLines;
    const origIndent = origLines[0].match(/^\s*/)[0];
    const newIndent = newLines[0].match(/^\s*/)[0];
    if (origIndent === newIndent) return newLines;
    return newLines.map(line => {
        if (!line.trim()) return line;
        if (line.startsWith(newIndent)) return origIndent + line.slice(newIndent.length);
        return line;
    });
}

/**
 * Build hash-annotated snippet around a position for error or conflict messages.
 */
function buildErrorSnippet(lines, centerIdx, radius = 5) {
    const start = Math.max(0, centerIdx - radius);
    const end = Math.min(lines.length, centerIdx + radius + 1);
    const text = lines.slice(start, end).map((line, i) => {
        const num = start + i + 1;
        const tag = lineTag(fnv1a(line));
        return `${tag}.${num}\t${line}`;
    }).join("\n");
    return { start: start + 1, end, text };
}

/**
 * Find line by tag.lineNum reference with fuzzy matching (+-5 lines).
 * Falls back to global hash relocation via hashIndex before throwing.
 */
function findLine(lines, lineNum, expectedTag, hashIndex) {
    const idx = lineNum - 1;
    if (idx < 0 || idx >= lines.length) {
        const center = idx >= lines.length ? lines.length - 1 : 0;
        const snip = buildErrorSnippet(lines, center);
        throw new Error(
            `Line ${lineNum} out of range (1-${lines.length}).\n\n` +
            `Current content (lines ${snip.start}-${snip.end}):\n${snip.text}\n\n` +
            `Tip: Use updated hashes above for retry.`
        );
    }

    const actual = lineTag(fnv1a(lines[idx]));
    if (actual === expectedTag) return idx;

    for (let d = 1; d <= 5; d++) {
        for (const off of [d, -d]) {
            const c = idx + off;
            if (c >= 0 && c < lines.length && lineTag(fnv1a(lines[c])) === expectedTag) return c;
        }
    }

    const stripped = lines[idx].replace(/\s+/g, "");
    if (stripped.length > 0) {
        for (let j = Math.max(0, idx - 5); j <= Math.min(lines.length - 1, idx + 5); j++) {
            if (lines[j].replace(/\s+/g, "") === stripped && lineTag(fnv1a(lines[j])) === expectedTag) return j;
        }
    }

    const CONFUSABLE_RE = /[\u2010\u2011\u2012\u2013\u2014\u2212\uFE63\uFF0D]/g;
    const norm = t => t.replace(CONFUSABLE_RE, "-");
    const normalizedExpected = norm(expectedTag);
    for (let i = Math.max(0, idx - 10); i <= Math.min(lines.length - 1, idx + 10); i++) {
        const normalizedActual = norm(lineTag(fnv1a(norm(lines[i]))));
        if (normalizedActual === normalizedExpected) return i;
    }

    if (hashIndex) {
        const relocated = hashIndex.get(expectedTag);
        if (relocated !== undefined) return relocated;
    }

    const snip = buildErrorSnippet(lines, idx);
    throw new Error(
        `HASH_MISMATCH: line ${lineNum} expected ${expectedTag}, got ${actual}.\n\n` +
        `Current content (lines ${snip.start}-${snip.end}):\n${snip.text}\n\n` +
        `Tip: Use updated hashes above for retry.`
    );
}

/**
 * Context diff via `diff` package (Myers O(ND) algorithm).
 * Returns compact hunks with ±ctx context lines, or null if no changes.
 */
export function simpleDiff(oldLines, newLines, ctx = 3) {
    const oldText = oldLines.join("\n") + "\n";
    const newText = newLines.join("\n") + "\n";
    const parts = diffLines(oldText, newText);

    const out = [];
    let oldNum = 1, newNum = 1;
    let lastChange = false;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const lines = part.value.replace(/\n$/, "").split("\n");

        if (part.added || part.removed) {
            for (const line of lines) {
                if (part.removed) { out.push(`-${oldNum}| ${line}`); oldNum++; }
                else { out.push(`+${newNum}| ${line}`); newNum++; }
            }
            lastChange = true;
        } else {
            const next = i < parts.length - 1 && (parts[i + 1].added || parts[i + 1].removed);
            if (lastChange || next) {
                let start = 0, end = lines.length;
                if (!lastChange) start = Math.max(0, end - ctx);
                if (!next && end - start > ctx) end = start + ctx;
                if (start > 0) { out.push("..."); oldNum += start; newNum += start; }
                for (let k = start; k < end; k++) {
                    out.push(` ${oldNum}| ${lines[k]}`);
                    oldNum++; newNum++;
                }
                if (end < lines.length) {
                    out.push("...");
                    oldNum += lines.length - end;
                    newNum += lines.length - end;
                }
            } else {
                oldNum += lines.length;
                newNum += lines.length;
            }
            lastChange = false;
        }
    }
    return out.length ? out.join("\n") : null;
}

function verifyChecksumAgainstSnapshot(snapshot, rc) {
    const { start, end, hex } = parseChecksum(rc);
    const actual = buildRangeChecksum(snapshot, start, end);
    if (!actual) return { ok: false, actual: null, start, end };
    return { ok: actual.split(":")[1] === hex, actual, start, end };
}

function buildConflictMessage({
    filePath,
    reason,
    revision,
    fileChecksum,
    lines,
    centerIdx,
    changedRanges,
    retryChecksum,
    details,
}) {
    const safeCenter = Math.max(0, Math.min(lines.length - 1, centerIdx));
    const snip = buildErrorSnippet(lines, safeCenter);
    let msg =
        `status: CONFLICT\n` +
        `reason: ${reason}\n` +
        `revision: ${revision}\n` +
        `file: ${fileChecksum}`;
    if (changedRanges) msg += `\nchanged_ranges: ${describeChangedRanges(changedRanges)}`;
    if (retryChecksum) msg += `\nretry_checksum: ${retryChecksum}`;
    msg += `\n\n${details}\n\nCurrent content (lines ${snip.start}-${snip.end}):\n${snip.text}`;
    msg += `\n\nTip: Retry from the fresh local snippet above.`;
    if (filePath) msg += `\npath: ${filePath}`;
    return msg;
}

function targetRangeForReplaceBetween(startIdx, endIdx, boundaryMode) {
    if (boundaryMode === "exclusive") {
        return { start: startIdx + 2, end: Math.max(startIdx + 1, endIdx) };
    }
    return { start: startIdx + 1, end: endIdx + 1 };
}

/**
 * Apply edits to a file.
 *
 * @param {string} filePath
 * @param {Array} edits - parsed edit objects
 * @param {object} opts - { dryRun, restoreIndent, baseRevision, conflictPolicy }
 * @returns {string} result message with diff
 */
export function editFile(filePath, edits, opts = {}) {
    filePath = normalizePath(filePath);
    const real = validatePath(filePath);
    const currentSnapshot = readSnapshot(real);
    const baseSnapshot = opts.baseRevision ? getSnapshotByRevision(opts.baseRevision) : null;
    const hasBaseSnapshot = !!(baseSnapshot && baseSnapshot.path === real);
    const staleRevision = !!opts.baseRevision && opts.baseRevision !== currentSnapshot.revision;
    const changedRanges = staleRevision && hasBaseSnapshot
        ? computeChangedRanges(baseSnapshot.lines, currentSnapshot.lines)
        : [];
    const conflictPolicy = opts.conflictPolicy || "conservative";

    const original = currentSnapshot.content;
    const lines = [...currentSnapshot.lines];
    const origLines = [...currentSnapshot.lines];
    const hadTrailingNewline = original.endsWith("\n");
    const hashIndex = currentSnapshot.uniqueTagIndex;
    let autoRebased = false;

    const anchored = [];
    for (const e of edits) {
        if (e.set_line || e.replace_lines || e.insert_after || e.replace_between) anchored.push(e);
        else if (e.replace) throw new Error("REPLACE_REMOVED: replace is no longer supported in edit_file. Use set_line/replace_lines for single edits, bulk_replace tool for rename/refactor.");
        else throw new Error(`BAD_INPUT: unknown edit type: ${JSON.stringify(e)}`);
    }

    const editTargets = [];
    for (const e of anchored) {
        if (e.set_line) {
            const line = parseRef(e.set_line.anchor).line;
            editTargets.push({ start: line, end: line });
        } else if (e.replace_lines) {
            const s = parseRef(e.replace_lines.start_anchor).line;
            const en = parseRef(e.replace_lines.end_anchor).line;
            editTargets.push({ start: s, end: en });
        } else if (e.insert_after) {
            const line = parseRef(e.insert_after.anchor).line;
            editTargets.push({ start: line, end: line, insert: true });
        } else if (e.replace_between) {
            const s = parseRef(e.replace_between.start_anchor).line;
            const en = parseRef(e.replace_between.end_anchor).line;
            editTargets.push({ start: s, end: en });
        }
    }
    for (let i = 0; i < editTargets.length; i++) {
        for (let j = i + 1; j < editTargets.length; j++) {
            const a = editTargets[i], b = editTargets[j];
            if (a.insert || b.insert) continue;
            if (a.start <= b.end && b.start <= a.end) {
                throw new Error(
                    `OVERLAPPING_EDITS: lines ${a.start}-${a.end} and ${b.start}-${b.end} overlap. ` +
                    `Split into separate edit_file calls.`
                );
            }
        }
    }

    const sorted = anchored.map((e) => {
        let sortKey;
        if (e.set_line) sortKey = parseRef(e.set_line.anchor).line;
        else if (e.replace_lines) sortKey = parseRef(e.replace_lines.start_anchor).line;
        else if (e.insert_after) sortKey = parseRef(e.insert_after.anchor).line;
        else if (e.replace_between) sortKey = parseRef(e.replace_between.start_anchor).line;
        return { ...e, _k: sortKey };
    }).sort((a, b) => b._k - a._k);

    const conflictIfNeeded = (reason, centerIdx, retryChecksum, details) => {
        if (conflictPolicy !== "conservative") {
            throw new Error(details);
        }
        return buildConflictMessage({
            filePath,
            reason,
            revision: currentSnapshot.revision,
            fileChecksum: currentSnapshot.fileChecksum,
            lines,
            centerIdx,
            changedRanges: staleRevision && hasBaseSnapshot ? changedRanges : null,
            retryChecksum,
            details,
        });
    };

    const locateOrConflict = (ref, reason = "stale_anchor") => {
        try {
            return findLine(lines, ref.line, ref.tag, hashIndex);
        } catch (e) {
            if (conflictPolicy !== "conservative" || !staleRevision) throw e;
            const centerIdx = Math.max(0, Math.min(lines.length - 1, ref.line - 1));
            return conflictIfNeeded(reason, centerIdx, null, e.message);
        }
    };

    const ensureRevisionContext = (actualStart, actualEnd, centerIdx) => {
        if (!staleRevision || conflictPolicy !== "conservative") return null;
        if (!hasBaseSnapshot) {
            return conflictIfNeeded(
                "base_revision_evicted",
                centerIdx,
                null,
                `Base revision ${opts.baseRevision} is not available in the local revision cache.`
            );
        }
        if (overlapsChangedRanges(changedRanges, actualStart, actualEnd)) {
            return conflictIfNeeded(
                "overlap",
                centerIdx,
                null,
                `Changes since ${opts.baseRevision} overlap edit range ${actualStart}-${actualEnd}.`
            );
        }
        autoRebased = true;
        return null;
    };

    for (const e of sorted) {
        if (e.set_line) {
            const { tag, line } = parseRef(e.set_line.anchor);
            const idx = locateOrConflict({ tag, line });
            if (typeof idx === "string") return idx;
            const conflict = ensureRevisionContext(idx + 1, idx + 1, idx);
            if (conflict) return conflict;

            const txt = e.set_line.new_text;
            if (!txt && txt !== 0) {
                lines.splice(idx, 1);
            } else {
                const origLine = [lines[idx]];
                const raw = String(txt).split("\n");
                const newLines = opts.restoreIndent ? restoreIndent(origLine, raw) : raw;
                lines.splice(idx, 1, ...newLines);
            }
            continue;
        }

        if (e.insert_after) {
            const { tag, line } = parseRef(e.insert_after.anchor);
            const idx = locateOrConflict({ tag, line });
            if (typeof idx === "string") return idx;
            const conflict = ensureRevisionContext(idx + 1, idx + 1, idx);
            if (conflict) return conflict;

            let insertLines = e.insert_after.text.split("\n");
            if (opts.restoreIndent) insertLines = restoreIndent([lines[idx]], insertLines);
            lines.splice(idx + 1, 0, ...insertLines);
            continue;
        }

        if (e.replace_lines) {
            const s = parseRef(e.replace_lines.start_anchor);
            const en = parseRef(e.replace_lines.end_anchor);
            const si = locateOrConflict(s);
            if (typeof si === "string") return si;
            const ei = locateOrConflict(en);
            if (typeof ei === "string") return ei;
            const actualStart = si + 1;
            const actualEnd = ei + 1;
            const rc = e.replace_lines.range_checksum;
            if (!rc) throw new Error("range_checksum required for replace_lines. Read the range first via read_file, then pass its checksum.");

            if (staleRevision && conflictPolicy === "conservative") {
                const conflict = ensureRevisionContext(actualStart, actualEnd, si);
                if (conflict) return conflict;
                const baseCheck = hasBaseSnapshot ? verifyChecksumAgainstSnapshot(baseSnapshot, rc) : null;
                if (!baseCheck?.ok) {
                    return conflictIfNeeded(
                        "stale_checksum",
                        si,
                        baseCheck?.actual || null,
                        baseCheck?.actual
                            ? `Provided checksum ${rc} does not match base revision ${opts.baseRevision}.`
                            : `Checksum range from ${rc} is outside the available base revision.`
                    );
                }
            } else {
                const { start: csStart, end: csEnd, hex: csHex } = parseChecksum(rc);
                if (csStart > actualStart || csEnd < actualEnd) {
                    const snip = buildErrorSnippet(origLines, actualStart - 1);
                    throw new Error(
                        `CHECKSUM_RANGE_GAP: range ${csStart}-${csEnd} does not cover edit range ${actualStart}-${actualEnd}.\n\n` +
                        `Current content (lines ${snip.start}-${snip.end}):\n${snip.text}\n\n` +
                        `Tip: Use updated hashes above for retry.`
                    );
                }
                const actual = buildRangeChecksum(currentSnapshot, csStart, csEnd);
                const actualHex = actual?.split(":")[1];
                if (!actual || csHex !== actualHex) {
                    const details =
                        `CHECKSUM_MISMATCH: expected ${rc}, got ${actual}. File changed — re-read lines ${csStart}-${csEnd}.`;
                    if (conflictPolicy === "conservative") {
                        return conflictIfNeeded("stale_checksum", csStart - 1, actual, details);
                    }
                    const snip = buildErrorSnippet(origLines, csStart - 1);
                    throw new Error(
                        `${details}\n\n` +
                        `Current content (lines ${snip.start}-${snip.end}):\n${snip.text}\n\n` +
                        `Retry with fresh checksum ${actual}, or use set_line with hashes above.`
                    );
                }
            }

            const txt = e.replace_lines.new_text;
            if (!txt && txt !== 0) {
                lines.splice(si, ei - si + 1);
            } else {
                const origRange = lines.slice(si, ei + 1);
                let newLines = String(txt).split("\n");
                if (opts.restoreIndent) newLines = restoreIndent(origRange, newLines);
                lines.splice(si, ei - si + 1, ...newLines);
            }
            continue;
        }

        if (e.replace_between) {
            const boundaryMode = e.replace_between.boundary_mode || "inclusive";
            if (boundaryMode !== "inclusive" && boundaryMode !== "exclusive") {
                throw new Error(`BAD_INPUT: replace_between boundary_mode must be inclusive or exclusive, got ${boundaryMode}`);
            }
            const s = parseRef(e.replace_between.start_anchor);
            const en = parseRef(e.replace_between.end_anchor);
            const si = locateOrConflict(s);
            if (typeof si === "string") return si;
            const ei = locateOrConflict(en);
            if (typeof ei === "string") return ei;
            if (si > ei) {
                throw new Error(`BAD_INPUT: replace_between start anchor resolves after end anchor (${si + 1} > ${ei + 1})`);
            }

            const targetRange = targetRangeForReplaceBetween(si, ei, boundaryMode);
            const conflict = ensureRevisionContext(targetRange.start, targetRange.end, si);
            if (conflict) return conflict;

            const txt = e.replace_between.new_text;
            let newLines = String(txt ?? "").split("\n");
            const sliceStart = boundaryMode === "exclusive" ? si + 1 : si;
            const removeCount = boundaryMode === "exclusive" ? Math.max(0, ei - si - 1) : (ei - si + 1);
            const origRange = lines.slice(sliceStart, sliceStart + removeCount);
            if (opts.restoreIndent && origRange.length > 0) newLines = restoreIndent(origRange, newLines);
            if (txt === "" || txt === null) newLines = [];
            lines.splice(sliceStart, removeCount, ...newLines);
        }
    }

    let content = lines.join("\n");
    if (hadTrailingNewline && !content.endsWith("\n")) content += "\n";
    if (!hadTrailingNewline && content.endsWith("\n")) content = content.slice(0, -1);

    if (original === content) {
        throw new Error("NOOP_EDIT: File already contains the desired content. No changes needed.");
    }

    let diff = simpleDiff(origLines, content.split("\n"));
    if (diff && diff.length > 80000) {
        diff = diff.slice(0, 80000) + `\n... (diff truncated, ${diff.length} chars total)`;
    }

    if (opts.dryRun) {
        let msg = `status: ${autoRebased ? "AUTO_REBASED" : "OK"}\nrevision: ${currentSnapshot.revision}\nfile: ${currentSnapshot.fileChecksum}\nDry run: ${filePath} would change (${content.split("\n").length} lines)`;
        if (staleRevision && hasBaseSnapshot) msg += `\nchanged_ranges: ${describeChangedRanges(changedRanges)}`;
        if (diff) msg += `\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``;
        return msg;
    }

    writeFileSync(real, content, "utf-8");
    const nextStat = statSync(real);
    const nextSnapshot = rememberSnapshot(real, content, { mtimeMs: nextStat.mtimeMs, size: nextStat.size });
    let msg =
        `status: ${autoRebased ? "AUTO_REBASED" : "OK"}\n` +
        `revision: ${nextSnapshot.revision}\n` +
        `file: ${nextSnapshot.fileChecksum}`;
    if (autoRebased && staleRevision && hasBaseSnapshot) {
        msg += `\nchanged_ranges: ${describeChangedRanges(changedRanges)}`;
    }
    msg += `\nUpdated ${filePath} (${content.split("\n").length} lines)`;
    if (diff) msg += `\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``;

    try {
        const db = getGraphDB(real);
        const relFile = db ? getRelativePath(real) : null;
        if (db && relFile && diff) {
            const diffLinesOut = diff.split("\n");
            let minLine = Infinity, maxLine = 0;
            for (const dl of diffLinesOut) {
                const m = dl.match(/^[+-](\d+)\|/);
                if (m) {
                    const n = +m[1];
                    if (n < minLine) minLine = n;
                    if (n > maxLine) maxLine = n;
                }
            }
            if (minLine <= maxLine) {
                const affected = callImpact(db, relFile, minLine, maxLine);
                if (affected.length > 0) {
                    const list = affected.map(a => `${a.name} (${a.file}:${a.line})`).join(", ");
                    msg += `\n\n⚠ Call impact: ${affected.length} callers in other files\n  ${list}`;
                }
            }
        }
    } catch { /* silent */ }

    const newLinesAll = content.split("\n");
    if (diff) {
        const diffArr = diff.split("\n");
        let minLine = Infinity, maxLine = 0;
        for (const dl of diffArr) {
            const m = dl.match(/^[+-](\d+)\|/);
            if (m) {
                const n = +m[1];
                if (n < minLine) minLine = n;
                if (n > maxLine) maxLine = n;
            }
        }
        if (minLine <= maxLine) {
            const ctxStart = Math.max(0, minLine - 6);
            const ctxEnd = Math.min(newLinesAll.length, maxLine + 5);
            const ctxLines = [];
            const ctxHashes = [];
            for (let i = ctxStart; i < ctxEnd; i++) {
                const h = fnv1a(newLinesAll[i]);
                ctxHashes.push(h);
                ctxLines.push(`${lineTag(h)}.${i + 1}\t${newLinesAll[i]}`);
            }
            const ctxCs = rangeChecksum(ctxHashes, ctxStart + 1, ctxEnd);
            msg += `\n\nPost-edit (lines ${ctxStart + 1}-${ctxEnd}):\n${ctxLines.join("\n")}\nchecksum: ${ctxCs}`;
        }
    }

    return msg;
}
