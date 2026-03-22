/**
 * TEST 1-12: Individual tool comparisons (built-in grep/read vs hex-graph).
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { runN, graphResult, rg } from "./helpers.mjs";
import {
    searchSymbols,
    getImpact,
    traceCalls,
    getContext,
    getArchitecture,
    getHotspots,
    getModuleMetrics,
    getReferences,
} from "../lib/store.mjs";
import { findClones } from "../lib/clones.mjs";
import { findCycles } from "../lib/cycles.mjs";
import { findUnused } from "../lib/unused.mjs";
import { impactOfChanges } from "../lib/impact.mjs";

/**
 * @param {object} store  — initialized graph store
 * @param {object} config — { repoRoot, allFiles, searchSym, contextSym, impactSym, traceSym }
 * @returns {object[]}    — array of result rows
 */
export function runAtomic(store, config) {
    const results = [];
    const { repoRoot, allFiles, searchSym, contextSym, impactSym, traceSym } = config;

    // ===================================================================
    // TEST 1: Search symbols
    // ===================================================================
    {
        const name = searchSym.name;

        const withoutChars = runN(() => {
            const out = rg(`-n "${name}" --type js "${repoRoot}" --max-count 30`);
            return out.length;
        });

        const withChars = runN(() => {
            const r = graphResult(searchSymbols(name, { limit: 20 }));
            return r.text.length;
        });

        results.push({
            id: 1,
            scenario: `Search symbols ("${name}")`,
            without: withoutChars,
            withG: withChars,
            opsWithout: 1,
            opsWith: 1,
            stepsWithout: 1,
            stepsWith: 1,
        });
    }

    // ===================================================================
    // TEST 2: Get context (360 view)
    // ===================================================================
    {
        const name = contextSym.name;
        const file = contextSym.file;
        const fullPath = resolve(repoRoot, file);

        const withoutChars = runN(() => {
            let total = 0;
            // 1. Read full source
            try { total += readFileSync(fullPath, "utf-8").length; } catch { /* skip */ }
            // 2. Grep for callers
            total += rg(`-n "${name}" --type js "${repoRoot}"`).length;
            // 3. Grep for callees within function body
            total += rg(`-n "\\b\\w+\\(" "${fullPath}"`).length;
            // 4. List other functions in same file
            total += rg(`-n "function " "${fullPath}"`).length;
            return total;
        });

        const withChars = runN(() => {
            const r = graphResult(getContext(name));
            return r.text.length;
        });

        results.push({
            id: 2,
            scenario: `Get context ("${name}")`,
            without: withoutChars,
            withG: withChars,
            opsWithout: 4,
            opsWith: 1,
            stepsWithout: 4,
            stepsWith: 1,
        });
    }

    // ===================================================================
    // TEST 3: Get impact (blast radius)
    // ===================================================================
    {
        const name = impactSym.name;

        const withoutChars = runN(() => {
            let total = 0;
            // 1. Find files referencing the symbol
            const fileList = rg(`-l "${name}" --type js "${repoRoot}"`);
            total += fileList.length;
            // 2. For each file (max 5): grep for exact lines
            const files = fileList.trim().split("\n").filter(Boolean).slice(0, 5);
            for (const f of files) {
                total += rg(`-n "${name}" "${f}"`).length;
            }
            return total;
        });

        // Count files for ops calculation
        const fileList = rg(`-l "${name}" --type js "${repoRoot}"`);
        const refFileCount = Math.min(fileList.trim().split("\n").filter(Boolean).length, 5);

        const withChars = runN(() => {
            const r = graphResult(getImpact(name, { depth: 3, limit: 50 }));
            return r.text.length;
        });

        results.push({
            id: 3,
            scenario: `Get impact ("${name}")`,
            without: withoutChars,
            withG: withChars,
            opsWithout: 1 + refFileCount,
            opsWith: 1,
            stepsWithout: 3,
            stepsWith: 1,
        });
    }

    // ===================================================================
    // TEST 4: Trace calls
    // ===================================================================
    {
        const name = traceSym.name;

        const withoutChars = runN(() => {
            let total = 0;
            // Depth 1: direct callers
            const d1 = rg(`-n "${name}\\(" --type js "${repoRoot}"`);
            total += d1.length;
            // Depth 2: for each caller, grep for ITS callers
            const d1Lines = d1.trim().split("\n").filter(Boolean).slice(0, 5);
            const callerNames = new Set();
            for (const line of d1Lines) {
                const m = line.match(/(?:function|const|let|var)\s+(\w+)/);
                if (m) callerNames.add(m[1]);
            }
            for (const cn of [...callerNames].slice(0, 3)) {
                total += rg(`-n "${cn}\\(" --type js "${repoRoot}"`).length;
            }
            return total;
        });

        const callerNames = new Set();
        const d1Lines = rg(`-n "${traceSym.name}\\(" --type js "${repoRoot}"`)
            .trim().split("\n").filter(Boolean).slice(0, 5);
        for (const line of d1Lines) {
            const m = line.match(/(?:function|const|let|var)\s+(\w+)/);
            if (m) callerNames.add(m[1]);
        }
        const depth2Ops = Math.min(callerNames.size, 3);

        const withChars = runN(() => {
            const r = graphResult(traceCalls(name, { direction: "callers", depth: 3, limit: 50 }));
            return r.text.length;
        });

        results.push({
            id: 4,
            scenario: `Trace calls ("${name}")`,
            without: withoutChars,
            withG: withChars,
            opsWithout: 1 + depth2Ops,
            opsWith: 1,
            stepsWithout: 3,
            stepsWith: 1,
        });
    }

    // ===================================================================
    // TEST 5: Architecture overview
    // ===================================================================
    {
        const withoutChars = runN(() => {
            let total = 0;
            const subset = allFiles.slice(0, 50);
            for (const f of subset) {
                try { total += readFileSync(f, "utf-8").length; } catch { /* skip */ }
            }
            return total;
        });

        const filesRead = Math.min(allFiles.length, 50);

        const withChars = runN(() => {
            const r = graphResult(getArchitecture());
            return r.text.length;
        });

        results.push({
            id: 5,
            scenario: "Architecture overview",
            without: withoutChars,
            withG: withChars,
            opsWithout: filesRead,
            opsWith: 1,
            stepsWithout: filesRead,
            stepsWith: 1,
        });
    }

    // ===================================================================
    // TEST 6: Find clones
    // ===================================================================
    {
        const withoutChars = runN(() => {
            let total = 0;
            total += rg(`-n "function " --type js "${repoRoot}" --max-count 50`).length;
            const subset = allFiles.slice(0, 10);
            for (const f of subset) {
                try { total += readFileSync(f, "utf-8").length; } catch {}
            }
            return total;
        });
        const filesRead = Math.min(allFiles.length, 10);

        const withChars = runN(() => {
            const result = findClones(store, { type: "all", threshold: 0.80, minStmts: 3, crossFile: true, format: "text", suppress: true });
            return (typeof result === "string" ? result : JSON.stringify(result)).length;
        });

        results.push({
            id: 6, scenario: "Find clones",
            without: withoutChars, withG: withChars,
            opsWithout: 1 + filesRead, opsWith: 1,
            stepsWithout: 2, stepsWith: 1,
        });
    }

    // ===================================================================
    // TEST 7: Find hotspots
    // ===================================================================
    {
        const withoutChars = runN(() => {
            let total = 0;
            total += rg(`-n "function " --type js "${repoRoot}"`).length;
            const funcNames = rg(`-o "function (\\w+)" --type js "${repoRoot}" --max-count 10`)
                .match(/function (\w+)/g)?.slice(0, 5) || [];
            for (const fn of funcNames) {
                const name = fn.replace("function ", "");
                total += rg(`-c "${name}" --type js "${repoRoot}"`).length;
            }
            return total;
        });

        const withChars = runN(() => {
            const result = getHotspots({ limit: 10 });
            return JSON.stringify(result).length;
        });

        results.push({
            id: 7, scenario: "Find hotspots",
            without: withoutChars, withG: withChars,
            opsWithout: 6, opsWith: 1,
            stepsWithout: 3, stepsWith: 1,
        });
    }

    // ===================================================================
    // TEST 8: Impact of changes
    // ===================================================================
    {
        const withoutChars = runN(() => {
            let total = 0;
            try {
                const diff = execSync("git diff --name-only HEAD", { cwd: repoRoot, encoding: "utf-8", timeout: 5000 });
                total += diff.length;
                const files = diff.trim().split("\n").filter(Boolean).slice(0, 5);
                for (const f of files) {
                    const full = resolve(repoRoot, f);
                    total += rg(`-n "export " "${full}"`).length;
                    const exports = rg(`-o "export (?:function|const|class) (\\w+)" "${full}"`);
                    const names = exports.match(/(?:function|const|class) (\w+)/g)?.slice(0, 3) || [];
                    for (const n of names) {
                        const sym = n.split(" ").pop();
                        total += rg(`-l "${sym}" --type js "${repoRoot}"`).length;
                    }
                }
            } catch { total += 100; }
            return total;
        });

        const withChars = runN(() => {
            const result = impactOfChanges(store, repoRoot, { ref: "HEAD", depth: 2 });
            return JSON.stringify(result).length;
        });

        results.push({
            id: 8, scenario: "Impact of changes",
            without: withoutChars, withG: withChars,
            opsWithout: 10, opsWith: 1,
            stepsWithout: 4, stepsWith: 1,
        });
    }

    // ===================================================================
    // TEST 9: Find unused exports
    // ===================================================================
    {
        const withoutChars = runN(() => {
            let total = 0;
            const exports = rg(`-n "export " --type js "${repoRoot}"`);
            total += exports.length;
            const syms = exports.match(/export (?:function|const|class) (\w+)/g)?.slice(0, 10) || [];
            for (const s of syms) {
                const name = s.split(" ").pop();
                total += rg(`-c "${name}" --type js "${repoRoot}"`).length;
            }
            return total;
        });

        const withChars = runN(() => {
            const result = findUnused(store);
            return JSON.stringify(result).length;
        });

        results.push({
            id: 9, scenario: "Find unused exports",
            without: withoutChars, withG: withChars,
            opsWithout: 11, opsWith: 1,
            stepsWithout: 3, stepsWith: 1,
        });
    }

    // ===================================================================
    // TEST 10: Find cycles
    // ===================================================================
    {
        const withoutChars = runN(() => {
            let total = 0;
            for (const f of allFiles.slice(0, 30)) {
                total += rg(`-n "import " "${f}"`).length;
            }
            return total;
        });
        const filesScanned = Math.min(allFiles.length, 30);

        const withChars = runN(() => {
            const result = findCycles(store);
            return JSON.stringify(result).length;
        });

        results.push({
            id: 10, scenario: "Find cycles",
            without: withoutChars, withG: withChars,
            opsWithout: filesScanned, opsWith: 1,
            stepsWithout: filesScanned + 1, stepsWith: 1,
        });
    }

    // ===================================================================
    // TEST 11: Module metrics
    // ===================================================================
    {
        const withoutChars = runN(() => {
            let total = 0;
            for (const f of allFiles.slice(0, 30)) {
                total += rg(`-n "import " "${f}"`).length;
            }
            return total;
        });
        const filesScanned = Math.min(allFiles.length, 30);

        const withChars = runN(() => {
            const result = getModuleMetrics();
            return JSON.stringify(result).length;
        });

        results.push({
            id: 11, scenario: "Module metrics",
            without: withoutChars, withG: withChars,
            opsWithout: filesScanned, opsWith: 1,
            stepsWithout: filesScanned + 2, stepsWith: 1,
        });
    }

    // ===================================================================
    // TEST 12: Find references
    // ===================================================================
    {
        const name = searchSym.name;

        const withoutChars = runN(() => {
            let total = 0;
            total += rg(`-n "${name}" --type js "${repoRoot}"`).length;
            total += rg(`-C 2 "${name}" --type js "${repoRoot}" --max-count 10`).length;
            return total;
        });

        const withChars = runN(() => {
            const result = getReferences(name);
            return (typeof result === "string" ? result : JSON.stringify(result)).length;
        });

        results.push({
            id: 12, scenario: `Find references ("${name}")`,
            without: withoutChars, withG: withChars,
            opsWithout: 2, opsWith: 1,
            stepsWithout: 3, stepsWith: 1,
        });
    }

    return results;
}
