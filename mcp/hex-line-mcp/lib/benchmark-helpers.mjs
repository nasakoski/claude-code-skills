import { readFileSync, statSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { resolve, extname, join } from "node:path";
import { fnv1a, lineTag } from "./hash.mjs";
import { readFile } from "./read.mjs";

// ---------------------------------------------------------------------------
// Constants (shared with benchmark.mjs)
// ---------------------------------------------------------------------------

const CODE_EXTS = new Set([".js", ".ts", ".py", ".mjs", ".go", ".rs", ".java", ".c", ".cpp", ".rb", ".php"]);
const MAX_FILES_PER_CAT = 3;
const RUNS = 5;

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function walkDir(dir, depth = 0) {
    if (depth > 10) return [];
    const results = [];
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return results; }
    for (const e of entries) {
        const full = resolve(dir, e.name);
        if (e.isDirectory()) {
            if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "vendor"
                || e.name === "dist" || e.name === "__pycache__" || e.name === "target") continue;
            results.push(...walkDir(full, depth + 1));
        } else if (e.isFile() && CODE_EXTS.has(extname(e.name).toLowerCase())) {
            try {
                const st = statSync(full);
                if (st.size > 0 && st.size < 1_000_000) results.push(full);
            } catch { /* skip */ }
        }
    }
    return results;
}

function getFileLines(f) {
    try { return readFileSync(f, "utf-8").replace(/\r\n/g, "\n").split("\n"); }
    catch { return null; }
}

function categorize(files) {
    const cats = { small: [], medium: [], large: [], xl: [] };
    for (const f of files) {
        const lines = getFileLines(f);
        if (!lines) continue;
        const n = lines.length;
        if (n >= 10 && n <= 50) cats.small.push(f);
        else if (n > 50 && n <= 200) cats.medium.push(f);
        else if (n > 200 && n <= 500) cats.large.push(f);
        else if (n > 500) cats.xl.push(f);
    }
    for (const key of Object.keys(cats)) {
        const arr = cats[key];
        if (arr.length > MAX_FILES_PER_CAT) {
            const step = Math.floor(arr.length / MAX_FILES_PER_CAT);
            cats[key] = Array.from({ length: MAX_FILES_PER_CAT }, (_, i) => arr[i * step]);
        }
    }
    return cats;
}

// ---------------------------------------------------------------------------
// Temp file: 200 lines of realistic JS
// ---------------------------------------------------------------------------

