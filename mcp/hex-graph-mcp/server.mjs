#!/usr/bin/env node
/**
 * hex-graph-mcp — Code knowledge graph MCP server.
 *
 * 7 tools: index_project, search_symbols, get_impact, trace_calls,
 *          get_context, get_architecture, watch_project
 * Tree-sitter AST → SQLite graph (nodes, edges, FTS5)
 * Transport: stdio
 */

import { z } from "zod";
import { checkForUpdates } from "./lib/update-check.mjs";

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

const server = new McpServer({ name: "hex-graph-mcp", version: "0.1.0" });

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
}, async ({ path: projectPath, languages }) => {
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
        limit: z.coerce.number().optional().describe("Max results (default: 20)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async ({ query, kind, limit }) => {
    try {
        const { searchSymbols } = await import("./lib/store.mjs");
        const result = searchSymbols(query, { kind, limit });
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
        depth: z.coerce.number().optional().describe("Max traversal depth (default: 3)"),
        limit: z.coerce.number().optional().describe("Max results (default: 50)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async ({ symbol, depth, limit }) => {
    try {
        const { getImpact } = await import("./lib/store.mjs");
        const result = getImpact(symbol, { depth, limit });
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
        depth: z.coerce.number().optional().describe("Max traversal depth (default: 3)"),
        limit: z.coerce.number().optional().describe("Max results (default: 50)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async ({ symbol, direction, depth, limit }) => {
    try {
        const { traceCalls } = await import("./lib/store.mjs");
        const result = traceCalls(symbol, { direction, depth, limit });
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
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async ({ symbol }) => {
    try {
        const { getContext } = await import("./lib/store.mjs");
        const result = getContext(symbol);
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
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async ({ path: scopePath }) => {
    try {
        const { getArchitecture } = await import("./lib/store.mjs");
        const result = getArchitecture(scopePath);
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
}, async ({ path: projectPath }) => {
    try {
        const { watchProject } = await import("./lib/watcher.mjs");
        const result = watchProject(projectPath);
        return { content: [{ type: "text", text: result }] };
    } catch (e) {
        return graphError("PATH_NOT_FOUND", e.message, "Check path exists");
    }
});

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
void checkForUpdates("@levnikolaevich/hex-graph-mcp", "0.1.0");
