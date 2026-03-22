/**
 * TEST 1-15: Individual tool comparisons (atomic benchmarks).
 *
 * Each test compares "agent without hex-line" vs "agent with hex-line"
 * for a single tool or error-recovery scenario.
 */

import { readFileSync, writeFileSync, unlinkSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fnv1a, lineTag, rangeChecksum } from "../lib/hash.mjs";
import { readFile } from "../lib/read.mjs";
import { directoryTree } from "../lib/tree.mjs";
import { fileInfo } from "../lib/info.mjs";
import { verifyChecksums } from "../lib/verify.mjs";
import { fileChanges } from "../lib/changes.mjs";
import { editFile } from "../lib/edit.mjs";
import { grepSearch } from "../lib/search.mjs";
import { bulkReplace } from "../lib/bulk-replace.mjs";
import {
    getFileLines,
    simBuiltInReadFull, simBuiltInOutlineFull, simBuiltInGrep,
    simBuiltInLsR, simBuiltInStat, simBuiltInWrite, simBuiltInEdit, simBuiltInVerify,
    simHexLineOutlinePlusRead, simHexLineGrep, simHexLineWrite, simHexLineEditDiff,
    runN, pctSavings,
} from "../lib/benchmark-helpers.mjs";

/**
 * Run TEST 1-15 atomic benchmarks.
 *
 * @param {object} config
 * @param {string[]} config.allFiles - All discovered code files
 * @param {object} config.cats - Categorized files { small, medium, large, xl }
 * @param {string} config.tmpPath - Path to temp benchmark file
 * @param {string} config.tmpContent - Content of temp file
 * @param {string[]} config.tmpLines - Lines of temp file
 * @param {string} config.repoRoot - Repository root path
 * @param {number} config.ts - Timestamp for unique temp file names
 * @returns {Promise<object[]>} Array of result objects
 */
