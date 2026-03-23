#!/usr/bin/env node
/**
 * hex-line-mcp — MCP server for hash-verified file operations.
 *
 * 11 tools: read_file, edit_file, write_file, grep_search, outline, verify, directory_tree, get_file_info, setup_hooks, changes, bulk_replace
 * FNV-1a 2-char tags + range checksums
 * Security: root policy, path validation, binary/size rejection
 * Transport: stdio
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
const version = typeof __HEX_VERSION__ !== "undefined" ? __HEX_VERSION__
  : (await import("node:module")).createRequire(import.meta.url)("./package.json").version;
import { z } from "zod";
import { createServerRuntime } from "@levnikolaevich/hex-common/runtime/mcp-bootstrap";
import { flexBool, flexNum } from "@levnikolaevich/hex-common/runtime/schema";
import { coerceParams } from "@levnikolaevich/hex-common/runtime/coerce";
import { checkForUpdates } from "@levnikolaevich/hex-common/runtime/update-check";
// LLM clients may send booleans as strings ("true"/"false").
// z.coerce.boolean() is unsafe: Boolean("false") === true.
// LLM clients may send numbers as strings ("5" instead of 5).
// z.coerce.number() generates {"type":"number"} → strict MCP clients reject strings.
// flexNum generates schema accepting both, coerces at runtime.
// Outer .optional() ensures JSON Schema marks field as not-required.

import { readFile } from "./lib/read.mjs";
import { editFile } from "./lib/edit.mjs";
import { grepSearch } from "./lib/search.mjs";
import { fileOutline } from "./lib/outline.mjs";
import { verifyChecksums } from "./lib/verify.mjs";
import { validateWritePath } from "./lib/security.mjs";
import { directoryTree } from "./lib/tree.mjs";
import { fileInfo } from "./lib/info.mjs";
import { setupHooks } from "./lib/setup.mjs";
import { fileChanges } from "./lib/changes.mjs";
import { bulkReplace } from "./lib/bulk-replace.mjs";

const { server, StdioServerTransport } = await createServerRuntime({
    name: "hex-line-mcp",
    version,
    installDir: "mcp/hex-line-mcp",
});


// ==================== read_file ====================

server.registerTool("read_file", {
    title: "Read File",
    description:
        "Read a file with hash-annotated lines, range checksums, and current revision. " +
        "Use offset/limit for targeted reads; use outline first for large code files.",
    inputSchema: z.object({
        path: z.string().optional().describe("File or directory path"),
        paths: z.array(z.string()).optional().describe("Array of file paths to read (batch mode)"),
        offset: flexNum().describe("Start line (1-indexed, default: 1)"),
        limit: flexNum().describe("Max lines (default: 2000, 0 = all)"),
        plain: flexBool().describe("Omit hashes (lineNum|content)"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path: p, paths: multi, offset, limit, plain } = coerceParams(rawParams);
    try {
        if (multi && multi.length > 0 && !p) {
            const results = [];
            for (const fp of multi) {
                try {
                    results.push(readFile(fp, { offset, limit, plain }));
                } catch (e) {
                    results.push(`File: ${fp}\n\nERROR: ${e.message}`);
                }
            }
            return { content: [{ type: "text", text: results.join("\n\n---\n\n") }] };
        }
        if (!p) throw new Error("Either 'path' or 'paths' is required");
        return { content: [{ type: "text", text: readFile(p, { offset, limit, plain }) }] };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});


// ==================== edit_file ====================

server.registerTool("edit_file", {
    title: "Edit File",
    description:
        "Apply revision-aware partial edits to one file. " +
        "Prefer one batched call per file. Supports set_line, replace_lines, insert_after, and replace_between. " +
        "For text rename/refactor use bulk_replace.",
    inputSchema: z.object({
        path: z.string().describe("File to edit"),
        edits: z.string().describe(
            'JSON array. Examples:\n' +
            '{"set_line":{"anchor":"ab.12","new_text":"new"}} — replace line\n' +
            '{"replace_lines":{"start_anchor":"ab.10","end_anchor":"cd.15","new_text":"...","range_checksum":"10-15:a1b2c3d4"}} — range\n' +
            '{"replace_between":{"start_anchor":"ab.10","end_anchor":"cd.40","new_text":"...","boundary_mode":"inclusive"}} — block rewrite\n' +
            '{"insert_after":{"anchor":"ab.20","text":"inserted"}} — insert below. For text rename use bulk_replace tool.',
        ),
        dry_run: flexBool().describe("Preview changes without writing"),
        restore_indent: flexBool().describe("Auto-fix indentation to match anchor (default: false)"),
        base_revision: z.string().optional().describe("Prior revision from read_file/edit_file. Enables conservative auto-rebase for same-file follow-up edits."),
        conflict_policy: z.enum(["strict", "conservative"]).optional().describe('Conflict handling (default: "conservative"). "conservative" returns structured CONFLICT output for stale edits instead of forcing reread.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}, async (rawParams) => {
    const { path: p, edits: json, dry_run, restore_indent, base_revision, conflict_policy } = coerceParams(rawParams);
    try {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed) || !parsed.length) throw new Error("Edits: non-empty JSON array required");
        return {
            content: [{
                type: "text",
                text: editFile(p, parsed, {
                    dryRun: dry_run,
                    restoreIndent: restore_indent,
                    baseRevision: base_revision,
                    conflictPolicy: conflict_policy,
                }),
            }],
        };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});


// ==================== write_file ====================

server.registerTool("write_file", {
    title: "Write File",
    description:
        "Create a new file or overwrite existing. Creates parent dirs. " +
        "For existing files prefer edit_file (shows diff, verifies hashes).",
    inputSchema: z.object({
        path: z.string().describe("File path"),
        content: z.string().describe("File content"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path: p, content } = coerceParams(rawParams);
    try {
        const abs = validateWritePath(p);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content, "utf-8");
        return { content: [{ type: "text", text: `Created ${p} (${content.split("\n").length} lines)` }] };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});


// ==================== grep_search ====================

server.registerTool("grep_search", {
    title: "Search Files",
    description:
        "Search file contents with ripgrep. Returns hash-annotated matches with per-group checksums for direct editing. " +
        "Output modes: content (default, edit-ready hashes+checksums), files (paths only), count (match counts). " +
        "For single-line edits: grep -> set_line directly. For range edits: use checksum from grep output. " +
        "ALWAYS prefer over shell grep/rg/findstr.",
    inputSchema: z.object({
        pattern: z.string().describe("Search pattern (regex by default, literal if literal:true)"),
        path: z.string().optional().describe("Search dir/file (default: cwd)"),
        glob: z.string().optional().describe('Glob filter (e.g. "*.ts")'),
        type: z.string().optional().describe('File type (e.g. "js", "py")'),
        output: z.enum(["content", "files", "count"]).optional().describe('Output format (default: content)'),
        case_insensitive: flexBool().describe("Ignore case (-i)"),
        smart_case: flexBool().describe("CI when pattern is all lowercase, CS if uppercase (-S)"),
        literal: flexBool().describe("Literal string search, no regex (-F)"),
        multiline: flexBool().describe("Pattern can span multiple lines (-U)"),
        context: flexNum().describe("Symmetric context lines around matches (-C)"),
        context_before: flexNum().describe("Context lines BEFORE match (-B)"),
        context_after: flexNum().describe("Context lines AFTER match (-A)"),
        limit: flexNum().describe("Max matches per file (default: 100)"),
        total_limit: flexNum().describe("Total match events across all files; multiline matches count as 1 (0 = unlimited)"),
        plain: flexBool().describe("Omit hash tags, return file:line:content"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { pattern, path: p, glob, type, output, case_insensitive, smart_case, literal, multiline,
            context, context_before, context_after, limit, total_limit, plain } = coerceParams(rawParams);
    try {
        const result = await grepSearch(pattern, {
            path: p, glob, type, output, caseInsensitive: case_insensitive, smartCase: smart_case,
            literal, multiline, context, contextBefore: context_before, contextAfter: context_after,
            limit, totalLimit: total_limit, plain,
        });
        return { content: [{ type: "text", text: result }] };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});


// ==================== outline ====================

server.registerTool("outline", {
    title: "File Outline",
    description:
        "AST-based structural outline: functions, classes, interfaces with line ranges. " +
        "10-20 lines instead of 500 — 95% token reduction. " +
        "Use before reading large code files. NOT for .md/.json/.yaml — use read_file.",
    inputSchema: z.object({
        path: z.string().describe("Source file path"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path: p } = coerceParams(rawParams);
    try {
        const result = await fileOutline(p);
        return { content: [{ type: "text", text: result }] };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});


// ==================== verify ====================

server.registerTool("verify", {
    title: "Verify Checksums",
    description:
        "Check whether held checksums and optional base_revision are still current, without rereading the file.",
    inputSchema: z.object({
        path: z.string().describe("File path"),
        checksums: z.string().describe('JSON array of checksum strings, e.g. ["1-50:f7e2a1b0", "51-100:abcd1234"]'),
        base_revision: z.string().optional().describe("Optional prior revision to compare against latest state."),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path: p, checksums, base_revision } = coerceParams(rawParams);
    try {
        const parsed = JSON.parse(checksums);
        if (!Array.isArray(parsed)) throw new Error("checksums must be a JSON array of strings");
        return { content: [{ type: "text", text: verifyChecksums(p, parsed, { baseRevision: base_revision }) }] };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});


// ==================== directory_tree ====================

server.registerTool("directory_tree", {
    title: "Directory Tree",
    description:
        "Compact directory tree with root .gitignore support (path-based rules, negation). " +
        "Supports pattern glob to find files/dirs by name (like find -name). " +
        "Use to understand repo structure or find specific files/dirs. " +
        "Skips node_modules, .git, dist by default.",
    inputSchema: z.object({
        path: z.string().describe("Directory path"),
        pattern: z.string().optional().describe('Glob filter on names (e.g. "*-mcp", "*.mjs"). Returns flat match list instead of tree'),
        type: z.enum(["file", "dir", "all"]).optional().describe('"file", "dir", or "all" (default). Like find -type f/d'),
        max_depth: flexNum().describe("Max recursion depth (default: 3, or 20 in pattern mode)"),
        gitignore: flexBool().describe("Respect root .gitignore patterns (default: true). Nested .gitignore not supported"),
        format: z.enum(["compact", "full"]).optional().describe('"compact" = names only, no sizes, depth 1. "full" = default with sizes'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path: p, max_depth, gitignore, format, pattern, type: entryType } = coerceParams(rawParams);
    try {
        return { content: [{ type: "text", text: directoryTree(p, { max_depth, gitignore, format, pattern, type: entryType }) }] };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});


// ==================== get_file_info ====================

server.registerTool("get_file_info", {
    title: "File Info",
    description:
        "File metadata without reading content: size, line count, modification time, type, binary detection. " +
        "Use before reading large files to check size.",
    inputSchema: z.object({
        path: z.string().describe("File path"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path: p } = coerceParams(rawParams);
    try {
        return { content: [{ type: "text", text: fileInfo(p) }] };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});


// ==================== setup_hooks ====================

server.registerTool("setup_hooks", {
    title: "Setup Hooks",
    description:
        "Install or uninstall hex-line hooks in CLI agent settings. " +
        "install: writes hooks to ~/.claude/settings.json, removes old per-project hooks. " +
        "uninstall: removes hex-line hooks from global settings. " +
        "Idempotent: re-running produces no changes if already in desired state.",
    inputSchema: z.object({
        agent: z.string().optional().describe('Target agent: "claude", "gemini", "codex", or "all" (default: "all")'),
        action: z.string().optional().describe('"install" (default) or "uninstall"'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { agent, action } = coerceParams(rawParams);
    try {
        return { content: [{ type: "text", text: setupHooks(agent, action) }] };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});


// ==================== changes ====================

server.registerTool("changes", {
    title: "Semantic Diff",
    description:
        "Compare file or directory against git ref (default: HEAD). For files: shows added/removed/modified symbols at AST level. " +
        "For directories: lists changed files with insertions/deletions stats. Use to understand what changed before committing.",
    inputSchema: z.object({
        path: z.string().describe("File or directory path"),
        compare_against: z.string().optional().describe('Git ref to compare against (default: "HEAD")'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawParams) => {
    const { path: p, compare_against } = coerceParams(rawParams);
    try {
        return { content: [{ type: "text", text: await fileChanges(p, compare_against) }] };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});


// ==================== bulk_replace ====================

server.registerTool("bulk_replace", {
    title: "Bulk Replace",
    description:
        "Search-and-replace across multiple files. Finds files by glob, applies ordered text replacements, returns per-file diffs. " +
        "Use dry_run:true to preview. For single-file rename, set glob to the filename.",
    inputSchema: z.object({
        replacements: z.string().describe('JSON array of {old, new} pairs: [{"old":"foo","new":"bar"}]'),
        glob: z.string().optional().describe('File glob (default: "**/*.{md,mjs,json,yml,ts,js}")'),
        path: z.string().optional().describe("Root directory (default: cwd)"),
        dry_run: flexBool().describe("Preview without writing (default: false)"),
        max_files: flexNum().describe("Max files to process (default: 100)"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
}, async (rawParams) => {
    try {
        const params = coerceParams(rawParams);
        const replacements = JSON.parse(params.replacements);
        if (!Array.isArray(replacements) || !replacements.length) throw new Error("replacements: non-empty JSON array of {old, new} required");
        const result = bulkReplace(
            params.path || process.cwd(),
            params.glob || "**/*.{md,mjs,json,yml,ts,js}",
            replacements,
            { dryRun: params.dry_run || false, maxFiles: params.max_files || 100 }
        );
        return { content: [{ type: "text", text: result }] };
    } catch (e) {
        return { content: [{ type: "text", text: e.message }], isError: true };
    }
});


// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
void checkForUpdates("@levnikolaevich/hex-line-mcp", version);
