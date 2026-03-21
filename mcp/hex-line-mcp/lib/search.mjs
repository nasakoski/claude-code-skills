/**
 * File search via ripgrep with hash-annotated results.
 * Uses spawn with arg arrays (no shell string interpolation).
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fnv1a, lineTag } from "./hash.mjs";
import { getGraphDB, matchAnnotation, getRelativePath } from "./graph-enrich.mjs";

const DEFAULT_LIMIT = 100;
const MAX_OUTPUT = 10 * 1024 * 1024; // 10 MB
const TIMEOUT = 30000; // 30s

/**
 * Search files using ripgrep.
 *
 * @param {string} pattern - regex pattern
 * @param {object} opts - { path, glob, type, caseInsensitive, context, limit, plain }
 * @returns {Promise<string>} formatted results
 */
export function grepSearch(pattern, opts = {}) {
    return new Promise((resolve_, reject) => {
        // Convert Git Bash /c/path → c:/path on Windows
        const rawPath = opts.path || "";
        const normPath = (process.platform === "win32" && /^\/[a-zA-Z]\//.test(rawPath))
            ? rawPath[1] + ":" + rawPath.slice(2) : rawPath;
        const target = normPath ? resolve(normPath) : process.cwd();
        const args = ["-n", "--no-heading", "--with-filename"];
        const plain = !!opts.plain;

        if (opts.caseInsensitive) args.push("-i");
        else if (opts.smartCase) args.push("-S");
        if (opts.context && opts.context > 0) args.push("-C", String(opts.context));
        if (opts.glob) args.push("--glob", opts.glob);
        if (opts.type) args.push("--type", opts.type);

        const limit = (opts.limit && opts.limit > 0) ? opts.limit : DEFAULT_LIMIT;
        args.push("-m", String(limit));
        args.push("--", pattern, target);

        let stdout = "";
        let totalBytes = 0;
        let killed = false;

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

        let stderrBuf = "";
        child.stderr.on("data", (chunk) => { stderrBuf += chunk.toString("utf-8"); });

        child.on("error", (err) => {
            if (err.code === "ENOENT") {
                reject(new Error("ripgrep (rg) not found. Install: https://github.com/BurntSushi/ripgrep#installation"));
            } else {
                reject(new Error(`rg spawn error: ${err.message}`));
            }
        });

        child.on("close", (code) => {
            if (killed) {
                resolve_("GREP_OUTPUT_TRUNCATED: exceeded 10MB. Use specific glob/path.");
                return;
            }
            if (code === 1) {
                resolve_("No matches found.");
                return;
            }
            if (code !== 0 && code !== null) {
                const reason = stderrBuf.trim() || "unknown error";
                reject(new Error(`GREP_ERROR: rg exit ${code} — ${reason}`));
                return;
            }

            // Format results with hash tags
            const resultLines = stdout.trimEnd().split("\n");
            const formatted = [];
            const db = getGraphDB(target);
            const relCache = new Map();

            // Match line: file:42:content
            const matchRe = /^((?:[A-Za-z]:)?[^:]*):(\d+):(.*)$/;
            // Context line: file-42-content
            const ctxRe = /^((?:[A-Za-z]:)?[^-]*)-(\d+)-(.*)$/;

            if (plain) {
                // Plain mode: file:line:content without hash tags
                for (const rl of resultLines) {
                    formatted.push(rl);
                }
            } else {
                for (const rl of resultLines) {
                    if (!rl || rl === "--") { formatted.push(rl); continue; }
                    // Normalize backslashes for consistent regex matching on Windows
                    const nl = rl.replace(/\\/g, "/");

                    const m = matchRe.exec(nl);
                    if (m) {
                        const tag = lineTag(fnv1a(m[3]));
                        let anno = "";
                        if (db) {
                            let rel = relCache.get(m[1]);
                            if (rel === undefined) { rel = getRelativePath(resolve(m[1])) || ""; relCache.set(m[1], rel); }
                            if (rel) { const a = matchAnnotation(db, rel, +m[2]); if (a) anno = `  ${a}`; }
                        }
                        formatted.push(`${m[1]}:>>${tag}.${m[2]}\t${m[3]}${anno}`);
                        continue;
                    }

                    const c = ctxRe.exec(nl);
                    if (c) {
                        const tag = lineTag(fnv1a(c[3]));
                        formatted.push(`${c[1]}:  ${tag}.${c[2]}\t${c[3]}`);
                        continue;
                    }

                    formatted.push(rl);
                }
            }

            resolve_(`\`\`\`\n${formatted.join("\n")}\n\`\`\``);
        });
    });
}
