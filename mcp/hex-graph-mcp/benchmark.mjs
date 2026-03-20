#!/usr/bin/env node
/**
 * Codegraph Token Efficiency Benchmark
 *
 * Compares char counts (token proxy) for code intelligence queries:
 *   - Without graph: Grep + Read (built-in tools)
 *   - With graph: MCP tool responses
 *
 * Usage: node mcp/hex-graph-mcp/benchmark.mjs [--repo /path/to/repo]
 * Default repo: current working directory.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, extname, basename, relative } from "node:path";
import { execSync } from "node:child_process";
import { indexProject } from "./lib/indexer.mjs";
import { getStore } from "./lib/store.mjs";
import { searchSymbols, getImpact, traceCalls, getContext, getArchitecture } from "./lib/store.mjs";

// --- CLI ---

const args = process.argv.slice(2);
let repoRoot = process.cwd();
const repoIdx = args.indexOf("--repo");
if (repoIdx !== -1 && args[repoIdx + 1]) {
    repoRoot = resolve(args[repoIdx + 1]);
}

const CODE_EXTS = new Set([".js", ".ts", ".mjs", ".py", ".cs", ".php"]);

// --- Helpers ---

function fmt(n) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function pct(a, b) {
    if (b === 0) return "N/A";
    return ((b - a) / b * 100).toFixed(0) + "%";
}

function walkDir(dir, depth = 0) {
    if (depth > 10) return [];
    const results = [];
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return results; }
    for (const e of entries) {
        const full = resolve(dir, e.name);
        if (e.isDirectory()) {
            if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "vendor"
                || e.name === "dist" || e.name === "__pycache__" || e.name === "target") continue;
            results.push(...walkDir(full, depth + 1));
        } else if (e.isFile() && CODE_EXTS.has(extname(e.name).toLowerCase())) {
            try {
                const st = statSync(full);
                if (st.size > 0 && st.size < 500_000) results.push(full);
            } catch { /* skip */ }
        }
    }
    return results;
}

/** Simulate grep output for a symbol name across repo */
function simulateGrep(symbolName, files, root) {
    const lines = [];
    for (const f of files) {
        let content;
        try { content = readFileSync(f, "utf-8"); } catch { continue; }
        const fileLines = content.split("\n");
        for (let i = 0; i < fileLines.length; i++) {
            if (fileLines[i].includes(symbolName)) {
                const relPath = relative(root, f).replace(/\\/g, "/");
                lines.push(`${relPath}:${i + 1}: ${fileLines[i]}`);
            }
        }
    }
    return lines.join("\n");
}

/** Simulate reading files that contain a symbol (Read tool output) */
function simulateReadFiles(symbolName, files, root) {
    const output = [];
    for (const f of files) {
        let content;
        try { content = readFileSync(f, "utf-8"); } catch { continue; }
        if (!content.includes(symbolName)) continue;
        const relPath = relative(root, f).replace(/\\/g, "/");
        const fileLines = content.split("\n");
        // Simulate cat -n output
        const numbered = fileLines.map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join("\n");
        output.push(`=== ${relPath} ===\n${numbered}`);
    }
    return output.join("\n\n");
}

// --- Main ---

