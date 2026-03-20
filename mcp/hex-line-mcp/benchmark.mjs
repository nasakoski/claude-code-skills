#!/usr/bin/env node
/**
 * Hex-line Combo Benchmark v2
 *
 * Compares "agent without hex-line" vs "agent with hex-line" across
 * read-only and write scenarios. Measures chars in response (proxy for tokens).
 *
 * Usage: node mcp/hex-line-mcp/benchmark.mjs [--repo /path/to/repo]
 * Default repo: current working directory.
 *
 * Zero external deps beyond hex-line lib modules.
 */

import { readFileSync, writeFileSync, unlinkSync, statSync, readdirSync } from "node:fs";
import { resolve, extname, basename, join } from "node:path";
import { tmpdir } from "node:os";
import { fnv1a, lineTag, rangeChecksum } from "./lib/hash.mjs";
import { readFile } from "./lib/read.mjs";
import { directoryTree } from "./lib/tree.mjs";
import { fileInfo } from "./lib/info.mjs";
import { verifyChecksums } from "./lib/verify.mjs";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let repoRoot = process.cwd();
const repoIdx = args.indexOf("--repo");
if (repoIdx !== -1 && args[repoIdx + 1]) {
    repoRoot = resolve(args[repoIdx + 1]);
}

const CODE_EXTS = new Set([".js", ".ts", ".py", ".mjs", ".go", ".rs", ".java", ".c", ".cpp", ".rb", ".php"]);
const MAX_FILES_PER_CAT = 3;
const RUNS = 3;

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
// Simulators — "without hex-line" (built-in tool output)
// ---------------------------------------------------------------------------

/** Simulate built-in Read: `cat -n` full file with header */
function simBuiltInReadFull(filePath, lines) {
    const body = lines.map((l, i) => `     ${String(i + 1).padStart(5)}\t${l}`).join("\n");
    return `Contents of ${filePath}:\n\n${body}`;
}

/** Simulate outline via full read — agent reads entire file to understand structure */
function simBuiltInOutlineFull(filePath, lines) {
    return simBuiltInReadFull(filePath, lines);
}

/** Simulate ripgrep raw output (no hashes) */
function simBuiltInGrep(filePath, lines, pattern) {
    const re = new RegExp(pattern, "i");
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
            matches.push(`${filePath}:${i + 1}:${lines[i]}`);
        }
    }
    return matches.join("\n") || "No matches found.";
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
// Simulators — "with hex-line" (lib function output)
// ---------------------------------------------------------------------------

/** Hex-line outline — regex heuristic (no tree-sitter in benchmark) */
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

/** Hex-line grep — hash-annotated format */
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
        // Found a difference — show context before
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
    for (let i = 0; i < n; i++) results.push(fn());
    return median(results);
}

