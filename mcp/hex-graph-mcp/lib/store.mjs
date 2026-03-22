/**
 * SQLite graph store for code knowledge graph.
 *
 * Schema: files -> nodes -> edges, with FTS5 search and CTE traversal.
 * ON DELETE CASCADE: removing a file auto-cleans nodes + edges.
 * WAL mode: concurrent reads during watcher writes.
 * Singleton per DB path.
 */

import Database from "better-sqlite3";
import { join } from "node:path";

// --- Singleton ---

const _stores = new Map();

/**
 * Get or create store for a project.
 * @param {string} projectPath - project root directory
 * @returns {Store}
 */
export function getStore(projectPath) {
    if (_stores.has(projectPath)) return _stores.get(projectPath);
    const store = new Store(projectPath);
    _stores.set(projectPath, store);
    return store;
}

// --- Store class ---

class Store {
    constructor(projectPath) {
        this.projectPath = projectPath;
        const dbPath = join(projectPath, ".codegraph", "index.db");
        this.db = new Database(dbPath);
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
        this._initSchema();
        this._prepareStatements();
    }

    _initSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS files (
                path TEXT PRIMARY KEY,
                mtime REAL NOT NULL,
                hash TEXT NOT NULL,
                node_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS nodes (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                qualified_name TEXT,
                kind TEXT NOT NULL,
                language TEXT NOT NULL,
                file TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
                line_start INTEGER,
                line_end INTEGER,
                parent_id INTEGER REFERENCES nodes(id) ON DELETE SET NULL,
                signature TEXT
            );

            CREATE TABLE IF NOT EXISTS edges (
                id INTEGER PRIMARY KEY,
                source_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                target_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                confidence TEXT DEFAULT 'exact',
                file TEXT NOT NULL,
                line INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
            CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);
            CREATE INDEX IF NOT EXISTS idx_nodes_qualified ON nodes(qualified_name);
            CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
            CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
            CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
            CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind, source_id);
            CREATE INDEX IF NOT EXISTS idx_edges_kind_target ON edges(kind, target_id);
        `);

        // Clone detection tables (non-destructive migration)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS clone_blocks (
                node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
                raw_hash TEXT NOT NULL,
                norm_hash TEXT NOT NULL,
                fingerprint BLOB,
                stmt_count INTEGER NOT NULL,
                token_count INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_clone_raw ON clone_blocks(raw_hash);
            CREATE INDEX IF NOT EXISTS idx_clone_norm ON clone_blocks(norm_hash);
            CREATE INDEX IF NOT EXISTS idx_clone_stmts ON clone_blocks(stmt_count);

            CREATE TABLE IF NOT EXISTS clone_lsh (
                band_id INTEGER NOT NULL,
                bucket_hash TEXT NOT NULL,
                node_id INTEGER NOT NULL REFERENCES clone_blocks(node_id) ON DELETE CASCADE,
                PRIMARY KEY (band_id, bucket_hash, node_id)
            );

            CREATE INDEX IF NOT EXISTS idx_lsh_lookup ON clone_lsh(band_id, bucket_hash);
        `);

        // FTS5 external content table
        const hasFts = this.db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='nodes_fts'"
        ).get();

        if (!hasFts) {
            this.db.exec(`
                CREATE VIRTUAL TABLE nodes_fts USING fts5(
                    name, kind, file,
                    content=nodes, content_rowid=id
                );

                CREATE TRIGGER nodes_ai AFTER INSERT ON nodes BEGIN
                    INSERT INTO nodes_fts(rowid, name, kind, file)
                    VALUES (new.id, new.name, new.kind, new.file);
                END;

                CREATE TRIGGER nodes_ad AFTER DELETE ON nodes BEGIN
                    INSERT INTO nodes_fts(nodes_fts, rowid, name, kind, file)
                    VALUES ('delete', old.id, old.name, old.kind, old.file);
                END;

                CREATE TRIGGER nodes_au AFTER UPDATE ON nodes BEGIN
                    INSERT INTO nodes_fts(nodes_fts, rowid, name, kind, file)
                    VALUES ('delete', old.id, old.name, old.kind, old.file);
                    INSERT INTO nodes_fts(rowid, name, kind, file)
                    VALUES (new.id, new.name, new.kind, new.file);
                END;
            `);
        }
    }

    _prepareStatements() {
        this._insertFile = this.db.prepare(
            "INSERT OR REPLACE INTO files (path, mtime, hash, node_count) VALUES (?, ?, ?, ?)"
        );
        this._getFile = this.db.prepare("SELECT * FROM files WHERE path = ?");
        this._deleteFile = this.db.prepare("DELETE FROM files WHERE path = ?");
        this._allFiles = this.db.prepare("SELECT path FROM files");

        this._insertNode = this.db.prepare(`
            INSERT INTO nodes (name, qualified_name, kind, language, file, line_start, line_end, parent_id, signature)
            VALUES (@name, @qualified_name, @kind, @language, @file, @line_start, @line_end, @parent_id, @signature)
        `);

        this._insertEdge = this.db.prepare(`
            INSERT INTO edges (source_id, target_id, kind, confidence, file, line)
            VALUES (@source_id, @target_id, @kind, @confidence, @file, @line)
        `);

        this._searchFts = this.db.prepare(`
            SELECT n.id, n.name, n.kind, n.file, n.line_start, n.line_end, n.qualified_name, n.signature
            FROM nodes_fts fts
            JOIN nodes n ON n.id = fts.rowid
            WHERE nodes_fts MATCH ?
            ORDER BY rank
            LIMIT ?
        `);

        this._findByName = this.db.prepare(
            "SELECT id, name, kind, file, line_start, line_end, qualified_name FROM nodes WHERE name = ?"
        );

        this._findByQualified = this.db.prepare(
            "SELECT id, name, kind, file, line_start, line_end, qualified_name FROM nodes WHERE qualified_name = ?"
        );

        this._nodesByFile = this.db.prepare(
            "SELECT id, name, kind, line_start, line_end, qualified_name, signature FROM nodes WHERE file = ? ORDER BY line_start"
        );

        this._edgesFrom = this.db.prepare(
            "SELECT e.*, n.name as target_name, n.file as target_file, n.line_start as target_line FROM edges e JOIN nodes n ON n.id = e.target_id WHERE e.source_id = ?"
        );

        this._edgesTo = this.db.prepare(
            "SELECT e.*, n.name as source_name, n.file as source_file, n.line_start as source_line FROM edges e JOIN nodes n ON n.id = e.source_id WHERE e.target_id = ?"
        );

        // --- Clone detection statements ---

        this._insertCloneBlock = this.db.prepare(
            "INSERT OR REPLACE INTO clone_blocks (node_id, raw_hash, norm_hash, fingerprint, stmt_count, token_count) VALUES (@node_id, @raw_hash, @norm_hash, @fingerprint, @stmt_count, @token_count)"
        );

        this._insertLshBand = this.db.prepare(
            "INSERT OR REPLACE INTO clone_lsh (band_id, bucket_hash, node_id) VALUES (@band_id, @bucket_hash, @node_id)"
        );

        this._lshCandidates = this.db.prepare(
            "SELECT DISTINCT cl.node_id FROM clone_lsh cl WHERE cl.band_id = ? AND cl.bucket_hash = ? AND cl.node_id != ?"
        );

        this._cloneBlockById = this.db.prepare(`
            SELECT cb.node_id, cb.raw_hash, cb.norm_hash, cb.fingerprint, cb.stmt_count, cb.token_count,
                   n.name, n.kind, n.file, n.line_start, n.line_end, n.qualified_name, n.signature
            FROM clone_blocks cb
            JOIN nodes n ON n.id = cb.node_id
            WHERE cb.node_id = ?
        `);

        this._allCloneBlocks = this.db.prepare(`
            SELECT cb.node_id, cb.raw_hash, cb.norm_hash, cb.fingerprint, cb.stmt_count, cb.token_count,
                   n.name, n.kind, n.file, n.line_start, n.line_end, n.qualified_name, n.signature
            FROM clone_blocks cb
            JOIN nodes n ON n.id = cb.node_id
            WHERE cb.stmt_count >= ?
        `);
    }

    // --- File operations ---

    upsertFile(path, mtime, hash, nodeCount) {
        this._insertFile.run(path, mtime, hash, nodeCount);
    }

    getFile(path) {
        return this._getFile.get(path);
    }

    deleteFile(path) {
        this._deleteFile.run(path);
    }

    allFilePaths() {
        return this._allFiles.all().map(r => r.path);
    }

    // --- Node operations ---

    insertNode(node) {
        const result = this._insertNode.run(node);
        return result.lastInsertRowid;
    }

    nodesByFile(filePath) {
        return this._nodesByFile.all(filePath);
    }

    findByName(name) {
        return this._findByName.all(name);
    }

    findByQualified(qualifiedName) {
        return this._findByQualified.all(qualifiedName);
    }

    // --- Edge operations ---

    insertEdge(edge) {
        this._insertEdge.run(edge);
    }

    edgesFrom(nodeId) {
        return this._edgesFrom.all(nodeId);
    }

    edgesTo(nodeId) {
        return this._edgesTo.all(nodeId);
    }

    // --- Clone detection operations ---

    insertCloneBlock({node_id, raw_hash, norm_hash, fingerprint, stmt_count, token_count}) {
        this._insertCloneBlock.run({node_id, raw_hash, norm_hash, fingerprint, stmt_count, token_count});
    }

    insertLshBand({band_id, bucket_hash, node_id}) {
        this._insertLshBand.run({band_id, bucket_hash, node_id});
    }

    getLshCandidates(bandId, bucketHash, excludeNodeId) {
        return this._lshCandidates.all(bandId, bucketHash, excludeNodeId).map(r => r.node_id);
    }

    getCloneBlockById(nodeId) {
        return this._cloneBlockById.get(nodeId);
    }

    getAllCloneBlocks(minStmts) {
        return this._allCloneBlocks.all(minStmts);
    }

    // --- Bulk operations (transaction) ---

    clearFile(filePath) {
        // CASCADE: deleting file removes all nodes + edges
        this._deleteFile.run(filePath);
    }

    bulkInsert(filePath, mtime, hash, language, definitions, imports) {
        const tx = this.db.transaction(() => {
            // Clear old data for this file
            this._deleteFile.run(filePath);

            const allNodes = [...definitions, ...imports];
            this._insertFile.run(filePath, mtime, hash, allNodes.length);

            const nodeIds = new Map();
            const classIndex = new Map(); // className -> nodeId

            for (const def of definitions) {
                const id = this.insertNode({
                    name: def.name,
                    qualified_name: def.parent
                        ? `${filePath}:${def.parent}.${def.name}`
                        : `${filePath}:${def.name}`,
                    kind: def.kind,
                    language,
                    file: filePath,
                    line_start: def.line_start,
                    line_end: def.line_end,
                    parent_id: def.parent ? (classIndex.get(def.parent) || null) : null,
                    signature: def.signature || null,
                });
                nodeIds.set(def.key, id);

                // Index class definitions for fast parent lookup
                if (def.kind === "class") {
                    classIndex.set(def.name, id);
                }
            }

            for (const imp of imports) {
                const id = this.insertNode({
                    name: imp.name,
                    qualified_name: `${filePath}:import:${imp.source}`,
                    kind: "import",
                    language,
                    file: filePath,
                    line_start: imp.line,
                    line_end: imp.line,
                    parent_id: null,
                    signature: null,
                });
                nodeIds.set(`import:${imp.source}`, id);
            }

            return nodeIds;
        });

        return tx();
    }

    // --- Query: Search symbols (FTS5) ---

    search(query, { kind, limit = 20 } = {}) {
        let ftsQuery = query;
        if (kind) ftsQuery = `${query} AND kind:${kind}`;

        try {
            return this._searchFts.all(ftsQuery, limit);
        } catch {
            // Fallback to LIKE if FTS query syntax fails
            const likeQuery = `%${query}%`;
            const stmt = kind
                ? this.db.prepare("SELECT * FROM nodes WHERE name LIKE ? AND kind = ? LIMIT ?")
                : this.db.prepare("SELECT * FROM nodes WHERE name LIKE ? LIMIT ?");
            return kind ? stmt.all(likeQuery, kind, limit) : stmt.all(likeQuery, limit);
        }
    }

    // --- Query: Impact (reverse CTE) ---

    impact(symbolName, { depth = 3 } = {}) {
        const nodes = this.findByName(symbolName);
        if (nodes.length === 0) return [];

        const nodeIds = nodes.map(n => n.id);
        const placeholders = nodeIds.map(() => "?").join(",");

        const stmt = this.db.prepare(`
            WITH RECURSIVE impact_chain(id, name, file, line_start, kind, depth, path) AS (
                SELECT n.id, n.name, n.file, n.line_start, n.kind, 0, n.name
                FROM nodes n WHERE n.id IN (${placeholders})

                UNION ALL

                SELECT n2.id, n2.name, n2.file, n2.line_start, n2.kind, ic.depth + 1,
                       ic.path || ' <- ' || n2.name
                FROM impact_chain ic
                JOIN edges e ON e.target_id = ic.id
                JOIN nodes n2 ON n2.id = e.source_id
                WHERE ic.depth < ? AND instr(ic.path, n2.name) = 0
            )
            SELECT DISTINCT id, name, file, line_start, kind, depth, path
            FROM impact_chain
            ORDER BY depth, file, line_start
        `);

        return stmt.all(...nodeIds, depth);
    }

    // --- Query: Trace calls (BFS CTE) ---

    trace(symbolName, { direction = "callers", depth = 3 } = {}) {
        const nodes = this.findByName(symbolName);
        if (nodes.length === 0) return [];

        const nodeIds = nodes.map(n => n.id);
        const placeholders = nodeIds.map(() => "?").join(",");

        const joinClause = direction === "callers"
            ? "JOIN edges e ON e.target_id = tc.id JOIN nodes n2 ON n2.id = e.source_id"
            : "JOIN edges e ON e.source_id = tc.id JOIN nodes n2 ON n2.id = e.target_id";

        const edgeFilter = "AND e.kind = 'calls'";

        const stmt = this.db.prepare(`
            WITH RECURSIVE trace_chain(id, name, file, line_start, kind, depth, confidence, path) AS (
                SELECT n.id, n.name, n.file, n.line_start, n.kind, 0, 'exact', n.name
                FROM nodes n WHERE n.id IN (${placeholders})

                UNION ALL

                SELECT n2.id, n2.name, n2.file, n2.line_start, n2.kind, tc.depth + 1, e.confidence,
                       tc.path || ' -> ' || n2.name
                FROM trace_chain tc
                ${joinClause}
                WHERE tc.depth < ? ${edgeFilter} AND instr(tc.path, n2.name) = 0
            )
            SELECT DISTINCT id, name, file, line_start, kind, depth, confidence, path
            FROM trace_chain
            ORDER BY depth, file, line_start
        `);

        return stmt.all(...nodeIds, depth);
    }

    // --- Query: Context (360 view) ---

    context(symbolName) {
        const nodes = this.findByName(symbolName);
        if (nodes.length === 0) return null;

        // Prefer definitions over imports
        const node = nodes.find(n => n.kind !== "import") || nodes[0];
        const callers = this.edgesTo(node.id).filter(e => e.kind === "calls");
        const callees = this.edgesFrom(node.id).filter(e => e.kind === "calls");
        const siblings = this.nodesByFile(node.file).filter(n => n.id !== node.id);
        const imports = this.edgesFrom(node.id).filter(e => e.kind === "imports");

        return {
            definition: node,
            callers: callers.map(e => ({ name: e.source_name, file: e.source_file, line: e.source_line })),
            callees: callees.map(e => ({ name: e.target_name, file: e.target_file, line: e.target_line })),
            siblings: siblings.map(s => ({ name: s.name, kind: s.kind, line_start: s.line_start })),
            imports: imports.map(e => ({ name: e.target_name, file: e.target_file })),
        };
    }

    // --- Query: Architecture ---

    architecture(scopePath) {
        // Group nodes by directory (module proxy)
        const allNodes = scopePath
            ? this.db.prepare("SELECT * FROM nodes WHERE file LIKE ? || '%' ESCAPE '\\'")
                .all(scopePath.replace(/[%_\\]/g, m => "\\" + m))
            : this.db.prepare("SELECT * FROM nodes").all();

        const modules = new Map();
        for (const node of allNodes) {
            const parts = node.file.replace(/\\/g, "/").split("/");
            const moduleKey = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
            if (!modules.has(moduleKey)) {
                modules.set(moduleKey, { files: new Set(), symbols: 0, kinds: {} });
            }
            const mod = modules.get(moduleKey);
            mod.files.add(node.file);
            mod.symbols++;
            mod.kinds[node.kind] = (mod.kinds[node.kind] || 0) + 1;
        }

        // Hotspots: most connected nodes
        const hotspots = this.db.prepare(`
            SELECT n.name, n.kind, n.file, n.line_start,
                   (SELECT COUNT(*) FROM edges WHERE source_id = n.id) as outgoing,
                   (SELECT COUNT(*) FROM edges WHERE target_id = n.id) as incoming,
                   (SELECT COUNT(*) FROM edges WHERE source_id = n.id) +
                   (SELECT COUNT(*) FROM edges WHERE target_id = n.id) as total
            FROM nodes n
            ORDER BY total DESC
            LIMIT 15
        `).all();

        // Cross-module edges
        const crossEdges = this.db.prepare(`
            SELECT
                replace(n1.file, rtrim(n1.file, replace(n1.file, '/', '')), '') as src_dir,
                replace(n2.file, rtrim(n2.file, replace(n2.file, '/', '')), '') as tgt_dir,
                COUNT(*) as count
            FROM edges e
            JOIN nodes n1 ON n1.id = e.source_id
            JOIN nodes n2 ON n2.id = e.target_id
            WHERE src_dir != tgt_dir
            GROUP BY src_dir, tgt_dir
            ORDER BY count DESC
            LIMIT 20
        `).all();

        return { modules, hotspots, crossEdges };
    }

    // --- Stats ---

    stats() {
        const files = this.db.prepare("SELECT COUNT(*) as count FROM files").get().count;
        const nodes = this.db.prepare("SELECT COUNT(*) as count FROM nodes").get().count;
        const edges = this.db.prepare("SELECT COUNT(*) as count FROM edges").get().count;
        return { files, nodes, edges };
    }

    close() {
        this.db.close();
        _stores.delete(this.projectPath);
    }
}

