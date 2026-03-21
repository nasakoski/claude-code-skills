/**
 * Compact directory tree with .gitignore support.
 *
 * Skips common build/cache dirs by default.
 * Parses .gitignore patterns (simple subset: globs, comments, negation).
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { resolve, basename, join, relative } from "node:path";

const SKIP_DIRS = new Set([
    "node_modules", ".git", "dist", "build", "__pycache__", ".next", "coverage",
]);

/**
 * Convert a simple glob pattern to a RegExp.
 * Supports: * (any non-slash), ** (any), ? (single char).
 */
function globToRegex(pat) {
    return new RegExp(
        "^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&")
                  .replace(/\*\*/g, "\0")
                  .replace(/\*/g, "[^/]*")
                  .replace(/\0/g, ".*")
                  .replace(/\?/g, ".") + "$"
    );
}

/**
 * Parse .gitignore into match functions.
 * Supports: comments (#), negation (!), wildcards (*), dir-only trailing /.
 */
function parseGitignore(content) {
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    const patterns = [];
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const negate = line.startsWith("!");
        let pat = negate ? line.slice(1) : line;
        // Strip leading /
        if (pat.startsWith("/")) pat = pat.slice(1);
        // Strip trailing /
        const dirOnly = pat.endsWith("/");
        if (dirOnly) pat = pat.slice(0, -1);
        const re = globToRegex(pat);
        patterns.push({ re, negate, dirOnly });
    }
    return patterns;
}
function isIgnored(name, isDir, patterns) {
    let ignored = false;
    for (const { re, negate, dirOnly } of patterns) {
        if (dirOnly && !isDir) continue;
        if (re.test(name)) ignored = !negate;
    }
    return ignored;
}

function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${bytes}B`;
}

/**
 * Find files/dirs by glob pattern. Returns flat list of relative paths.
 * @param {string} dirPath - Root directory to search
 * @param {object} opts - { pattern, type, max_depth, gitignore }
 * @returns {string} Formatted match list
 */
function findByPattern(dirPath, opts) {
    const re = globToRegex(opts.pattern);
    const filterType = opts.type || "all";
    const maxDepth = opts.max_depth ?? 20;
    const useGitignore = opts.gitignore ?? true;

    const normalized = (process.platform === "win32" && /^\/[a-zA-Z]\//.test(dirPath))
        ? dirPath[1] + ":" + dirPath.slice(2) : dirPath;
    const abs = resolve(normalized);
    if (!existsSync(abs)) throw new Error(`DIRECTORY_NOT_FOUND: ${abs}`);
    if (!statSync(abs).isDirectory()) throw new Error(`Not a directory: ${abs}`);

    let patterns = [];
    if (useGitignore) {
        const gi = join(abs, ".gitignore");
        if (existsSync(gi)) {
            try { patterns = parseGitignore(readFileSync(gi, "utf-8")); } catch { /* skip */ }
        }
    }

    const matches = [];

    function walk(dir, depth) {
        if (depth > maxDepth) return;
        let entries;
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }

        for (const entry of entries) {
            const isDir = entry.isDirectory();
            if (SKIP_DIRS.has(entry.name) && isDir) continue;
            if (isIgnored(entry.name, isDir, patterns)) continue;

            const full = join(dir, entry.name);

            if (re.test(entry.name)) {
                if (filterType === "all" ||
                    (filterType === "dir" && isDir) ||
                    (filterType === "file" && !isDir)) {
                    const rel = relative(abs, full).replace(/\\/g, "/");
                    matches.push(isDir ? rel + "/" : rel);
                }
            }

            if (isDir) walk(full, depth + 1);
        }
    }

    walk(abs, 1);
    matches.sort();

    const rootName = basename(abs);
    if (matches.length === 0) {
        return `No matches for "${opts.pattern}" in ${rootName}/`;
    }
    return `Found ${matches.length} match${matches.length === 1 ? "" : "es"} for "${opts.pattern}" in ${rootName}/\n\n${matches.join("\n")}`;
}

/**
 * Build directory tree recursively, or find by pattern.
 * @param {string} dirPath - Absolute directory path
 * @param {object} opts - { max_depth, gitignore, format, pattern, type }
 * @returns {string} Formatted tree or match list
 */
export function directoryTree(dirPath, opts = {}) {
    if (opts.pattern) return findByPattern(dirPath, opts);

    const compact = opts.format === "compact";
    const maxDepth = compact ? 1 : (opts.max_depth ?? 3);
    const useGitignore = opts.gitignore ?? true;

    // Convert Git Bash /c/path → c:/path on Windows
    const normalized = (process.platform === "win32" && /^\/[a-zA-Z]\//.test(dirPath))
        ? dirPath[1] + ":" + dirPath.slice(2) : dirPath;
    const abs = resolve(normalized);
    if (!existsSync(abs)) throw new Error(`DIRECTORY_NOT_FOUND: ${abs}. Check path or use directory_tree on parent directory.`);
    const rootStat = statSync(abs);
    if (!rootStat.isDirectory()) throw new Error(`Not a directory: ${abs}`);

    // Load .gitignore
    let patterns = [];
    if (useGitignore) {
        const gi = join(abs, ".gitignore");
        if (existsSync(gi)) {
            try { patterns = parseGitignore(readFileSync(gi, "utf-8")); } catch { /* skip */ }
        }
    }

    let totalFiles = 0;
    let totalSize = 0;
    const lines = [];

    function walk(dir, prefix, depth) {
        if (depth > maxDepth) return;
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch { return; }

        // Sort: directories first, then files, alphabetical
        entries.sort((a, b) => {
            const aDir = a.isDirectory() ? 0 : 1;
            const bDir = b.isDirectory() ? 0 : 1;
            if (aDir !== bDir) return aDir - bDir;
            return a.name.localeCompare(b.name);
        });

        for (const entry of entries) {
            const name = entry.name;
            const isDir = entry.isDirectory();

            if (SKIP_DIRS.has(name) && isDir) continue;
            if (isIgnored(name, isDir, patterns)) continue;

            const full = join(dir, name);

            if (isDir) {
                if (compact) {
                    lines.push(`${prefix}${name}/`);
                } else {
                    // Count files in subdirectory
                    const subInfo = { files: 0 };
                    countFiles(full, subInfo);
                    lines.push(`${prefix}${name}/ (${subInfo.files} files)`);
                }
                walk(full, prefix + "  ", depth + 1);
            } else {
                totalFiles++;
                if (compact) {
                    lines.push(`${prefix}${name}`);
                } else {
                    let size = 0;
                    try { size = statSync(full).size; } catch { /* skip */ }
                    totalSize += size;
                    if (size >= 1024) {
                        lines.push(`${prefix}${name} (${formatSize(size)})`);
                    } else {
                        lines.push(`${prefix}${name}`);
                    }
                }
            }
        }
    }

    function countFiles(dir, info, depth = 0) {
        if (depth > 10) return; // safety limit for deep trees
        let entries;
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name) && entry.isDirectory()) continue;
            if (isIgnored(entry.name, entry.isDirectory(), patterns)) continue;
            if (entry.isDirectory()) {
                countFiles(join(dir, entry.name), info, depth + 1);
            } else {
                info.files++;
            }
        }
    }

    const rootName = basename(abs);
    walk(abs, "  ", 1);

    const header = compact
        ? `Directory: ${rootName}/ (${totalFiles} files)`
        : `Directory: ${rootName}/ (${totalFiles} files, ${formatSize(totalSize)})`;
    return `${header}\n\n${rootName}/\n${lines.join("\n")}`;
}
