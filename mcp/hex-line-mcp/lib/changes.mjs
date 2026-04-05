/**
 * Semantic diff formatting over the shared git-ref semantic diff substrate.
 */

import { statSync } from "node:fs";
import { validatePath, normalizePath } from "./security.mjs";
import { semanticGitDiff } from "@levnikolaevich/hex-common/git/semantic-diff";

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
        }
        sections.push("");
        sections.push("Use changes on a specific file for symbol-level diff.");
        return sections.join("\n");
    }

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

    return parts.join("\n");
}
