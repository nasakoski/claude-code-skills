import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { simpleDiff } from "./edit.mjs";

export function bulkReplace(rootDir, globPattern, replacements, opts = {}) {
    const { dryRun = false, maxFiles = 100 } = opts;
    const abs = resolve(rootDir);

    // Find files via ripgrep (respects .gitignore)
    let files;
    try {
        const rgOut = execSync(`rg --files -g "${globPattern}" "${abs}"`, { encoding: "utf-8", timeout: 10000 });
        files = rgOut.trim().split("\n").filter(Boolean);
    } catch (e) {
        if (e.status === 1) return "No files matched the glob pattern.";
        throw new Error(`GREP_ERROR: ${e.message}`);
    }

    if (files.length > maxFiles) {
        return `TOO_MANY_FILES: Found ${files.length} files, max_files is ${maxFiles}. Use more specific glob or increase max_files.`;
    }

    const results = [];
    let changed = 0, skipped = 0, errors = 0;

    for (const file of files) {
        try {
            const original = readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
            let content = original;

            for (const { old: oldText, new: newText } of replacements) {
                content = content.split(oldText).join(newText);
            }

            if (content === original) { skipped++; continue; }

            const diff = simpleDiff(original.split("\n"), content.split("\n"));

            if (!dryRun) {
                writeFileSync(file, content, "utf-8");
            }

            const relPath = file.replace(abs, "").replace(/^[/\\]/, "");
            results.push(`--- ${relPath}\n${diff || "(no visible diff)"}`);
            changed++;
        } catch (e) {
            results.push(`ERROR: ${file}: ${e.message}`);
            errors++;
        }
    }

    const header = `Bulk replace: ${changed} files changed, ${skipped} skipped, ${errors} errors (dry_run: ${dryRun})`;
    return results.length ? `${header}\n\n${results.join("\n\n")}` : header;
}