// --- Error helper (MCP_TOOL_DESIGN_GUIDE Rule 3) ---

export function graphError(code, message, recovery) {
    return { content: [{ type: "text", text: `${code}: ${message}\nRecovery: ${recovery}` }], isError: true };
}

export function resolveStore(path) {
    if (path) {
        const store = _stores.get(path);
        if (store) return store;
        for (const [key, s] of _stores) {
            if (path.startsWith(key) || key.startsWith(path)) return s;
        }
    }
    const first = [..._stores.values()][0];
    if (!first) return null;
    return first;
}


// --- Exported query functions (for server.mjs tool handlers) ---
export function searchSymbols(query, { kind, limit = 20, path } = {}) {
    const store = resolveStore(path);
    if (!store) return graphError("NOT_INDEXED", "No project indexed", "Run index_project first");

    const results = store.search(query, { kind, limit });
    if (results.length === 0) return graphError("SYMBOL_NOT_FOUND", `No symbols matching "${query}"`, "Try a shorter query or different kind filter");

    const lines = [`Found ${results.length} symbols:\n`];
    lines.push("| Name | Kind | File | Line |");
    lines.push("|------|------|------|------|");
    for (const r of results) {
        lines.push(`| ${r.name} | ${r.kind} | ${r.file} | ${r.line_start} |`);
    }
    return lines.join("\n");
}

