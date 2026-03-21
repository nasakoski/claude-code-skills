/**
 * Hash-verified file editing with diff output.
 *
 * Supports:
 * - Range-based: range "ab.12-cd.15" + checksum
 * - Anchor-based: set_line, replace_lines, insert_after
 * - Text-based: replace { old_text, new_text, all }
 * - dry_run preview, noop detection, diff output
 */

import { readFileSync, writeFileSync } from "node:fs";
import { diffLines } from "diff";
import { fnv1a, lineTag, rangeChecksum } from "./hash.mjs";
import { validatePath } from "./security.mjs";
import { getGraphDB, blastRadius, getRelativePath } from "./graph-enrich.mjs";

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
        const start = idx >= lines.length
            ? Math.max(0, lines.length - 10)
            : 0;
        const end = idx >= lines.length
            ? lines.length
            : Math.min(lines.length, 10);
        const snippet = lines.slice(start, end).map((line, i) => {
            const num = start + i + 1;
            const tag = lineTag(fnv1a(line));
            return `${tag}.${num}\t${line}`;
        }).join("\n");

        throw new Error(
            `Line ${lineNum} out of range (1-${lines.length}).\n\n` +
            `Current content (lines ${start + 1}-${end}):\n${snippet}\n\n` +
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

    // Build snippet with fresh hashes so agent can retry without re-reading
    const start = Math.max(0, idx - 5);
    const end = Math.min(lines.length, idx + 6);
    const snippet = lines.slice(start, end).map((line, i) => {
        const num = start + i + 1;
        const tag = lineTag(fnv1a(line));
        return `${tag}.${num}\t${line}`;
    }).join("\n");

    throw new Error(
        `Hash mismatch line ${lineNum}: expected ${expectedTag}, got ${actual}.\n\n` +
        `Current content (lines ${start + 1}-${end}):\n${snippet}\n\n` +
        `Tip: Use updated hashes above for retry.`
    );
}

/**
 * Parse a ref string: "ab.12" → { tag: "ab", line: 12 }
 */
function parseRef(ref) {
    const m = ref.trim().match(/^([a-z2-7]{2})\.(\d+)$/);
    if (!m) throw new Error(`Bad ref: "${ref}". Expected "ab.12"`);
    return { tag: m[1], line: parseInt(m[2], 10) };
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
        throw new Error("replace requires all:true (rename-all mode). For single replacements, use set_line or replace_lines with hash anchors.");
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
    const real = validatePath(filePath);
    const original = readFileSync(real, "utf-8").replace(/\r\n/g, "\n");
    const lines = original.split("\n");
    const origLines = [...lines];

    // Build hash index once for global relocation in findLine
    const hashIndex = buildHashIndex(lines);

    // Separate anchor edits from text-replace edits
    const anchored = [];
    const texts = [];

    for (const e of edits) {
        if (e.set_line || e.replace_lines || e.insert_after) anchored.push(e);
        else if (e.replace) texts.push(e);
        else throw new Error(`Unknown edit type: ${JSON.stringify(e)}`);
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
            const rcHex = rc.includes(":") ? rc.split(":")[1] : rc;
            const lineHashes = [];
            for (let i = si; i <= ei; i++) lineHashes.push(fnv1a(lines[i]));
            const actual = rangeChecksum(lineHashes, s.line, en.line);
            const actualHex = actual.split(":")[1];
            if (rcHex !== actualHex) throw new Error(`Range checksum mismatch: expected ${rc}, got ${actual}. File changed \u2014 re-read lines ${s.line}-${en.line}.`);

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

    return msg;
}
