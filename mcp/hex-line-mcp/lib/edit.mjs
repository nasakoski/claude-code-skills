/**
 * Hash-verified file editing with diff output.
 *
 * Supports:
 * - Range-based: range "ab.12-cd.15" + checksum
 * - Anchor-based: set_line, replace_lines, insert_after
 * - Text-based: replace { old_text, new_text, all }
 * - dry_run preview, noop detection, diff output
 */

import { writeFileSync } from "node:fs";
import { diffLines } from "diff";
import { fnv1a, lineTag, rangeChecksum, parseChecksum, parseRef } from "./hash.mjs";
import { validatePath, normalizePath } from "./security.mjs";
import { getGraphDB, blastRadius, getRelativePath } from "./graph-enrich.mjs";
import { readText } from "./format.mjs";

// Unicode characters visually similar to ASCII hyphen-minus (U+002D)
const CONFUSABLE_HYPHENS = /[\u2010\u2011\u2012\u2013\u2014\u2212\uFE63\uFF0D]/g;

/**
 * Normalize confusable unicode hyphens to ASCII hyphen-minus.
 */
function normalizeConfusables(text) {
    return text.replace(CONFUSABLE_HYPHENS, "-");
}

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
        if (!line.trim()) return line; // skip empty lines
        if (line.startsWith(newIndent)) return origIndent + line.slice(newIndent.length);
        return line;
    });
}

/**
 * Build hash-annotated snippet around a position for error messages.
 * @param {string[]} lines - file lines
 * @param {number} centerIdx - 0-based center index
 * @param {number} radius - lines before/after center (default 5)
 * @returns {{ start: number, end: number, text: string }}
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
 * Build a hash index of all lines, keeping only unique tags.
 * 2-char tags have collisions — duplicates are excluded to avoid wrong relocations.
 * @param {string[]} lines
 * @returns {Map<string, number>} tag → line index (0-based)
 */
