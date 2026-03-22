#!/usr/bin/env node
/**
 * hex-graph-mcp — Code knowledge graph MCP server.
 *
 * 8 tools: index_project, search_symbols, get_impact, trace_calls,
 *          get_context, get_architecture, watch_project, find_clones
 * Tree-sitter AST → SQLite graph (nodes, edges, FTS5)
 * Transport: stdio
 */

import { z } from "zod";
import { createRequire } from "node:module";
const { version } = createRequire(import.meta.url)("./package.json");
import { checkForUpdates } from "./lib/update-check.mjs";
import { coerceParams } from "./lib/coerce.mjs";
import { findClones } from "./lib/clones.mjs";
import { resolveStore } from "./lib/store.mjs";

// LLM clients may send booleans/numbers as strings. Safe coercion.
const flexBool = () => z.preprocess(
    v => typeof v === "string" ? v === "true" : v,
    z.boolean().optional()
);
const flexNum = () => z.preprocess(
    v => typeof v === "string" ? Number(v) : v,
    z.number().optional()
);

// --- SDK ---

let McpServer, StdioServerTransport;
try {
    ({ McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js"));
    ({ StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js"));
} catch {
    process.stderr.write(
        "hex-graph-mcp: @modelcontextprotocol/sdk not found.\n" +
        "Run: cd mcp/hex-graph-mcp && npm install\n"
    );
    process.exit(1);
}

const server = new McpServer({ name: "hex-graph-mcp", version });

// --- Error helper (MCP_TOOL_DESIGN_GUIDE Rule 3) ---
function graphError(code, message, recovery) {
    return { content: [{ type: "text", text: `${code}: ${message}\nRecovery: ${recovery}` }], isError: true };
}

// ==================== index_project ====================

server.registerTool("index_project", {
    title: "Index Project",
    description:
        "Scan and index a project into a code knowledge graph. " +
        "Extracts functions, classes, methods, imports, call edges via tree-sitter AST. " +
        "Idempotent: re-running skips unchanged files. Run once when starting work on a codebase.",
    inputSchema: z.object({
        path: z.string().describe("Project root directory"),
        languages: z.array(z.string()).optional().describe('Filter languages (e.g. ["javascript","python"]). Default: all supported'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path: projectPath, languages } = coerceParams(rawParams);
    try {
        const { indexProject } = await import("./lib/indexer.mjs");
        const result = await indexProject(projectPath, { languages });
        return { content: [{ type: "text", text: result }] };
    } catch (e) {
        return graphError("PATH_NOT_FOUND", e.message, "Check path exists and is accessible");
    }
});

// ==================== search_symbols ====================

server.registerTool("search_symbols", {
    title: "Search Symbols",
    description:
        "Full-text search for symbols (functions, classes, methods) by name. " +
        "Returns matching symbols with file:line location. " +
        "Use to find code before get_context or trace_calls.",
    inputSchema: z.object({
        query: z.string().describe("Symbol name or partial name to search"),
        kind: z.string().optional().describe('Filter by kind: "function", "class", "method", "variable", "import"'),
        limit: flexNum().describe("Max results (default: 20)"),
        path: z.string().optional().describe("Project path (auto-detected if single project indexed)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { query, kind, limit, path } = coerceParams(rawParams);
    try {
        const { searchSymbols } = await import("./lib/store.mjs");
        const result = searchSymbols(query, { kind, limit, path });
        if (result.isError) return result;
        return { content: [{ type: "text", text: result }] };
    } catch (e) {
        return graphError("DB_ERROR", e.message, "Re-run index_project to rebuild");
    }
});

// ==================== get_impact ====================

server.registerTool("get_impact", {
    title: "Get Impact",
    description:
        "Blast radius analysis: what symbols and files are affected if you change a given symbol. " +
        "Walks reverse dependency edges transitively. " +
        "Use BEFORE refactoring to understand consequences.",
    inputSchema: z.object({
        symbol: z.string().describe("Symbol name to analyze"),
        depth: flexNum().describe("Max traversal depth (default: 3)"),
        limit: flexNum().describe("Max results (default: 50)"),
        path: z.string().optional().describe("Project path (auto-detected if single project indexed)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { symbol, depth, limit, path } = coerceParams(rawParams);
    try {
        const { getImpact } = await import("./lib/store.mjs");
        const result = getImpact(symbol, { depth, limit, path });
        if (result.isError) return result;
        return { content: [{ type: "text", text: result }] };
    } catch (e) {
        return graphError("DB_ERROR", e.message, "Re-run index_project to rebuild");
    }
});


// ==================== trace_calls ====================

server.registerTool("trace_calls", {
    title: "Trace Calls",
    description:
        "Trace call chains: who calls this symbol (callers) or what does it call (callees). " +
        "BFS traversal on call edges with configurable depth. " +
        "Use to understand execution flow and find entry points.",
    inputSchema: z.object({
        symbol: z.string().describe("Symbol name to trace"),
        direction: z.enum(["callers", "callees"]).optional().describe('Traversal direction (default: "callers")'),
        depth: flexNum().describe("Max traversal depth (default: 3)"),
        limit: flexNum().describe("Max results (default: 50)"),
        path: z.string().optional().describe("Project path (auto-detected if single project indexed)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { symbol, direction, depth, limit, path } = coerceParams(rawParams);
    try {
        const { traceCalls } = await import("./lib/store.mjs");
        const result = traceCalls(symbol, { direction, depth, limit, path });
        if (result.isError) return result;
        return { content: [{ type: "text", text: result }] };
    } catch (e) {
        return graphError("DB_ERROR", e.message, "Re-run index_project to rebuild");
    }
});


// ==================== get_context ====================

server.registerTool("get_context", {
    title: "Get Context",
    description:
        "360-degree view of a symbol: definition, callers, callees, siblings in same scope, file context. " +
        "Combines multiple graph queries into one response. " +
        "Key tool for understanding unfamiliar code — start here.",
    inputSchema: z.object({
        symbol: z.string().describe("Symbol name to inspect"),
        path: z.string().optional().describe("Project path (auto-detected if single project indexed)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { symbol, path } = coerceParams(rawParams);
    try {
        const { getContext } = await import("./lib/store.mjs");
        const result = getContext(symbol, { path });
        if (result.isError) return result;
        return { content: [{ type: "text", text: result }] };
    } catch (e) {
        return graphError("DB_ERROR", e.message, "Re-run index_project to rebuild");
    }
});

// ==================== get_architecture ====================

server.registerTool("get_architecture", {
    title: "Get Architecture",
    description:
        "Project architecture overview: modules (directory-based), dependency matrix between modules, " +
        "hotspots (most connected symbols). " +
        "Use when starting work on unfamiliar codebase.",
    inputSchema: z.object({
        path: z.string().optional().describe("Scope to subdirectory (default: entire indexed project)"),
        project_path: z.string().optional().describe("Project path (auto-detected if single project indexed)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path: scopePath, project_path } = coerceParams(rawParams);
    try {
        const { getArchitecture } = await import("./lib/store.mjs");
        const result = getArchitecture(scopePath, { path: project_path });
        if (result.isError) return result;
        return { content: [{ type: "text", text: result }] };
    } catch (e) {
        return graphError("DB_ERROR", e.message, "Re-run index_project to rebuild");
    }
});

// ==================== watch_project ====================

server.registerTool("watch_project", {
    title: "Watch Project",
    description:
        "Start file watcher for incremental graph updates. " +
        "Singleton per project path — re-calling returns existing watcher status. " +
        "On file change: reparse and update graph. On file delete: CASCADE cleanup.",
    inputSchema: z.object({
        path: z.string().describe("Project root directory to watch"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path: projectPath } = coerceParams(rawParams);
    try {
        const { watchProject } = await import("./lib/watcher.mjs");
        const result = watchProject(projectPath);
        return { content: [{ type: "text", text: result }] };
    } catch (e) {
        return graphError("PATH_NOT_FOUND", e.message, "Check path exists");
    }
});

// ==================== find_clones ====================

server.registerTool("find_clones", {
    title: "Find Clones",
    description:
        "Detect code clones (exact copies, renamed variables, structurally similar). " +
        "3-tier: exact (Type-1), normalized (Type-2), near_miss (Type-3). " +
        "Returns groups with refactoring impact scores. Requires index_project first.",
    inputSchema: z.object({
        path: z.string().describe("Project root (must be indexed)"),
        type: z.enum(["exact", "normalized", "near_miss", "all"]).default("all").describe("Clone type to detect"),
        threshold: z.preprocess(v => typeof v === "string" ? Number(v) : v, z.number().min(0).max(1).default(0.80)).describe("Jaccard threshold for near_miss (0.0-1.0, default: 0.80)"),
        min_stmts: z.preprocess(v => typeof v === "string" ? Number(v) : v, z.number().int().min(1).optional()).describe("Min statements override (tier defaults: exact=3, normalized=5, near_miss=8)"),
        kind: z.enum(["function", "method", "all"]).default("all").describe("Symbol kind filter. near_miss always restricts to function+method"),
        scope: z.string().optional().describe("File glob filter (e.g. 'src/**/*.ts')"),
        cross_file: flexBool().describe("Only cross-file clones (default: true)"),
        format: z.enum(["json", "text"]).default("json").describe("Output format"),
        suppress: flexBool().describe("Apply suppression heuristics (default: true)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path, type, threshold, min_stmts, kind, scope, cross_file, format, suppress } = coerceParams(rawParams);
    try {
        const store = resolveStore(path);
        if (!store) return graphError("NOT_INDEXED", "No project indexed", "Run index_project first");

        const result = findClones(store, {
            type,
            threshold: threshold ?? 0.80,
            minStmts: min_stmts ?? null,
            kind,
            scope,
            crossFile: cross_file ?? true,
            format,
            suppress: suppress ?? true,
        });

        const content = format === "json"
            ? JSON.stringify(result, null, 2)
            : result;
        return { content: [{ type: "text", text: typeof content === "string" ? content : JSON.stringify(content, null, 2) }] };
    } catch (e) {
        return graphError("DB_ERROR", e.message, "Re-run index_project to rebuild");
    }
});

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
void checkForUpdates("@levnikolaevich/hex-graph-mcp", version);