function generateTempCode() {
    const lines = [];
    lines.push('import { readFileSync } from "node:fs";');
    lines.push('import { resolve, basename } from "node:path";');
    lines.push("");
    lines.push("const DEFAULT_TIMEOUT = 5000;");
    lines.push("const MAX_RETRIES = 3;");
    lines.push("");
    lines.push("/**");
    lines.push(" * Configuration manager for application settings.");
    lines.push(" * Supports file-based and environment-based config sources.");
    lines.push(" */");
    lines.push("class ConfigManager {");
    lines.push("    constructor(configPath) {");
    lines.push("        this.configPath = resolve(configPath);");
    lines.push("        this.cache = new Map();");
    lines.push("        this.watchers = [];");
    lines.push("        this.loaded = false;");
    lines.push("    }");
    lines.push("");
    lines.push("    load() {");
    lines.push("        const raw = readFileSync(this.configPath, 'utf-8');");
    lines.push("        const parsed = JSON.parse(raw);");
    lines.push("        for (const [key, value] of Object.entries(parsed)) {");
    lines.push("            this.cache.set(key, value);");
    lines.push("        }");
    lines.push("        this.loaded = true;");
    lines.push("        this.notifyWatchers('load', parsed);");
    lines.push("        return this;");
    lines.push("    }");
    lines.push("");
    lines.push("    get(key, defaultValue = undefined) {");
    lines.push("        if (!this.loaded) this.load();");
    lines.push("        return this.cache.has(key) ? this.cache.get(key) : defaultValue;");
    lines.push("    }");
    lines.push("");
    lines.push("    set(key, value) {");
    lines.push("        this.cache.set(key, value);");
    lines.push("        this.notifyWatchers('set', { key, value });");
    lines.push("    }");
    lines.push("");
    lines.push("    watch(callback) {");
    lines.push("        this.watchers.push(callback);");
    lines.push("        return () => {");
    lines.push("            this.watchers = this.watchers.filter(w => w !== callback);");
    lines.push("        };");
    lines.push("    }");
    lines.push("");
    lines.push("    notifyWatchers(event, data) {");
    lines.push("        for (const watcher of this.watchers) {");
    lines.push("            try { watcher(event, data); }");
    lines.push("            catch (e) { console.error('Watcher error:', e.message); }");
    lines.push("        }");
    lines.push("    }");
    lines.push("}");
    lines.push("");
    lines.push("/**");
    lines.push(" * Retry wrapper with exponential backoff.");
    lines.push(" */");
    lines.push("async function withRetry(fn, options = {}) {");
    lines.push("    const { retries = MAX_RETRIES, delay = 100, backoff = 2 } = options;");
    lines.push("    let lastError;");
    lines.push("    for (let attempt = 0; attempt <= retries; attempt++) {");
    lines.push("        try {");
    lines.push("            return await fn(attempt);");
    lines.push("        } catch (err) {");
    lines.push("            lastError = err;");
    lines.push("            if (attempt < retries) {");
    lines.push("                const wait = delay * Math.pow(backoff, attempt);");
    lines.push("                await new Promise(r => setTimeout(r, wait));");
    lines.push("            }");
    lines.push("        }");
    lines.push("    }");
    lines.push("    throw lastError;");
    lines.push("}");
    lines.push("");
    lines.push("/**");
    lines.push(" * HTTP client with timeout and retry support.");
    lines.push(" */");
    lines.push("class HttpClient {");
    lines.push("    constructor(baseUrl, options = {}) {");
    lines.push("        this.baseUrl = baseUrl.replace(/\\/$/, '');");
    lines.push("        this.timeout = options.timeout || DEFAULT_TIMEOUT;");
    lines.push("        this.headers = options.headers || {};");
    lines.push("        this.retries = options.retries || MAX_RETRIES;");
    lines.push("    }");
    lines.push("");
    lines.push("    async request(method, path, body = null) {");
    lines.push("        const url = `${this.baseUrl}${path}`;");
    lines.push("        const controller = new AbortController();");
    lines.push("        const timer = setTimeout(() => controller.abort(), this.timeout);");
    lines.push("");
    lines.push("        try {");
    lines.push("            return await withRetry(async () => {");
    lines.push("                const opts = {");
    lines.push("                    method,");
    lines.push("                    headers: { ...this.headers },");
    lines.push("                    signal: controller.signal,");
    lines.push("                };");
    lines.push("                if (body) {");
    lines.push("                    opts.headers['Content-Type'] = 'application/json';");
    lines.push("                    opts.body = JSON.stringify(body);");
    lines.push("                }");
    lines.push("                const response = await fetch(url, opts);");
    lines.push("                if (!response.ok) {");
    lines.push("                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);");
    lines.push("                }");
    lines.push("                return response.json();");
    lines.push("            }, { retries: this.retries });");
    lines.push("        } finally {");
    lines.push("            clearTimeout(timer);");
    lines.push("        }");
    lines.push("    }");
    lines.push("");
    lines.push("    get(path) { return this.request('GET', path); }");
    lines.push("    post(path, body) { return this.request('POST', path, body); }");
    lines.push("    put(path, body) { return this.request('PUT', path, body); }");
    lines.push("    delete(path) { return this.request('DELETE', path); }");
    lines.push("}");
    lines.push("");
    lines.push("/**");
    lines.push(" * Simple event emitter for pub/sub patterns.");
    lines.push(" */");
    lines.push("class EventEmitter {");
    lines.push("    constructor() {");
    lines.push("        this.listeners = new Map();");
    lines.push("    }");
    lines.push("");
    lines.push("    on(event, handler) {");
    lines.push("        if (!this.listeners.has(event)) {");
    lines.push("            this.listeners.set(event, []);");
    lines.push("        }");
    lines.push("        this.listeners.get(event).push(handler);");
    lines.push("        return this;");
    lines.push("    }");
    lines.push("");
    lines.push("    off(event, handler) {");
    lines.push("        const handlers = this.listeners.get(event);");
    lines.push("        if (handlers) {");
    lines.push("            this.listeners.set(event, handlers.filter(h => h !== handler));");
    lines.push("        }");
    lines.push("        return this;");
    lines.push("    }");
    lines.push("");
    lines.push("    emit(event, ...args) {");
    lines.push("        const handlers = this.listeners.get(event) || [];");
    lines.push("        for (const handler of handlers) {");
    lines.push("            handler(...args);");
    lines.push("        }");
    lines.push("    }");
    lines.push("");
    lines.push("    once(event, handler) {");
    lines.push("        const wrapper = (...args) => {");
    lines.push("            handler(...args);");
    lines.push("            this.off(event, wrapper);");
    lines.push("        };");
    lines.push("        return this.on(event, wrapper);");
    lines.push("    }");
    lines.push("}");
    lines.push("");
    lines.push("/**");
    lines.push(" * Validate and sanitize user input.");
    lines.push(" */");
    lines.push("function validateInput(schema, data) {");
    lines.push("    const errors = [];");
    lines.push("    for (const [field, rules] of Object.entries(schema)) {");
    lines.push("        const value = data[field];");
    lines.push("        if (rules.required && (value === undefined || value === null)) {");
    lines.push("            errors.push(`${field} is required`);");
    lines.push("            continue;");
    lines.push("        }");
    lines.push("        if (value !== undefined && rules.type && typeof value !== rules.type) {");
    lines.push("            errors.push(`${field} must be ${rules.type}`);");
    lines.push("        }");
    lines.push("        if (typeof value === 'string' && rules.maxLength && value.length > rules.maxLength) {");
    lines.push("            errors.push(`${field} exceeds max length ${rules.maxLength}`);");
    lines.push("        }");
    lines.push("        if (typeof value === 'number' && rules.min !== undefined && value < rules.min) {");
    lines.push("            errors.push(`${field} must be >= ${rules.min}`);");
    lines.push("        }");
    lines.push("    }");
    lines.push("    return errors.length > 0 ? { valid: false, errors } : { valid: true };");
    lines.push("}");
    lines.push("");
    lines.push("/**");
    lines.push(" * Format bytes to human-readable string.");
    lines.push(" */");
    lines.push("function formatBytes(bytes) {");
    lines.push("    if (bytes === 0) return '0 B';");
    lines.push("    const units = ['B', 'KB', 'MB', 'GB', 'TB'];");
    lines.push("    const exp = Math.floor(Math.log(bytes) / Math.log(1024));");
    lines.push("    const value = bytes / Math.pow(1024, exp);");
    lines.push("    return `${value.toFixed(exp > 0 ? 1 : 0)} ${units[exp]}`;");
    lines.push("}");
    lines.push("");
    lines.push("/**");
    lines.push(" * Deep merge two objects (source into target).");
    lines.push(" */");
    lines.push("function deepMerge(target, source) {");
    lines.push("    const result = { ...target };");
    lines.push("    for (const key of Object.keys(source)) {");
    lines.push("        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {");
    lines.push("            result[key] = deepMerge(result[key] || {}, source[key]);");
    lines.push("        } else {");
    lines.push("            result[key] = source[key];");
    lines.push("        }");
    lines.push("    }");
    lines.push("    return result;");
    lines.push("}");
    lines.push("");
    lines.push("export { ConfigManager, HttpClient, EventEmitter, withRetry, validateInput, formatBytes, deepMerge };");

    // Pad to exactly 200 lines
    while (lines.length < 200) lines.push("");
    return lines.slice(0, 200);
}

