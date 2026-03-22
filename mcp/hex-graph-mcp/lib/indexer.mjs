/**
 * 4-pass indexing pipeline for code knowledge graph.
 *
 * Pass 0: PURGE — remove files no longer on disk (CASCADE cleanup)
 * Pass 1: SCAN — walk directory, skip unchanged files (mtime check)
 * Pass 2: PARSE — tree-sitter AST -> definitions + imports + calls
 * Pass 3: RESOLVE — link imports to target files, build call edges
 *
 * Idempotent: re-running skips unchanged files.
 * Incremental: can reindex a single file (for watcher).
 */

import { readFileSync, statSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { resolve, extname, relative, join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { getStore } from "./store.mjs";
import { parseFile, languageFor, supportedExtensions } from "./parser.mjs";

const IGNORE_DIRS = new Set([
    "node_modules", ".git", "dist", "build", "out", ".next",
    "__pycache__", ".venv", "venv", "vendor", "target",
    ".codegraph", ".vs", "bin", "obj", "packages",
]);

const MAX_FILE_SIZE = 500_000; // 500KB

/**
 * Index a project.
 * @param {string} projectPath
 * @param {object} [options]
 * @param {string[]} [options.languages] - filter by language names
 * @returns {Promise<string>} summary message
 */
export async function indexProject(projectPath, { languages } = {}) {
    const absPath = resolve(projectPath);
    const t0 = Date.now();

    // Ensure .codegraph dir exists
    const dbDir = join(absPath, ".codegraph");
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

    const store = getStore(absPath);

    // Filter extensions by language if specified
    const allowedExts = languages
        ? supportedExtensions().filter(ext => languages.includes(languageFor(ext)))
        : supportedExtensions();
    const allowedSet = new Set(allowedExts);

    // Pass 0: PURGE deleted files
    const existingPaths = store.allFilePaths();
    let purged = 0;
    for (const p of existingPaths) {
        const fullPath = resolve(absPath, p);
        if (!existsSync(fullPath)) {
            store.deleteFile(p);
            purged++;
        }
    }

    // Pass 1: SCAN
    const filesToIndex = [];
    walkDir(absPath, absPath, allowedSet, store, filesToIndex);

    // Pass 2: PARSE
    let parsed = 0;
    const fileNodeMap = new Map(); // relPath -> { definitions, imports, calls, language }

    for (const { relPath, fullPath, mtime } of filesToIndex) {
        let source;
        try {
            source = readFileSync(fullPath, "utf-8").replace(/\r\n/g, "\n");
        } catch {
            continue;
        }

        const hash = createHash("md5").update(source).digest("hex").slice(0, 12);
        const ext = extname(relPath).toLowerCase();
        const language = languageFor(ext);

        const { definitions, imports, calls } = await parseFile(fullPath, source, { cloneDetection: true });

        // Bulk insert definitions + imports
        const nodeIds = store.bulkInsert(relPath, mtime, hash, language, definitions, imports);

        // Insert clone detection data
        persistCloneData(store, definitions, nodeIds);

        fileNodeMap.set(relPath, { definitions, imports, calls, language, nodeIds });
        parsed++;
    }

    // Pass 3: RESOLVE — build call edges
    let edgeCount = 0;
    for (const [filePath, data] of fileNodeMap) {
        const { calls, nodeIds, definitions, imports } = data;

        // Build local symbol map (name -> nodeId, null = ambiguous)
        const localSymbols = new Map();
        // Build class method map ("parent.name" -> nodeId) for scope-aware resolution
        const classMethods = new Map();

        for (const def of definitions) {
            if (!nodeIds.has(def.key)) continue;
            const nodeId = nodeIds.get(def.key);

            // Scoped methods: track by "parent.name" for same-class resolution
            if (def.parent) {
                classMethods.set(`${def.parent}.${def.name}`, nodeId);
            }

            // Unscoped: unique names only (null = ambiguous)
            if (localSymbols.has(def.name)) {
                localSymbols.set(def.name, null);
            } else {
                localSymbols.set(def.name, nodeId);
            }
        }

        // Build imported symbol map
        const importedSymbols = new Map();
        for (const imp of imports) {
            // Try to resolve import source to a file in the project
            const resolvedFile = resolveImportSource(imp.source, filePath, store);
            if (resolvedFile) {
                // Find exported symbols from target file
                const targetNodes = store.nodesByFile(resolvedFile);
                for (const tn of targetNodes) {
                    if (tn.kind !== "import") {
                        importedSymbols.set(tn.name, tn.id);
                    }
                }
            }
            // Also map the imported names directly
            for (const name of imp.name.split(", ")) {
                const trimmed = name.trim();
                if (trimmed && trimmed !== "*") {
                    const targetNodes = store.findByName(trimmed);
                    if (targetNodes.length === 1) {
                        importedSymbols.set(trimmed, targetNodes[0].id);
                    }
                }
            }
        }

        // Determine caller context (which function contains each call)
        for (const call of calls) {
            const callerDef = findEnclosingDefinition(call.line, definitions);
            const callerId = callerDef ? nodeIds.get(callerDef.key) : null;
            if (!callerId) continue;

            // Resolution hierarchy: same-class sibling -> local -> imported -> global unique
            let targetId = null;
            let confidence = "exact";

            // 1. Same-class sibling method (highest priority)
            if (callerDef.parent && classMethods.has(`${callerDef.parent}.${call.name}`)) {
                targetId = classMethods.get(`${callerDef.parent}.${call.name}`);
            }
            // 2. Local symbol (skip if null = ambiguous due to same-name methods)
            else if (localSymbols.has(call.name) && localSymbols.get(call.name) != null) {
                targetId = localSymbols.get(call.name);
            }
            // 3. Imported symbol
            else if (importedSymbols.has(call.name)) {
                targetId = importedSymbols.get(call.name);
            }
            // 4. Global name match (unique only)
            else {
                const candidates = store.findByName(call.name);
                const nonImport = candidates.filter(c => c.kind !== "import");
                if (nonImport.length === 1) {
                    targetId = nonImport[0].id;
                    confidence = "ambiguous";
                }
                // Multiple candidates -> skip (too ambiguous)
            }

            if (targetId && targetId !== callerId) {
                store.insertEdge({
                    source_id: callerId,
                    target_id: targetId,
                    kind: "calls",
                    confidence,
                    file: filePath,
                    line: call.line,
                });
                edgeCount++;
            }
        }
    }

    const elapsed = Date.now() - t0;
    const stats = store.stats();

    return [
        `Indexed ${stats.files} files, ${stats.nodes} symbols, ${stats.edges} edges in ${elapsed}ms`,
        purged > 0 ? `Purged ${purged} deleted files` : null,
        `Parsed ${parsed} files (${filesToIndex.length - parsed} skipped, unchanged)`,
        `Built ${edgeCount} new call edges`,
    ].filter(Boolean).join("\n");
}

/**
 * Reindex a single file (for watcher).
 * @param {string} projectPath
 * @param {string} filePath - relative to project
 */
export async function reindexFile(projectPath, filePath) {
    const absPath = resolve(projectPath);
    const fullPath = resolve(absPath, filePath);

    if (!existsSync(fullPath)) {
        const store = getStore(absPath);
        store.deleteFile(filePath);
        return;
    }

    const source = readFileSync(fullPath, "utf-8").replace(/\r\n/g, "\n");
    const hash = createHash("md5").update(source).digest("hex").slice(0, 12);
    const stat = statSync(fullPath);
    const language = languageFor(extname(filePath).toLowerCase());
    if (!language) return;

    const store = getStore(absPath);
    const { definitions, imports } = await parseFile(fullPath, source, { cloneDetection: true });
    const nodeIds = store.bulkInsert(filePath, stat.mtimeMs, hash, language, definitions, imports);

    // Insert clone detection data for reindexed file
    persistCloneData(store, definitions, nodeIds);
}

// --- Helpers ---

function persistCloneData(store, definitions, nodeIds) {
    for (const def of definitions) {
        if (!def.clone_data) continue;
        const nodeId = nodeIds.get(def.key);
        if (!nodeId) continue;

        store.insertCloneBlock({
            node_id: nodeId,
            raw_hash: def.clone_data.raw_hash,
            norm_hash: def.clone_data.norm_hash,
            fingerprint: def.clone_data.fingerprint,
            stmt_count: def.clone_data.stmt_count,
            token_count: def.clone_data.token_count,
        });

        for (const band of def.clone_data.bands) {
            store.insertLshBand({
                band_id: band.bandId,
                bucket_hash: band.bucketHash,
                node_id: nodeId,
            });
        }
    }
}

function walkDir(dir, root, allowedExts, store, results, depth = 0) {
    if (depth > 12) return;

    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        const fullPath = resolve(dir, entry.name);

        if (entry.isDirectory()) {
            if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
            walkDir(fullPath, root, allowedExts, store, results, depth + 1);
        } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (!allowedExts.has(ext)) continue;

            let stat;
            try {
                stat = statSync(fullPath);
            } catch {
                continue;
            }

            if (stat.size > MAX_FILE_SIZE || stat.size === 0) continue;

            const relPath = relative(root, fullPath).replace(/\\/g, "/");

            // Check if file changed (mtime comparison)
            const existing = store.getFile(relPath);
            if (existing && Math.abs(existing.mtime - stat.mtimeMs) < 1) continue;

            results.push({ relPath, fullPath, mtime: stat.mtimeMs });
        }
    }
}

