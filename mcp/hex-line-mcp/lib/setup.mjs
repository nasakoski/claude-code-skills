/**
 * Setup hex-line hooks for CLI agents.
 *
 * Idempotent: re-running with same config produces no changes.
 * Supports: claude (hooks in ~/.claude/settings.json global), gemini, codex (info only).
 * Cleanup: removes old per-project hooks from .claude/settings.local.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

// Stable hook location outside npm/npx cache.
// setup_hooks copies the bundled hook.mjs here so the path survives npx eviction.
const STABLE_HOOK_DIR = resolve(homedir(), ".claude", "hex-line");
const STABLE_HOOK_PATH = join(STABLE_HOOK_DIR, "hook.mjs").replace(/\\/g, "/");
const HOOK_COMMAND = `node ${STABLE_HOOK_PATH}`;

// Source hook.mjs location (for copying).
// In dev: lib/setup.mjs -> ../hook.mjs (source).
// In npm: dist/server.mjs -> hook.mjs (bundled sibling in dist/).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SOURCE_HOOK = resolve(__dirname, "..", "hook.mjs");
const DIST_HOOK = resolve(__dirname, "hook.mjs");

// Substring that identifies any hex-line hook command (old or new paths).
const HOOK_SIGNATURE = "hex-line";


const CLAUDE_HOOKS = {
    SessionStart: {
        matcher: "*",
        hooks: [{ type: "command", command: HOOK_COMMAND, timeout: 5 }],
    },
    PreToolUse: {
        matcher: "Read|Edit|Write|Grep|Bash|mcp__hex-line__.*",
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
 * Find existing hook entry index by hex-line signature substring.
 * Catches both old relative ("node mcp/hex-line-mcp/hook.mjs") and
 * new absolute ("node d:/.../hex-line-mcp/hook.mjs") commands.
 */
function findEntryByCommand(entries) {
    return entries.findIndex(
        (e) => Array.isArray(e.hooks) && e.hooks.some((h) =>
            typeof h.command === "string" && h.command.includes(HOOK_SIGNATURE)
        )
    );
}

// ---- Core: write hooks to a settings file ----

function writeHooksToFile(settingsPath, label) {
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
        const idx = findEntryByCommand(entries);

        if (idx >= 0) {
            const existing = entries[idx];
            if (existing.matcher === desired.matcher &&
                existing.hooks.length === desired.hooks.length &&
                existing.hooks[0].command === HOOK_COMMAND &&
                existing.hooks[0].timeout === desired.hooks[0].timeout) {
                continue; // Already configured exactly
            }
            // Update in place (path changed or config updated)
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
        return `Claude (${label}): already configured`;
    }

    writeJson(settingsPath, config);
    return `Claude (${label}): hooks -> ${STABLE_HOOK_PATH} OK`;
}

// ---- Cleanup: remove hex-line hooks from per-project file ----

function cleanLocalHooks() {
    const localPath = resolve(process.cwd(), ".claude/settings.local.json");
    const config = readJson(localPath);

    if (!config || !config.hooks || typeof config.hooks !== "object") {
        return "local: clean";
    }

    let changed = false;

    for (const event of Object.keys(CLAUDE_HOOKS)) {
        if (!Array.isArray(config.hooks[event])) continue;

        const entries = config.hooks[event];
        const idx = findEntryByCommand(entries);

        if (idx >= 0) {
            entries.splice(idx, 1);
            changed = true;
        }

        // Remove empty arrays
        if (entries.length === 0) {
            delete config.hooks[event];
        }
    }

    // Remove empty hooks object
    if (Object.keys(config.hooks).length === 0) {
        delete config.hooks;
    }

    if (!changed) {
        return "local: clean";
    }

    writeJson(localPath, config);
    return "local: removed old hex-line hooks";
}

// ---- Output Style installer ----

