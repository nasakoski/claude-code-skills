/**
 * File search via ripgrep with hash-annotated results.
 * Uses spawn with arg arrays (no shell string interpolation).
 *
 * Output modes:
 *   content (default) — hash-annotated lines with per-group checksums (uses rg --json)
 *   files — file paths only (rg -l)
 *   count — match counts per file (rg -c)
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fnv1a, lineTag, rangeChecksum } from "./hash.mjs";
import { getGraphDB, matchAnnotation, getRelativePath } from "./graph-enrich.mjs";
import { normalizePath } from "./security.mjs";

const DEFAULT_LIMIT = 100;
const MAX_OUTPUT = 10 * 1024 * 1024; // 10 MB
const TIMEOUT = 30000; // 30s



/**
 * Spawn ripgrep and collect stdout.
 * Returns { stdout, code, stderr, killed }.
 */
function spawnRg(args) {
    return new Promise((resolve_, reject) => {
        let stdout = "";
        let totalBytes = 0;
        let killed = false;
        let stderrBuf = "";

        const child = spawn("rg", args, { timeout: TIMEOUT });

        child.stdout.on("data", (chunk) => {
            totalBytes += chunk.length;
            if (totalBytes > MAX_OUTPUT) {
                killed = true;
                child.kill();
                return;
            }
            stdout += chunk.toString("utf-8");
        });

        child.stderr.on("data", (chunk) => { stderrBuf += chunk.toString("utf-8"); });

        child.on("error", (err) => {
            if (err.code === "ENOENT") {
                reject(new Error("ripgrep (rg) not found. Install: https://github.com/BurntSushi/ripgrep#installation"));
            } else {
                reject(new Error(`rg spawn error: ${err.message}`));
            }
        });

        child.on("close", (code) => {
            resolve_({ stdout, code, stderr: stderrBuf, killed });
        });
    });
}

/**
 * Search files using ripgrep.
 *
 * @param {string} pattern - regex or literal pattern
 * @param {object} opts
 * @returns {Promise<string>} formatted results
 */
export function grepSearch(pattern, opts = {}) {
    const normPath = normalizePath(opts.path || "");
    const target = normPath ? resolve(normPath) : process.cwd();
    const output = opts.output || "content";
    const plain = !!opts.plain;
    const totalLimit = (opts.totalLimit && opts.totalLimit > 0) ? opts.totalLimit : 0;

    // Branch by output mode
    if (output === "files") return filesMode(pattern, target, opts);
    if (output === "count") return countMode(pattern, target, opts);
    return contentMode(pattern, target, opts, plain, totalLimit);
}

/**
 * files mode: rg -l — just file paths.
 */
async function filesMode(pattern, target, opts) {
    // -l + shared flags (without -n/heading/-m since -l ignores them)
    const realArgs = ["-l"];
    if (opts.caseInsensitive) realArgs.push("-i");
    else if (opts.smartCase) realArgs.push("-S");
    if (opts.literal) realArgs.push("-F");
    if (opts.multiline) realArgs.push("-U", "--multiline-dotall");
    if (opts.glob) realArgs.push("--glob", opts.glob);
    if (opts.type) realArgs.push("--type", opts.type);
    realArgs.push("--", pattern, target);

    const { stdout, code, stderr, killed } = await spawnRg(realArgs);
    if (killed) return "GREP_OUTPUT_TRUNCATED: exceeded 10MB. Use specific glob/path.";
    if (code === 1) return "No matches found.";
    if (code !== 0 && code !== null) throw new Error(`GREP_ERROR: rg exit ${code} — ${stderr.trim() || "unknown error"}`);

    const lines = stdout.trimEnd().split("\n").filter(Boolean);
    const normalized = lines.map(l => l.replace(/\\/g, "/"));
    return `\`\`\`\n${normalized.join("\n")}\n\`\`\``;
}

/**
 * count mode: rg -c — match counts per file.
 */
async function countMode(pattern, target, opts) {
    const realArgs = ["-c"];
    if (opts.caseInsensitive) realArgs.push("-i");
    else if (opts.smartCase) realArgs.push("-S");
    if (opts.literal) realArgs.push("-F");
    if (opts.multiline) realArgs.push("-U", "--multiline-dotall");
    if (opts.glob) realArgs.push("--glob", opts.glob);
    if (opts.type) realArgs.push("--type", opts.type);
    realArgs.push("--", pattern, target);

    const { stdout, code, stderr, killed } = await spawnRg(realArgs);
    if (killed) return "GREP_OUTPUT_TRUNCATED: exceeded 10MB. Use specific glob/path.";
    if (code === 1) return "No matches found.";
    if (code !== 0 && code !== null) throw new Error(`GREP_ERROR: rg exit ${code} — ${stderr.trim() || "unknown error"}`);

    const lines = stdout.trimEnd().split("\n").filter(Boolean);
    const normalized = lines.map(l => l.replace(/\\/g, "/"));
    return `\`\`\`\n${normalized.join("\n")}\n\`\`\``;
}

/**
 * content mode: rg --json — hash-annotated lines with per-group checksums.
 */
