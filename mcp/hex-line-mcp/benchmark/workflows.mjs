/**
 * W1-W4: Multi-step workflow scenarios.
 *
 * Each workflow compares a realistic multi-tool agent session
 * with and without hex-line.
 */

import { readFileSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fnv1a, lineTag, rangeChecksum } from "../lib/hash.mjs";
import { readFile } from "../lib/read.mjs";
import { verifyChecksums } from "../lib/verify.mjs";
import { editFile } from "../lib/edit.mjs";
import { bulkReplace } from "../lib/bulk-replace.mjs";
import { fileOutline } from "../lib/outline.mjs";
import {
    getFileLines,
    simBuiltInReadFull, simBuiltInGrep, simBuiltInEdit,
    simHexLineEditDiff,
    runN, pctSavings,
} from "../lib/benchmark-helpers.mjs";

/**
 * Run W1-W4 workflow benchmarks.
 *
 * @param {object} config
 * @param {string[]} config.allFiles - All discovered code files
 * @param {string[]} config.largeFiles - Top 3 largest code files
 * @param {string} config.tmpContent - Content of temp file
 * @param {string[]} config.tmpLines - Lines of temp file
 * @returns {Promise<object[]>} Array of workflow result objects
 */
export async function runWorkflows(config) {
    const { allFiles, largeFiles, tmpContent, tmpLines } = config;
    const workflowResults = [];

    // W1: Search -> Edit (find a pattern, edit the match)
    {
        const wTmpPath = resolve(tmpdir(), `hex-wf1-${Date.now()}.js`);
        writeFileSync(wTmpPath, tmpContent, "utf-8");
        const editLine = tmpLines[12];
        const editNew = editLine + " // workflow-modified";

        // Without: grep -> read file for context -> edit with old_string
        const { value: without } = runN(() => {
            let total = 0;
            // Step 1: grep to find
            total += simBuiltInGrep("configPath", wTmpPath).length;
            // Step 2: read full file for context (agent needs surrounding lines)
            total += simBuiltInReadFull(wTmpPath, tmpLines).length;
            // Step 3: edit
            const origLines = [...tmpLines];
            const newLines = [...tmpLines];
            newLines[12] = editNew;
            total += simBuiltInEdit(wTmpPath, origLines, newLines).length;
            return total;
        });

        // With: grep_search (has hashes) -> edit with anchor (no re-read needed)
        const { value: withSL } = runN(() => {
            let total = 0;
            // Step 1: grep with hashes
            const grepOut = readFileSync(wTmpPath, "utf-8"); // simulate grep result
            const lines = grepOut.split("\n");
            const targetIdx = 12;
            const tag = lineTag(fnv1a(lines[targetIdx]));
            total += `${wTmpPath}:>>${tag}.${targetIdx + 1}\t${lines[targetIdx]}`.length;
            // Step 2: edit with anchor directly (no read needed)
            try {
                const result = editFile(wTmpPath, [{ set_line: { anchor: `${tag}.${targetIdx + 1}`, new_text: editNew } }]);
                total += result.length;
            } catch (e) { total += e.message.length; }
            return total;
        });

        workflowResults.push({
            id: "W1", scenario: "Search \u2192 Edit",
            without, withSL,
            opsWithout: 3, opsWith: 2,
        });
        try { unlinkSync(wTmpPath); } catch {}
    }

    // W2: Read -> Edit -> Verify cycle
    {
        const wTmpPath = resolve(tmpdir(), `hex-wf2-${Date.now()}.js`);
        writeFileSync(wTmpPath, tmpContent, "utf-8");

        // Without: read full -> edit -> re-read full to verify
        const { value: without } = runN(() => {
            let total = 0;
            total += simBuiltInReadFull(wTmpPath, tmpLines).length; // read
            const origLines = [...tmpLines];
            const newLines = [...tmpLines];
            newLines[12] = '        this.configPath = resolve(configPath || ".");';
            total += simBuiltInEdit(wTmpPath, origLines, newLines).length; // edit
            total += simBuiltInReadFull(wTmpPath, tmpLines).length; // re-read to verify
            return total;
        });

        // With: read targeted -> edit -> verify checksums
        const { value: withSL } = runN(() => {
            let total = 0;
            total += readFile(wTmpPath, { offset: 8, limit: 20 }).length; // targeted read
            // Reset file for edit
            writeFileSync(wTmpPath, tmpContent, "utf-8");
            try {
                const result = editFile(wTmpPath, [{ replace: { old_text: tmpLines[12], new_text: '        this.configPath = resolve(configPath || ".");' } }]);
                total += result.length;
            } catch (e) { total += e.message.length; }
            // Verify with checksums instead of re-reading
            const hashes = tmpLines.slice(0, 50).map(l => fnv1a(l));
            const cs = rangeChecksum(hashes, 1, 50);
            try { total += verifyChecksums(wTmpPath, [cs]).length; }
            catch { total += 100; }
            return total;
        });

        workflowResults.push({
            id: "W2", scenario: "Read \u2192 Edit \u2192 Verify",
            without, withSL,
            opsWithout: 3, opsWith: 3,
        });
        try { unlinkSync(wTmpPath); } catch {}
    }

    // W3: Multi-file refactor (rename in 5 files)
    {
        const wDir = resolve(tmpdir(), `hex-wf3-${Date.now()}`);
        mkdirSync(wDir, { recursive: true });
        const wPaths = [];
        for (let i = 0; i < 5; i++) {
            const p = resolve(wDir, `file-${i}.js`);
            writeFileSync(p, tmpContent, "utf-8");
            wPaths.push(p);
        }

        // Without: grep to find files -> read each -> edit each = 11 ops
        const { value: without } = runN(() => {
            let total = 0;
            total += simBuiltInGrep("configPath", wPaths[0]).length; // find
            for (const p of wPaths) {
                total += simBuiltInReadFull(p, tmpLines).length; // read each
                const origLines = [...tmpLines];
                const newLines = [...tmpLines];
                newLines[12] = newLines[12].replace("configPath", "settingsPath");
                total += simBuiltInEdit(p, origLines, newLines).length; // edit each
            }
            return total;
        });

        // With: grep_search -> bulk_replace = 2 ops
        const { value: withSL } = runN(() => {
            let total = 0;
            // Restore files
            for (const p of wPaths) writeFileSync(p, tmpContent, "utf-8");
            // Single grep (simulated — bulk_replace does its own finding)
            total += 200; // approximate grep output
            // Single bulk_replace
            const result = bulkReplace(
                wDir,
                "*.js",
                [{ old: "configPath", new: "settingsPath" }],
                { dryRun: true, maxFiles: 10 }
            );
            total += result.length;
            return total;
        });

        workflowResults.push({
            id: "W3", scenario: "Multi-file refactor (5 files)",
            without, withSL,
            opsWithout: 11, opsWith: 2,
        });
        try { rmSync(wDir, { recursive: true }); } catch {}
    }

    // W4: Explore large file -> targeted edit
    {
        const largeFile = largeFiles[0] || allFiles[0];
        const largeLines = getFileLines(largeFile);
        if (largeLines && largeLines.length > 100) {
            // Without: read full file -> grep for method -> edit
            const { value: without } = runN(() => {
                let total = 0;
                total += simBuiltInReadFull(largeFile, largeLines).length;
                total += simBuiltInGrep("function", largeFile).length;
                // Simulate edit response
                const origLines = [...largeLines];
                const newLines = [...largeLines];
                newLines[10] = newLines[10] + " // modified";
                total += simBuiltInEdit(largeFile, origLines, newLines).length;
                return total;
            });

            // With: outline -> read range -> edit with anchor
            let outlineLen = 500;
            try { outlineLen = (await fileOutline(largeFile)).length; } catch {}
            const { value: withSL } = runN(() => {
                let total = 0;
                total += outlineLen; // outline (pre-computed, async)
                total += readFile(largeFile, { offset: 5, limit: 30 }).length; // targeted read
                total += simHexLineEditDiff(largeLines.slice(5, 35), [...largeLines.slice(5, 35)].map((l, i) => i === 5 ? l + " // modified" : l)).length;
                return total;
            });

            workflowResults.push({
                id: "W4", scenario: `Explore+edit (${largeLines.length}L file)`,
                without, withSL,
                opsWithout: 3, opsWith: 3,
            });
        }
    }

    return workflowResults;
}
