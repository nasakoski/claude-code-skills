/**
 * File metadata without reading content.
 *
 * Returns: size, line count, modification time, type, binary detection.
 */

import { statSync, readFileSync } from "node:fs";
import { resolve, isAbsolute, extname, basename } from "node:path";

const MAX_LINE_COUNT_SIZE = 10 * 1024 * 1024; // 10 MB

const EXT_NAMES = {
    ".ts": "TypeScript source", ".tsx": "TypeScript JSX source",
    ".js": "JavaScript source", ".jsx": "JavaScript JSX source",
    ".mjs": "JavaScript ESM source", ".cjs": "JavaScript CJS source",
    ".py": "Python source", ".rb": "Ruby source", ".rs": "Rust source",
    ".go": "Go source", ".java": "Java source", ".kt": "Kotlin source",
    ".swift": "Swift source", ".c": "C source", ".cpp": "C++ source",
    ".h": "C/C++ header", ".cs": "C# source", ".php": "PHP source",
    ".sh": "Shell script", ".bash": "Bash script", ".zsh": "Zsh script",
    ".json": "JSON data", ".yaml": "YAML data", ".yml": "YAML data",
    ".toml": "TOML config", ".xml": "XML document", ".html": "HTML document",
    ".css": "CSS stylesheet", ".scss": "SCSS stylesheet", ".less": "LESS stylesheet",
    ".md": "Markdown document", ".txt": "Plain text", ".csv": "CSV data",
    ".sql": "SQL script", ".graphql": "GraphQL schema",
    ".png": "PNG image", ".jpg": "JPEG image", ".jpeg": "JPEG image",
    ".gif": "GIF image", ".svg": "SVG image", ".ico": "Icon file",
    ".pdf": "PDF document", ".zip": "ZIP archive", ".tar": "TAR archive",
    ".gz": "Gzip archive", ".wasm": "WebAssembly binary",
    ".lock": "Lock file", ".env": "Environment config",
    ".dockerfile": "Dockerfile", ".vue": "Vue component", ".svelte": "Svelte component",
};

function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${bytes}B`;
}

function relativeTime(mtime) {
    const diff = Date.now() - mtime.getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} minute${mins > 1 ? "s" : ""} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? "s" : ""} ago`;
}

function detectBinary(filePath, size) {
    if (size === 0) return false;
    const fd = readFileSync(filePath, { encoding: null, flag: "r" });
    const checkLen = Math.min(fd.length, 8192);
    for (let i = 0; i < checkLen; i++) {
        if (fd[i] === 0) return true;
    }
    return false;
}

/**
 * Get file metadata without reading full content.
 * @param {string} filePath
 * @returns {string} Formatted metadata
 */
export function fileInfo(filePath) {
    if (!filePath) throw new Error("Empty file path");
    const abs = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);

    const stat = statSync(abs);
    if (!stat.isFile()) throw new Error(`Not a regular file: ${abs}`);

    const size = stat.size;
    const mtime = stat.mtime;
    const ext = extname(abs).toLowerCase();
    const name = basename(abs);

    // File type
    let typeName = EXT_NAMES[ext] || (ext ? `${ext.slice(1).toUpperCase()} file` : "Unknown type");
    if (name === "Dockerfile") typeName = "Dockerfile";
    if (name === "Makefile") typeName = "Makefile";

    // Binary detection
    const isBinary = size > 0 ? detectBinary(abs, size) : false;

    // Line count (only for non-binary, <10MB)
    let lineCount = null;
    if (!isBinary && size <= MAX_LINE_COUNT_SIZE && size > 0) {
        const content = readFileSync(abs, "utf-8");
        lineCount = content.split("\n").length;
    }

    // Format output
    const sizeStr = lineCount !== null
        ? `Size: ${formatSize(size)} (${lineCount} lines)`
        : `Size: ${formatSize(size)}`;
    const timeStr = `Modified: ${mtime.toISOString().replace("T", " ").slice(0, 19)} (${relativeTime(mtime)})`;

    return [
        `File: ${filePath}`,
        sizeStr,
        timeStr,
        `Type: ${typeName}`,
        `Binary: ${isBinary ? "yes" : "no"}`,
    ].join("\n");
}