async function contentMode(pattern, target, opts, plain, totalLimit) {
    const realArgs = ["--json"];
    if (opts.caseInsensitive) realArgs.push("-i");
    else if (opts.smartCase) realArgs.push("-S");
    if (opts.literal) realArgs.push("-F");
    if (opts.multiline) realArgs.push("-U", "--multiline-dotall");
    if (opts.glob) realArgs.push("--glob", opts.glob);
    if (opts.type) realArgs.push("--type", opts.type);
    if (opts.context && opts.context > 0) realArgs.push("-C", String(opts.context));
    if (opts.contextBefore && opts.contextBefore > 0) realArgs.push("-B", String(opts.contextBefore));
    if (opts.contextAfter && opts.contextAfter > 0) realArgs.push("-A", String(opts.contextAfter));

    const limit = (opts.limit && opts.limit > 0) ? opts.limit : DEFAULT_LIMIT;
    realArgs.push("-m", String(limit));
    realArgs.push("--", pattern, target);

    const { stdout, code, stderr, killed } = await spawnRg(realArgs);
    if (killed) return "GREP_OUTPUT_TRUNCATED: exceeded 10MB. Use specific glob/path.";
    if (code === 1) return "No matches found.";
    if (code !== 0 && code !== null) throw new Error(`GREP_ERROR: rg exit ${code} — ${stderr.trim() || "unknown error"}`);

    // Parse NDJSON output
    const jsonLines = stdout.trimEnd().split("\n").filter(Boolean);
    const formatted = [];
    const db = getGraphDB(target);
    const relCache = new Map();

    // Track current group for checksums
    let groupFile = null;
    let groupLines = [];   // { lineNum, hash32 }
    let matchCount = 0;

    function flushGroup() {
        if (groupLines.length === 0) return;
        const sorted = [...groupLines].sort((a, b) => a.lineNum - b.lineNum);
        const start = sorted[0].lineNum;
        const end = sorted[sorted.length - 1].lineNum;
        const hashes = sorted.map(l => l.hash32);
        const cs = rangeChecksum(hashes, start, end);
        formatted.push(`checksum: ${cs}`);
        groupLines = [];
    }

    for (const jl of jsonLines) {
        let msg;
        try { msg = JSON.parse(jl); } catch { continue; }

        if (msg.type === "begin" || msg.type === "end" || msg.type === "summary") {
            if (msg.type === "end") {
                flushGroup();
                groupFile = null;
            }
            if (msg.type === "begin") {
                // Separator between file groups
                if (formatted.length > 0 && formatted[formatted.length - 1] !== "") {
                    formatted.push("");
                }
            }
            continue;
        }

        if (msg.type !== "match" && msg.type !== "context") continue;

        const data = msg.data;
        const filePath = (data.path?.text || "").replace(/\\/g, "/");
        const lineNum = data.line_number;
        if (!lineNum) continue;

        // Get line content (handle text vs bytes)
        let content = data.lines?.text;
        if (content === undefined && data.lines?.bytes) {
            content = Buffer.from(data.lines.bytes, "base64").toString("utf-8");
        }
        if (content === undefined) continue;

        // Trim trailing newline from rg JSON output
        content = content.replace(/\n$/, "");

        // Handle multiline: split into individual lines
        const subLines = content.split("\n");

        // Track group boundaries
        if (filePath !== groupFile) {
            flushGroup();
            groupFile = filePath;
        }

        for (let i = 0; i < subLines.length; i++) {
            const ln = lineNum + i;
            const lineContent = subLines[i];
            const hash32 = fnv1a(lineContent);
            const tag = lineTag(hash32);

            // Flush on line gap (disjoint match clusters get separate checksums)
            if (groupLines.length > 0) {
                const lastLn = groupLines[groupLines.length - 1].lineNum;
                if (ln > lastLn + 1) flushGroup();
            }
            groupLines.push({ lineNum: ln, hash32 });

            const isMatch = msg.type === "match";
            if (plain) {
                formatted.push(`${filePath}:${ln}:${lineContent}`);
            } else {
                let anno = "";
                if (db && isMatch) {
                    let rel = relCache.get(filePath);
                    if (rel === undefined) {
                        rel = getRelativePath(resolve(filePath)) || "";
                        relCache.set(filePath, rel);
                    }
                    if (rel) {
                        const a = matchAnnotation(db, rel, ln);
                        if (a) anno = `  ${a}`;
                    }
                }
                const prefix = isMatch ? ">>" : "  ";
                formatted.push(`${filePath}:${prefix}${tag}.${ln}\t${lineContent}${anno}`);
            }

        }

        // Count matches per rg event, not per subLine
        if (msg.type === "match") {
            matchCount++;
            if (totalLimit > 0 && matchCount >= totalLimit) {
                flushGroup();
                formatted.push(`--- total_limit reached (${totalLimit}) ---`);
                return `\`\`\`\n${formatted.join("\n")}\n\`\`\``;
            }
        }
    }

    // Flush last group
    flushGroup();

    return `\`\`\`\n${formatted.join("\n")}\n\`\`\``;
}
