/**
 * Session-derived workflow scenarios built from recent real Claude usage.
 *
 * These are still local, reproducible benchmarks, but the tasks are framed
 * after actual day-to-day workflows observed in recent sessions:
 * - debugging hex-line hook behavior
 * - adjusting setup/output guidance
 * - repo-wide benchmark wording refactor
 * - targeted edit inside a large smoke test
 */

import { copyFileSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fnv1a, lineTag, rangeChecksum } from "../lib/hash.mjs";
import { readFile } from "../lib/read.mjs";
import { verifyChecksums } from "../lib/verify.mjs";
import { editFile } from "../lib/edit.mjs";
import { bulkReplace } from "../lib/bulk-replace.mjs";
import { fileOutline } from "../lib/outline.mjs";
import {
    getFileLines,
    simBuiltInReadFull,
    simBuiltInGrep,
    simBuiltInEdit,
    simHexLineEditDiff,
    runN,
} from "../lib/benchmark-helpers.mjs";

function ensureLine(lines, matcher, label) {
    const idx = lines.findIndex((line) => matcher(line));
    if (idx === -1) throw new Error(`Benchmark fixture missing line for ${label}`);
    return idx;
}

function copyIntoTemp(tempRoot, sourceRoot, relPath) {
    const src = resolve(sourceRoot, relPath);
    const dst = resolve(tempRoot, relPath);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    return dst;
}

