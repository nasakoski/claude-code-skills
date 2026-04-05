/**
 * Semantic diff formatting over the shared git-ref semantic diff substrate.
 */

import { statSync } from "node:fs";
import { join } from "node:path";
import { validatePath, normalizePath } from "./security.mjs";
import { semanticGitDiff } from "@levnikolaevich/hex-common/git/semantic-diff";
import { getGraphDB, getRelativePath, semanticImpact } from "./graph-enrich.mjs";

function exportedLooking(symbol) {
    return /^\s*(export|public)\b/.test(symbol.text || "");
}

function summarizeGraphRisk(db, relFile, file) {
    if (!db || !relFile || !file.semantic_supported) return [];
    const lines = [];
    const seen = new Set();
    for (const symbol of [...file.added_symbols, ...file.modified_symbols].slice(0, 6)) {
        const impacts = semanticImpact(db, relFile, symbol.start, symbol.end);
        for (const impact of impacts) {
            const riskParts = [];
            if (impact.counts.publicApi > 0) riskParts.push("public API");
            if (impact.counts.frameworkEntrypoints > 0) riskParts.push(`${impact.counts.frameworkEntrypoints} framework entrypoint`);
            if (impact.counts.externalCallers > 0) riskParts.push(`${impact.counts.externalCallers} external callers`);
            if (impact.counts.downstreamReturnFlow > 0) riskParts.push(`${impact.counts.downstreamReturnFlow} return-flow`);
            if (impact.counts.downstreamPropertyFlow > 0) riskParts.push(`${impact.counts.downstreamPropertyFlow} property-flow`);
            if (impact.counts.sinkReach > 0) riskParts.push(`${impact.counts.sinkReach} terminal flow`);
            if (impact.counts.cloneSiblings > 0) riskParts.push(`${impact.counts.cloneSiblings} clone siblings`);
            if (impact.counts.sameNameSymbols > 0) riskParts.push(`${impact.counts.sameNameSymbols} same-name siblings`);
            if (riskParts.length === 0) continue;
            const key = `${impact.symbol}|${riskParts.join(",")}`;
            if (seen.has(key)) continue;
            seen.add(key);
            lines.push(`- ${impact.symbol}: ${riskParts.join(", ")}`);
            if (lines.length >= 6) return lines;
        }
    }
    return lines;
}

/**
 * Compare file against git ref, returning semantic symbol diff.
 *
 * @param {string} filePath        File path (absolute or relative)
 * @param {string} compareAgainst  Git ref (default: "HEAD")
 * @returns {Promise<string>}      Formatted diff
 */
export async function fileChanges(filePath, compareAgainst = "HEAD") {
    filePath = normalizePath(filePath);
    const real = validatePath(filePath);

    // Directory: return git diff --stat (compact file list, no content reads)
    if (statSync(real).isDirectory()) {
        const db = getGraphDB(join(real, "__hex-line_probe__"));
        const diff = await semanticGitDiff(real, { baseRef: compareAgainst });
        if (diff.summary.changed_file_count === 0) {
            return `No changes in ${filePath} vs ${compareAgainst}`;
        }
        const sections = [`Changed files in ${filePath} vs ${compareAgainst}:`, ""];
        for (const file of diff.changed_files) {
            const counts = [];
            if (file.added_symbols.length) counts.push(`${file.added_symbols.length} added`);
            if (file.removed_symbols.length) counts.push(`${file.removed_symbols.length} removed`);
            if (file.modified_symbols.length) counts.push(`${file.modified_symbols.length} modified`);
            if (!file.semantic_supported) counts.push("unsupported semantic diff");
            sections.push(`- ${file.path}${file.old_path ? ` (from ${file.old_path})` : ""}: ${counts.join(", ") || "no symbol changes"}`);
            const riskLines = summarizeGraphRisk(db, file.path.replace(/\\/g, "/"), file);
            for (const line of riskLines.slice(0, 2)) sections.push(`  ${line}`);
            for (const symbol of file.removed_symbols.slice(0, 2)) {
                if (exportedLooking(symbol)) sections.push(`  - removed_api_warning: ${symbol.text}`);
            }
        }
        sections.push("");
        sections.push("Use changes on a specific file for symbol-level diff.");
        return sections.join("\n");
    }

    const db = getGraphDB(real);
    const diff = await semanticGitDiff(real, { baseRef: compareAgainst });
    const file = diff.changed_files[0];
    if (!file) {
        return `No changes in ${filePath} vs ${compareAgainst}`;
    }
    if (!file.semantic_supported) {
        return `Cannot outline ${file.extension} files. Supported: .js .mjs .cjs .jsx .ts .tsx .py .cs .php`;
    }

    // Format
    const parts = [`Changes in ${filePath} vs ${compareAgainst}:`];

    if (file.added_symbols.length) {
        parts.push("\nAdded:");
        for (const symbol of file.added_symbols) parts.push(`  + ${symbol.start}-${symbol.end}: ${symbol.text}`);
    }
    if (file.removed_symbols.length) {
        parts.push("\nRemoved:");
        for (const symbol of file.removed_symbols) parts.push(`  - ${symbol.start}-${symbol.end}: ${symbol.text}`);
    }
    if (file.modified_symbols.length) {
        parts.push("\nModified:");
        for (const symbol of file.modified_symbols) {
            const delta = symbol.lines - symbol.previous.lines;
            const sign = delta > 0 ? "+" : "";
            parts.push(`  ~ ${symbol.start}-${symbol.end}: ${symbol.text}  (${sign}${delta} lines)`);
        }
    }

    if (!file.added_symbols.length && !file.removed_symbols.length && !file.modified_symbols.length) {
        parts.push("\nNo symbol changes detected.");
    }

    const summary = `${file.added_symbols.length} added, ${file.removed_symbols.length} removed, ${file.modified_symbols.length} modified`;
    parts.push(`\nSummary: ${summary}`);
    const relFile = getRelativePath(real) || file.path?.replace(/\\/g, "/");
    const riskLines = summarizeGraphRisk(db, relFile, file);
    const removedApiWarnings = file.removed_symbols.filter(exportedLooking).slice(0, 4);
    if (riskLines.length || removedApiWarnings.length) {
        parts.push("\nSemantic review:");
        for (const line of riskLines) parts.push(`  ${line}`);
        for (const symbol of removedApiWarnings) parts.push(`  - removed_api_warning: ${symbol.text}`);
    }

    return parts.join("\n");
}