function findEnclosingDefinition(line, definitions) {
    // Find the definition that contains this line
    let best = null;
    for (const def of definitions) {
        if (def.line_start <= line && def.line_end >= line) {
            // Prefer the most specific (innermost) definition
            if (!best || def.line_start > best.line_start) {
                best = def;
            }
        }
    }
    return best;
}

function resolveImportSource(source, fromFile, store) {
    if (!source) return null;

    // Skip external packages (no relative path)
    if (!source.startsWith(".") && !source.startsWith("/")) return null;

    const fromDir = dirname(fromFile);
    const candidates = [
        join(fromDir, source).replace(/\\/g, "/"),
        join(fromDir, source + ".js").replace(/\\/g, "/"),
        join(fromDir, source + ".mjs").replace(/\\/g, "/"),
        join(fromDir, source + ".ts").replace(/\\/g, "/"),
        join(fromDir, source + ".tsx").replace(/\\/g, "/"),
        join(fromDir, source + ".py").replace(/\\/g, "/"),
        join(fromDir, source, "index.js").replace(/\\/g, "/"),
        join(fromDir, source, "index.ts").replace(/\\/g, "/"),
        join(fromDir, source, "index.mjs").replace(/\\/g, "/"),
    ];

    for (const candidate of candidates) {
        const normalized = candidate.replace(/^\.\//, "");
        if (store.getFile(normalized)) return normalized;
    }

    return null;
}