export async function runWorkflows(config) {
    const { repoRoot, allFiles, largeFiles } = config;
    const workflowResults = [];

    // W1: derived from "Debug hex line formatting in file listings"
    {
        const sourcePath = resolve(repoRoot, "hook.mjs");
        const sourceLines = getFileLines(sourcePath);
        if (!sourceLines) throw new Error("Unable to load hook.mjs for benchmark workflow W1");

        const targetIdx = ensureLine(
            sourceLines,
            (line) => line.includes("ls -R, ls -laR (recursive only)"),
            "hook redirect comment",
        );
        const tempPath = resolve(tmpdir(), `hex-line-wf1-${Date.now()}.mjs`);
        copyFileSync(sourcePath, tempPath);

        const updatedLine = sourceLines[targetIdx].replace("recursive only", "recursive listing only");
        const updatedLines = [...sourceLines];
        updatedLines[targetIdx] = updatedLine;

        const { value: without } = runN(() => {
            let total = 0;
            total += simBuiltInGrep("ls -R", tempPath).length;
            total += simBuiltInReadFull(tempPath, sourceLines).length;
            total += simBuiltInEdit(tempPath, sourceLines, updatedLines).length;
            return total;
        });

        const { value: withSL } = runN(() => {
            let total = 0;
            const tag = lineTag(fnv1a(sourceLines[targetIdx]));
            total += `${tempPath}:>>${tag}.${targetIdx + 1}\t${sourceLines[targetIdx]}`.length;
            try {
                total += editFile(tempPath, [{ set_line: { anchor: `${tag}.${targetIdx + 1}`, new_text: updatedLine } }]).length;
            } catch (e) {
                total += e.message.length;
            }
            return total;
        });

        workflowResults.push({
            id: "W1",
            scenario: "Debug hook file-listing redirect",
            without,
            withSL,
            opsWithout: 3,
            opsWith: 2,
        });
        try { unlinkSync(tempPath); } catch {}
    }

    // W2: derived from setup / guidance updates in repo tooling sessions
    {
        const sourcePath = resolve(repoRoot, "lib", "setup.mjs");
        const sourceLines = getFileLines(sourcePath);
        if (!sourceLines) throw new Error("Unable to load lib/setup.mjs for benchmark workflow W2");

        const targetIdx = ensureLine(
            sourceLines,
            (line) => line.includes("Codex: Not supported"),
            "setup guidance line",
        );
        const tempPath = resolve(tmpdir(), `hex-line-wf2-${Date.now()}.mjs`);
        copyFileSync(sourcePath, tempPath);

        const updatedLine = sourceLines[targetIdx].replace(
            "Add MCP Tool Preferences to AGENTS.md instead",
            "Document MCP Tool Preferences in AGENTS.md instead",
        );
        const updatedLines = [...sourceLines];
        updatedLines[targetIdx] = updatedLine;
        const windowStart = Math.max(1, targetIdx - 3);
        const windowLimit = Math.min(sourceLines.length - windowStart + 1, 10);
        const hashes = sourceLines.map((line) => fnv1a(line));
        const checksum = rangeChecksum(hashes, windowStart, windowStart + windowLimit - 1);

        const { value: without } = runN(() => {
            let total = 0;
            total += simBuiltInReadFull(tempPath, sourceLines).length;
            total += simBuiltInEdit(tempPath, sourceLines, updatedLines).length;
            total += simBuiltInReadFull(tempPath, sourceLines).length;
            return total;
        });

        const { value: withSL } = runN(() => {
            let total = 0;
            total += readFile(tempPath, { offset: windowStart, limit: windowLimit }).length;
            copyFileSync(sourcePath, tempPath);
            try {
                const tag = lineTag(fnv1a(sourceLines[targetIdx]));
                total += editFile(tempPath, [{ set_line: { anchor: `${tag}.${targetIdx + 1}`, new_text: updatedLine } }]).length;
            } catch (e) {
                total += e.message.length;
            }
            try {
                total += verifyChecksums(tempPath, [checksum]).length;
            } catch (e) {
                total += e.message.length;
            }
            return total;
        });

        workflowResults.push({
            id: "W2",
            scenario: "Adjust setup_hooks guidance and verify",
            without,
            withSL,
            opsWithout: 3,
            opsWith: 3,
        });
        try { unlinkSync(tempPath); } catch {}
    }

    // W3: derived from repo-wide benchmark wording refactors
    {
        const tempRoot = resolve(tmpdir(), `hex-line-wf3-${Date.now()}`);
        mkdirSync(tempRoot, { recursive: true });
        const fixtureFiles = [
            "README.md",
            "package.json",
            "benchmark/index.mjs",
            "benchmark/atomic.mjs",
            "benchmark/workflows.mjs",
        ];
        const copiedFiles = fixtureFiles.map((relPath) => copyIntoTemp(tempRoot, repoRoot, relPath));
        const fileLines = copiedFiles.map((filePath) => getFileLines(filePath));
        const replacements = [{ old: "benchmark", new: "workflow benchmark" }];

        const { value: without } = runN(() => {
            let total = 0;
            for (let i = 0; i < copiedFiles.length; i++) {
                const filePath = copiedFiles[i];
                const lines = fileLines[i];
                if (!lines) continue;
                total += simBuiltInGrep("benchmark", filePath).length;
                total += simBuiltInReadFull(filePath, lines).length;
                const updated = lines.map((line) => line.split("benchmark").join("workflow benchmark"));
                total += simBuiltInEdit(filePath, lines, updated).length;
            }
            return total;
        });

        const { value: withSL } = runN(() => {
            return bulkReplace(
                tempRoot,
                "**/*.{md,json,mjs}",
                replacements,
                { dryRun: true, maxFiles: 10 },
            ).length;
        });

        workflowResults.push({
            id: "W3",
            scenario: "Repo-wide benchmark wording refresh",
            without,
            withSL,
            opsWithout: copiedFiles.length * 3,
            opsWith: 1,
        });
        try { rmSync(tempRoot, { recursive: true }); } catch {}
    }

    // W4: derived from reviewing large smoke tests before a focused change
    {
        const preferredLarge = allFiles.find((filePath) => filePath.endsWith("test\\smoke.mjs"))
            || largeFiles[0]
            || allFiles[0];
        const largeLines = getFileLines(preferredLarge);
        if (largeLines && largeLines.length > 100) {
            const targetIdx = ensureLine(
                largeLines,
                (line) => line.includes("describe(\"hook — ls redirect\""),
                "large smoke test anchor",
            );
            const sliceStart = Math.max(0, targetIdx - 5);
            const sliceEnd = Math.min(largeLines.length, targetIdx + 15);
            const editedSlice = largeLines.slice(sliceStart, sliceEnd).map((line, idx) =>
                idx === (targetIdx - sliceStart) ? `${line} // benchmark-note` : line,
            );

            const { value: without } = runN(() => {
                let total = 0;
                total += simBuiltInReadFull(preferredLarge, largeLines).length;
                total += simBuiltInGrep("hook — ls redirect", preferredLarge).length;
                const updatedLines = [...largeLines];
                updatedLines[targetIdx] = `${updatedLines[targetIdx]} // benchmark-note`;
                total += simBuiltInEdit(preferredLarge, largeLines, updatedLines).length;
                return total;
            });

            let outlineLen = 500;
            try { outlineLen = (await fileOutline(preferredLarge)).length; } catch {}

            const { value: withSL } = runN(() => {
                let total = 0;
                total += outlineLen;
                total += readFile(preferredLarge, { offset: sliceStart + 1, limit: sliceEnd - sliceStart }).length;
                total += simHexLineEditDiff(largeLines.slice(sliceStart, sliceEnd), editedSlice).length;
                return total;
            });

            workflowResults.push({
                id: "W4",
                scenario: `Inspect large smoke test before edit (${largeLines.length}L)`,
                without,
                withSL,
                opsWithout: 3,
                opsWith: 3,
            });
        }
    }

    // W5: revision-aware follow-up edit after unrelated line shift
    {
        const tempPath = resolve(tmpdir(), `hex-line-wf5-${Date.now()}.mjs`);
        const prefix = Array.from({ length: 80 }, (_, i) => `pre-${i}`);
        const suffix = Array.from({ length: 80 }, (_, i) => `post-${i}`);
        const sourceLines = [
            ...prefix,
            "head1",
            "head2",
            "targetA",
            "targetB",
            "tail",
            ...suffix,
            "",
        ];
        const sourceText = sourceLines.join("\n");
        mkdirSync(dirname(tempPath), { recursive: true });
        writeFileSync(tempPath, sourceText, "utf-8");

        const head1Idx = prefix.length;
        const targetAIdx = prefix.length + 2;
        const targetBIdx = prefix.length + 3;
        const withInsert = [
            ...prefix,
            "head1",
            "inserted",
            "head2",
            "targetA",
            "targetB",
            "tail",
            ...suffix,
            "",
        ];
        const updatedLines = [
            ...prefix,
            "head1",
            "inserted",
            "head2",
            "targetA",
            "updatedB",
            "tail",
            ...suffix,
            "",
        ];

        const { value: without } = runN(() => {
            let total = 0;
            total += simBuiltInReadFull(tempPath, sourceLines).length;
            total += simBuiltInEdit(tempPath, sourceLines, withInsert).length;
            total += simBuiltInReadFull(tempPath, withInsert).length;
            total += simBuiltInEdit(tempPath, withInsert, updatedLines).length;
            return total;
        });

        const { value: withSL } = runN(() => {
            let total = 0;
            writeFileSync(tempPath, sourceText, "utf-8");
            const baseRead = readFile(tempPath, { offset: head1Idx + 1, limit: 8 });
            total += baseRead.length;
            const baseRevision = baseRead.match(/revision: (\S+)/)?.[1];
            const headTag = lineTag(fnv1a(sourceLines[head1Idx]));
            total += editFile(tempPath, [{ insert_after: { anchor: `${headTag}.${head1Idx + 1}`, text: "inserted" } }]).length;
            const startTag = lineTag(fnv1a(sourceLines[targetAIdx]));
            const endTag = lineTag(fnv1a(sourceLines[targetBIdx]));
            const rc = rangeChecksum(
                [fnv1a(sourceLines[targetAIdx]), fnv1a(sourceLines[targetBIdx])],
                targetAIdx + 1,
                targetBIdx + 1,
            );
            total += editFile(tempPath, [{
                replace_lines: {
                    start_anchor: `${startTag}.${targetAIdx + 1}`,
                    end_anchor: `${endTag}.${targetBIdx + 1}`,
                    new_text: "targetA\nupdatedB",
                    range_checksum: rc,
                }
            }], { baseRevision, conflictPolicy: "conservative" }).length;
            return total;
        });

        workflowResults.push({
            id: "W5",
            scenario: "Follow-up edit after unrelated line shift",
            without,
            withSL,
            opsWithout: 4,
            opsWith: 3,
        });
        try { unlinkSync(tempPath); } catch {}
    }

    return workflowResults;
}
