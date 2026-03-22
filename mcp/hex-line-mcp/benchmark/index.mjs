#!/usr/bin/env node
/**
 * Hex-line Combo Benchmark v3
 *
 * Compares "agent without hex-line" vs "agent with hex-line" across
 * read-only and write scenarios. Measures chars in response (proxy for tokens).
 *
 * Usage: node mcp/hex-line-mcp/benchmark/index.mjs [--repo /path/to/repo] [--with-graph]
 * Default repo: current working directory.
 *
 * Zero external deps beyond hex-line lib modules.
 */

import { writeFileSync, unlinkSync } from "node:fs";
import { resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import {
    walkDir, getFileLines, categorize, generateTempCode,
    fmt, pctSavings, RUNS,
} from "../lib/benchmark-helpers.mjs";
import { runAtomic } from "./atomic.mjs";
import { runGraph } from "./graph.mjs";
import { runWorkflows } from "./workflows.mjs";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let repoRoot = process.cwd();
const repoIdx = args.indexOf("--repo");
if (repoIdx !== -1 && args[repoIdx + 1]) {
    repoRoot = resolve(args[repoIdx + 1]);
}

const withGraph = args.includes("--with-graph");

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const allFiles = walkDir(repoRoot);
    if (allFiles.length === 0) {
        console.log(`No code files found in ${repoRoot}`);
        process.exit(1);
    }

    const totalLines = allFiles.reduce((sum, f) => {
        const lines = getFileLines(f);
        return lines ? sum + lines.length : sum;
    }, 0);

    const cats = categorize(allFiles);
    const repoName = basename(repoRoot);

    // Top 3 largest code files for realistic tests
    const sorted = allFiles.map(f => ({ f, lines: getFileLines(f)?.length || 0 }))
        .sort((a, b) => b.lines - a.lines);
    const largeFiles = sorted.slice(0, 3).map(s => s.f);

    // Temp file setup
    const ts = Date.now();
    const tmpPath = resolve(tmpdir(), `hex-line-bench-${ts}.js`);
    const tmpLines = generateTempCode();
    const tmpContent = tmpLines.join("\n");
    writeFileSync(tmpPath, tmpContent, "utf-8");

    // Build config shared across all benchmark modules
    const config = { allFiles, cats, largeFiles, tmpPath, tmpContent, tmpLines, repoRoot, ts };

    // Run benchmark suites
    const results = await runAtomic(config);

    let graphOut = [];
    if (withGraph) {
        graphOut = await runGraph(config);
    }

    const workflowResults = await runWorkflows(config);

    // Cleanup
    try { unlinkSync(tmpPath); } catch { /* ok */ }

    // ===================================================================
    // Report
    // ===================================================================
    const out = [];
    out.push("# Hex-line Benchmark v3");
    out.push("");
    out.push(`Repository: ${repoName} (${fmt(allFiles.length)} code files, ${fmt(totalLines)} lines)  `);
    out.push(`Temp file: ${tmpPath} (200 lines)  `);
    out.push(`Date: ${new Date().toISOString().slice(0, 10)}  `);
    out.push(`Runs per scenario: ${RUNS} (median)  `);
    out.push("");

    // Ops comparison: how many tool calls each scenario requires
    const OPS = {
        "Read full (<50L)":           { without: 1, with: 1 },
        "Read full (50-200L)":        { without: 1, with: 1 },
        "Read full (200-500L)":       { without: 1, with: 1 },
        "Read full (500L+)":          { without: 1, with: 1 },
        "Outline+read (200-500L)":    { without: 1, with: 2 },
        "Outline+read (500L+)":       { without: 1, with: 2 },
        "Grep search":                { without: 1, with: 1 },
        "Directory tree":             { without: 1, with: 1 },
        "File info":                  { without: 1, with: 1 },
        "Create file (200L)":         { without: 1, with: 1 },
        "Edit x5 sequential":         { without: 5, with: 5 },
        "Verify checksums (4 ranges)": { without: 4, with: 1 },
        "Multi-file read":            { without: 2, with: 1 },
        "bulk_replace dry_run (5 files)": { without: 5, with: 1 },
        "Changes (semantic diff)":    { without: 1, with: 1 },
        "FILE_NOT_FOUND recovery*":   { without: 3, with: 1 },
        "Hash mismatch recovery*":    { without: 3, with: 1 },
        "Bash redirects (cat+ls+stat)": { without: 3, with: 3 },
        "HASH_HINT multi-match recovery*": { without: 3, with: 2 },
    };

    const STEPS = {
        "Read full (<50L)": { without: 1, with: 1 },
        "Read full (50-200L)": { without: 1, with: 1 },
        "Read full (200-500L)": { without: 1, with: 1 },
        "Read full (500L+)": { without: 1, with: 1 },
        "Outline+read (200-500L)": { without: 1, with: 2 },
        "Outline+read (500L+)": { without: 1, with: 2 },
        "Grep search": { without: 1, with: 1 },
        "Directory tree": { without: 1, with: 1 },
        "File info": { without: 1, with: 1 },
        "Create file (200L)": { without: 1, with: 1 },
        "Edit x5 sequential": { without: 5, with: 5 },
        "Verify checksums (4 ranges)": { without: 4, with: 1 },
        "Multi-file read": { without: 1, with: 1 },
        "bulk_replace dry_run (5 files)": { without: 5, with: 1 },
        "Changes (semantic diff)": { without: 1, with: 1 },
        "FILE_NOT_FOUND recovery": { without: 3, with: 1 },
        "Hash mismatch recovery": { without: 3, with: 1 },
        "Bash redirects (cat+ls+stat)": { without: 1, with: 1 },
        "HASH_HINT multi-match recovery": { without: 3, with: 1 },
    };

    // Combined results + ops + steps table
    out.push("## Results");
    out.push("");
    out.push("| # | Scenario | Baseline | Hex-line | Savings | Ops | Steps |");
    out.push("|---|----------|----------|----------|---------|-----|-------|");

    for (const r of results) {
        if (r.num >= 16) continue; // graph rows added below

        // Match OPS/STEPS keys
        let op = OPS[r.scenario];
        if (!op) {
            const key = Object.keys(OPS).find(k => r.scenario.startsWith(k));
            if (key) op = OPS[key];
        }
        let step = STEPS[r.scenario];
        if (!step) {
            const key = Object.keys(STEPS).find(k => r.scenario.startsWith(k));
            if (key) step = STEPS[key];
        }

        const opsStr = op ? `${op.without}\u2192${op.with}` : "\u2014";
        const stepsStr = step ? `${step.without}\u2192${step.with}` : "\u2014";

        out.push(`| ${r.num} | ${r.scenario} | ${fmt(r.without)} chars | ${fmt(r.withSL)} chars | ${r.savings} | ${opsStr} | ${stepsStr} |`);
    }

    // Append graph rows into same table (if any)
    if (graphOut.length > 0) {
        out.push("| | **hex-line \u00b1 graph** | **No Graph** | **With Graph** | | | |");
        out.push(...graphOut);
    }
    out.push("");

    // Workflow scenarios table
    if (workflowResults.length > 0) {
        out.push("## Workflow Scenarios (multi-step)");
        out.push("");
        out.push("| # | Scenario | Built-in | Hex-line | Savings | Ops |");
        out.push("|---|----------|----------|----------|---------|-----|");
        for (const w of workflowResults) {
            out.push(`| ${w.id} | ${w.scenario} | ${fmt(w.without)} chars | ${fmt(w.withSL)} chars | ${pctSavings(w.without, w.withSL)} | ${w.opsWithout}\u2192${w.opsWith} |`);
        }
        out.push("");
    }

    // Verdict
    out.push("## Verdict");
    out.push("");

    const readResults = results.filter(r => r.num === 1);
    const outlineResults = results.filter(r => r.num === 2);
    const editResult = results.find(r => r.num === 7);
    const verifyResult = results.find(r => r.num === 8);
    const treeResult = results.find(r => r.num === 4);
    const batchResult = results.find(r => r.num === 9);
    const bulkResult = results.find(r => r.num === 10);
    const changesResult = results.find(r => r.num === 11);
    const notFoundResult = results.find(r => r.num === 12);
    const mismatchResult = results.find(r => r.num === 13);
    const bashResult = results.find(r => r.num === 14);

    const coreResults = results.filter(r => r.num < 16);
    const allSavingsNums = coreResults.map(r => {
        if (r.without === 0) return 0;
        return ((r.without - r.withSL) / r.without) * 100;
    });
    const avgSavings = allSavingsNums.length > 0
        ? allSavingsNums.reduce((a, b) => a + b, 0) / allSavingsNums.length
        : 0;

    // Weighted average based on typical development session frequency
    const WEIGHTS = {
        "Read full (<50L)": 2, "Read full (50-200L)": 5, "Read full (200-500L)": 3, "Read full (500L+)": 1,
        "Outline+read (200-500L)": 8, "Outline+read (500L+)": 8,
        "Grep search": 5, "Directory tree": 2, "File info": 1, "Create file (200L)": 1,
        "Edit x5 sequential": 10, "Verify checksums (4 ranges)": 8,
        "Multi-file read": 2, "bulk_replace dry_run (5 files)": 1,
        "Changes (semantic diff)": 3,
        "FILE_NOT_FOUND recovery": 2, "Hash mismatch recovery": 3,
        "Bash redirects (cat+ls+stat)": 3, "HASH_HINT multi-match recovery": 2,
    };
    let wSum = 0, wTotal = 0;
    for (const r of coreResults) {
        const w = WEIGHTS[r.scenario] || 1;
        const sav = r.without === 0 ? 0 : ((r.without - r.withSL) / r.without) * 100;
        wSum += w * sav;
        wTotal += w;
    }
    const weightedAvg = wTotal > 0 ? wSum / wTotal : 0;

    // Ops/Steps totals for core scenarios
    const totalOpsWithout = coreResults.reduce((s, r) => {
        let op = OPS[r.scenario];
        if (!op) { const key = Object.keys(OPS).find(k => r.scenario.startsWith(k)); if (key) op = OPS[key]; }
        return s + (op ? op.without : 1);
    }, 0);
    const totalOpsWith = coreResults.reduce((s, r) => {
        let op = OPS[r.scenario];
        if (!op) { const key = Object.keys(OPS).find(k => r.scenario.startsWith(k)); if (key) op = OPS[key]; }
        return s + (op ? op.with : 1);
    }, 0);
    const totalStepsWithout = coreResults.reduce((s, r) => {
        let step = STEPS[r.scenario];
        if (!step) { const key = Object.keys(STEPS).find(k => r.scenario.startsWith(k)); if (key) step = STEPS[key]; }
        return s + (step ? step.without : 1);
    }, 0);
    const totalStepsWith = coreResults.reduce((s, r) => {
        let step = STEPS[r.scenario];
        if (!step) { const key = Object.keys(STEPS).find(k => r.scenario.startsWith(k)); if (key) step = STEPS[key]; }
        return s + (step ? step.with : 1);
    }, 0);
    const opsPct = totalOpsWithout > 0 ? ((totalOpsWithout - totalOpsWith) / totalOpsWithout * 100).toFixed(0) : 0;

    // Read verdict
    const readVerdict = [];
    const smallRead = readResults.find(r => r.scenario.includes("<50L"));
    const xlRead = readResults.find(r => r.scenario.includes("500L+"));
    if (smallRead) {
        const pct = Math.abs(((smallRead.without - smallRead.withSL) / smallRead.without * 100)).toFixed(0);
        const verb = smallRead.withSL <= smallRead.without ? "saves" : "costs";
        readVerdict.push(`Small files (<50L): hash annotations ${verb} ~${pct}%.`);
    }
    if (xlRead) {
        const pct = Math.abs(((xlRead.without - xlRead.withSL) / xlRead.without * 100)).toFixed(0);
        const verb = xlRead.withSL <= xlRead.without ? "saves" : "costs";
        readVerdict.push(`Large files (500L+): full read ${verb} ~${pct}%.`);
    }

    out.push("**Read:**");
    for (const v of readVerdict) out.push(`- ${v}`);
    if (outlineResults.length > 0) {
        const best = outlineResults.reduce((a, b) =>
            ((a.without - a.withSL) / a.without) > ((b.without - b.withSL) / b.without) ? a : b
        );
        const savPct = ((best.without - best.withSL) / best.without * 100).toFixed(0);
        out.push(`- Outline+targeted read saves ${savPct}% on large files vs full read.`);
    }
    out.push("");

    if (editResult) {
        const editSav = ((editResult.without - editResult.withSL) / editResult.without * 100).toFixed(0);
        out.push(`**Edit:** Compact diff output saves ${editSav}% vs old_string/new_string context blocks (5 edits).`);
        out.push("");
    }

    if (verifyResult) {
        const verifySav = ((verifyResult.without - verifyResult.withSL) / verifyResult.without * 100).toFixed(0);
        out.push(`**Verify:** Checksum verification saves ${verifySav}% vs full re-read for staleness check.`);
        out.push("");
    }

    if (treeResult) {
        const pct = Math.abs(((treeResult.without - treeResult.withSL) / treeResult.without * 100)).toFixed(0);
        const verb = treeResult.withSL <= treeResult.without ? "saves" : "costs";
        out.push(`**Tree:** Compact directory tree ${verb} ${pct}% vs \`ls -laR\`.`);
        out.push("");
    }

    if (batchResult) {
        const batchSav = ((batchResult.without - batchResult.withSL) / batchResult.without * 100).toFixed(0);
        out.push(`**Batch read:** Multi-file read saves ${batchSav}% vs separate Read calls (${batchResult.scenario.match(/\d+ files/)?.[0] || 'N files'}).`);
        out.push("");
    }

    if (bulkResult) {
        const bulkSav = ((bulkResult.without - bulkResult.withSL) / bulkResult.without * 100).toFixed(0);
        out.push(`**Bulk replace:** Single bulk_replace saves ${bulkSav}% vs 5 separate edit_file calls.`);
        out.push("");
    }

    if (changesResult) {
        const changesSav = ((changesResult.without - changesResult.withSL) / changesResult.without * 100).toFixed(0);
        out.push(`**Changes:** Semantic diff summary saves ${changesSav}% vs raw unified diff output.`);
        out.push("");
    }

    if (notFoundResult) {
        const notFoundSav = ((notFoundResult.without - notFoundResult.withSL) / notFoundResult.without * 100).toFixed(0);
        out.push(`**Error recovery (FILE_NOT_FOUND):** Inline dir listing saves ${notFoundSav}% vs 3 round-trips.`);
        out.push("");
    }

    if (mismatchResult) {
        const mismatchSav = ((mismatchResult.without - mismatchResult.withSL) / mismatchResult.without * 100).toFixed(0);
        out.push(`**Error recovery (hash mismatch):** Fresh snippet saves ${mismatchSav}% vs full re-read + retry.`);
        out.push("");
    }

    if (bashResult) {
        const bashSav = ((bashResult.without - bashResult.withSL) / bashResult.without * 100).toFixed(0);
        const verb = bashResult.withSL <= bashResult.without ? "saves" : "costs";
        out.push(`**Bash redirects:** Structured hex-line output ${verb} ${bashSav}% vs cat+ls+stat combined.`);
        out.push("");
    }

    // Break-even
    out.push("## Break-even");
    out.push("");
    if (outlineResults.length > 0) {
        out.push("- **Outline workflow** breaks even at ~50 lines. Above that, savings grow linearly.");
    }
    if (verifyResult && verifyResult.withSL < verifyResult.without) {
        const ratio = (verifyResult.without / verifyResult.withSL).toFixed(0);
        out.push(`- **Verify** is ${ratio}x cheaper than re-reading. Pays for hash overhead after first staleness check.`);
    }
    if (editResult && editResult.withSL < editResult.without) {
        out.push("- **Edit** compact diff is always cheaper than old_string/new_string blocks.");
    }
    if (notFoundResult && notFoundResult.withSL < notFoundResult.without) {
        const ratio = (notFoundResult.without / notFoundResult.withSL).toFixed(0);
        out.push(`- **Error recovery** eliminates round-trips: ${ratio}x cheaper for FILE_NOT_FOUND.`);
    }
    if (mismatchResult && mismatchResult.withSL < mismatchResult.without) {
        const ratio = (mismatchResult.without / mismatchResult.withSL).toFixed(0);
        out.push(`- **Hash mismatch** recovery with fresh snippet is ${ratio}x cheaper than full re-read + retry.`);
    }
    if (changesResult && changesResult.withSL < changesResult.without) {
        out.push("- **Semantic diff** always cheaper than raw unified diff for understanding changes.");
    }
    out.push(`- **Average:** ${avgSavings.toFixed(0)}% tokens (flat) / ${weightedAvg.toFixed(0)}% (weighted) | ${totalOpsWithout}\u2192${totalOpsWith} ops (${opsPct}% fewer) | ${totalStepsWithout}\u2192${totalStepsWith} steps`);
    out.push("");

    console.log(out.join("\n"));
}

main();
