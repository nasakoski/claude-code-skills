/**
 * FNV-1a hashing for hash-verified file editing.
 *
 * Trueline-compatible: 2-char tags from 32-symbol alphabet,
 * range checksums as FNV-1a accumulator over line hashes.
 *
 * Line format: {tag}.{lineNum}\t{content}
 * Range checksum: checksum: {startLine}-{endLine}:{8hex}
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// 32 symbols — bitwise & 0x1f (power of 2, no division)
const TAG_CHARS = "abcdefghijklmnopqrstuvwxyz234567";

/**
 * FNV-1a 32-bit hash of a string (UTF-8 encoded).
 * Whitespace is normalized (collapsed) before hashing.
 */
export function fnv1a(str) {
    // Normalize: strip trailing \r, collapse whitespace
    const normalized = str.replace(/\r$/, "").replace(/\s+/g, "");
    let h = FNV_OFFSET;
    for (let i = 0; i < normalized.length; i++) {
        let code = normalized.charCodeAt(i);
        // Handle surrogate pairs for codepoints > U+FFFF
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < normalized.length) {
            const lo = normalized.charCodeAt(i + 1);
            if (lo >= 0xdc00 && lo <= 0xdfff) {
                code = ((code - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
                i++;
            }
        }
        // Encode as UTF-8 bytes and feed to FNV-1a
        if (code < 0x80) {
            h = Math.imul(h ^ code, FNV_PRIME) >>> 0;
        } else if (code < 0x800) {
            h = Math.imul(h ^ (0xc0 | (code >> 6)), FNV_PRIME) >>> 0;
            h = Math.imul(h ^ (0x80 | (code & 0x3f)), FNV_PRIME) >>> 0;
        } else if (code < 0x10000) {
            h = Math.imul(h ^ (0xe0 | (code >> 12)), FNV_PRIME) >>> 0;
            h = Math.imul(h ^ (0x80 | ((code >> 6) & 0x3f)), FNV_PRIME) >>> 0;
            h = Math.imul(h ^ (0x80 | (code & 0x3f)), FNV_PRIME) >>> 0;
        } else {
            h = Math.imul(h ^ (0xf0 | (code >> 18)), FNV_PRIME) >>> 0;
            h = Math.imul(h ^ (0x80 | ((code >> 12) & 0x3f)), FNV_PRIME) >>> 0;
            h = Math.imul(h ^ (0x80 | ((code >> 6) & 0x3f)), FNV_PRIME) >>> 0;
            h = Math.imul(h ^ (0x80 | (code & 0x3f)), FNV_PRIME) >>> 0;
        }
    }
    return h;
}

/**
 * 2-character tag from 32-bit hash.
 * Uses bits 0-4 and 8-12 for two characters from TAG_CHARS.
 */
export function lineTag(hash32) {
    return TAG_CHARS[hash32 & 0x1f] + TAG_CHARS[(hash32 >>> 8) & 0x1f];
}

/**
 * Compute tag for a line's content.
 */
export function hashLine(content) {
    return lineTag(fnv1a(content));
}

/**
 * Format a line with hash prefix: {tag}.{lineNum}\t{content}
 */
export function formatLine(lineNum, content) {
    return `${hashLine(content)}.${lineNum}\t${content}`;
}

/**
 * Range checksum: FNV-1a accumulator over line hashes (little-endian bytes).
 * Returns "{startLine}-{endLine}:{8hex}".
 */
export function rangeChecksum(lineHashes, startLine, endLine) {
    let acc = FNV_OFFSET;
    for (const h of lineHashes) {
        // Feed 4 bytes of each 32-bit hash in little-endian order
        acc = Math.imul(acc ^ (h & 0xff), FNV_PRIME) >>> 0;
        acc = Math.imul(acc ^ ((h >>> 8) & 0xff), FNV_PRIME) >>> 0;
        acc = Math.imul(acc ^ ((h >>> 16) & 0xff), FNV_PRIME) >>> 0;
        acc = Math.imul(acc ^ ((h >>> 24) & 0xff), FNV_PRIME) >>> 0;
    }
    return `${startLine}-${endLine}:${acc.toString(16).padStart(8, "0")}`;
}

/**
 * Parse a line reference: "ab.12" → { tag: "ab", line: 12 }
 */
export function parseRef(ref) {
    const m = ref.trim().match(/^([a-z2-7]{2})\.(\d+)$/);
    if (!m) throw new Error(`Bad ref: "${ref}". Expected "ab.12" (tag.lineNum)`);
    return { tag: m[1], line: parseInt(m[2], 10) };
}

/**
 * Parse a range checksum: "1-50:f7e2a1b0" → { start: 1, end: 50, hex: "f7e2a1b0" }
 */
export function parseChecksum(cs) {
    const m = cs.trim().match(/^(\d+)-(\d+):([0-9a-f]{8})$/);
    if (!m) throw new Error(`Bad checksum: "${cs}". Expected "1-50:f7e2a1b0"`);
    return { start: parseInt(m[1], 10), end: parseInt(m[2], 10), hex: m[3] };
}
