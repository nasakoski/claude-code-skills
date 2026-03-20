/**
 * Setup hex-line hooks for CLI agents.
 *
 * Idempotent: re-running with same config produces no changes.
 * Supports: claude (hooks in settings.local.json), gemini, codex (info only).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const HOOK_COMMAND = "node mcp/hex-line-mcp/hook.mjs";

const CLAUDE_HOOKS = {
    SessionStart: {
        matcher: "*",
        hooks: [{ type: "command", command: HOOK_COMMAND, timeout: 5 }],
    },
    PreToolUse: {
        matcher: "Read|Edit|Write|Grep|Bash",
        hooks: [{ type: "command", command: HOOK_COMMAND, timeout: 5 }],
    },
    PostToolUse: {
        matcher: "Bash",
        hooks: [{ type: "command", command: HOOK_COMMAND, timeout: 10 }],
    },
};

// ---- Helpers ----

function readJson(filePath) {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Find existing hook entry index by command substring.
 * @param {Array} entries - Array of {matcher, hooks[]} objects
 * @param {string} command - Command string to match
 * @returns {number} Index or -1
 */
function findEntryByCommand(entries, command) {
    return entries.findIndex(
        (e) => Array.isArray(e.hooks) && e.hooks.some((h) => h.command === command)
    );
}

// ---- Agent configurators ----

function setupClaude() {
    const settingsPath = resolve(process.cwd(), ".claude/settings.local.json");
    const config = readJson(settingsPath) || {};

    if (!config.hooks || typeof config.hooks !== "object") {
        config.hooks = {};
    }

    let changed = false;

    for (const [event, desired] of Object.entries(CLAUDE_HOOKS)) {
        if (!Array.isArray(config.hooks[event])) {
            config.hooks[event] = [];
        }

        const entries = config.hooks[event];
        const idx = findEntryByCommand(entries, HOOK_COMMAND);

        if (idx >= 0) {
            // Entry exists — check if matcher and timeout match
            const existing = entries[idx];
            if (existing.matcher === desired.matcher &&
                existing.hooks.length === desired.hooks.length &&
                existing.hooks[0].timeout === desired.hooks[0].timeout) {
                continue; // Already configured exactly
            }
            // Update in place
            entries[idx] = { matcher: desired.matcher, hooks: [...desired.hooks] };
            changed = true;
        } else {
            entries.push({ matcher: desired.matcher, hooks: [...desired.hooks] });
            changed = true;
        }
    }

    if (config.disableAllHooks !== false) {
        config.disableAllHooks = false;
        changed = true;
    }

    if (!changed) {
        return "Claude: already configured, no changes";
    }

    writeJson(settingsPath, config);
    return "Claude: PreToolUse + PostToolUse -> mcp/hex-line-mcp/hook.mjs OK";
}

function setupGemini() {
    return "Gemini: Not supported (Gemini CLI does not support hooks. Add MCP Tool Preferences to GEMINI.md instead)";
}

function setupCodex() {
    return "Codex: Not supported (Codex CLI does not support hooks. Add MCP Tool Preferences to AGENTS.md instead)";
}

// ---- Public API ----

const AGENTS = { claude: setupClaude, gemini: setupGemini, codex: setupCodex };

/**
 * Configure hex-line hooks for one or all supported agents.
 * @param {string} [agent="all"] - "claude", "gemini", "codex", or "all"
 * @returns {string} Status report
 */
export function setupHooks(agent = "all") {
    const target = (agent || "all").toLowerCase();

    if (target !== "all" && !AGENTS[target]) {
        throw new Error(`UNKNOWN_AGENT: '${agent}'. Supported: claude, gemini, codex, all`);
    }

    const targets = target === "all" ? Object.keys(AGENTS) : [target];
    const results = targets.map((name) => "  " + AGENTS[name]());

    const header = `Hooks configured for ${target}:`;
    const footer = "\nRestart Claude Code to apply hook changes.";
    return [header, ...results, footer].join("\n");
}