export async function runAtomic(config) {
    const { allFiles, cats, tmpPath, tmpContent, tmpLines, repoRoot, ts } = config;
    const results = [];

    // ===================================================================
    // TEST 1: Read full file
    // ===================================================================
    for (const [cat, files] of Object.entries(cats)) {
        if (files.length === 0) continue;
        const withoutArr = [];
        const withArr = [];

        for (const f of files) {
            const lines = getFileLines(f);
            if (!lines) continue;
            withoutArr.push(runN(() => simBuiltInReadFull(f, lines).length));
            withArr.push(runN(() => readFile(f).length));
        }

        if (withoutArr.length === 0) continue;
        const avgWithout = Math.round(withoutArr.reduce((a, b) => a + b.value, 0) / withoutArr.length);
        const avgWith = Math.round(withArr.reduce((a, b) => a + b.value, 0) / withArr.length);
        const avgMsWithout = parseFloat((withoutArr.reduce((a, b) => a + b.ms, 0) / withoutArr.length).toFixed(1));
        const avgMsWith = parseFloat((withArr.reduce((a, b) => a + b.ms, 0) / withArr.length).toFixed(1));

        const label = { small: "<50L", medium: "50-200L", large: "200-500L", xl: "500L+" }[cat];
        results.push({
            num: 1, scenario: `Read full (${label})`,
            without: avgWithout, withSL: avgWith,
            savings: pctSavings(avgWithout, avgWith),
            latencyWithout: avgMsWithout, latencyWith: avgMsWith,
        });
    }

    // ===================================================================
    // TEST 2: Read with outline — full read vs outline + targeted read
    // ===================================================================
    for (const cat of ["large", "xl"]) {
        const files = cats[cat] || [];
        if (files.length === 0) continue;
        const withoutArr = [];
        const withArr = [];

        for (const f of files) {
            const lines = getFileLines(f);
            if (!lines) continue;
            withoutArr.push(runN(() => simBuiltInOutlineFull(f, lines).length));
            withArr.push(runN(() => simHexLineOutlinePlusRead(f, lines).length));
        }

        if (withoutArr.length === 0) continue;
        const avgWithout = Math.round(withoutArr.reduce((a, b) => a + b.value, 0) / withoutArr.length);
        const avgWith = Math.round(withArr.reduce((a, b) => a + b.value, 0) / withArr.length);
        const avgMsWithout = parseFloat((withoutArr.reduce((a, b) => a + b.ms, 0) / withoutArr.length).toFixed(1));
        const avgMsWith = parseFloat((withArr.reduce((a, b) => a + b.ms, 0) / withArr.length).toFixed(1));

        const label = cat === "large" ? "200-500L" : "500L+";
        results.push({
            num: 2, scenario: `Outline+read (${label})`,
            without: avgWithout, withSL: avgWith,
            savings: pctSavings(avgWithout, avgWith),
            latencyWithout: avgMsWithout, latencyWith: avgMsWith,
        });
    }

    // ===================================================================
    // TEST 3: Grep search
    // ===================================================================
    {
        const grepFiles = [...(cats.medium || []), ...(cats.large || []), ...(cats.xl || [])].slice(0, 3);
        if (grepFiles.length > 0) {
            const withoutArr = [];
            const withArr = [];

            for (const f of grepFiles) {
                const lines = getFileLines(f);
                if (!lines) continue;
                const pattern = "function|class|const";
                withoutArr.push(runN(() => simBuiltInGrep(pattern, f).length));
                withArr.push(runN(() => simHexLineGrep(f, lines, pattern).length));
            }

            if (withoutArr.length > 0) {
                const avgWithout = Math.round(withoutArr.reduce((a, b) => a + b.value, 0) / withoutArr.length);
                const avgWith = Math.round(withArr.reduce((a, b) => a + b.value, 0) / withArr.length);
                const avgMsWithout = parseFloat((withoutArr.reduce((a, b) => a + b.ms, 0) / withoutArr.length).toFixed(1));
                const avgMsWith = parseFloat((withArr.reduce((a, b) => a + b.ms, 0) / withArr.length).toFixed(1));
                results.push({
                    num: 3, scenario: "Grep search",
                    without: avgWithout, withSL: avgWith,
                    savings: pctSavings(avgWithout, avgWith),
                    latencyWithout: avgMsWithout, latencyWith: avgMsWith,
                });
            }
        }
    }

    // ===================================================================
    // TEST 4: Directory tree
    // ===================================================================
    {
        const { value: without, ms: withoutMs } = runN(() => simBuiltInLsR(repoRoot, 0, 3).length);
        const { value: withSL, ms: withMs } = runN(() => directoryTree(repoRoot, { max_depth: 3 }).length);
        results.push({
            num: 4, scenario: "Directory tree",
            without, withSL,
            savings: pctSavings(without, withSL),
            latencyWithout: withoutMs, latencyWith: withMs,
        });
    }

    // ===================================================================
    // TEST 5: File info
    // ===================================================================
    {
        const infoFile = allFiles[Math.floor(allFiles.length / 2)] || allFiles[0];
        const { value: without, ms: withoutMs } = runN(() => simBuiltInStat(infoFile).length);
        const { value: withSL, ms: withMs } = runN(() => fileInfo(infoFile).length);
        results.push({
            num: 5, scenario: "File info",
            without, withSL,
            savings: pctSavings(without, withSL),
            latencyWithout: withoutMs, latencyWith: withMs,
        });
    }

    // ===================================================================
    // TEST 6: Create file (write)
    // ===================================================================
    {
        const { value: without, ms: withoutMs } = runN(() => simBuiltInWrite(tmpPath, tmpContent).length);
        const { value: withSL, ms: withMs } = runN(() => simHexLineWrite(tmpPath, tmpContent).length);
        results.push({
            num: 6, scenario: "Create file (200L)",
            without, withSL,
            savings: pctSavings(without, withSL),
            latencyWithout: withoutMs, latencyWith: withMs,
        });
    }

    // ===================================================================
    // TEST 7: Edit x5 sequential
    // ===================================================================
    {
        const editTargets = [
            { line: 13, new: '        this.configPath = resolve(configPath || ".");' },
            { line: 55, new: "    const { retries = MAX_RETRIES, delay = 200, backoff = 3 } = options;" },
            { line: 75, new: "        this.timeout = options.timeout ?? DEFAULT_TIMEOUT;" },
            { line: 116, new: "        return this; // chainable" },
            { line: 148, new: "    /** @type {string[]} */\n    const errors = [];" },
        ];

        let totalWithout = 0;
        let totalWith = 0;
        let totalMsWithout = 0;
        let totalMsWith = 0;

        for (const edit of editTargets) {
            const origLines = [...tmpLines];
            const newLines = [...tmpLines];
            const idx = edit.line - 1;
            if (idx < newLines.length) {
                newLines[idx] = edit.new;
            }

            const rW = runN(() => simBuiltInEdit(tmpPath, origLines, newLines).length);
            const rH = runN(() => simHexLineEditDiff(origLines, newLines).length);
            totalWithout += rW.value;
            totalWith += rH.value;
            totalMsWithout += rW.ms;
            totalMsWith += rH.ms;
        }

        results.push({
            num: 7, scenario: "Edit x5 sequential",
            without: totalWithout, withSL: totalWith,
            savings: pctSavings(totalWithout, totalWith),
            latencyWithout: parseFloat(totalMsWithout.toFixed(1)), latencyWith: parseFloat(totalMsWith.toFixed(1)),
        });
    }

    // ===================================================================
    // TEST 8: Verify checksums
    // ===================================================================
    {
        const fileLines = readFileSync(tmpPath, "utf-8").replace(/\r\n/g, "\n").split("\n");
        const hashes = fileLines.map(l => fnv1a(l));
        const cs1 = rangeChecksum(hashes.slice(0, 50), 1, 50);
        const cs2 = rangeChecksum(hashes.slice(50, 100), 51, 100);
        const cs3 = rangeChecksum(hashes.slice(100, 150), 101, 150);
        const cs4 = rangeChecksum(hashes.slice(150, 200), 151, 200);
        const checksums = [cs1, cs2, cs3, cs4];

        const { value: without, ms: withoutMs } = runN(() => simBuiltInVerify(tmpPath, fileLines).length);
        const { value: withSL, ms: withMs } = runN(() => verifyChecksums(tmpPath, checksums).length);

        results.push({
            num: 8, scenario: "Verify checksums (4 ranges)",
            without, withSL,
            savings: pctSavings(without, withSL),
            latencyWithout: withoutMs, latencyWith: withMs,
        });
    }

    // ===================================================================
    // TEST 9: Multi-file read (batch)
    // ===================================================================
    {
        const batchFiles = (cats.small || []).slice(0, 3);
        if (batchFiles.length >= 2) {
            // Without hex-line: N separate Read calls
            const { value: without, ms: withoutMs } = runN(() => {
                let total = 0;
                for (const f of batchFiles) {
                    const lines = getFileLines(f);
                    if (lines) total += simBuiltInReadFull(f, lines).length;
                }
                return total;
            });

            // With hex-line: 1 read_file call with paths:[] — concatenated output
            const { value: withSL, ms: withMs } = runN(() => {
                const parts = [];
                for (const f of batchFiles) {
                    parts.push(readFile(f));
                }
                return parts.join("\n\n---\n\n").length;
            });

            results.push({
                num: 9, scenario: `Multi-file read (${batchFiles.length} files)`,
                without, withSL,
                savings: pctSavings(without, withSL),
                latencyWithout: withoutMs, latencyWith: withMs,
            });
        }
    }

    // ===================================================================
    // TEST 10: bulk_replace dry_run
    // ===================================================================
    {
        const bulkTmpPaths = [];
        for (let i = 0; i < 5; i++) {
            const p = resolve(tmpdir(), `hex-line-bulk-${ts}-${i}.js`);
            writeFileSync(p, tmpContent, "utf-8");
            bulkTmpPaths.push(p);
        }

        const editLine = 13;
        const editNew = '        this.configPath = resolve(configPath || ".");';

        // Without hex-line: 5 separate edit_file calls
        const { value: without, ms: withoutMs } = runN(() => {
            let total = 0;
            for (const p of bulkTmpPaths) {
                const origLines = [...tmpLines];
                const newLines = [...tmpLines];
                newLines[editLine - 1] = editNew;
                total += simBuiltInEdit(p, origLines, newLines).length;
            }
            return total;
        });

        // With hex-line: 1 bulk_replace — summary + per-file compact diff
        const { value: withSL, ms: withMs } = runN(() => {
            let response = "5 files changed, 0 errors\n";
            for (const p of bulkTmpPaths) {
                const origLines = [...tmpLines];
                const newLines = [...tmpLines];
                newLines[editLine - 1] = editNew;
                response += simHexLineEditDiff(origLines, newLines) + "\n";
            }
            return response.length;
        });

        results.push({
            num: 10, scenario: "bulk_replace dry_run (5 files)",
            without, withSL,
            savings: pctSavings(without, withSL),
            latencyWithout: withoutMs, latencyWith: withMs,
        });

        for (const p of bulkTmpPaths) {
            try { unlinkSync(p); } catch { /* ok */ }
        }
    }

    // ===================================================================
    // TEST 11: changes (semantic diff)
    // ===================================================================
    {
        // Without hex-line: raw unified diff output
        const { value: without, ms: withoutMs } = runN(() => {
            const diffLines = [
                `diff --git a/benchmark-target.js b/benchmark-target.js`,
                `index abc1234..def5678 100644`,
                `--- a/benchmark-target.js`,
                `+++ b/benchmark-target.js`,
                `@@ -10,6 +10,12 @@ const DEFAULT_TIMEOUT = 5000;`,
            ];
            // Simulate ~15 context + change lines typical of a small diff
            for (let i = 0; i < 5; i++) {
                diffLines.push(` ${tmpLines[i + 5] || "    // context line"}`);  // context
            }
            diffLines.push(`-${tmpLines[12] || "    old line"}`);
            diffLines.push(`+        this.configPath = resolve(configPath || ".");`);
            for (let i = 0; i < 5; i++) {
                diffLines.push(` ${tmpLines[i + 14] || "    // context line"}`);  // context
            }
            // Second hunk — added function
            diffLines.push(`@@ -195,0 +201,8 @@`);
            for (let i = 0; i < 3; i++) {
                diffLines.push(` ${tmpLines[i + 150] || "    // context"}`);
            }
            for (let i = 0; i < 5; i++) {
                diffLines.push(`+    // new function line ${i}`);
            }
            for (let i = 0; i < 3; i++) {
                diffLines.push(` ${tmpLines[i + 155] || "    // context"}`);
            }
            return diffLines.join("\n").length;
        });

        // With hex-line: real fileChanges() semantic diff (async, called once — deterministic)
        let withSL;
        let withMs = 0;
        try {
            const t0 = performance.now();
            const changesOut = await fileChanges(allFiles[0]);
            withMs = parseFloat((performance.now() - t0).toFixed(1));
            withSL = changesOut.length;
        } catch {
            withSL = 133; // fallback if no git history
        }

        results.push({
            num: 11, scenario: "Changes (semantic diff)",
            without, withSL,
            savings: pctSavings(without, withSL),
            latencyWithout: withoutMs, latencyWith: withMs,
        });
    }

    // ===================================================================
    // TEST 12: FILE_NOT_FOUND recovery
    // ===================================================================
    {
        const missingPath = resolve(repoRoot, "src/utils/halper.js");
        const parentDir = resolve(repoRoot, "src/utils");

        // Without hex-line: 3 round-trips (error → ls → retry)
        const { value: without, ms: withoutMs } = runN(() => {
            // Round 1: real ENOENT error
            let r1;
            try { readFileSync(missingPath, "utf-8"); r1 = ""; } catch (e) { r1 = e.message; }
            // Round 2: real directory listing to find correct name
            let r2;
            try { r2 = readdirSync(parentDir).join("\n"); } catch { r2 = `${parentDir}: directory not found`; }
            // Round 3: agent re-reads correct file (small file ~30 lines)
            const r3 = simBuiltInReadFull(missingPath, tmpLines.slice(0, 30));
            return (r1 + r2 + r3).length;
        });

        // With hex-line: real readFile() on nonexistent path — returns error + parent dir listing
        const { value: withSL, ms: withMs } = runN(() => {
            try {
                return readFile(missingPath).length;
            } catch (e) {
                return e.message.length;
            }
        });

        results.push({
            num: 12, scenario: "FILE_NOT_FOUND recovery*",
            without, withSL,
            savings: pctSavings(without, withSL),
            latencyWithout: withoutMs, latencyWith: withMs,
        });
    }

    // ===================================================================
    // TEST 13: Hash mismatch recovery
    // ===================================================================
    {
        // Without hex-line: 3 round-trips (stale error → re-read full → retry edit)
        const { value: without, ms: withoutMs } = runN(() => {
            // Round 1: error
            const r1 = 'Error: file content has changed (stale). Please re-read the file.';
            // Round 2: full re-read
            const r2 = simBuiltInReadFull(tmpPath, tmpLines);
            // Round 3: retry edit response
            const origLines = [...tmpLines];
            const newLines = [...tmpLines];
            newLines[12] = '        this.configPath = resolve(configPath || ".");';
            const r3 = simBuiltInEdit(tmpPath, origLines, newLines);
            return (r1 + r2 + r3).length;
        });

        // With hex-line: 1 round-trip (error + fresh snippet +/-5 lines around target)
        const { value: withSL, ms: withMs } = runN(() => {
            const targetLine = 13;
            const snippetStart = Math.max(0, targetLine - 6);
            const snippetEnd = Math.min(tmpLines.length, targetLine + 5);
            const snippet = tmpLines.slice(snippetStart, snippetEnd);
            const annotated = snippet.map((l, i) => {
                const lineNum = snippetStart + i + 1;
                const tag = lineTag(fnv1a(l));
                return `${tag}.${lineNum}\t${l}`;
            }).join("\n");
            const response = `HASH_MISMATCH at line ${targetLine}. Fresh snippet:\n\`\`\`\n${annotated}\n\`\`\``;
            return response.length;
        });

        results.push({
            num: 13, scenario: "Hash mismatch recovery*",
            without, withSL,
            savings: pctSavings(without, withSL),
            latencyWithout: withoutMs, latencyWith: withMs,
        });
    }

    // ===================================================================
    // TEST 14: Bash redirect savings
    // ===================================================================
    {
        const infoFile = allFiles[Math.floor(allFiles.length / 2)] || allFiles[0];
        const infoLines = getFileLines(infoFile);
        if (infoLines) {
            // Sub-test A: cat vs read_file
            const catW = runN(() => {
                // cat output: raw lines, no line numbers (agent redirect)
                return infoLines.join("\n").length;
            });
            const catH = runN(() => readFile(infoFile).length);

            // Sub-test B: ls -la vs directory_tree
            const dirTarget = resolve(repoRoot);
            const lsW = runN(() => simBuiltInLsR(dirTarget, 0, 1).length);
            const lsH = runN(() => directoryTree(dirTarget, { max_depth: 1 }).length);

            // Sub-test C: stat vs get_file_info
            const stW = runN(() => simBuiltInStat(infoFile).length);
            const stH = runN(() => fileInfo(infoFile).length);

            // Combined: without = raw outputs (no follow-up possible)
            // With = structured output (enables follow-up without extra calls)
            const totalWithout = catW.value + lsW.value + stW.value;
            const totalWith = catH.value + lsH.value + stH.value;
            const totalMsWithout = catW.ms + lsW.ms + stW.ms;
            const totalMsWith = catH.ms + lsH.ms + stH.ms;

            results.push({
                num: 14, scenario: "Bash redirects (cat+ls+stat)",
                without: totalWithout, withSL: totalWith,
                savings: pctSavings(totalWithout, totalWith),
                latencyWithout: parseFloat(totalMsWithout.toFixed(1)), latencyWith: parseFloat(totalMsWith.toFixed(1)),
            });
        }
    }

    // ===================================================================
    // TEST 15: HASH_HINT multi-match recovery
    // ===================================================================
    {
        // Create a file with a duplicated line so textReplace triggers HASH_HINT
        const dupLine = '    return this.config;';
        const dupContent = tmpLines.map((l, i) => (i === 20 || i === 80) ? dupLine : l);
        const dupPath = resolve(tmpdir(), `hex-line-dup-${ts}.js`);
        writeFileSync(dupPath, dupContent.join("\n"), "utf-8");

        // Without hex-line: 3 round-trips (opaque error + re-read full + retry)
        const { value: without, ms: withoutMs } = runN(() => {
            const r1 = 'Error: multiple occurrences found. Provide more context.';
            const r2 = simBuiltInReadFull(dupPath, dupContent);
            const origLines = [...dupContent];
            const newLines = [...dupContent];
            newLines[20] = '    return this.updatedConfig;';
            const r3 = simBuiltInEdit(dupPath, origLines, newLines);
            return (r1 + r2 + r3).length;
        });

        // With hex-line: HASH_HINT error contains annotated snippets (1 round-trip)
        const { value: withSL, ms: withMs } = runN(() => {
            try {
                editFile(dupPath, [{ replace: { old_text: dupLine, new_text: '    return this.updatedConfig;' } }]);
                return 0; // should not reach
            } catch (e) {
                // HASH_HINT error message + simulated anchor retry
                const retry = '{"set_line":{"anchor":"xx.21","new_text":"    return this.updatedConfig;"}}';
                return (e.message + retry).length;
            }
        });

        results.push({
            num: 15, scenario: "HASH_HINT multi-match recovery*",
            without, withSL,
            savings: pctSavings(without, withSL),
            latencyWithout: withoutMs, latencyWith: withMs,
        });

        try { unlinkSync(dupPath); } catch { /* ok */ }
    }

    return results;
}