// ---------------------------------------------------------------------------
// Simulators -- "without hex-line" (built-in tool output)
// ---------------------------------------------------------------------------

/** Simulate built-in Read: `cat -n` full file with header */
function simBuiltInReadFull(filePath, lines) {
    const body = lines.map((l, i) => `     ${String(i + 1).padStart(5)}\t${l}`).join("\n");
    return `Contents of ${filePath}:\n\n${body}`;
}

/** Simulate outline via full read -- agent reads entire file to understand structure */
function simBuiltInOutlineFull(filePath, lines) {
    return simBuiltInReadFull(filePath, lines);
}

/** Real ripgrep call (matches built-in Grep tool behavior) */
function simBuiltInGrep(pattern, path) {
    try {
        return execSync(`rg -n --no-heading "${pattern}" "${path}"`, { encoding: "utf-8", timeout: 10000 });
    } catch { return ""; }
}

/** Simulate `ls -laR` style output for a directory */
function simBuiltInLsR(dirPath, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return "";
    const out = [];
    let entries;
    try { entries = readdirSync(dirPath, { withFileTypes: true }); }
    catch { return ""; }

    const SKIP = new Set(["node_modules", ".git", "dist", "build", "__pycache__", "coverage"]);

    out.push(`${dirPath}:`);
    out.push("total " + entries.length);

    for (const e of entries) {
        if (SKIP.has(e.name) && e.isDirectory()) continue;
        const full = join(dirPath, e.name);
        try {
            const st = statSync(full);
            const type = e.isDirectory() ? "d" : "-";
            const size = String(st.size).padStart(8);
            const date = st.mtime.toISOString().slice(0, 16).replace("T", " ");
            out.push(`${type}rw-r--r-- 1 user group ${size} ${date} ${e.name}`);
        } catch { /* skip */ }
    }
    out.push("");

    for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (SKIP.has(e.name)) continue;
        const full = join(dirPath, e.name);
        const sub = simBuiltInLsR(full, depth + 1, maxDepth);
        if (sub) out.push(sub);
    }

    return out.join("\n");
}

