/**
 * Heuristic impact estimator based on static call graph.
 * NOT authoritative — name-based resolution, no dynamic dispatch.
 */

import { execFileSync } from "node:child_process";

const TEST_PATTERNS = [
    /\.test\./,
    /\.spec\./,
    /[\\/]test[\\/]/,
    /[\\/]__tests__[\\/]/,
];

function isTestFile(filePath) {
    return TEST_PATTERNS.some(re => re.test(filePath));
}

/**
 * Walk callers transitively up to `depth` levels via 'calls' edges.
 * Returns Set of node IDs (excluding seeds).
 */
function walkCallers(store, seedNodeIds, depth) {
    const visited = new Set(seedNodeIds);
    let frontier = [...seedNodeIds];

    for (let d = 0; d < depth && frontier.length > 0; d++) {
        const next = [];
        for (const nodeId of frontier) {
            const edges = store.edgesTo(nodeId);
            for (const e of edges) {
                if (e.kind !== "calls") continue;
                if (visited.has(e.source_id)) continue;
                visited.add(e.source_id);
                next.push(e.source_id);
            }
        }
        frontier = next;
    }

    // Remove seeds — we only want transitive callers
    for (const id of seedNodeIds) visited.delete(id);
    return visited;
}

/**
 * Estimate which files/tests are affected by recent code changes.
 *
 * @param {Store} store - resolved graph store
 * @param {string} projectPath - project root (for git diff)
 * @param {object} opts
 * @param {string} opts.ref - git ref to diff against (default: "HEAD")
 * @param {number} opts.depth - transitive caller depth (default: 2)
 * @param {boolean} opts.testsOnly - only return affected test files
 * @returns {{ changed: string[], affected: string[], affected_tests: string[], confidence: string, note: string }}
 */
export function impactOfChanges(store, projectPath, { ref = "HEAD", depth = 2, testsOnly = false } = {}) {
    // 1. Get changed files from git
    let diffOutput;
    try {
        diffOutput = execFileSync("git", ["diff", "--name-only", ref], {
            cwd: projectPath,
            encoding: "utf-8",
            timeout: 10_000,
        });
    } catch (err) {
        const msg = err.stderr || err.message || "Unknown git error";
        if (msg.includes("not a git repository")) {
            throw new Error("Not a git repository: " + projectPath);
        }
        if (msg.includes("unknown revision")) {
            throw new Error("Unknown git ref: " + ref);
        }
        throw new Error("git diff failed: " + msg);
    }

    let changedFiles = diffOutput
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);

    // Include untracked files when comparing against HEAD (working tree changes)
    if (ref === "HEAD") {
        try {
            const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
                cwd: projectPath,
                encoding: "utf-8",
                timeout: 10_000,
            });
            const untrackedFiles = untracked.split("\n").filter(Boolean);
            changedFiles = [...new Set([...changedFiles, ...untrackedFiles])];
        } catch { /* ignore — untracked detection is best-effort */ }
    }

    const changed = changedFiles;

    if (changed.length === 0) {
        return {
            changed: [],
            affected: [],
            affected_tests: [],
            confidence: "heuristic",
            note: "No changed files detected.",
        };
    }

    // 2. Collect all symbols from changed files
    const seedNodeIds = [];
    for (const relPath of changed) {
        // Normalize to forward slashes for store lookup
        const normalized = relPath.replace(/\\/g, "/");
        const nodes = store.nodesByFile(normalized);
        for (const n of nodes) {
            seedNodeIds.push(n.id);
        }
    }

    // 3. Walk callers transitively
    const callerIds = walkCallers(store, seedNodeIds, depth);

    // 4. Collect unique affected files from caller nodes
    const affectedFilesSet = new Set();
    const changedSet = new Set(changed.map(f => f.replace(/\\/g, "/")));

    // Resolve file paths for caller node IDs
    if (callerIds.size > 0) {
        const ids = [...callerIds];
        // Batch query in chunks to avoid SQL variable limit
        const CHUNK = 500;
        for (let i = 0; i < ids.length; i += CHUNK) {
            const chunk = ids.slice(i, i + CHUNK);
            const placeholders = chunk.map(() => "?").join(",");
            const rows = store.db.prepare(
                `SELECT DISTINCT file FROM nodes WHERE id IN (${placeholders})`
            ).all(...chunk);
            for (const row of rows) {
                const f = row.file.replace(/\\/g, "/");
                if (!changedSet.has(f)) {
                    affectedFilesSet.add(f);
                }
            }
        }
    }

    // 5. Separate test files
    const affected = [];
    const affectedTests = [];

    for (const f of affectedFilesSet) {
        if (isTestFile(f)) {
            affectedTests.push(f);
        } else {
            affected.push(f);
        }
    }

    // Also check changed files for tests (they are both changed AND test)
    const changedTests = changed.filter(f => isTestFile(f));

    // Add test files from changed set that aren't already in affectedTests
    for (const t of changedTests) {
        const normalized = t.replace(/\\/g, "/");
        if (!affectedTests.includes(normalized)) {
            affectedTests.push(normalized);
        }
    }

    affected.sort();
    affectedTests.sort();
    const sortedChanged = [...changed].sort();

    return {
        changed: sortedChanged,
        affected: testsOnly ? [] : affected,
        affected_tests: affectedTests,
        confidence: "heuristic",
        note: "Based on static call graph. Dynamic dispatch, reflection, and unresolved imports may cause false negatives.",
    };
}
