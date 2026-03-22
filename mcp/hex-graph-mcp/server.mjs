#!/usr/bin/env node
/**
 * hex-graph-mcp — Code knowledge graph MCP server.
 *
 * 14 tools: index_project, search_symbols, get_impact, trace_calls,
 *          get_context, get_architecture, watch_project, find_clones,
 *          find_hotspots, find_unused, impact_of_changes, find_cycles, module_metrics,
 *          find_references
 * Tree-sitter AST → SQLite graph (nodes, edges, FTS5)
 * Transport: stdio
 */

import { z } from "zod";
import { createRequire } from "node:module";
const { version } = createRequire(import.meta.url)("./package.json");
import { checkForUpdates } from "./lib/update-check.mjs";
import { coerceParams } from "./lib/coerce.mjs";
import { findClones } from "./lib/clones.mjs";
import { impactOfChanges } from "./lib/impact.mjs";
import { findCycles } from "./lib/cycles.mjs";
import { resolveStore, getReferences } from "./lib/store.mjs";
import { findUnused, formatUnusedText } from "./lib/unused.mjs";

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

// ==================== find_hotspots ====================

server.registerTool("find_hotspots", {
    title: "Find Hotspots",
    description:
        "Find high-risk symbols by complexity \u00d7 caller count. Shows functions/methods that are both complex and widely depended on. " +
        "Complexity = stmt_count from clone analysis, or line span as fallback. Requires index_project first.",
    inputSchema: z.object({
        path: z.string().describe("Project root (must be indexed)"),
        min_callers: flexNum().describe("Minimum caller count to include (default: 2)"),
        min_complexity: flexNum().describe("Minimum complexity to include (default: 15)"),
        limit: flexNum().describe("Max results (default: 20)"),
        scope: z.string().optional().describe("File path prefix filter (e.g. 'src/api')"),
        format: z.enum(["json", "text"]).default("text").describe("Output format"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path, min_callers, min_complexity, limit, scope, format } = coerceParams(rawParams);
    try {
        const store = resolveStore(path);
        if (!store) return graphError("NOT_INDEXED", "No project indexed", "Run index_project first");

        const rows = store.hotspots({
            minCallers: min_callers ?? 2,
            minComplexity: min_complexity ?? 15,
            limit: limit ?? 20,
            scopePath: scope,
        });

        if (format === "json") {
            return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
        }

        // Text format
        const lines = [];
        lines.push(`${rows.length} hotspots (risk = complexity \u00d7 callers)`);
        lines.push("");
        lines.push("  risk  complexity  callers  file");
        for (const r of rows) {
            const cLabel = r.complexity_source === "stmt_count"
                ? `${r.complexity} stmts`
                : `${r.complexity} lines*`;
            lines.push(`  ${String(r.risk).padStart(4)}  ${cLabel.padEnd(10)}  ${String(r.callers).padStart(7)}  ${r.file}:${r.line_start}  ${r.name}()`);
        }
        if (rows.some(r => r.complexity_source === "line_span_fallback")) {
            lines.push("");
            lines.push("* = line_span_fallback (no clone_blocks data)");
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
        return graphError("DB_ERROR", e.message, "Re-run index_project to rebuild");
    }
});

// ==================== find_unused ====================

server.registerTool("find_unused", {
    title: "Find Unused Exports",
    description:
        "Use find_unused when cleaning dead code. Finds exported symbols with zero imports. " +
        "Shows dead exports that may be safe to remove. " +
        "Static-analysis heuristic — no CJS/dynamic/reflection.",
    inputSchema: z.object({
        path: z.string().describe("Project root (must be indexed)"),
        scope: z.string().optional().describe("File path prefix filter (e.g. 'src/lib')"),
        kind: z.enum(["function", "class", "variable", "all"]).default("all").describe("Symbol kind filter (default: all)"),
        show_suppressed: flexBool().describe("Include suppressed items (default: false)"),
        format: z.enum(["json", "text"]).default("text").describe("Output format"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path, scope, kind, show_suppressed, format } = coerceParams(rawParams);
    try {
        const store = resolveStore(path);
        if (!store) return graphError("NOT_INDEXED", "No project indexed", "Run index_project first");

        const result = findUnused(store, {
            scopePath: scope,
            kind: kind || "all",
        });

        if (format === "json") {
            const output = show_suppressed
                ? result
                : { ...result, unused: result.unused.filter(u => !u.suppressed) };
            return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        const text = formatUnusedText(result, show_suppressed ?? false);
        return { content: [{ type: "text", text }] };
    } catch (e) {
        return graphError("DB_ERROR", e.message, "Re-run index_project to rebuild");
    }
});

// ==================== impact_of_changes ====================

server.registerTool("impact_of_changes", {
    title: "Impact of Changes",
    description:
        "Estimate which files/tests are affected by recent code changes. " +
        "Heuristic \u2014 based on static call graph, not authoritative.",
    inputSchema: z.object({
        path: z.string().describe("Project root directory"),
        ref: z.string().default("HEAD").describe("Git ref to diff against (default: HEAD)"),
        depth: flexNum().describe("Transitive caller depth (default: 2)"),
        tests_only: flexBool().describe("Only show affected test files"),
        format: z.enum(["json", "text"]).default("text").describe("Output format"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path: projectPath, ref, depth, tests_only, format } = coerceParams(rawParams);
    try {
        const store = resolveStore(projectPath);
        if (!store) return graphError("NOT_INDEXED", "No project indexed", "Run index_project first");

        const result = impactOfChanges(store, projectPath, {
            ref: ref || "HEAD",
            depth: depth ?? 2,
            testsOnly: tests_only ?? false,
        });

        if (format === "json") {
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        // Text format
        const lines = [];
        lines.push(`Impact of changes (vs ${result.changed.length > 0 ? (ref || "HEAD") : "HEAD"}, depth=${depth ?? 2}, ${result.confidence})`);
        lines.push("");

        if (!tests_only) {
            lines.push(`Changed files (${result.changed.length}):`);
            for (const f of result.changed) lines.push(`  ${f}`);
            lines.push("");

            lines.push(`Affected files (${result.affected.length}):`);
            for (const f of result.affected) lines.push(`  ${f}`);
            lines.push("");
        }

        lines.push(`Affected tests (${result.affected_tests.length}):`);
        for (const f of result.affected_tests) lines.push(`  ${f}`);
        lines.push("");

        lines.push(`Note: ${result.note}`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
        if (e.message.includes("Not a git repository") || e.message.includes("Unknown git ref")) {
            return graphError("GIT_ERROR", e.message, "Check path is a git repo and ref exists");
        }
        return graphError("DB_ERROR", e.message, "Re-run index_project to rebuild");
    }
});

// ==================== find_cycles ====================

server.registerTool("find_cycles", {
    title: "Find Cycles",
    description:
        "Detect circular module dependencies. Shows import cycles that increase coupling and block tree-shaking. " +
        "Uses file-level import graph (module_edges). Requires index_project first.",
    inputSchema: z.object({
        path: z.string().describe("Project root (must be indexed)"),
        scope: z.string().optional().describe("File path prefix filter (e.g. 'src/api')"),
        format: z.enum(["json", "text"]).default("text").describe("Output format"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path, scope, format } = coerceParams(rawParams);
    try {
        const store = resolveStore(path);
        if (!store) return graphError("NOT_INDEXED", "No project indexed", "Run index_project first");

        const result = findCycles(store, { scopePath: scope });

        if (format === "json") {
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        // Text format
        const lines = [];
        if (result.cycles.length === 0) {
            lines.push(`No circular dependencies found (${result.total_modules} modules, ${result.total_edges} edges)`);
        } else {
            lines.push(`${result.cycles.length} circular dependenc${result.cycles.length === 1 ? "y" : "ies"} found (${result.total_modules} modules, ${result.total_edges} edges)`);
            lines.push("");
            for (let i = 0; i < result.cycles.length; i++) {
                const c = result.cycles[i];
                lines.push(`Cycle ${i + 1} (${c.length} files):`);
                lines.push(`  ${c.files.join(" \u2192 ")}`);
                lines.push("");
            }
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
        return graphError("DB_ERROR", e.message, "Re-run index_project to rebuild");
    }
});

// ==================== module_metrics ====================

server.registerTool("module_metrics", {
    title: "Module Metrics",
    description:
        "Calculate module coupling metrics (Ca/Ce/Instability) per file. Shows which modules are most coupled or unstable. " +
        "Ca = afferent (who imports this), Ce = efferent (who this imports), I = Ce/(Ca+Ce). Requires index_project first.",
    inputSchema: z.object({
        path: z.string().describe("Project root (must be indexed)"),
        scope: z.string().optional().describe("File path prefix filter (e.g. 'src/api')"),
        sort: z.enum(["instability", "ca", "ce", "coupling"]).default("instability").describe("Sort order (default: instability)"),
        min_coupling: flexNum().describe("Minimum total coupling Ca+Ce to include (default: 2)"),
        format: z.enum(["json", "text"]).default("text").describe("Output format"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path, scope, sort, min_coupling, format } = coerceParams(rawParams);
    try {
        const store = resolveStore(path);
        if (!store) return graphError("NOT_INDEXED", "No project indexed", "Run index_project first");

        const rows = store.moduleMetrics({
            scopePath: scope,
            sort: sort ?? "instability",
            minCoupling: min_coupling ?? 2,
        });

        if (format === "json") {
            return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
        }

        // Text format
        const lines = [];
        lines.push(`Module coupling metrics (${rows.length} files, sorted by ${sort ?? "instability"})`);
        lines.push("");
        lines.push("  I     Ca  Ce  File");
        for (const r of rows) {
            const iStr = r.instability.toFixed(2).padStart(5);
            const caStr = String(r.ca).padStart(4);
            const ceStr = String(r.ce).padStart(4);
            lines.push(`  ${iStr} ${caStr} ${ceStr}  ${r.file}`);
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
        return graphError("DB_ERROR", e.message, "Re-run index_project to rebuild");
    }
});

// ==================== find_references ====================

server.registerTool("find_references", {
    title: "Find References",
    description:
        "Use find_references when you need all usages of a symbol — calls, reads, type annotations, re-exports. " +
        "Use instead of grep when you need semantic references, not text matches. " +
        "Requires index_project first.",
    inputSchema: z.object({
        symbol: z.string().describe("Symbol name to find references for"),
        file: z.string().optional().describe("File path to disambiguate same-name symbols (e.g. 'src/utils.mjs')"),
        kind: z.enum(["ref_read", "ref_type", "calls", "reexports", "imports", "all"]).default("all").describe("Filter by reference kind"),
        limit: flexNum().describe("Max references (default: 50)"),
        path: z.string().optional().describe("Project root"),
        format: z.enum(["json", "text"]).default("text").describe("Output format"),
    }),
}, async (rawParams) => {
    const { symbol, file, kind, limit, path, format } = coerceParams(rawParams);
    try {
        const result = getReferences(symbol, { kind, limit: limit ?? 50, file, path });
        if (typeof result === "string") return { content: [{ type: "text", text: result }], isError: true };

        if (format === "json") {
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        // Text format
        const lines = [];
        if (result.ambiguous) {
            lines.push(`${result.symbol}: ${result.definitions.length} definitions (${result.total} total references)`);
            lines.push("Hint: use file param to select one definition");
            lines.push("");
            for (const def of result.definitions) {
                lines.push(`## ${result.symbol} (${def.kind} in ${def.file}:${def.line})`);
                lines.push(`  ${def.total} references`);
                for (const ref of def.references) {
                    lines.push(`    ${ref.kind.padEnd(10)} ${ref.file}:${ref.line}`);
                }
                lines.push("");
            }
        } else {
            lines.push(`${result.symbol} (${result.definition.kind} in ${result.definition.file}:${result.definition.line})`);
            lines.push(`${result.total} references`);
            if (Object.keys(result.total_by_kind).length > 0) {
                lines.push(`  by kind: ${Object.entries(result.total_by_kind).map(([k, v]) => `${k}:${v}`).join(", ")}`);
            }
            lines.push("");
            for (const ref of result.references) {
                lines.push(`  ${ref.kind.padEnd(10)} ${ref.file}:${ref.line}`);
            }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
void checkForUpdates("@levnikolaevich/hex-graph-mcp", version);