/** Simulate `stat` output for a file */
function simBuiltInStat(filePath) {
    const st = statSync(filePath);
    return [
        `  File: ${filePath}`,
        `  Size: ${st.size}\tBlocks: ${Math.ceil(st.size / 512)}\tIO Block: 4096\tregular file`,
        `Device: 0h/0d\tInode: 0\tLinks: 1`,
        `Access: (0644/-rw-r--r--)\tUid: ( 1000/ user)\tGid: ( 1000/ group)`,
        `Access: ${st.atime.toISOString()}`,
        `Modify: ${st.mtime.toISOString()}`,
        `Change: ${st.ctime.toISOString()}`,
        ` Birth: ${st.birthtime.toISOString()}`,
    ].join("\n");
}

/** Simulate built-in write response */
function simBuiltInWrite(filePath, content) {
    const lineCount = content.split("\n").length;
    return `File ${filePath} has been created successfully (${lineCount} lines).`;
}

/** Simulate built-in edit: old_string/new_string context blocks */
function simBuiltInEdit(filePath, origLines, newLines) {
    let changeStart = -1, changeEnd = -1;
    for (let i = 0; i < Math.max(origLines.length, newLines.length); i++) {
        if (origLines[i] !== newLines[i]) {
            if (changeStart === -1) changeStart = i;
            changeEnd = i;
        }
    }
    if (changeStart === -1) return "";

    const ctxBefore = Math.max(0, changeStart - 3);
    const ctxAfter = Math.min(origLines.length, changeEnd + 4);
    const old_string = origLines.slice(ctxBefore, ctxAfter).join("\n");
    const new_string = newLines.slice(ctxBefore, Math.min(newLines.length, changeEnd + 4)).join("\n");
    return `The file ${filePath} has been edited. Here's the result of running \`cat -n\` on a snippet:\n` +
        `old_string:\n${old_string}\nnew_string:\n${new_string}`;
}

/** Simulate built-in verify: full re-read to check if file changed */
function simBuiltInVerify(filePath, lines) {
    return simBuiltInReadFull(filePath, lines);
}

// ---------------------------------------------------------------------------
// Simulators -- "with hex-line" (lib function output)
// ---------------------------------------------------------------------------

