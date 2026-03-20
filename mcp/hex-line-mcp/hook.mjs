#!/usr/bin/env node
/**
 * Unified hook for hex-line-mcp.
 *
 * Handles three events:
 *
 * PreToolUse:
 *   - Tool redirect: blocks Read/Edit/Write/Grep for text files,
 *     redirecting to hex-line MCP equivalents.
 *   - Bash redirect: blocks simple cat/head/tail/ls/grep/sed/diff
 *     commands, redirecting to hex-line MCP equivalents.
 *   - Dangerous command blocker: blocks rm -rf /, force push,
 *     hard reset, DROP, chmod 777, mkfs, dd, etc.
 *
 * PostToolUse:
 *   - RTK output filter: compresses verbose Bash output
 *     (npm install, test, build, pip, git) to save context tokens.
 *
 * SessionStart:
 *   - Injects tool preference list into agent context.
 *
 * Exit 0 = approve / no feedback / systemMessage
 * Exit 2 = block (PreToolUse) or feedback via stderr (PostToolUse)
 */

import { deduplicateLines, smartTruncate } from "./lib/normalize.mjs";

// ---- Constants ----

const BINARY_EXT = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".ico",
    ".pdf", ".ipynb",
    ".zip", ".tar", ".gz", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".wasm",
    ".mp3", ".mp4", ".wav", ".avi", ".mkv",
    ".ttf", ".otf", ".woff", ".woff2",
]);

const TOOL_HINTS = {
    Read:  "mcp__hex-line__read_file (not Read, not cat/head/tail)",
    Edit:  "mcp__hex-line__edit_file (not Edit, not sed -i)",
    Write: "mcp__hex-line__write_file (not Write)",
    Grep:  "mcp__hex-line__grep_search (not Grep, not grep/rg)",
    cat:   "mcp__hex-line__read_file (not cat)",
    head:  "mcp__hex-line__read_file with offset/limit (not head)",
    tail:  "mcp__hex-line__read_file with offset (not tail)",
    ls:    "mcp__hex-line__directory_tree (not ls/find/tree)",
    stat:  "mcp__hex-line__get_file_info (not stat/wc -l)",
    grep:  "mcp__hex-line__grep_search (not grep/rg)",
    sed:   "mcp__hex-line__edit_file (not sed -i)",
    diff:  "mcp__hex-line__changes (not diff)",
    outline: "mcp__hex-line__outline (before reading large code files)",
    verify:  "mcp__hex-line__verify (staleness check without re-read)",
    changes: "mcp__hex-line__changes (semantic AST diff)",
    bulk:    "mcp__hex-line__bulk_replace (multi-file search-replace)",
    setup:   "mcp__hex-line__setup_hooks (configure hooks for agents)",
};

const BASH_REDIRECTS = [
    { regex: /^cat\s+\S+/, key: "cat" },
    { regex: /^head\s+/, key: "head" },
    { regex: /^tail\s+/, key: "tail" },
    { regex: /^(ls|dir)(\s+-\S+)*\s+/, key: "ls" },
    { regex: /^tree\s+/, key: "ls" },
    { regex: /^find\s+.*-name/, key: "ls" },
    { regex: /^(stat|wc\s+-l)\s+/, key: "stat" },
    { regex: /^(grep|rg)\s+/, key: "grep" },
    { regex: /^sed\s+-i/, key: "sed" },
    { regex: /^diff\s+/, key: "diff" },
];

const TOOL_REDIRECT_MAP = {
    Read: "Read",
    Edit: "Edit",
    Write: "Write",
    Grep: "Grep",
};

const DANGEROUS_PATTERNS = [
    {
        regex: /rm\s+(-[rf]+\s+)*[/~]/,
        reason: "rm -rf on root/home directory",
    },
    {
        regex: /git\s+push\s+(-f|--force)/,
        reason: "force push can overwrite remote history",
    },
    {
        regex: /git\s+reset\s+--hard/,
        reason: "hard reset discards uncommitted changes",
    },
    {
        regex: /DROP\s+(TABLE|DATABASE)/i,
        reason: "DROP destroys data permanently",
    },
    {
        regex: /chmod\s+777/,
        reason: "chmod 777 removes all access restrictions",
    },
    {
        regex: /mkfs/,
        reason: "filesystem format destroys all data",
    },
    {
        regex: /dd\s+if=\/dev\/zero/,
        reason: "direct disk write destroys data",
    },
];

const COMPOUND_OPERATORS = /[|]|>>?|&&|\|\||;/;

const CMD_PATTERNS = [
    [/npm (install|ci|update|add)/i, "npm-install"],
    [/npm test|jest|vitest|mocha|pytest|cargo test/i, "test"],
    [/npm run build|tsc|webpack|vite build|cargo build/i, "build"],
    [/pip install/i, "pip-install"],
    [/git (log|diff|status)/i, "git"],
];

const LINE_THRESHOLD = 50;
const HEAD_LINES = 15;
const TAIL_LINES = 15;

