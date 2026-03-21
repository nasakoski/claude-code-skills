/**
 * File read with FNV-1a hash annotations and range checksums.
 *
 * Output format: {tag}.{lineNum}\t{content}
 * Appends: checksum: {start}-{end}:{8hex}
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { fnv1a, lineTag, rangeChecksum } from "./hash.mjs";
import { validatePath } from "./security.mjs";
import { getGraphDB, fileAnnotations, getRelativePath } from "./graph-enrich.mjs";

/**
 * Format a Date as relative time string: "just now", "5 min ago", etc.
 */
function relativeTime(date) {
    const sec = Math.round((Date.now() - date.getTime()) / 1000);
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? "" : "s"} ago`;
}

const DEFAULT_LIMIT = 2000;
const MAX_OUTPUT_CHARS = 80000;

/**
 * Read a file with hash-annotated lines.
 *
 * @param {string} filePath
 * @param {object} opts - { offset, limit, plain, ranges }
 * @returns {string} formatted output
 */
export function readFile(filePath, opts = {}) {
    const real = validatePath(filePath);
    const stat = statSync(real);

    // Directory listing fallback
    if (stat.isDirectory()) {
        const entries = readdirSync(real, { withFileTypes: true });
        const listing = entries.map((e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`).join("\n");
        return `Directory: ${filePath}\n\n\`\`\`\n${listing}\n\`\`\``;
    }

    const content = readFileSync(real, "utf-8").replace(/\r\n/g, "\n");
    const lines = content.split("\n");
    const total = lines.length;

    // Determine ranges to read
    let ranges;
    if (opts.ranges && opts.ranges.length > 0) {
        ranges = opts.ranges.map((r) => ({
            start: Math.max(1, r.start || 1),
            end: Math.min(total, r.end || total),
        }));
    } else {
        const startLine = Math.max(1, opts.offset || 1);
        const maxLines = (opts.limit && opts.limit > 0) ? opts.limit : DEFAULT_LIMIT;
        ranges = [{ start: startLine, end: Math.min(total, startLine - 1 + maxLines) }];
    }

    const parts = [];

    let cappedAtLine = 0;

    for (const range of ranges) {
        const selected = lines.slice(range.start - 1, range.end);
        const lineHashes = [];
        const formatted = [];
        let charCount = 0;

        for (let i = 0; i < selected.length; i++) {
            const line = selected[i];
            const num = range.start + i;
            const hash32 = fnv1a(line);
            const entry = opts.plain
                ? `${num}|${line}`
                : `${lineTag(hash32)}.${num}\t${line}`;

            if (charCount + entry.length > MAX_OUTPUT_CHARS && formatted.length > 0) {
                cappedAtLine = num;
                break;
            }
            lineHashes.push(hash32);
            formatted.push(entry);
            charCount += entry.length + 1;
        }

        // Update range end to actual lines shown
        const actualEnd = formatted.length > 0
            ? range.start + formatted.length - 1
            : range.start;
        range.end = actualEnd;

        parts.push(formatted.join("\n"));

        // Range checksum (only for lines actually shown)
        const cs = rangeChecksum(lineHashes, range.start, actualEnd);
        parts.push(`\nchecksum: ${cs}`);

        if (cappedAtLine) break;
    }

    // Header
    const sizeKB = (stat.size / 1024).toFixed(1);
    const mtime = stat.mtime;
    const ago = relativeTime(mtime);
    let header = `File: ${filePath} (${total} lines, ${sizeKB}KB, ${ago})`;
    if (ranges.length === 1) {
        const r = ranges[0];
        if (r.start > 1 || r.end < total) {
            header += ` [showing ${r.start}-${r.end}]`;
        }
        if (r.end < total) {
            header += ` (${total - r.end} more below)`;
        }
    }

    // Graph enrichment (optional — silent if no DB)
    const db = getGraphDB(real);
    const relFile = db ? getRelativePath(real) : null;
    let graphLine = "";
    if (db && relFile) {
        const annos = fileAnnotations(db, relFile);
        if (annos.length > 0) {
            const items = annos.map(a => {
                const counts = (a.callees || a.callers) ? ` ${a.callees}\u2193 ${a.callers}\u2191` : "";
                return `${a.name} [${a.kind}${counts}]`;
            });
            graphLine = `\nGraph: ${items.join(" | ")}`;
        }
    }

    let result = `${header}${graphLine}\n\n\`\`\`\n${parts.join("\n")}\n\`\`\``;

    // Auto-hint for large files read from start without offset
    if (total > 200 && (!opts.offset || opts.offset <= 1) && !cappedAtLine) {
        result += `\n\n\u26A1 Tip: This file has ${total} lines. Use outline first, then read_file with offset/limit for 75% fewer tokens.`;
    }

    // Character cap notice
    if (cappedAtLine) {
        result += `\n\nOUTPUT_CAPPED at line ${cappedAtLine} (${MAX_OUTPUT_CHARS} char limit). Use offset=${cappedAtLine} to continue reading.`;
    }

    return result;
}