export function getImpact(symbol, { depth = 3, limit = 50, path } = {}) {
    const store = resolveStore(path);
    if (!store) return graphError("NOT_INDEXED", "No project indexed", "Run index_project first");

    const results = store.impact(symbol, { depth });
    if (results.length === 0) return graphError("SYMBOL_NOT_FOUND", `No impact found for "${symbol}"`, "Check spelling, run search_symbols");

    const truncated = results.length > limit;
    const shown = truncated ? results.slice(0, limit) : results;

    const lines = [`Impact analysis for "${symbol}" (depth ${depth}):\n`];
    lines.push("| Depth | Name | Kind | File | Line | Path |");
    lines.push("|-------|------|------|------|------|------|");
    for (const r of shown) {
        lines.push(`| ${r.depth} | ${r.name} | ${r.kind} | ${r.file} | ${r.line_start} | ${r.path} |`);
    }
    if (truncated) lines.push(`\n--- ${results.length - limit} more symbols omitted ---`);
    lines.push(`\n${results.length} symbols in blast radius`);
    return lines.join("\n");
}

export function traceCalls(symbol, { direction = "callers", depth = 3, limit = 50, path } = {}) {
    const store = resolveStore(path);
    if (!store) return graphError("NOT_INDEXED", "No project indexed", "Run index_project first");

    const results = store.trace(symbol, { direction, depth });
    if (results.length === 0) return graphError("SYMBOL_NOT_FOUND", `No ${direction} found for "${symbol}"`, "Check spelling, run search_symbols");

    const truncated = results.length > limit;
    const shown = truncated ? results.slice(0, limit) : results;

    const lines = [`${direction} of "${symbol}" (depth ${depth}):\n`];
    lines.push("| Depth | Name | Kind | File | Line | Confidence | Chain |");
    lines.push("|-------|------|------|------|------|------------|-------|");
    for (const r of shown) {
        lines.push(`| ${r.depth} | ${r.name} | ${r.kind} | ${r.file} | ${r.line_start} | ${r.confidence} | ${r.path} |`);
    }
    if (truncated) lines.push(`\n--- ${results.length - limit} more symbols omitted ---`);
    return lines.join("\n");
}

