/**
 * Graph enrichment for hex-line tools.
 *
 * Reads .codegraph/index.db (created by hex-graph-mcp) in readonly mode.
 * Provides symbol annotations for outline, read_file, grep_search, edit_file.
 *
 * Lazy singleton: DB opened once per session, reused across calls.
 * Graceful fallback: if better-sqlite3 or DB missing → returns null silently.
 */

import { existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { createRequire } from "node:module";

let _db = null;

let _unavailable = false;

/**
 * Get readonly graph DB for a project root.
 * Returns null if DB missing or better-sqlite3 not installed.
 * @param {string} filePath - any file path inside the project
 * @returns {object|null} better-sqlite3 Database instance or null
 */
export function getGraphDB(filePath) {
    if (_unavailable) return null;
    if (_db) return _db;

    try {
        const projectRoot = findProjectRoot(filePath);
        if (!projectRoot) return null;

        const dbPath = join(projectRoot, ".codegraph", "index.db");
        if (!existsSync(dbPath)) return null;

        const require = createRequire(import.meta.url);
        const Database = require("better-sqlite3");
        _db = new Database(dbPath, { readonly: true });

        return _db;
    } catch {
        _unavailable = true;
        return null;
    }
}

/**
 * Get [N↓ M↑] annotation for a symbol.
 * @param {object} db - better-sqlite3 instance
 * @param {string} file - relative file path
 * @param {string} name - symbol name
 * @returns {string|null} e.g. "[5↓ 3↑]" or null
 */
export function symbolAnnotation(db, file, name) {
    try {
        const node = db.prepare(
            "SELECT id FROM nodes WHERE file = ? AND name = ? AND kind != 'import' LIMIT 1"
        ).get(file, name);
        if (!node) return null;

        const callees = db.prepare(
            "SELECT COUNT(*) as c FROM edges WHERE source_id = ? AND kind = 'calls'"
        ).get(node.id).c;
        const callers = db.prepare(
            "SELECT COUNT(*) as c FROM edges WHERE target_id = ? AND kind = 'calls'"
        ).get(node.id).c;

        if (callees === 0 && callers === 0) return null;
        return `[${callees}\u2193 ${callers}\u2191]`;
    } catch {
        return null;
    }
}

/**
 * Get all symbol annotations for a file (for read_file Graph: header).
 * @param {object} db
 * @param {string} file - relative file path
 * @returns {Array<{name, kind, callees, callers}>}
 */
export function fileAnnotations(db, file) {
    try {
        const nodes = db.prepare(
            "SELECT id, name, kind FROM nodes WHERE file = ? AND kind != 'import' ORDER BY line_start"
        ).all(file);

        const result = [];
        for (const node of nodes) {
            const callees = db.prepare(
                "SELECT COUNT(*) as c FROM edges WHERE source_id = ? AND kind = 'calls'"
            ).get(node.id).c;
            const callers = db.prepare(
                "SELECT COUNT(*) as c FROM edges WHERE target_id = ? AND kind = 'calls'"
            ).get(node.id).c;
            result.push({
                name: node.name,
                kind: node.kind,
                callees,
                callers,
            });
        }
        return result;
    } catch {
        return [];
    }
}

/**
 * Blast radius: symbols affected by changes in given line range.
 * @param {object} db
 * @param {string} file - relative file path
 * @param {number} startLine
 * @param {number} endLine
 * @returns {Array<{name, file, line}>} affected symbols (max 10)
 */
export function blastRadius(db, file, startLine, endLine) {
    try {
        const modified = db.prepare(
            "SELECT id, name FROM nodes WHERE file = ? AND kind != 'import' AND line_start <= ? AND line_end >= ?"
        ).all(file, endLine, startLine);

        if (modified.length === 0) return [];

        const affected = [];
        const seen = new Set();

        for (const node of modified) {
            const dependents = db.prepare(
                "SELECT n.name, n.file, n.line_start FROM edges e JOIN nodes n ON n.id = e.source_id WHERE e.target_id = ? AND e.kind = 'calls'"
            ).all(node.id);

            for (const dep of dependents) {
                const key = `${dep.file}:${dep.name}`;
                if (!seen.has(key) && dep.file !== file) {
                    seen.add(key);
                    affected.push({ name: dep.name, file: dep.file, line: dep.line_start });
                }
            }
        }

        return affected.slice(0, 10);
    } catch {
        return [];
    }
}

/**
 * Get symbol kind + annotation for a grep match.
 * @param {object} db
 * @param {string} file - relative file path
 * @param {number} line - line number
 * @returns {string|null} e.g. "[fn 5↓ 3↑]" or null
 */
export function matchAnnotation(db, file, line) {
    try {
        const node = db.prepare(
            "SELECT id, name, kind FROM nodes WHERE file = ? AND kind != 'import' AND line_start <= ? AND line_end >= ? LIMIT 1"
        ).get(file, line, line);
        if (!node) return null;

        const kindShort = { function: "fn", class: "cls", method: "mtd", variable: "var" }[node.kind] || node.kind;

        const callees = db.prepare(
            "SELECT COUNT(*) as c FROM edges WHERE source_id = ? AND kind = 'calls'"
        ).get(node.id).c;
        const callers = db.prepare(
            "SELECT COUNT(*) as c FROM edges WHERE target_id = ? AND kind = 'calls'"
        ).get(node.id).c;

        if (callees === 0 && callers === 0) return `[${kindShort}]`;
        return `[${kindShort} ${callees}\u2193 ${callers}\u2191]`;
    } catch {
        return null;
    }
}

/**
 * Get relative path from project root (matching DB paths).
 * @param {string} filePath - absolute file path
 * @returns {string|null} relative path with forward slashes, or null
 */
export function getRelativePath(filePath) {
    const root = findProjectRoot(filePath);
    if (!root) return null;
    return relative(root, filePath).replace(/\\/g, "/");
}

// --- Helpers ---

function findProjectRoot(filePath) {
    // First pass: look for .codegraph/index.db (strongest signal)
    let dir = dirname(filePath);
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(dir, ".codegraph", "index.db"))) return dir;
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    // Second pass: fallback to .git
    dir = dirname(filePath);
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(dir, ".git"))) return dir;
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}