/** Hex-line outline -- regex heuristic (no tree-sitter in benchmark) */
function simHexLineOutline(lines) {
    const structural = /^\s*(export\s+)?(function|class|def|async\s+def|impl|fn|pub\s+fn|struct|interface|type|enum|const|let|var)\b/;
    const importLine = /^\s*(import|from|require|use|#include)/;
    const entries = [];
    let importStart = -1, importEnd = -1, importCount = 0;

    for (let i = 0; i < lines.length; i++) {
        if (importLine.test(lines[i])) {
            if (importStart === -1) importStart = i + 1;
            importEnd = i + 1;
            importCount++;
            continue;
        }
        if (structural.test(lines[i])) {
            let end = lines.length;
            for (let j = i + 1; j < lines.length; j++) {
                if (structural.test(lines[j])) { end = j; break; }
            }
            entries.push(`${i + 1}-${end}: ${lines[i].trim().slice(0, 120)}`);
        }
    }

    const parts = [];
    if (importCount > 0) parts.push(`${importStart}-${importEnd}: (${importCount} imports/declarations)`);
    parts.push(...entries);
    parts.push("", `(${entries.length} symbols, ${lines.length} source lines)`);
    return `File: benchmark-target\n\n${parts.join("\n")}`;
}

/** Hex-line outline + targeted read of first function (30 lines) */
function simHexLineOutlinePlusRead(filePath, lines) {
    const outlineStr = simHexLineOutline(lines);
    const structural = /^\s*(export\s+)?(function|class|def|async\s+def|impl|fn|pub\s+fn|struct)\b/;
    let funcStart = 0;
    for (let i = 0; i < lines.length; i++) {
        if (structural.test(lines[i])) { funcStart = i + 1; break; }
    }
    const start = Math.max(1, funcStart);
    const readStr = readFile(filePath, { offset: start, limit: 30 });
    return outlineStr + "\n---\n" + readStr;
}

/** Hex-line grep -- hash-annotated format */
function simHexLineGrep(filePath, lines, pattern) {
    const re = new RegExp(pattern, "i");
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
            const tag = lineTag(fnv1a(lines[i]));
            matches.push(`${filePath}:>>${tag}.${i + 1}\t${lines[i]}`);
        }
    }
    return matches.length > 0
        ? "```\n" + matches.join("\n") + "\n```"
        : "No matches found.";
}

/** Hex-line write response */
function simHexLineWrite(filePath, content) {
    const lineCount = content.split("\n").length;
    return `Created ${filePath} (${lineCount} lines)`;
}

/** Hex-line edit response: compact diff hunks */
function simHexLineEditDiff(origLines, newLines, ctx = 3) {
    const out = [];
    const maxLen = Math.max(origLines.length, newLines.length);
    let i = 0;

    while (i < maxLen) {
        if (i < origLines.length && i < newLines.length && origLines[i] === newLines[i]) {
            i++;
            continue;
        }
        // Found a difference -- show context before
        const ctxStart = Math.max(0, i - ctx);
        if (ctxStart < i) {
            if (ctxStart > 0) out.push("...");
            for (let k = ctxStart; k < i; k++) {
                out.push(` ${k + 1}| ${origLines[k]}`);
            }
        }
        // Show changed lines
        const changeStart = i;
        while (i < maxLen && (i >= origLines.length || i >= newLines.length || origLines[i] !== newLines[i])) {
            if (i < origLines.length) out.push(`-${i + 1}| ${origLines[i]}`);
            i++;
        }
        for (let k = changeStart; k < i && k < newLines.length; k++) {
            out.push(`+${k + 1}| ${newLines[k]}`);
        }
        // Context after
        const ctxEnd = Math.min(maxLen, i + ctx);
        for (let k = i; k < ctxEnd && k < origLines.length; k++) {
            out.push(` ${k + 1}| ${origLines[k]}`);
        }
        if (ctxEnd < maxLen) out.push("...");
        break;
    }

    const diff = out.join("\n");
    return diff
        ? `Updated benchmark-file\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``
        : "Updated benchmark-file";
}

// ---------------------------------------------------------------------------
// Runner utilities
// ---------------------------------------------------------------------------

function median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function runN(fn, n = RUNS) {
    const results = [];
    const times = [];
    for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        results.push(fn());
        times.push(performance.now() - t0);
    }
    return { value: median(results), ms: parseFloat(median(times).toFixed(1)) };
}

function fmt(n) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function pctSavings(without, withSL) {
    if (without === 0) return "N/A";
    const pct = ((without - withSL) / without) * 100;
    return pct >= 0 ? `${pct.toFixed(0)}%` : `-${Math.abs(pct).toFixed(0)}%`;
}

export {
    walkDir, getFileLines, categorize, generateTempCode,
    simBuiltInReadFull, simBuiltInOutlineFull, simBuiltInGrep,
    simBuiltInLsR, simBuiltInStat, simBuiltInWrite, simBuiltInEdit, simBuiltInVerify,
    simHexLineOutline, simHexLineOutlinePlusRead, simHexLineGrep, simHexLineWrite, simHexLineEditDiff,
    median, runN, fmt, pctSavings, RUNS,
};