function buildHashIndex(lines) {
    const hashIndex = new Map();
    const duplicates = new Set();
    for (let i = 0; i < lines.length; i++) {
        const tag = lineTag(fnv1a(lines[i]));
        if (duplicates.has(tag)) continue;
        if (hashIndex.has(tag)) { hashIndex.delete(tag); duplicates.add(tag); continue; }
        hashIndex.set(tag, i);
    }
    return hashIndex;
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

    // Fuzzy: search +-5
    for (let d = 1; d <= 5; d++) {
        for (const off of [d, -d]) {
            const c = idx + off;
            if (c >= 0 && c < lines.length && lineTag(fnv1a(lines[c])) === expectedTag) return c;
        }
    }

    // Whitespace-tolerant
    const stripped = lines[idx].replace(/\s+/g, "");
    if (stripped.length > 0) {
        for (let j = Math.max(0, idx - 5); j <= Math.min(lines.length - 1, idx + 5); j++) {
            if (lines[j].replace(/\s+/g, "") === stripped && lineTag(fnv1a(lines[j])) === expectedTag) return j;
        }
    }

    // Confusable normalization: try matching after normalizing unicode hyphens
    const normalizedExpected = normalizeConfusables(expectedTag);
    for (let i = Math.max(0, idx - 10); i <= Math.min(lines.length - 1, idx + 10); i++) {
        const normalizedActual = normalizeConfusables(lineTag(fnv1a(normalizeConfusables(lines[i]))));
        if (normalizedActual === normalizedExpected) return i;
    }

    // Global hash relocation: search entire file via pre-built unique-tag index
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
                if (start > 0) { out.push(`...`); oldNum += start; newNum += start; }
                for (let k = start; k < end; k++) {
                    out.push(` ${oldNum}| ${lines[k]}`);
                    oldNum++; newNum++;
                }
                if (end < lines.length) {
                    out.push(`...`);
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

/**
 * Find the longest common substring between two strings.
 * Returns { pos, len } — position in `haystack` and length of match.
 */
function longestCommonSubstring(haystack, needle) {
    if (!haystack || !needle) return { pos: 0, len: 0 };
    const h = haystack, n = needle;
    let bestLen = 0, bestPos = 0;
    // Sliding window: for each start in needle, check match lengths in haystack
    // Use suffix approach limited to first 200 chars of needle for performance
    const sample = n.slice(0, 200);
    for (let i = 0; i < h.length && bestLen < sample.length; i++) {
        let len = 0;
        for (let j = 0; j < sample.length && i + len < h.length; j++) {
            if (h[i + len] === sample[j]) { len++; } else { if (len > bestLen) { bestLen = len; bestPos = i; } len = 0; }
        }
        if (len > bestLen) { bestLen = len; bestPos = i; }
    }
    return { pos: bestPos, len: bestLen };
}

/**
 * Build a snippet of ~10 lines around a character position in normalized content.
 */
function buildSnippet(norm, charPos) {
    const lines = norm.split("\n");
    // Find which line the charPos falls on
    let cumulative = 0;
    let targetLine = 0;
    for (let i = 0; i < lines.length; i++) {
        cumulative += lines[i].length + 1; // +1 for \n
        if (cumulative > charPos) { targetLine = i; break; }
    }
    const half = 5;
    const start = Math.max(0, targetLine - half);
    const end = Math.min(lines.length, start + 10);
    const snippetLines = [];
    for (let i = start; i < end; i++) {
        const tag = lineTag(fnv1a(lines[i]));
        snippetLines.push(`${tag}.${i + 1}\t${lines[i]}`);
    }
    return { start: start + 1, end, text: snippetLines.join("\n") };
}

/**
 * Fuzzy text replacement.
 */
function textReplace(content, oldText, newText, all) {
    const norm = content.replace(/\r\n/g, "\n");
    const normOld = oldText.replace(/\r\n/g, "\n");
    const normNew = newText.replace(/\r\n/g, "\n");

    if (!all) {
        // Uniqueness check: count occurrences
        const parts = norm.split(normOld);
        const count = parts.length - 1;
        if (count === 0) {
            // Fall through to TEXT_NOT_FOUND below
        } else if (count === 1) {
            // Unique match — safe to replace single occurrence
            return parts.join(normNew);
        } else {
            throw new Error(
                `AMBIGUOUS_MATCH: "${normOld.slice(0, 80)}" found ${count} times. ` +
                `Use all:true to replace all, or use set_line/replace_lines for a specific occurrence.`
            );
        }
    }
    let idx = norm.indexOf(normOld);
    let confusableMatch = false;
    if (idx === -1) {
        // Confusable normalization: try matching after normalizing unicode hyphens
        const normContent = normalizeConfusables(norm);
        const normSearch = normalizeConfusables(normOld);
        const confIdx = normContent.indexOf(normSearch);
        if (confIdx !== -1) {
            idx = confIdx;
            confusableMatch = true;
        } else {
            const { pos, len } = longestCommonSubstring(norm, normOld);
            const anchor = len > 3 ? pos : Math.floor(norm.length / 2);
            const snip = buildSnippet(norm, anchor);
            throw new Error(
                `TEXT_NOT_FOUND: "${normOld.slice(0, 100)}..." not found.\n\n` +
                `Nearest content (lines ${snip.start}-${snip.end}):\n${snip.text}\n\n` +
                `Tip: Use hashes above for anchor-based edit, or adjust old_text.`
            );
        }
    }

    // Determine the match length in original content (same as normOld.length for both paths)
    const matchLen = normOld.length;

    if (confusableMatch) {
        // Replace all via normalized matching
        const normContent = normalizeConfusables(norm);
        const normSearch = normalizeConfusables(normOld);
        let result = "";
        let pos = 0;
        let searchIdx = normContent.indexOf(normSearch, pos);
        while (searchIdx !== -1) {
            result += norm.slice(pos, searchIdx) + normNew;
            pos = searchIdx + matchLen;
            searchIdx = normContent.indexOf(normSearch, pos);
        }
        result += norm.slice(pos);
        return result;
    }
    return norm.split(normOld).join(normNew);
}


/**
 * Apply edits to a file.
 *
 * @param {string} filePath
 * @param {Array} edits - parsed edit objects
 * @param {object} opts - { dryRun }
 * @returns {string} result message with diff
 */
export function editFile(filePath, edits, opts = {}) {
    filePath = normalizePath(filePath);
    const real = validatePath(filePath);
    const original = readText(real);
    const lines = original.split("\n");
    const origLines = [...lines];
    const hadTrailingNewline = original.endsWith("\n");

    // Build hash index once for global relocation in findLine
    const hashIndex = buildHashIndex(lines);

    // Separate anchor edits from text-replace edits
    const anchored = [];
    const texts = [];

    for (const e of edits) {
        if (e.set_line || e.replace_lines || e.insert_after) anchored.push(e);
        else if (e.replace) texts.push(e);
        else throw new Error(`BAD_INPUT: unknown edit type: ${JSON.stringify(e)}`);
    }

    // Overlap validation: reject duplicate/overlapping edit targets
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
        }
    }
    for (let i = 0; i < editTargets.length; i++) {
        for (let j = i + 1; j < editTargets.length; j++) {
            const a = editTargets[i], b = editTargets[j];
            if (a.insert || b.insert) continue; // insert_after doesn't overlap
            if (a.start <= b.end && b.start <= a.end) {
                throw new Error(
                    `OVERLAPPING_EDITS: lines ${a.start}-${a.end} and ${b.start}-${b.end} overlap. ` +
                    `Split into separate edit_file calls.`
                );
            }
        }
    }

    // Sort anchor edits bottom-to-top
    const sorted = anchored.map((e) => {
        let sortKey;
        if (e.set_line) sortKey = parseRef(e.set_line.anchor).line;
        else if (e.replace_lines) sortKey = parseRef(e.replace_lines.start_anchor).line;
        else if (e.insert_after) sortKey = parseRef(e.insert_after.anchor).line;
        return { ...e, _k: sortKey };
    }).sort((a, b) => b._k - a._k);

    // Apply anchor edits
    for (const e of sorted) {
        if (e.set_line) {
            const { tag, line } = parseRef(e.set_line.anchor);
            const idx = findLine(lines, line, tag, hashIndex);
            const txt = e.set_line.new_text;
            if (!txt && txt !== 0) {
                lines.splice(idx, 1);
            } else {
                const origLine = [lines[idx]];
                const raw = String(txt).split("\n");
                const newLines = opts.restoreIndent ? restoreIndent(origLine, raw) : raw;
                lines.splice(idx, 1, ...newLines);
            }
        } else if (e.replace_lines) {
            const s = parseRef(e.replace_lines.start_anchor);
            const en = parseRef(e.replace_lines.end_anchor);
            const si = findLine(lines, s.line, s.tag, hashIndex);
            const ei = findLine(lines, en.line, en.tag, hashIndex);

            // Range checksum verification (mandatory)
            const rc = e.replace_lines.range_checksum;
            if (!rc) throw new Error("range_checksum required for replace_lines. Read the range first via read_file, then pass its checksum.");

            // Checksum's range is authoritative (from read_file), not anchor range
            const { start: csStart, end: csEnd, hex: csHex } = parseChecksum(rc);

            // Coverage check: checksum range must contain ACTUAL edit range (after relocation)
            const actualStart = si + 1;
            const actualEnd = ei + 1;
            if (csStart > actualStart || csEnd < actualEnd) {
                const snip = buildErrorSnippet(origLines, actualStart - 1);
                throw new Error(
                    `CHECKSUM_RANGE_GAP: range ${csStart}-${csEnd} does not cover edit range ${actualStart}-${actualEnd}.\n\n` +
                    `Current content (lines ${snip.start}-${snip.end}):\n${snip.text}\n\n` +
                    `Tip: Use updated hashes above for retry.`
                );
            }

            // Verify freshness over checksum's own range using origLines snapshot
            const csStartIdx = csStart - 1;
            const csEndIdx = csEnd - 1;
            if (csStartIdx < 0 || csEndIdx >= origLines.length) {
                const snip = buildErrorSnippet(origLines, origLines.length - 1);
                throw new Error(
                    `CHECKSUM_OUT_OF_BOUNDS: range ${csStart}-${csEnd} exceeds file length ${origLines.length}.\n\n` +
                    `Current content (lines ${snip.start}-${snip.end}):\n${snip.text}\n\n` +
                    `Tip: Use updated hashes above for retry.`
                );
            }
            const lineHashes = [];
            for (let i = csStartIdx; i <= csEndIdx; i++) lineHashes.push(fnv1a(origLines[i]));
            const actual = rangeChecksum(lineHashes, csStart, csEnd);
            const actualHex = actual.split(":")[1];
            if (csHex !== actualHex) {
                const snip = buildErrorSnippet(origLines, csStartIdx);
                throw new Error(
                    `CHECKSUM_MISMATCH: expected ${rc}, got ${actual}. File changed \u2014 re-read lines ${csStart}-${csEnd}.\n\n` +
                    `Current content (lines ${snip.start}-${snip.end}):\n${snip.text}\n\n` +
                    `Retry with fresh checksum ${actual}, or use set_line with hashes above.`
                );
            }

            const txt = e.replace_lines.new_text;
            if (!txt && txt !== 0) {
                lines.splice(si, ei - si + 1);
            } else {
                const origLines = lines.slice(si, ei + 1);
                let newLines = String(txt).split("\n");
                if (opts.restoreIndent) newLines = restoreIndent(origLines, newLines);
                lines.splice(si, ei - si + 1, ...newLines);
            }
        } else if (e.insert_after) {
            const { tag, line } = parseRef(e.insert_after.anchor);
            const idx = findLine(lines, line, tag, hashIndex);
            let insertLines = e.insert_after.text.split("\n");
            if (opts.restoreIndent) insertLines = restoreIndent([lines[idx]], insertLines);
            lines.splice(idx + 1, 0, ...insertLines);
        }
    }

    // Apply text replacements
    let content = lines.join("\n");
    if (hadTrailingNewline && !content.endsWith("\n")) content += "\n";
    if (!hadTrailingNewline && content.endsWith("\n")) content = content.slice(0, -1);
    for (const e of texts) {
        if (!e.replace.old_text) throw new Error("replace.old_text required");
        content = textReplace(content, e.replace.old_text, e.replace.new_text || "", e.replace.all || false);
    }

    if (original === content) {
        throw new Error("NOOP_EDIT: File already contains the desired content. No changes needed.");
    }

    let diff = simpleDiff(origLines, content.split("\n"));
    if (diff && diff.length > 80000) {
        diff = diff.slice(0, 80000) + `\n... (diff truncated, ${diff.length} chars total)`;
    }

    if (opts.dryRun) {
        let msg = `Dry run: ${filePath} would change (${content.split("\n").length} lines)`;
        if (diff) msg += `\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``;
        return msg;
    }

    writeFileSync(real, content, "utf-8");
    let msg = `Updated ${filePath} (${content.split("\n").length} lines)`;
    if (diff) msg += `\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``;

    // Blast radius warning (optional — silent if no graph DB)
    try {
        const db = getGraphDB(real);
        const relFile = db ? getRelativePath(real) : null;
        if (db && relFile) {
            // Find changed line range from diff
            const diffLines = diff.split("\n");
            let minLine = Infinity, maxLine = 0;
            for (const dl of diffLines) {
                const m = dl.match(/^[+-](\d+)\|/);
                if (m) { const n = +m[1]; if (n < minLine) minLine = n; if (n > maxLine) maxLine = n; }
            }
            if (minLine <= maxLine) {
                const affected = blastRadius(db, relFile, minLine, maxLine);
                if (affected.length > 0) {
                    const list = affected.map(a => `${a.name} (${a.file}:${a.line})`).join(", ");
                    msg += `\n\n\u26A0 Blast radius: ${affected.length} dependents in other files\n  ${list}`;
                }
            }
        }
    } catch { /* silent */ }

    // Post-edit context: hash-annotated lines around changed region + checksums
    const newLines = content.split("\n");
    if (diff) {
        const diffArr = diff.split("\n");
        let minLine = Infinity, maxLine = 0;
        for (const dl of diffArr) {
            const m = dl.match(/^[+-](\d+)\|/);
            if (m) { const n = +m[1]; if (n < minLine) minLine = n; if (n > maxLine) maxLine = n; }
        }
        if (minLine <= maxLine) {
            const ctxStart = Math.max(0, minLine - 6);
            const ctxEnd = Math.min(newLines.length, maxLine + 5);
            const ctxLines = [];
            const ctxHashes = [];
            for (let i = ctxStart; i < ctxEnd; i++) {
                const h = fnv1a(newLines[i]);
                ctxHashes.push(h);
                ctxLines.push(`${lineTag(h)}.${i + 1}\t${newLines[i]}`);
            }
            const ctxCs = rangeChecksum(ctxHashes, ctxStart + 1, ctxEnd);
            msg += `\n\nPost-edit (lines ${ctxStart + 1}-${ctxEnd}):\n${ctxLines.join("\n")}\nchecksum: ${ctxCs}`;
        }
    }
    // File-level checksum
    const fileHashes = [];
    for (let i = 0; i < newLines.length; i++) fileHashes.push(fnv1a(newLines[i]));
    const fileCs = rangeChecksum(fileHashes, 1, newLines.length);
    msg += `\nfile: ${fileCs}`;

    return msg;
}
