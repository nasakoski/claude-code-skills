/**
 * Checksum verification without re-reading full file.
 * Validates range checksums from prior reads.
 */

import { parseChecksum } from "@levnikolaevich/hex-common/text-protocol/hash";
import { validatePath, normalizePath } from "./security.mjs";
import {
    buildRangeChecksum,
    computeChangedRanges,
    describeChangedRanges,
    getSnapshotByRevision,
    readSnapshot,
} from "./revisions.mjs";

/**
 * Verify checksums against current file state.
 *
 * @param {string} filePath
 * @param {string[]} checksums - array of "start-end:8hex" strings
 * @param {object} opts
 * @returns {string} verification result
 */
export function verifyChecksums(filePath, checksums, opts = {}) {
    filePath = normalizePath(filePath);
    const real = validatePath(filePath);
    const current = readSnapshot(real);
    const baseSnapshot = opts.baseRevision ? getSnapshotByRevision(opts.baseRevision) : null;

    const results = [];
    let allValid = true;

    for (const cs of checksums) {
        const parsed = parseChecksum(cs);

        if (parsed.start < 1 || parsed.end > current.lines.length) {
            results.push(`${cs}: INVALID (range ${parsed.start}-${parsed.end} exceeds file length ${current.lines.length})`);
            allValid = false;
            continue;
        }

        const actual = buildRangeChecksum(current, parsed.start, parsed.end);
        const currentHex = actual.split(":")[1];

        if (currentHex === parsed.hex) {
            results.push(`${cs}: valid`);
        } else {
            const staleBits = [`${cs}: STALE → current: ${actual}`];
            if (baseSnapshot?.path === real) {
                const changedRanges = computeChangedRanges(baseSnapshot.lines, current.lines);
                staleBits.push(`revision: ${current.revision}`);
                staleBits.push(`changed_ranges: ${describeChangedRanges(changedRanges)}`);
            } else if (opts.baseRevision) {
                staleBits.push(`revision: ${current.revision}`);
                staleBits.push(`changed_ranges: unavailable (base revision evicted)`);
            }
            results.push(staleBits.join("\n"));
            allValid = false;
        }
    }

    if (allValid && checksums.length > 0) {
        let msg = `All ${checksums.length} checksum(s) valid for ${filePath}`;
        msg += `\nrevision: ${current.revision}`;
        msg += `\nfile: ${current.fileChecksum}`;
        return msg;
    }

    return results.join("\n");
}