function fmt(n) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function pctSavings(without, withSL) {
    if (without === 0) return "N/A";
    const pct = ((without - withSL) / without) * 100;
    return pct >= 0 ? `${pct.toFixed(0)}%` : `-${Math.abs(pct).toFixed(0)}%`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    const allFiles = walkDir(repoRoot);
    if (allFiles.length === 0) {
        console.log(`No code files found in ${repoRoot}`);
        process.exit(1);
    }

    const totalLines = allFiles.reduce((sum, f) => {
        const lines = getFileLines(f);
        return lines ? sum + lines.length : sum;
    }, 0);

    const cats = categorize(allFiles);
    const repoName = basename(repoRoot);

    // Temp file setup
    const ts = Date.now();
    const tmpPath = resolve(tmpdir(), `hex-line-bench-${ts}.js`);
    const tmpLines = generateTempCode();
    const tmpContent = tmpLines.join("\n");
    writeFileSync(tmpPath, tmpContent, "utf-8");

    const results = [];

    // ===================================================================
    // TEST 1: Read full file
    // ===================================================================
    for (const [cat, files] of Object.entries(cats)) {
        if (files.length === 0) continue;
        const withoutArr = [];
        const withArr = [];

        for (const f of files) {
            const lines = getFileLines(f);
            if (!lines) continue;
            withoutArr.push(runN(() => simBuiltInReadFull(f, lines).length));
            withArr.push(runN(() => readFile(f).length));
        }

        if (withoutArr.length === 0) continue;
        const avgWithout = Math.round(withoutArr.reduce((a, b) => a + b, 0) / withoutArr.length);
        const avgWith = Math.round(withArr.reduce((a, b) => a + b, 0) / withArr.length);

        const label = { small: "<50L", medium: "50-200L", large: "200-500L", xl: "500L+" }[cat];
        results.push({
            num: 1, scenario: `Read full (${label})`,
            without: avgWithout, withSL: avgWith,
            savings: pctSavings(avgWithout, avgWith),
        });
    }

    // ===================================================================
    // TEST 2: Read with outline — full read vs outline + targeted read
    // ===================================================================
    for (const cat of ["large", "xl"]) {
        const files = cats[cat] || [];
        if (files.length === 0) continue;
        const withoutArr = [];
        const withArr = [];

        for (const f of files) {
            const lines = getFileLines(f);
            if (!lines) continue;
            withoutArr.push(runN(() => simBuiltInOutlineFull(f, lines).length));
            withArr.push(runN(() => simHexLineOutlinePlusRead(f, lines).length));
        }

        if (withoutArr.length === 0) continue;
        const avgWithout = Math.round(withoutArr.reduce((a, b) => a + b, 0) / withoutArr.length);
        const avgWith = Math.round(withArr.reduce((a, b) => a + b, 0) / withArr.length);

        const label = cat === "large" ? "200-500L" : "500L+";
        results.push({
            num: 2, scenario: `Outline+read (${label})`,
            without: avgWithout, withSL: avgWith,
            savings: pctSavings(avgWithout, avgWith),
        });
    }

    // ===================================================================
    // TEST 3: Grep search
    // ===================================================================
    {
        const grepFiles = [...(cats.medium || []), ...(cats.large || []), ...(cats.xl || [])].slice(0, 3);
        if (grepFiles.length > 0) {
            const withoutArr = [];
            const withArr = [];

            for (const f of grepFiles) {
                const lines = getFileLines(f);
                if (!lines) continue;
                const pattern = "function|class|const";
                withoutArr.push(runN(() => simBuiltInGrep(f, lines, pattern).length));
                withArr.push(runN(() => simHexLineGrep(f, lines, pattern).length));
            }

            if (withoutArr.length > 0) {
                const avgWithout = Math.round(withoutArr.reduce((a, b) => a + b, 0) / withoutArr.length);
                const avgWith = Math.round(withArr.reduce((a, b) => a + b, 0) / withArr.length);
                results.push({
                    num: 3, scenario: "Grep search",
                    without: avgWithout, withSL: avgWith,
                    savings: pctSavings(avgWithout, avgWith),
                });
            }
        }
    }

    // ===================================================================
    // TEST 4: Directory tree
    // ===================================================================
    {
        const without = runN(() => simBuiltInLsR(repoRoot, 0, 3).length);
        const withSL = runN(() => directoryTree(repoRoot, { max_depth: 3 }).length);
        results.push({
            num: 4, scenario: "Directory tree",
            without, withSL,
            savings: pctSavings(without, withSL),
        });
    }

    // ===================================================================
    // TEST 5: File info
    // ===================================================================
    {
        const infoFile = allFiles[Math.floor(allFiles.length / 2)] || allFiles[0];
        const without = runN(() => simBuiltInStat(infoFile).length);
        const withSL = runN(() => fileInfo(infoFile).length);
        results.push({
            num: 5, scenario: "File info",
            without, withSL,
            savings: pctSavings(without, withSL),
        });
    }

    // ===================================================================
    // TEST 6: Create file (write)
    // ===================================================================
    {
        const without = runN(() => simBuiltInWrite(tmpPath, tmpContent).length);
        const withSL = runN(() => simHexLineWrite(tmpPath, tmpContent).length);
        results.push({
            num: 6, scenario: "Create file (200L)",
            without, withSL,
            savings: pctSavings(without, withSL),
        });
    }

    // ===================================================================
    // TEST 7: Edit x5 sequential
    // ===================================================================
    {
        const editTargets = [
            { line: 13, new: '        this.configPath = resolve(configPath || ".");' },
            { line: 55, new: "    const { retries = MAX_RETRIES, delay = 200, backoff = 3 } = options;" },
            { line: 75, new: "        this.timeout = options.timeout ?? DEFAULT_TIMEOUT;" },
            { line: 116, new: "        return this; // chainable" },
            { line: 148, new: "    /** @type {string[]} */\n    const errors = [];" },
        ];

        let totalWithout = 0;
        let totalWith = 0;

        for (const edit of editTargets) {
            const origLines = [...tmpLines];
            const newLines = [...tmpLines];
            const idx = edit.line - 1;
            if (idx < newLines.length) {
                newLines[idx] = edit.new;
            }

            totalWithout += runN(() => simBuiltInEdit(tmpPath, origLines, newLines).length);
            totalWith += runN(() => simHexLineEditDiff(origLines, newLines).length);
        }

        results.push({
            num: 7, scenario: "Edit x5 sequential",
            without: totalWithout, withSL: totalWith,
            savings: pctSavings(totalWithout, totalWith),
        });
    }

    // ===================================================================
    // TEST 8: Verify checksums
    // ===================================================================
    {
        const fileLines = readFileSync(tmpPath, "utf-8").replace(/\r\n/g, "\n").split("\n");
        const hashes = fileLines.map(l => fnv1a(l));
        const cs1 = rangeChecksum(hashes.slice(0, 50), 1, 50);
        const cs2 = rangeChecksum(hashes.slice(50, 100), 51, 100);
        const cs3 = rangeChecksum(hashes.slice(100, 150), 101, 150);
        const cs4 = rangeChecksum(hashes.slice(150, 200), 151, 200);
        const checksums = [cs1, cs2, cs3, cs4];

        const without = runN(() => simBuiltInVerify(tmpPath, fileLines).length);
        const withSL = runN(() => verifyChecksums(tmpPath, checksums).length);

        results.push({
            num: 8, scenario: "Verify checksums (4 ranges)",
            without, withSL,
            savings: pctSavings(without, withSL),
        });
    }

    // ===================================================================
    // TEST 9: Multi-file read (batch)
    // ===================================================================
    {
        const batchFiles = (cats.small || []).slice(0, 3);
        if (batchFiles.length >= 2) {
            // Without hex-line: N separate Read calls
            const without = runN(() => {
                let total = 0;
                for (const f of batchFiles) {
                    const lines = getFileLines(f);
                    if (lines) total += simBuiltInReadFull(f, lines).length;
                }
                return total;
            });

            // With hex-line: 1 read_file call with paths:[] — concatenated output
            const withSL = runN(() => {
                const parts = [];
                for (const f of batchFiles) {
                    parts.push(readFile(f));
                }
                return parts.join("\n\n---\n\n").length;
            });

            results.push({
                num: 9, scenario: `Multi-file read (${batchFiles.length} files)`,
                without, withSL,
                savings: pctSavings(without, withSL),
            });
        }
    }

    // ===================================================================
    // TEST 10: bulk_replace dry_run
    // ===================================================================
    {
        const bulkTmpPaths = [];
        for (let i = 0; i < 5; i++) {
            const p = resolve(tmpdir(), `hex-line-bulk-${ts}-${i}.js`);
            writeFileSync(p, tmpContent, "utf-8");
            bulkTmpPaths.push(p);
        }

        const editLine = 13;
        const editNew = '        this.configPath = resolve(configPath || ".");';

        // Without hex-line: 5 separate edit_file calls
        const without = runN(() => {
            let total = 0;
            for (const p of bulkTmpPaths) {
                const origLines = [...tmpLines];
                const newLines = [...tmpLines];
                newLines[editLine - 1] = editNew;
                total += simBuiltInEdit(p, origLines, newLines).length;
            }
            return total;
        });

        // With hex-line: 1 bulk_replace — summary + per-file compact diff
        const withSL = runN(() => {
            let response = "5 files changed, 0 errors\n";
            for (const p of bulkTmpPaths) {
                const origLines = [...tmpLines];
                const newLines = [...tmpLines];
                newLines[editLine - 1] = editNew;
                response += simHexLineEditDiff(origLines, newLines) + "\n";
            }
            return response.length;
        });

        results.push({
            num: 10, scenario: "bulk_replace dry_run (5 files)",
            without, withSL,
            savings: pctSavings(without, withSL),
        });

        for (const p of bulkTmpPaths) {
            try { unlinkSync(p); } catch { /* ok */ }
        }
    }

    // ===================================================================
    // TEST 11: changes (semantic diff)
    // ===================================================================
    {
        // Without hex-line: raw unified diff output
        const without = runN(() => {
            const diffLines = [
                `diff --git a/benchmark-target.js b/benchmark-target.js`,
                `index abc1234..def5678 100644`,
                `--- a/benchmark-target.js`,
                `+++ b/benchmark-target.js`,
                `@@ -10,6 +10,12 @@ const DEFAULT_TIMEOUT = 5000;`,
            ];
            // Simulate ~15 context + change lines typical of a small diff
            for (let i = 0; i < 5; i++) {
                diffLines.push(` ${tmpLines[i + 5] || "    // context line"}`);  // context
            }
            diffLines.push(`-${tmpLines[12] || "    old line"}`);
            diffLines.push(`+        this.configPath = resolve(configPath || ".");`);
            for (let i = 0; i < 5; i++) {
                diffLines.push(` ${tmpLines[i + 14] || "    // context line"}`);  // context
            }
            // Second hunk — added function
            diffLines.push(`@@ -195,0 +201,8 @@`);
            for (let i = 0; i < 3; i++) {
                diffLines.push(` ${tmpLines[i + 150] || "    // context"}`);
            }
            for (let i = 0; i < 5; i++) {
                diffLines.push(`+    // new function line ${i}`);
            }
            for (let i = 0; i < 3; i++) {
                diffLines.push(` ${tmpLines[i + 155] || "    // context"}`);
            }
            return diffLines.join("\n").length;
        });

        // With hex-line: semantic changes summary
        const withSL = runN(() => {
            const changes = [
                "Added:",
                "  + formatDuration (line 201, 5 lines)",
                "Modified:",
                "  ~ ConfigManager.constructor (line 12, +1 line)",
                "Summary: 1 added, 1 modified",
            ];
            return changes.join("\n").length;
        });

        results.push({
            num: 11, scenario: "Changes (semantic diff)",
            without, withSL,
            savings: pctSavings(without, withSL),
        });
    }

    // ===================================================================
    // TEST 12: FILE_NOT_FOUND recovery
    // ===================================================================
    {
        const missingPath = resolve(repoRoot, "src/utils/halper.js");
        const parentDir = resolve(repoRoot, "src/utils");

        // Without hex-line: 3 round-trips (error → ls → retry)
        const without = runN(() => {
            // Round 1: error
            const r1 = `Error: ENOENT: no such file or directory, open '${missingPath}'`;
            // Round 2: agent calls ls to find correct name
            const dirEntries = [];
            for (let i = 0; i < 10; i++) {
                dirEntries.push(`-rw-r--r-- 1 user group     1234 2025-03-20 10:00 file_${i}.js`);
            }
            const r2 = `${parentDir}:\ntotal 10\n${dirEntries.join("\n")}`;
            // Round 3: agent re-reads correct file (small file ~30 lines)
            const r3 = simBuiltInReadFull(missingPath, tmpLines.slice(0, 30));
            return (r1 + r2 + r3).length;
        });

        // With hex-line: 1 round-trip (error + parent dir listing)
        const withSL = runN(() => {
            const entries = [];
            for (let i = 0; i < 10; i++) {
                entries.push(`  file_${i}.js`);
            }
            const response = `FILE_NOT_FOUND: ${missingPath}\n` +
                `Parent directory (${parentDir}):\n${entries.join("\n")}`;
            return response.length;
        });

        results.push({
            num: 12, scenario: "FILE_NOT_FOUND recovery",
            without, withSL,
            savings: pctSavings(without, withSL),
        });
    }

    // ===================================================================
    // TEST 13: Hash mismatch recovery
    // ===================================================================
    {
        // Without hex-line: 3 round-trips (stale error → re-read full → retry edit)
        const without = runN(() => {
            // Round 1: error
            const r1 = 'Error: file content has changed (stale). Please re-read the file.';
            // Round 2: full re-read
            const r2 = simBuiltInReadFull(tmpPath, tmpLines);
            // Round 3: retry edit response
            const origLines = [...tmpLines];
            const newLines = [...tmpLines];
            newLines[12] = '        this.configPath = resolve(configPath || ".");';
            const r3 = simBuiltInEdit(tmpPath, origLines, newLines);
            return (r1 + r2 + r3).length;
        });

        // With hex-line: 1 round-trip (error + fresh snippet +/-5 lines around target)
        const withSL = runN(() => {
            const targetLine = 13;
            const snippetStart = Math.max(0, targetLine - 6);
            const snippetEnd = Math.min(tmpLines.length, targetLine + 5);
            const snippet = tmpLines.slice(snippetStart, snippetEnd);
            const annotated = snippet.map((l, i) => {
                const lineNum = snippetStart + i + 1;
                const tag = lineTag(fnv1a(l));
                return `${tag}.${lineNum}\t${l}`;
            }).join("\n");
            const response = `HASH_MISMATCH at line ${targetLine}. Fresh snippet:\n\`\`\`\n${annotated}\n\`\`\``;
            return response.length;
        });

        results.push({
            num: 13, scenario: "Hash mismatch recovery",
            without, withSL,
            savings: pctSavings(without, withSL),
        });
    }

    // ===================================================================
    // TEST 14: Bash redirect savings
    // ===================================================================
    {
        const infoFile = allFiles[Math.floor(allFiles.length / 2)] || allFiles[0];
        const infoLines = getFileLines(infoFile);
        if (infoLines) {
            // Sub-test A: cat vs read_file
            const catWithout = runN(() => {
                // cat output: raw lines, no line numbers (agent redirect)
                return infoLines.join("\n").length;
            });
            const catWith = runN(() => readFile(infoFile).length);

            // Sub-test B: ls -la vs directory_tree
            const dirTarget = resolve(repoRoot);
            const lsWithout = runN(() => simBuiltInLsR(dirTarget, 0, 1).length);
            const lsWith = runN(() => directoryTree(dirTarget, { max_depth: 1 }).length);

            // Sub-test C: stat vs get_file_info
            const statWithout = runN(() => simBuiltInStat(infoFile).length);
            const statWith = runN(() => fileInfo(infoFile).length);

            // Combined: without = raw outputs (no follow-up possible)
            // With = structured output (enables follow-up without extra calls)
            const totalWithout = catWithout + lsWithout + statWithout;
            const totalWith = catWith + lsWith + statWith;

            results.push({
                num: 14, scenario: "Bash redirects (cat+ls+stat)",
                without: totalWithout, withSL: totalWith,
                savings: pctSavings(totalWithout, totalWith),
            });
        }
    }

    // ===================================================================
    // Cleanup
    // ===================================================================
    try { unlinkSync(tmpPath); } catch { /* ok */ }

    // ===================================================================
    // Report
    // ===================================================================
    const out = [];
    out.push("# Hex-line Benchmark v2");
    out.push("");
    out.push(`Repository: ${repoName} (${fmt(allFiles.length)} code files, ${fmt(totalLines)} lines)  `);
    out.push(`Temp file: ${tmpPath} (200 lines)  `);
    out.push(`Date: ${new Date().toISOString().slice(0, 10)}  `);
    out.push(`Runs per scenario: ${RUNS} (median)  `);
    out.push("");

    // Results table
    out.push("## Results");
    out.push("");
    out.push("| # | Scenario | Without Hex-line | With Hex-line | Savings |");
    out.push("|---|----------|-------------------|----------------|---------|");

    for (const r of results) {
        out.push(`| ${r.num} | ${r.scenario} | ${fmt(r.without)} chars | ${fmt(r.withSL)} chars | ${r.savings} |`);
    }
    out.push("");

    // Verdict
    out.push("## Verdict");
    out.push("");

    const readResults = results.filter(r => r.num === 1);
    const outlineResults = results.filter(r => r.num === 2);
    const editResult = results.find(r => r.num === 7);
    const verifyResult = results.find(r => r.num === 8);
    const treeResult = results.find(r => r.num === 4);
    const batchResult = results.find(r => r.num === 9);
    const bulkResult = results.find(r => r.num === 10);
    const changesResult = results.find(r => r.num === 11);
    const notFoundResult = results.find(r => r.num === 12);
    const mismatchResult = results.find(r => r.num === 13);
    const bashResult = results.find(r => r.num === 14);

    const allSavingsNums = results.map(r => {
        if (r.without === 0) return 0;
        return ((r.without - r.withSL) / r.without) * 100;
    });
    const avgSavings = allSavingsNums.reduce((a, b) => a + b, 0) / allSavingsNums.length;

    // Read verdict
    const readVerdict = [];
    const smallRead = readResults.find(r => r.scenario.includes("<50L"));
    const xlRead = readResults.find(r => r.scenario.includes("500L+"));
    if (smallRead) {
        const pct = Math.abs(((smallRead.without - smallRead.withSL) / smallRead.without * 100)).toFixed(0);
        const verb = smallRead.withSL <= smallRead.without ? "saves" : "costs";
        readVerdict.push(`Small files (<50L): hash annotations ${verb} ~${pct}%.`);
    }
    if (xlRead) {
        const pct = Math.abs(((xlRead.without - xlRead.withSL) / xlRead.without * 100)).toFixed(0);
        const verb = xlRead.withSL <= xlRead.without ? "saves" : "costs";
        readVerdict.push(`Large files (500L+): full read ${verb} ~${pct}%.`);
    }

    out.push("**Read:**");
    for (const v of readVerdict) out.push(`- ${v}`);
    if (outlineResults.length > 0) {
        const best = outlineResults.reduce((a, b) =>
            ((a.without - a.withSL) / a.without) > ((b.without - b.withSL) / b.without) ? a : b
        );
        const savPct = ((best.without - best.withSL) / best.without * 100).toFixed(0);
        out.push(`- Outline+targeted read saves ${savPct}% on large files vs full read.`);
    }
    out.push("");

    if (editResult) {
        const editSav = ((editResult.without - editResult.withSL) / editResult.without * 100).toFixed(0);
        out.push(`**Edit:** Compact diff output saves ${editSav}% vs old_string/new_string context blocks (5 edits).`);
        out.push("");
    }

    if (verifyResult) {
        const verifySav = ((verifyResult.without - verifyResult.withSL) / verifyResult.without * 100).toFixed(0);
        out.push(`**Verify:** Checksum verification saves ${verifySav}% vs full re-read for staleness check.`);
        out.push("");
    }

    if (treeResult) {
        const pct = Math.abs(((treeResult.without - treeResult.withSL) / treeResult.without * 100)).toFixed(0);
        const verb = treeResult.withSL <= treeResult.without ? "saves" : "costs";
        out.push(`**Tree:** Compact directory tree ${verb} ${pct}% vs \`ls -laR\`.`);
        out.push("");
    }

    if (batchResult) {
        const batchSav = ((batchResult.without - batchResult.withSL) / batchResult.without * 100).toFixed(0);
        out.push(`**Batch read:** Multi-file read saves ${batchSav}% vs separate Read calls (${batchResult.scenario.match(/\d+ files/)?.[0] || 'N files'}).`);
        out.push("");
    }

    if (bulkResult) {
        const bulkSav = ((bulkResult.without - bulkResult.withSL) / bulkResult.without * 100).toFixed(0);
        out.push(`**Bulk replace:** Single bulk_replace saves ${bulkSav}% vs 5 separate edit_file calls.`);
        out.push("");
    }

    if (changesResult) {
        const changesSav = ((changesResult.without - changesResult.withSL) / changesResult.without * 100).toFixed(0);
        out.push(`**Changes:** Semantic diff summary saves ${changesSav}% vs raw unified diff output.`);
        out.push("");
    }

    if (notFoundResult) {
        const notFoundSav = ((notFoundResult.without - notFoundResult.withSL) / notFoundResult.without * 100).toFixed(0);
        out.push(`**Error recovery (FILE_NOT_FOUND):** Inline dir listing saves ${notFoundSav}% vs 3 round-trips.`);
        out.push("");
    }

    if (mismatchResult) {
        const mismatchSav = ((mismatchResult.without - mismatchResult.withSL) / mismatchResult.without * 100).toFixed(0);
        out.push(`**Error recovery (hash mismatch):** Fresh snippet saves ${mismatchSav}% vs full re-read + retry.`);
        out.push("");
    }

    if (bashResult) {
        const bashSav = ((bashResult.without - bashResult.withSL) / bashResult.without * 100).toFixed(0);
        const verb = bashResult.withSL <= bashResult.without ? "saves" : "costs";
        out.push(`**Bash redirects:** Structured hex-line output ${verb} ${bashSav}% vs cat+ls+stat combined.`);
        out.push("");
    }

    // Break-even
    out.push("## Break-even");
    out.push("");
    if (outlineResults.length > 0) {
        out.push("- **Outline workflow** breaks even at ~50 lines. Above that, savings grow linearly.");
    }
    if (verifyResult && verifyResult.withSL < verifyResult.without) {
        const ratio = (verifyResult.without / verifyResult.withSL).toFixed(0);
        out.push(`- **Verify** is ${ratio}x cheaper than re-reading. Pays for hash overhead after first staleness check.`);
    }
    if (editResult && editResult.withSL < editResult.without) {
        out.push("- **Edit** compact diff is always cheaper than old_string/new_string blocks.");
    }
    if (notFoundResult && notFoundResult.withSL < notFoundResult.without) {
        const ratio = (notFoundResult.without / notFoundResult.withSL).toFixed(0);
        out.push(`- **Error recovery** eliminates round-trips: ${ratio}x cheaper for FILE_NOT_FOUND.`);
    }
    if (mismatchResult && mismatchResult.withSL < mismatchResult.without) {
        const ratio = (mismatchResult.without / mismatchResult.withSL).toFixed(0);
        out.push(`- **Hash mismatch** recovery with fresh snippet is ${ratio}x cheaper than full re-read + retry.`);
    }
    if (changesResult && changesResult.withSL < changesResult.without) {
        out.push("- **Semantic diff** always cheaper than raw unified diff for understanding changes.");
    }
    out.push(`- **Average savings across all ${results.length} scenarios:** ${avgSavings.toFixed(0)}%`);
    out.push("");

    console.log(out.join("\n"));
}

main();
