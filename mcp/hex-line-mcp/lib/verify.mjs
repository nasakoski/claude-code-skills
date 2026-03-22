/**
 * Checksum verification without re-reading full file.
 * Validates range checksums from prior reads.
 */

import { fnv1a, rangeChecksum, parseChecksum } from "./hash.mjs";
import { validatePath } from "./security.mjs";
import { readText } from "./format.mjs";

/**
 * Verify checksums against current file state.
 *
 * @param {string} filePath
 * @param {string[]} checksums - array of "start-end:8hex" strings
 * @returns {string} verification result
 */
export function verifyChecksums(filePath, checksums) {
    const real = validatePath(filePath);
    const content = readText(real);
    const lines = content.split("\n");

    // Pre-compute all line hashes
    const lineHashes = lines.map((l) => fnv1a(l));

    const results = [];
    let allValid = true;

    for (const cs of checksums) {
        const parsed = parseChecksum(cs);

        if (parsed.start < 1 || parsed.end > lines.length) {
            results.push(`${cs}: INVALID (range ${parsed.start}-${parsed.end} exceeds file length ${lines.length})`);
            allValid = false;
            continue;
        }

        const currentHashes = lineHashes.slice(parsed.start - 1, parsed.end);
        const current = rangeChecksum(currentHashes, parsed.start, parsed.end);
        const currentHex = current.split(":")[1];

        if (currentHex === parsed.hex) {
            results.push(`${cs}: valid`);
        } else {
            results.push(`${cs}: STALE → current: ${current}`);
            allValid = false;
        }
    }

    if (allValid && checksums.length > 0) {
        return `All ${checksums.length} checksum(s) valid for ${filePath}`;
    }

    return results.join("\n");
}
