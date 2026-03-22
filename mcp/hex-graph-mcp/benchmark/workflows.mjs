/**
 * W1-W4: Multi-tool pipeline workflow scenarios.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
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
import { findCycles } from "../lib/cycles.mjs";
import { findUnused } from "../lib/unused.mjs";
import { impactOfChanges } from "../lib/impact.mjs";

/**
 * @param {object} store  — initialized graph store
 * @param {object} config — { repoRoot, allFiles, searchSym, contextSym, impactSym, traceSym }
 * @returns {object[]}    — array of workflow result rows
 */
export function runWorkflows(store, config) {
    const workflows = [];
    const { repoRoot, allFiles, searchSym, impactSym } = config;

    // W1: Understand unfamiliar codebase
    {
        const withoutChars = runN(() => {
            let total = 0;
            const subset = allFiles.slice(0, 10);
            for (const f of subset) {
                try { total += readFileSync(f, "utf-8").length; } catch {}
            }
            total += rg(`-n "function " --type js "${repoRoot}" --max-count 30`).length;
            total += rg(`-n "class " --type js "${repoRoot}" --max-count 30`).length;
            return total;
        });

        const withChars = runN(() => {
            let total = 0;
            total += graphResult(getArchitecture()).text.length;
            total += graphResult(searchSymbols("main", { limit: 5 })).text.length;
            if (searchSym) total += graphResult(getContext(searchSym.name)).text.length;
            return total;
        });

        workflows.push({
            id: "W1", scenario: "Understand codebase",
            without: withoutChars, withG: withChars,
            opsWithout: 12, opsWith: 3,
            stepsWithout: 12, stepsWith: 3,
        });
    }

    // W2: Safe refactoring
    {
        const name = impactSym?.name || searchSym.name;
        const withoutChars = runN(() => {
            let total = 0;
            total += rg(`-n "${name}" --type js "${repoRoot}"`).length;
            total += rg(`-l "${name}" --type js "${repoRoot}"`).length;
            const files = rg(`-l "${name}" --type js "${repoRoot}"`).trim().split("\n").filter(Boolean).slice(0, 5);
            for (const f of files) {
                try { total += readFileSync(f, "utf-8").length; } catch {}
            }
            return total;
        });

        const withChars = runN(() => {
            let total = 0;
            total += graphResult(getImpact(name, { depth: 3, limit: 50 })).text.length;
            total += (typeof getReferences(name) === "string" ? getReferences(name) : JSON.stringify(getReferences(name))).length;
            total += graphResult(traceCalls(name, { direction: "callers", depth: 2 })).text.length;
            return total;
        });

        workflows.push({
            id: "W2", scenario: "Safe refactoring",
            without: withoutChars, withG: withChars,
            opsWithout: 7, opsWith: 3,
            stepsWithout: 5, stepsWith: 3,
        });
    }

    // W3: Code quality audit
    {
        const withoutChars = runN(() => {
            let total = 0;
            total += rg(`-n "export " --type js "${repoRoot}"`).length;
            for (const f of allFiles.slice(0, 20)) {
                total += rg(`-n "import " "${f}"`).length;
            }
            total += rg(`-n "function " --type js "${repoRoot}"`).length;
            return total;
        });

        const withChars = runN(() => {
            let total = 0;
            total += JSON.stringify(findUnused(store)).length;
            total += JSON.stringify(findCycles(store)).length;
            total += JSON.stringify(getHotspots({ limit: 10 })).length;
            total += JSON.stringify(getModuleMetrics()).length;
            return total;
        });

        workflows.push({
            id: "W3", scenario: "Code quality audit",
            without: withoutChars, withG: withChars,
            opsWithout: 22, opsWith: 4,
            stepsWithout: 22, stepsWith: 4,
        });
    }

    // W4: PR review — impact assessment
    {
        const withoutChars = runN(() => {
            let total = 0;
            try {
                total += execSync("git diff --name-only HEAD", { cwd: repoRoot, encoding: "utf-8", timeout: 5000 }).length;
            } catch { total += 50; }
            total += rg(`-n "function " --type js "${repoRoot}" --max-count 20`).length;
            total += rg(`-n "export " --type js "${repoRoot}" --max-count 20`).length;
            return total;
        });

        const withChars = runN(() => {
            let total = 0;
            total += JSON.stringify(impactOfChanges(store, repoRoot)).length;
            total += JSON.stringify(getHotspots({ limit: 5 })).length;
            return total;
        });

        workflows.push({
            id: "W4", scenario: "PR review impact",
            without: withoutChars, withG: withChars,
            opsWithout: 3, opsWith: 2,
            stepsWithout: 4, stepsWith: 2,
        });
    }

    return workflows;
}