// ---- Helpers ----

function extOf(filePath) {
    const dot = filePath.lastIndexOf(".");
    return dot !== -1 ? filePath.slice(dot).toLowerCase() : "";
}

function detectCommandType(cmd) {
    for (const [re, type] of CMD_PATTERNS) {
        if (re.test(cmd)) return type;
    }
    return "generic";
}

function block(reason) {
    process.stdout.write(JSON.stringify({ decision: "block", reason }));
    process.exit(2);
}

// ---- PreToolUse handler ----

function handlePreToolUse(data) {
    const toolName = data.tool_name || "";
    const toolInput = data.tool_input || {};

    // Already using hex-line - approve silently
    if (toolName.startsWith("mcp__hex-line__")) {
        process.exit(0);
    }

    // Tool redirect: Read / Edit / Write / Grep
    const hintKey = TOOL_REDIRECT_MAP[toolName];
    if (hintKey) {
        const filePath = toolInput.file_path || toolInput.path || "";

        // Skip binary extensions
        if (BINARY_EXT.has(extOf(filePath))) {
            process.exit(0);
        }

        // Skip plan-mode and system paths (normalize backslashes for Windows)
        const normalPath = filePath.replace(/\\/g, "/");
        if (normalPath.includes(".claude/plans/") || normalPath.includes("AppData")) {
            process.exit(0);
        }

        // Block with redirect
        block("Obligatory use " + TOOL_HINTS[hintKey]);
    }

    // Bash tool checks
    if (toolName === "Bash") {
        const command = (toolInput.command || "").trim();

        // User-confirmed bypass
        if (command.includes("# hex-confirmed")) {
            process.exit(0);
        }

        // Dangerous command blocker
        for (const { regex, reason } of DANGEROUS_PATTERNS) {
            if (regex.test(command)) {
                block(
                    `DANGEROUS: ${reason}. Ask user to confirm, then retry with: # hex-confirmed`
                );
            }
        }

        // Skip compound commands — pipes, redirects, chains are intentional
        if (COMPOUND_OPERATORS.test(command)) {
            process.exit(0);
        }

        // Simple command redirect
        for (const { regex, key } of BASH_REDIRECTS) {
            if (regex.test(command)) {
                block("Obligatory use " + TOOL_HINTS[key]);
            }
        }
    }

    // Everything else - approve
    process.exit(0);
}

// ---- PostToolUse handler ----

function handlePostToolUse(data) {
    const toolName = data.tool_name || "";

    // Only filter Bash output
    if (toolName !== "Bash") {
        process.exit(0);
    }

    const toolInput = data.tool_input || {};
    const toolResult = data.tool_result;
    const command = toolInput.command || "";

    // Nothing to filter
    if (!toolResult || typeof toolResult !== "string") {
        process.exit(0);
    }

    const lines = toolResult.split("\n");
    const originalCount = lines.length;

    // Short output - no filtering
    if (originalCount < LINE_THRESHOLD) {
        process.exit(0);
    }

    const type = detectCommandType(command);

    // Pipeline: deduplicate -> smart truncate
    const deduped = deduplicateLines(lines);
    const dedupedText = deduped.join("\n");
    const filtered = smartTruncate(dedupedText, HEAD_LINES, TAIL_LINES);
    const filteredCount = filtered.split("\n").length;

    const header = `RTK FILTERED: ${type} (${originalCount} lines -> ${filteredCount} lines)`;

    const output = [
        "=".repeat(50),
        header,
        "=".repeat(50),
        "",
        filtered,
        "",
        "-".repeat(50),
        `Original: ${originalCount} lines | Filtered: ${filteredCount} lines`,
        "=".repeat(50),
    ].join("\n");

    process.stderr.write(output);
    process.exit(2);
}

// ---- SessionStart: inject tool preferences ----

function handleSessionStart() {
    const seen = new Set();
    const lines = [];
    for (const hint of Object.values(TOOL_HINTS)) {
        const tool = hint.split(" ")[0];
        if (!seen.has(tool)) {
            seen.add(tool);
            lines.push(`- ${hint}`);
        }
    }
    lines.push("Exceptions: images, PDFs, notebooks \u2192 built-in Read");
    lines.push("Bash OK for: npm/node/git/docker/curl, pipes, scripts");
    const msg = "Hex-line MCP available. ALWAYS prefer:\n" + lines.join("\n");
    process.stdout.write(JSON.stringify({ systemMessage: msg }));
    process.exit(0);
}

// ---- Main: read stdin, route by hook_event_name ----

let input = "";
process.stdin.on("data", (chunk) => {
    input += chunk;
});
process.stdin.on("end", () => {
    try {
        const data = JSON.parse(input);
        const event = data.hook_event_name || "";

        if (event === "SessionStart") handleSessionStart();
        else if (event === "PreToolUse") handlePreToolUse(data);
        else if (event === "PostToolUse") handlePostToolUse(data);
        else process.exit(0);
    } catch {
        process.exit(0);
    }
});
