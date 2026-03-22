#!/usr/bin/env node
/**
 * Hex-graph Benchmark v2
 *
 * Compares "agent with built-in grep/read" vs "agent with hex-graph" across
 * code intelligence scenarios. Measures chars, ops, steps, and accuracy.
 *
 * Prerequisites: .codegraph/index.db must exist. Run hex-graph index_project first.
 * Usage: node benchmark/index.mjs [--repo /path/to/repo]
 */

import { existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { getStore } from "../lib/store.mjs";
import { fmt, pctSavings, walkDir } from "./helpers.mjs";
import { runAtomic } from "./atomic.mjs";
import { runWorkflows } from "./workflows.mjs";
import { runAmortization } from "./amortization.mjs";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let repoRoot = process.cwd();
const repoIdx = args.indexOf("--repo");
if (repoIdx !== -1 && args[repoIdx + 1]) repoRoot = resolve(args[repoIdx + 1]);

// Check DB
const dbPath = resolve(repoRoot, ".codegraph/index.db");
if (!existsSync(dbPath)) {
    console.error(
        "hex-graph benchmark requires .codegraph/index.db.\n" +
        "Run: mcp__hex-graph__index_project or node mcp/hex-graph-mcp/server.mjs first."
    );
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Initialize store and pick symbols
// ---------------------------------------------------------------------------

const store = getStore(repoRoot);

/** Pick a symbol name that exists in the DB (function/method, well-connected) */
function pickSymbol() {
    const row = store.db.prepare(`
        SELECT n.name, n.kind, n.file, COUNT(e.id) as refs
        FROM nodes n
        JOIN edges e ON e.target_id = n.id
        WHERE n.kind IN ('function', 'method')
        GROUP BY n.id
        ORDER BY refs DESC
        LIMIT 1
    `).get();
    return row || null;
}

/** Pick a symbol with callers from other files */
function pickCrossFileSymbol() {
    const row = store.db.prepare(`
        SELECT n.name, n.kind, n.file, COUNT(DISTINCT n2.file) as caller_files
        FROM nodes n
        JOIN edges e ON e.target_id = n.id AND e.kind = 'calls'
        JOIN nodes n2 ON n2.id = e.source_id
        WHERE n.kind IN ('function', 'method') AND n2.file != n.file
        GROUP BY n.id
        ORDER BY caller_files DESC
        LIMIT 1
    `).get();
    return row || null;
}

/** Pick a function from the largest file */
function pickLargestFileSymbol() {
    const row = store.db.prepare(`
        SELECT n.name, n.kind, n.file
        FROM nodes n
        JOIN files f ON f.path = n.file
        WHERE n.kind IN ('function', 'method')
        ORDER BY f.node_count DESC, n.line_start ASC
        LIMIT 1
    `).get();
    return row || null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const allFiles = walkDir(repoRoot);
    if (allFiles.length === 0) {
        console.log(`No code files found in ${repoRoot}`);
        process.exit(1);
    }

    const stats = store.stats();
    const repoName = basename(repoRoot);

    // Pre-pick symbols for tests
    const sym1 = pickSymbol();
    const sym2 = pickLargestFileSymbol();
    const sym3 = pickCrossFileSymbol();

    if (!sym1 && !sym2 && !sym3) {
        console.error("No suitable symbols found in index. Re-index with more files.");
        process.exit(1);
    }

    // Use fallbacks if specific picks fail
    const searchSym = sym1 || sym2 || sym3;
    const contextSym = sym2 || sym1 || sym3;
    const impactSym = sym3 || sym1 || sym2;
    const traceSym = sym1 || sym3 || sym2;

    const config = { repoRoot, allFiles, searchSym, contextSym, impactSym, traceSym };

    // Run all benchmark phases
    const results = runAtomic(store, config);
    const workflows = runWorkflows(store, config);
    const amort = await runAmortization(store, config);

    // ===================================================================
    // Report
    // ===================================================================

    const out = [];
    out.push("# Hex-graph Benchmark v2");
    out.push("");
    out.push(`Repository: ${repoName} (${fmt(allFiles.length)} files, ${fmt(stats.nodes)} symbols indexed)`);
    out.push(`Date: ${new Date().toISOString().slice(0, 10)}`);
    out.push("");

    // Results table
    out.push("## Results");
    out.push("");
    out.push("| # | Scenario | Built-in | Hex-graph | Savings | Ops | Steps |");
    out.push("|---|----------|----------|-----------|---------|-----|-------|");

    let totalOpsWithout = 0;
    let totalOpsWith = 0;
    let totalStepsWithout = 0;
    let totalStepsWith = 0;

    for (const r of results) {
        out.push(
            `| ${r.id} | ${r.scenario} | ${fmt(r.without)} chars | ${fmt(r.withG)} chars | ${pctSavings(r.without, r.withG)} | ${r.opsWithout}\u2192${r.opsWith} | ${r.stepsWithout}\u2192${r.stepsWith} |`
        );
        totalOpsWithout += r.opsWithout;
        totalOpsWith += r.opsWith;
        totalStepsWithout += r.stepsWithout;
        totalStepsWith += r.stepsWith;
    }

    out.push("");
    const avgSavings = results.length > 0
        ? results.reduce((sum, r) => sum + (r.without > 0 ? ((r.without - r.withG) / r.without) * 100 : 0), 0) / results.length
        : 0;
    out.push(`**Average:** ${avgSavings.toFixed(0)}% tokens | ${totalOpsWithout}\u2192${totalOpsWith} ops | ${totalStepsWithout}\u2192${totalStepsWith} steps`);
    out.push("");

    // Index cost
    out.push("## Index Cost");
    out.push("");
    out.push(`Index time: ${fmt(Math.round(amort.indexTimeMs))}ms for ${fmt(stats.files)} files`);
    out.push(`Average query: ${amort.avgQueryMs.toFixed(1)}ms`);

    const breakEvenStr = amort.breakEven === Infinity
        ? "N/A (queries not faster)"
        : `${fmt(amort.breakEven)} queries (amortized after ~${fmt(amort.breakEven)} calls)`;
    out.push(`Break-even: ${breakEvenStr}`);
    out.push("");

    // Accuracy notes
    out.push("## Accuracy");
    out.push("");
    out.push("| Metric | Built-in (grep) | Hex-graph |");
    out.push("|--------|----------------|-----------|");
    out.push("| False positives | Comments, strings, variable names matching | Zero (AST-based) |");
    out.push("| Cross-file resolution | Manual chain of greps | Automatic via import edges |");
    out.push("| Depth control | Manual BFS, error-prone | CTE with depth parameter |");
    out.push("| Structured output | Raw text lines | Markdown tables with metadata |");
    out.push("");

    // Workflow results
    if (workflows.length > 0) {
        out.push("## Workflow Scenarios");
        out.push("");
        out.push("| # | Scenario | Built-in | Hex-graph | Savings | Ops | Steps |");
        out.push("|---|----------|----------|-----------|---------|-----|-------|");
        for (const w of workflows) {
            out.push(
                `| ${w.id} | ${w.scenario} | ${fmt(w.without)} chars | ${fmt(w.withG)} chars | ${pctSavings(w.without, w.withG)} | ${w.opsWithout}\u2192${w.opsWith} | ${w.stepsWithout}\u2192${w.stepsWith} |`
            );
        }
        out.push("");
    }

    console.log(out.join("\n"));
}

main();
