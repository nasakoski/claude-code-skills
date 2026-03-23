import { writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { simpleDiff } from "./edit.mjs";
import { normalizePath } from "./security.mjs";
import { readText, MAX_OUTPUT_CHARS } from "./format.mjs";

let ignoreMod;
try { ignoreMod = await import("ignore"); } catch { /* unavailable */ }

/** Walk directory, respecting .gitignore via `ignore` package. */
function walkFiles(dir, rootDir, ig) {
    const results = [];
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return results; }
    for (const e of entries) {
        if (e.name === ".git" || e.name === "node_modules") continue;
        const full = join(dir, e.name);
        const rel = relative(rootDir, full).replace(/\\/g, "/");
        if (ig && ig.ignores(rel)) continue;
        if (e.isDirectory()) {
            results.push(...walkFiles(full, rootDir, ig));
        } else {
            results.push(full);
        }
    }
    return results;
}

/** Simple glob match (supports *, **, ?, {a,b}). */
function globMatch(filename, pattern) {
    const re = pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, "\0")
        .replace(/\*/g, "[^/]*")
        .replace(/\0/g, ".*")
        .replace(/\?/g, ".");
    return new RegExp("^" + re + "$").test(filename);
}

function loadGitignore(rootDir) {
    if (!ignoreMod) return null;
    const ig = (ignoreMod.default || ignoreMod)();
    try {
        const content = readText(join(rootDir, ".gitignore"));
        ig.add(content);
    } catch { /* no .gitignore */ }
    return ig;
}

export function bulkReplace(rootDir, globPattern, replacements, opts = {}) {
    const { dryRun = false, maxFiles = 100 } = opts;
    const abs = resolve(normalizePath(rootDir));

    const ig = loadGitignore(abs);
    const allFiles = walkFiles(abs, abs, ig);
    const files = allFiles.filter(f => {
        const rel = relative(abs, f).replace(/\\/g, "/");
        return globMatch(rel, globPattern);
    });

    if (files.length === 0) return "No files matched the glob pattern.";

    if (files.length > maxFiles) {
        return `TOO_MANY_FILES: Found ${files.length} files, max_files is ${maxFiles}. Use more specific glob or increase max_files.`;
    }

    const results = [];
    let changed = 0, skipped = 0, errors = 0;
    const MAX_OUTPUT = MAX_OUTPUT_CHARS;
    let totalChars = 0;

    for (const file of files) {
        try {
            const original = readText(file);
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
            totalChars += results[results.length - 1].length;
            if (totalChars > MAX_OUTPUT) {
                const remaining = files.length - files.indexOf(file) - 1;
                if (remaining > 0) results.push(`OUTPUT_CAPPED: ${remaining} more files not shown. Output exceeded ${MAX_OUTPUT} chars.`);
                break;
            }
        } catch (e) {
            results.push(`ERROR: ${file}: ${e.message}`);
            errors++;
        }
    }

    const header = `Bulk replace: ${changed} files changed, ${skipped} skipped, ${errors} errors (dry_run: ${dryRun})`;
    return results.length ? `${header}\n\n${results.join("\n\n")}` : header;
}