function installOutputStyle() {
    const source = resolve(dirname(fileURLToPath(import.meta.url)), "..", "output-style.md");
    const target = resolve(homedir(), ".claude", "output-styles", "hex-line.md");

    // Copy output-style.md to ~/.claude/output-styles/
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(source, "utf-8"), "utf-8");

    // Set hex-line only if no explicit style is already active
    const userSettings = resolve(homedir(), ".claude/settings.json");
    const config = readJson(userSettings) || {};
    const prev = config.outputStyle;
    if (!prev) {
        config.outputStyle = "hex-line";
        writeJson(userSettings, config);
    }

    const msg = prev
        ? `Output style file installed. Existing style '${prev}' preserved (not overridden)`
        : "Output style 'hex-line' installed and activated globally";
    return msg;
}

// ---- Agent configurators ----

function setupClaude() {
    const results = [];

    // Phase A: copy hook.mjs to stable location (~/.claude/hex-line/hook.mjs)
    const hookSource = existsSync(DIST_HOOK) ? DIST_HOOK : SOURCE_HOOK;
    if (!existsSync(hookSource)) {
        return "Claude: FAILED — hook.mjs not found. Reinstall @levnikolaevich/hex-line-mcp.";
    }
    mkdirSync(STABLE_HOOK_DIR, { recursive: true });
    copyFileSync(hookSource, STABLE_HOOK_PATH);
    results.push(`hook.mjs -> ${STABLE_HOOK_PATH}`);

    // Phase B: write hooks to global ~/.claude/settings.json
    const globalPath = resolve(homedir(), ".claude/settings.json");
    results.push(writeHooksToFile(globalPath, "global"));

    // Phase C: remove hex-line hooks from per-project settings.local.json
    results.push(cleanLocalHooks());

    // Phase D: install Output Style
    results.push(installOutputStyle());

    return results.join(" | ");
}

function setupGemini() {
    return "Gemini: Not supported (Gemini CLI does not support hooks. Add MCP Tool Preferences to GEMINI.md instead)";
}

function setupCodex() {
    return "Codex: Not supported (Codex CLI does not support hooks. Add MCP Tool Preferences to AGENTS.md instead)";
}

// ---- Uninstall: remove hex-line hooks ----

function uninstallClaude() {
    const globalPath = resolve(homedir(), ".claude/settings.json");
    const config = readJson(globalPath);
    if (!config || !config.hooks || typeof config.hooks !== "object") {
        return "Claude: no hooks to remove";
    }

    let changed = false;
    for (const event of Object.keys(CLAUDE_HOOKS)) {
        if (!Array.isArray(config.hooks[event])) continue;
        const idx = findEntryByCommand(config.hooks[event]);
        if (idx >= 0) {
            config.hooks[event].splice(idx, 1);
            if (config.hooks[event].length === 0) delete config.hooks[event];
            changed = true;
        }
    }

    if (Object.keys(config.hooks).length === 0) delete config.hooks;

    if (!changed) return "Claude: no hex-line hooks found";

    writeJson(globalPath, config);
    return "Claude: hex-line hooks removed from global settings";
}

// ---- Public API ----

const AGENTS = { claude: setupClaude, gemini: setupGemini, codex: setupCodex };

/**
 * Configure hex-line hooks for one or all supported agents.
 * Claude: writes to ~/.claude/settings.json (global), cleans per-project hooks.
 * @param {string} [agent="all"] - "claude", "gemini", "codex", or "all"
 * @param {string} [action="install"] - "install" or "uninstall"
 * @returns {string} Status report
 */
export function setupHooks(agent = "all", action = "install") {
    const target = (agent || "all").toLowerCase();
    const act = (action || "install").toLowerCase();

    if (act === "uninstall") {
        const result = uninstallClaude();
        return `Hooks uninstalled:\n  ${result}\n\nRestart Claude Code to apply changes.`;
    }

    if (target !== "all" && !AGENTS[target]) {
        throw new Error(`UNKNOWN_AGENT: '${agent}'. Supported: claude, gemini, codex, all`);
    }

    const targets = target === "all" ? Object.keys(AGENTS) : [target];
    const results = targets.map((name) => "  " + AGENTS[name]());

    const header = `Hooks configured for ${target}:`;
    const footer = "\nRestart Claude Code to apply hook changes.";
    return [header, ...results, footer].join("\n");
}