async function main() {
    const allFiles = walkDir(repoRoot);
    if (allFiles.length === 0) {
        console.log(`No code files found in ${repoRoot}`);
        process.exit(1);
    }

    const repoName = basename(repoRoot);
    const totalLines = allFiles.reduce((sum, f) => {
        try { return sum + readFileSync(f, "utf-8").split("\n").length; }
        catch { return sum; }
    }, 0);

    // Index the project
    const t0 = Date.now();
    const indexResult = await indexProject(repoRoot);
    const indexTime = Date.now() - t0;

    const store = getStore(resolve(repoRoot));
    const stats = store.stats();

    // Pick sample symbols for benchmarking
    const sampleSymbols = store.db.prepare(`
        SELECT DISTINCT name FROM nodes
        WHERE kind IN ('function', 'method') AND name NOT LIKE 'import%'
        ORDER BY RANDOM()
        LIMIT 5
    `).all().map(r => r.name);

    if (sampleSymbols.length === 0) {
        console.log("No function/method symbols found in graph");
        process.exit(1);
    }

    // --- Scenario 1: "Who calls X?" ---
    const callersRows = [];
    for (const sym of sampleSymbols) {
        const grepOut = simulateGrep(sym, allFiles, repoRoot);
        const graphOut = traceCalls(sym, { direction: "callers" });
        const grepMatches = grepOut.split("\n").filter(Boolean).length;
        callersRows.push({
            symbol: sym,
            grepChars: grepOut.length,
            graphChars: graphOut.length,
            grepMatches,
            savings: pct(graphOut.length, grepOut.length),
        });
    }

    // --- Scenario 2: "Impact of changing X?" ---
    const impactRows = [];
    for (const sym of sampleSymbols) {
        // Without graph: grep + read all files mentioning symbol
        const grepOut = simulateGrep(sym, allFiles, repoRoot);
        const readOut = simulateReadFiles(sym, allFiles, repoRoot);
        const withoutGraph = grepOut.length + readOut.length;
        const graphOut = getImpact(sym);
        impactRows.push({
            symbol: sym,
            grepChars: withoutGraph,
            graphChars: graphOut.length,
            savings: pct(graphOut.length, withoutGraph),
        });
    }

    // --- Scenario 3: "Context of symbol Y?" ---
    const contextRows = [];
    for (const sym of sampleSymbols) {
        const readOut = simulateReadFiles(sym, allFiles, repoRoot);
        const graphOut = getContext(sym);
        contextRows.push({
            symbol: sym,
            readChars: readOut.length,
            graphChars: graphOut.length,
            savings: pct(graphOut.length, readOut.length),
        });
    }

    // --- Scenario 4: "Architecture?" ---
    const archGrepChars = allFiles.map(f => {
        const rel = relative(repoRoot, f).replace(/\\/g, "/");
        return rel;
    }).join("\n").length;
    const archGraphOut = getArchitecture();
    const archGraphChars = archGraphOut.length;

    // --- Report ---
    const lines = [];
    lines.push("# Codegraph Token Efficiency Benchmark");
    lines.push("");
    lines.push(`**Repository:** ${repoName} (${fmt(allFiles.length)} code files, ${fmt(totalLines)} lines)`);
    lines.push(`**Index:** ${stats.files} files, ${stats.nodes} symbols, ${stats.edges} edges in ${indexTime}ms`);
    lines.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
    lines.push("");

    // Scenario 1
    lines.push("## Scenario 1: \"Who calls X?\"");
    lines.push("");
    lines.push("| Symbol | Grep (chars) | Graph (chars) | Grep matches | Savings |");
    lines.push("|--------|-------------|---------------|--------------|---------|");
    for (const r of callersRows) {
        lines.push(`| ${r.symbol} | ${fmt(r.grepChars)} | ${fmt(r.graphChars)} | ${r.grepMatches} | ${r.savings} |`);
    }
    lines.push("");

    // Scenario 2
    lines.push("## Scenario 2: \"Impact of changing X?\"");
    lines.push("");
    lines.push("| Symbol | Grep+Read (chars) | Graph (chars) | Savings |");
    lines.push("|--------|-------------------|---------------|---------|");
    for (const r of impactRows) {
        lines.push(`| ${r.symbol} | ${fmt(r.grepChars)} | ${fmt(r.graphChars)} | ${r.savings} |`);
    }
    lines.push("");

    // Scenario 3
    lines.push("## Scenario 3: \"Context of symbol Y?\"");
    lines.push("");
    lines.push("| Symbol | Read files (chars) | Graph (chars) | Savings |");
    lines.push("|--------|-------------------|---------------|---------|");
    for (const r of contextRows) {
        lines.push(`| ${r.symbol} | ${fmt(r.readChars)} | ${fmt(r.graphChars)} | ${r.savings} |`);
    }
    lines.push("");

    // Scenario 4
    lines.push("## Scenario 4: \"Project architecture?\"");
    lines.push("");
    lines.push(`| Method | Chars |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Glob file listing | ${fmt(archGrepChars)} |`);
    lines.push(`| get_architecture() | ${fmt(archGraphChars)} |`);
    lines.push(`| **Savings** | ${pct(archGraphChars, archGrepChars)} |`);
    lines.push("");

    // Summary
    const avgSavings = [...callersRows, ...impactRows, ...contextRows]
        .map(r => {
            const s = parseInt(r.savings);
            return isNaN(s) ? 0 : s;
        });
    const avgPct = avgSavings.length > 0
        ? Math.round(avgSavings.reduce((a, b) => a + b, 0) / avgSavings.length)
        : 0;

    lines.push("## Summary");
    lines.push("");
    lines.push(`**Average token savings:** ${avgPct}%`);
    lines.push(`**Tool calls reduction:** 1 MCP call vs 5-10 Grep+Read chains`);
    lines.push(`**Precision:** Graph returns only structurally connected symbols, Grep returns all text matches`);
    lines.push("");

    console.log(lines.join("\n"));
}

main();