export function getContext(symbol, { path } = {}) {
    const store = resolveStore(path);
    if (!store) return graphError("NOT_INDEXED", "No project indexed", "Run index_project first");

    const ctx = store.context(symbol);
    if (!ctx) return graphError("SYMBOL_NOT_FOUND", `Symbol "${symbol}" not found`, "Check spelling, run search_symbols");

    const lines = [];
    const d = ctx.definition;
    lines.push(`## ${d.name} (${d.kind})`);
    lines.push(`**File:** ${d.file}:${d.line_start}-${d.line_end}`);
    if (d.qualified_name) lines.push(`**Qualified:** ${d.qualified_name}`);
    lines.push("");

    const MAX_REFS = 50;
    if (ctx.callers.length > 0) {
        lines.push(`### Callers (${ctx.callers.length})`);
        for (const c of ctx.callers.slice(0, MAX_REFS)) lines.push(`- ${c.name} (${c.file}:${c.line})`);
        if (ctx.callers.length > MAX_REFS) lines.push(`  ... (${ctx.callers.length - MAX_REFS} more callers)`);
        lines.push("");
    }

    if (ctx.callees.length > 0) {
        lines.push(`### Callees (${ctx.callees.length})`);
        for (const c of ctx.callees.slice(0, MAX_REFS)) lines.push(`- ${c.name} (${c.file}:${c.line})`);
        if (ctx.callees.length > MAX_REFS) lines.push(`  ... (${ctx.callees.length - MAX_REFS} more callees)`);
        lines.push("");
    }

    if (ctx.siblings.length > 0) {
        lines.push(`### Siblings in same file (${ctx.siblings.length})`);
        for (const s of ctx.siblings.slice(0, MAX_REFS)) lines.push(`- ${s.name} (${s.kind}, L${s.line_start})`);
        if (ctx.siblings.length > MAX_REFS) lines.push(`  ... (${ctx.siblings.length - MAX_REFS} more siblings)`);
        lines.push("");
    }

    return lines.join("\n");
}

export function getArchitecture(scopePath, { limit = 15, path } = {}) {
    const store = resolveStore(path);
    if (!store) return graphError("NOT_INDEXED", "No project indexed", "Run index_project first");

    const { modules, hotspots, crossEdges } = store.architecture(scopePath);

    const lines = [];
    lines.push("## Modules\n");
    lines.push("| Module | Files | Symbols | Breakdown |");
    lines.push("|--------|-------|---------|-----------|" );
    for (const [name, mod] of modules) {
        const breakdown = Object.entries(mod.kinds).map(([k, v]) => `${k}:${v}`).join(", ");
        lines.push(`| ${name} | ${mod.files.size} | ${mod.symbols} | ${breakdown} |`);
    }

    const shownHotspots = hotspots.slice(0, limit);
    lines.push("\n## Hotspots (most connected)\n");
    lines.push("| Name | Kind | File | In | Out | Total |");
    lines.push("|------|------|------|----|-----|-------|");
    for (const h of shownHotspots) {
        lines.push(`| ${h.name} | ${h.kind} | ${h.file} | ${h.incoming} | ${h.outgoing} | ${h.total} |`);
    }
    if (hotspots.length > limit) lines.push(`\n--- ${hotspots.length - limit} more hotspots omitted ---`);

    if (crossEdges.length > 0) {
        lines.push("\n## Cross-Module Dependencies\n");
        lines.push("| From | To | Edges |");
        lines.push("|------|----|-------|");
        for (const e of crossEdges) {
            lines.push(`| ${e.src_dir} | ${e.tgt_dir} | ${e.count} |`);
        }
    }

    const stats = store.stats();
    lines.push(`\n**Total:** ${stats.files} files, ${stats.nodes} symbols, ${stats.edges} edges`);

    return lines.join("\n");
}
