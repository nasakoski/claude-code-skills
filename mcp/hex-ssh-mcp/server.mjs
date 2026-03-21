#!/usr/bin/env node
/**
 * hex-ssh-mcp -- Token-efficient SSH MCP server with hash-verified file ops.
 *
 * 6 tools: remote-ssh, ssh-read-lines, ssh-edit-block, ssh-search-code,
 *          ssh-write-chunk, ssh-verify
 *
 * FNV-1a hash annotations on reads, checksum verification on edits.
 * Security: ALLOWED_HOSTS, ALLOWED_DIRS env vars.
 * Output: deduplication, normalization, smart truncation.
 * Transport: stdio
 *
 * MCP SDK ^1.17.0. FNV-1a hash verification from hex-line-mcp.
 */

import { z } from "zod";

// LLM clients may send booleans as strings ("true"/"false").
// z.coerce.boolean() is unsafe: Boolean("false") === true.
const flexBool = () => z.preprocess(
    v => typeof v === "string" ? v === "true" : v,
    z.boolean().optional()
);
const flexNum = () => z.preprocess(
    v => typeof v === "string" ? Number(v) : v,
    z.number().optional()
);
import { diffLines } from "diff";
import { fnv1a, lineTag, rangeChecksum, parseChecksum } from "./lib/hash.mjs";
import { executeCommand, validateRemotePath } from "./lib/ssh-client.mjs";
import { deduplicateLines, smartTruncate, normalizeOutput } from "./lib/normalize.mjs";
import { coerceParams } from "./lib/coerce.mjs";
import { checkForUpdates } from "./lib/update-check.mjs";

// --- SDK ---

let McpServer, StdioServerTransport;
try {
    ({ McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js"));
    ({ StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js"));
} catch {
    process.stderr.write(
        "hex-ssh-mcp: @modelcontextprotocol/sdk not found.\n" +
        "Run: cd mcp/hex-ssh-mcp && npm install\n"
    );
    process.exit(1);
}

const server = new McpServer({ name: "hex-ssh-mcp", version: "1.0.0" });

// --- Common connection args for reuse ---

const connProps = {
    host: z.string().describe("Remote server hostname or IP"),
    user: z.string().describe("SSH username"),
    privateKeyPath: z.string().optional().describe("Path to SSH private key (optional, falls back to SSH_PRIVATE_KEY env or ~/.ssh/id_*)"),
    port: flexNum().describe("SSH port (default: 22)"),
};

/**
 * Build connection params from tool args with defaults.
 */
function connParams(args) {
    return {
        host: args.host,
        user: args.user,
        privateKeyPath: args.privateKeyPath || undefined,
        port: args.port || 22,
    };
}

/**
 * Run an SSH command and return { output, error, exitCode }.
 */
async function sshExec(args, command) {
    return executeCommand({ ...connParams(args), command });
}

/**
 * Standard error response.
 */
function errResult(msg) {
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}

/**
 * Structured error with code and recovery hint.
 */
function sshError(code, message, recovery) {
    return { content: [{ type: "text", text: `${code}: ${message}\nRecovery: ${recovery}` }], isError: true };
}

/**
 * Standard success response.
 */
function okResult(text) {
    return { content: [{ type: "text", text }] };
}


// ==================== remote-ssh ====================

server.registerTool("remote-ssh", {
    title: "SSH Command",
    description:
        "Execute SSH commands on remote servers. Returns stdout/stderr/exitCode. " +
        "Output is normalized and deduplicated for token efficiency.",
    inputSchema: {
        ...connProps,
        command: z.string().describe("Shell command to execute"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}, async (rawArgs) => {
    const args = coerceParams(rawArgs);
    try {
        if (!args.host || !args.user || !args.command) {
            return errResult("Required: host, user, command");
        }

        const result = await sshExec(args, args.command);
        const output = normalizeOutput(result.output || "", { deduplicate: true });

        const parts = [`$ ${args.command}`, output];
        if (result.error) parts.push(`stderr: ${result.error}`);
        if (result.exitCode) parts.push(`exit: ${result.exitCode}`);

        return okResult(parts.join("\n"));
    } catch (e) {
        return errResult(e.message);
    }
});


// ==================== ssh-read-lines ====================

server.registerTool("ssh-read-lines", {
    title: "SSH Read File",
    description:
        "Read remote file with FNV-1a hash-annotated lines (tag.lineNum\\tcontent) and range checksums. " +
        "Use offset/limit for large files. Hashes enable verified editing via ssh-edit-block. " +
        "ALWAYS prefer over 'remote-ssh cat' -- returns edit-ready hashes.",
    inputSchema: {
        ...connProps,
        filePath: z.string().describe("Path to file on remote server"),
        startLine: flexNum().describe("Start line (1-based, default: 1)"),
        endLine: flexNum().describe("End line (optional, reads to limit if not set)"),
        maxLines: flexNum().describe("Max lines to read (default: 200)"),
        plain: flexBool().describe("Omit hashes (lineNum|content)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawArgs) => {
    const args = coerceParams(rawArgs);
    try {
        if (!args.host || !args.user || !args.filePath) {
            return errResult("Required: host, user, filePath");
        }

        validateRemotePath(args.filePath);

        const startLine = args.startLine || 1;
        const maxLines = args.maxLines || 200;
        const plain = args.plain || false;

        // Get total lines + content in one command
        let readCmd;
        if (args.endLine) {
            readCmd = `wc -l < "${args.filePath}" && sed -n '${startLine},${args.endLine}p' "${args.filePath}"`;
        } else {
            readCmd = `wc -l < "${args.filePath}" && sed -n '${startLine},$p' "${args.filePath}" | head -${maxLines}`;
        }

        const check = `if [ ! -f "${args.filePath}" ]; then echo "FILE_NOT_FOUND" && exit 1; fi; ${readCmd}`;
        const result = await sshExec(args, check);

        if (result.exitCode !== 0 || result.output === "FILE_NOT_FOUND") {
            return sshError("FILE_NOT_FOUND", `${args.filePath} does not exist`, "Check path exists");
        }

        const outputLines = result.output.split("\n");
        const totalLines = parseInt(outputLines[0].trim(), 10) || 0;
        const contentLines = outputLines.slice(1);

        // Compute actual end line
        const actualEnd = args.endLine
            ? Math.min(args.endLine, totalLines)
            : Math.min(startLine + contentLines.length - 1, totalLines);

        // Hash-annotate lines with character cap
        const MAX_OUTPUT_CHARS = 80000;
        const lineHashes = [];
        const formatted = [];
        let charCount = 0;
        let cappedAtLine = 0;

        for (let i = 0; i < contentLines.length; i++) {
            const line = contentLines[i];
            const num = startLine + i;
            const hash32 = fnv1a(line);
            const entry = plain
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

        // Update actual end to lines shown
        const shownEnd = formatted.length > 0
            ? startLine + formatted.length - 1
            : startLine;

        // Range checksum (only for lines actually shown)
        const cs = rangeChecksum(lineHashes, startLine, shownEnd);

        // Header
        let header = `File: ${args.filePath} (${totalLines} lines)`;
        if (startLine > 1 || shownEnd < totalLines) {
            header += ` [showing ${startLine}-${shownEnd}]`;
        }
        if (shownEnd < totalLines) {
            header += ` (${totalLines - shownEnd} more below)`;
        }

        let text = `${header}\n\n\`\`\`\n${formatted.join("\n")}\n\nchecksum: ${cs}\n\`\`\``;

        if (cappedAtLine) {
            text += `\n\nOUTPUT_CAPPED at line ${cappedAtLine} (${MAX_OUTPUT_CHARS} char limit). Use startLine=${cappedAtLine} to continue.`;
        }

        return okResult(text);
    } catch (e) {
        return errResult(e.message);
    }
});


// ==================== ssh-edit-block ====================

server.registerTool("ssh-edit-block", {
    title: "SSH Edit File",
    description:
        "Edit text blocks in remote files with hash-verified anchors or text replacement. " +
        "Anchor-based: provide anchor/startAnchor/endAnchor from ssh-read-lines for precise edits. " +
        "Text-based: provide oldText/newText (hash-hint returned if multiple matches). " +
        "Use ssh-read-lines first to get hash anchors and checksums.",
    inputSchema: {
        ...connProps,
        filePath: z.string().describe("Path to file on remote server"),
        oldText: z.string().optional().describe("Text to find and replace (for text-based editing)"),
        newText: z.string().optional().describe("Replacement text"),
        checksum: z.string().optional().describe("Range checksum from ssh-read-lines (e.g. '1-50:f7e2a1b0'). If provided, verifies file unchanged before edit."),
        expectedReplacements: flexNum().describe("Expected number of replacements (default: 1)"),
        anchor: z.string().optional().describe("Hash anchor 'ab.42' to set single line (from ssh-read-lines)"),
        startAnchor: z.string().optional().describe("Start hash anchor 'ab.42' for range replace"),
        endAnchor: z.string().optional().describe("End hash anchor 'cd.45' for range replace"),
        insertAfter: z.string().optional().describe("Hash anchor 'ab.42' to insert after"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}, async (rawArgs) => {
    const args = coerceParams(rawArgs);
    try {
        if (!args.host || !args.user || !args.filePath) {
            return errResult("Required: host, user, filePath");
        }
        const hasAnchor = args.anchor || args.startAnchor || args.insertAfter;
        if (!hasAnchor && (args.oldText === undefined || args.newText === undefined)) {
            return errResult("Required: oldText + newText (text-based) or anchor/startAnchor/insertAfter (anchor-based)");
        }

        validateRemotePath(args.filePath);

        // If checksum provided, verify file hasn't changed
        if (args.checksum) {
            const parsed = parseChecksum(args.checksum);
            const readCmd = `sed -n '${parsed.start},${parsed.end}p' "${args.filePath}"`;
            const readResult = await sshExec(args, readCmd);

            if (readResult.exitCode !== 0) {
                return sshError("FILE_NOT_FOUND", `Cannot read ${args.filePath} for verification`, "Check path exists");
            }

            const currentLines = readResult.output.split("\n");
            const currentHashes = currentLines.map((l) => fnv1a(l));
            const currentCs = rangeChecksum(currentHashes, parsed.start, parsed.end);
            const currentHex = currentCs.split(":")[1];

            if (currentHex !== parsed.hex) {
                return sshError(
                    "STALE_CHECKSUM",
                    `expected ${args.checksum}, current ${currentCs}. File changed since last read.`,
                    "Re-read with ssh-read-lines"
                );
            }
        }

        // Anchor-based editing (preferred path)
        if (args.anchor || args.startAnchor || args.insertAfter) {
            // Parse anchor ref: "ab.42" -> { tag: "ab", line: 42 }
            function parseRef(ref) {
                const m = ref.trim().match(/^([a-z2-7]{2})\.(\d+)$/);
                if (!m) return errResult(`Bad anchor: "${ref}". Expected "ab.42"`);
                return { tag: m[1], line: parseInt(m[2], 10) };
            }

            // Read current content with line context
            const readResult = await sshExec(args, `cat "${args.filePath}"`);
            if (readResult.exitCode !== 0) {
                return sshError("FILE_NOT_FOUND", `Cannot read ${args.filePath}`, "Check path exists");
            }
            const allLines = readResult.output.replace(/\r\n/g, "\n").split("\n");

            // Verify anchor hash matches
            function verifyAnchor(ref) {
                const { tag, line, content: errContent } = parseRef(ref);
                if (errContent) return parseRef(ref); // error result
                const idx = line - 1;
                if (idx < 0 || idx >= allLines.length) {
                    const start = idx >= allLines.length
                        ? Math.max(0, allLines.length - 10) : 0;
                    const end = idx >= allLines.length
                        ? allLines.length : Math.min(allLines.length, 10);
                    const snippet = allLines.slice(start, end).map((l, i) => {
                        const n = start + i + 1;
                        return `${lineTag(fnv1a(l))}.${n}\t${l}`;
                    }).join("\n");
                    return errResult(
                        `Line ${line} out of range (1-${allLines.length}).\n\n` +
                        `Current content (lines ${start + 1}-${end}):\n${snippet}\n\n` +
                        `Tip: Re-read with ssh-read-lines for updated hashes.`
                    );
                }
                const actual = lineTag(fnv1a(allLines[idx]));
                if (actual !== tag) {
                    // Fuzzy +/-5
                    for (let d = 1; d <= 5; d++) {
                        for (const off of [d, -d]) {
                            const c = idx + off;
                            if (c >= 0 && c < allLines.length && lineTag(fnv1a(allLines[c])) === tag) {
                                return { idx: c };
                            }
                        }
                    }
                    // Build snippet for retry
                    const start = Math.max(0, idx - 3);
                    const end = Math.min(allLines.length, idx + 4);
                    const snippet = allLines.slice(start, end).map((l, i) => {
                        const n = start + i + 1;
                        return `${lineTag(fnv1a(l))}.${n}\t${l}`;
                    }).join("\n");
                    return errResult(
                        `Hash mismatch line ${line}: expected ${tag}, got ${actual}.\n\n` +
                        `Current (lines ${start + 1}-${end}):\n${snippet}\n\n` +
                        `Tip: Re-read with ssh-read-lines for updated hashes.`
                    );
                }
                return { idx };
            }

            let updated;
            if (args.anchor) {
                const v = verifyAnchor(args.anchor);
                if (v.content) return v; // error
                const newLines = (args.newText || "").split("\n");
                updated = [...allLines];
                updated.splice(v.idx, 1, ...newLines);
            } else if (args.startAnchor && args.endAnchor) {
                const vs = verifyAnchor(args.startAnchor);
                if (vs.content) return vs;
                const ve = verifyAnchor(args.endAnchor);
                if (ve.content) return ve;
                const newLines = (args.newText || "").split("\n");
                updated = [...allLines];
                updated.splice(vs.idx, ve.idx - vs.idx + 1, ...newLines);
            } else if (args.insertAfter) {
                const v = verifyAnchor(args.insertAfter);
                if (v.content) return v;
                const insertLines = (args.newText || "").split("\n");
                updated = [...allLines];
                updated.splice(v.idx + 1, 0, ...insertLines);
            }

            const updatedContent = updated.join("\n");
            const marker = "HEX_SSH_EOF_" + Date.now();
            const writeCmd = `cat > "${args.filePath}" << '${marker}'\n${updatedContent}\n${marker}`;
            const writeResult = await sshExec(args, writeCmd);
            if (writeResult.exitCode !== 0) {
                return sshError("WRITE_FAILED", `Write to ${args.filePath} failed: ${writeResult.error || "unknown"}`, "Check permissions and disk space");
            }

            // Diff
            const original = allLines.join("\n") + "\n";
            const parts = diffLines(original, updatedContent + "\n");
            const diffParts = [];
            let oldNum = 1, newNum = 1;
            for (const part of parts) {
                const pLines = part.value.replace(/\n$/, "").split("\n");
                if (part.added || part.removed) {
                    for (const line of pLines) {
                        if (part.removed) { diffParts.push(`-${oldNum}| ${line}`); oldNum++; }
                        else { diffParts.push(`+${newNum}| ${line}`); newNum++; }
                    }
                } else {
                    oldNum += pLines.length; newNum += pLines.length;
                }
            }

            let msg = `Updated ${args.filePath} (anchor-based edit)`;
            if (diffParts.length > 0) {
                msg += `\n\n\`\`\`diff\n${diffParts.slice(0, 40).join("\n")}\n\`\`\``;
            }
            return okResult(msg);
        }

        // Text-based editing path
        const readResult = await sshExec(args, `cat "${args.filePath}"`);
        if (readResult.exitCode !== 0) {
            return sshError("FILE_NOT_FOUND", `Cannot read ${args.filePath}: ${readResult.error || "unknown error"}`, "Check path exists");
        }

        const original = readResult.output;
        const oldNorm = args.oldText.replace(/\r\n/g, "\n");
        const newNorm = args.newText.replace(/\r\n/g, "\n");
        const contentNorm = original.replace(/\r\n/g, "\n");

        // Find occurrences
        let count = 0;
        let pos = 0;
        while ((pos = contentNorm.indexOf(oldNorm, pos)) !== -1) {
            count++;
            pos += oldNorm.length;
        }

        if (count === 0) {
            // Find nearest content via longest common substring
            const sampleLen = Math.min(oldNorm.length, 100);
            const sample = oldNorm.slice(0, sampleLen);
            let bestPos = 0, bestLen = 0;
            for (let i = 0; i < contentNorm.length && bestLen < sample.length; i++) {
                let len = 0;
                for (let j = 0; j < sample.length && i + len < contentNorm.length; j++) {
                    if (contentNorm[i + len] === sample[j]) len++;
                    else { if (len > bestLen) { bestLen = len; bestPos = i; } len = 0; }
                }
                if (len > bestLen) { bestLen = len; bestPos = i; }
            }

            // Build hash-annotated snippet around nearest match
            const allLines = contentNorm.split("\n");
            let cumLen = 0, targetLine = 0;
            const anchor = bestLen > 3 ? bestPos : Math.floor(contentNorm.length / 2);
            for (let i = 0; i < allLines.length; i++) {
                cumLen += allLines[i].length + 1;
                if (cumLen > anchor) { targetLine = i; break; }
            }
            const start = Math.max(0, targetLine - 3);
            const end = Math.min(allLines.length, targetLine + 4);
            const snippet = allLines.slice(start, end).map((line, j) => {
                const num = start + j + 1;
                const tag = lineTag(fnv1a(line));
                return `${tag}.${num}\t${line}`;
            }).join("\n");

            return sshError(
                "TEXT_NOT_FOUND",
                `"${oldNorm.slice(0, 100)}${oldNorm.length > 100 ? "..." : ""}" not found in ${args.filePath}.\n\n` +
                `Nearest content (lines ${start + 1}-${end}):\n${snippet}`,
                "Use ssh-read-lines for full hashes, then ssh-edit-block with anchors"
            );
        }

        const expected = args.expectedReplacements || 1;
        if (count !== expected && expected > 0) {
            // Build hash-hint showing all match locations
            const allLines = contentNorm.split("\n");
            const positions = [];
            let searchPos = 0;
            while ((searchPos = contentNorm.indexOf(oldNorm, searchPos)) !== -1) {
                positions.push(searchPos);
                searchPos += oldNorm.length;
            }

            const matchLineCount = oldNorm.split("\n").length;
            const snippets = positions.map((charPos, i) => {
                let cumLen = 0, matchLine = 0;
                for (let l = 0; l < allLines.length; l++) {
                    cumLen += allLines[l].length + 1;
                    if (cumLen > charPos) { matchLine = l; break; }
                }
                const start = Math.max(0, matchLine - 1);
                const end = Math.min(allLines.length, matchLine + matchLineCount + 1);
                const lines = allLines.slice(start, end).map((line, j) => {
                    const num = start + j + 1;
                    const tag = lineTag(fnv1a(line));
                    return `${tag}.${num}\t${line}`;
                });
                return `Match ${i + 1} (lines ${start + 1}-${end}):\n${lines.join("\n")}`;
            });

            return errResult(
                `HASH_HINT: Found ${count} match(es), expected ${expected}. Use anchor-based edit.\n\n` +
                snippets.join("\n\n") +
                `\n\nUse ssh-read-lines to get full hashes, then ssh-edit-block with exact context.`
            );
        }

        // Apply replacement
        let updated;
        if (expected === 1 && count === 1) {
            const idx = contentNorm.indexOf(oldNorm);
            updated = contentNorm.slice(0, idx) + newNorm + contentNorm.slice(idx + oldNorm.length);
        } else {
            updated = contentNorm.split(oldNorm).join(newNorm);
        }

        // Write via heredoc to preserve special chars
        const marker = "HEX_SSH_EOF_" + Date.now();
        const writeCmd = `cat > "${args.filePath}" << '${marker}'\n${updated}\n${marker}`;
        const writeResult = await sshExec(args, writeCmd);

        if (writeResult.exitCode !== 0) {
            return sshError("WRITE_FAILED", `Write to ${args.filePath} failed: ${writeResult.error || "unknown error"}`, "Check permissions and disk space");
        }

        // Build compact diff with context (Myers via `diff` package)
        const parts = diffLines(contentNorm + "\n", updated + "\n");
        const diffParts = [];
        let oldNum = 1, newNum = 1;
        let lastChange = false;
        const ctx = 3;
        for (let di = 0; di < parts.length; di++) {
            const part = parts[di];
            const pLines = part.value.replace(/\n$/, "").split("\n");
            if (part.added || part.removed) {
                for (const line of pLines) {
                    if (part.removed) { diffParts.push(`-${oldNum}| ${line}`); oldNum++; }
                    else { diffParts.push(`+${newNum}| ${line}`); newNum++; }
                }
                lastChange = true;
            } else {
                const next = di < parts.length - 1 && (parts[di + 1].added || parts[di + 1].removed);
                if (lastChange || next) {
                    let start = 0, end = pLines.length;
                    if (!lastChange) start = Math.max(0, end - ctx);
                    if (!next && end - start > ctx) end = start + ctx;
                    if (start > 0) { diffParts.push('...'); oldNum += start; newNum += start; }
                    for (let k = start; k < end; k++) {
                        diffParts.push(` ${oldNum}| ${pLines[k]}`); oldNum++; newNum++;
                    }
                    if (end < pLines.length) { diffParts.push('...'); oldNum += pLines.length - end; newNum += pLines.length - end; }
                } else { oldNum += pLines.length; newNum += pLines.length; }
                lastChange = false;
            }
        }

        let msg = `Updated ${args.filePath} (${count} replacement${count > 1 ? "s" : ""})`;
        if (diffParts.length > 0) {
            const diffText = smartTruncate(diffParts.join("\n"), 30, 10);
            msg += `\n\n\`\`\`diff\n${diffText}\n\`\`\``;
        }

        return okResult(msg);
    } catch (e) {
        return errResult(e.message);
    }
});


// ==================== ssh-search-code ====================

server.registerTool("ssh-search-code", {
    title: "SSH Search",
    description:
        "Search for patterns in remote files with grep. " +
        "Output is deduplicated (identical normalized lines collapsed with xN count). " +
        "Use filePattern to filter by extension.",
    inputSchema: {
        ...connProps,
        path: z.string().describe("Directory to search on remote server"),
        pattern: z.string().describe("Text/regex pattern to search"),
        filePattern: z.string().optional().describe('Glob filter (e.g. "*.js", "*.py")'),
        ignoreCase: flexBool().describe("Case-insensitive search (default: false)"),
        maxResults: flexNum().describe("Max result lines (default: 50)"),
        contextLines: flexNum().describe("Context lines around matches (default: 0)"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawArgs) => {
    const args = coerceParams(rawArgs);
    try {
        if (!args.host || !args.user || !args.path || !args.pattern) {
            return errResult("Required: host, user, path, pattern");
        }

        validateRemotePath(args.path);

        const maxResults = args.maxResults || 50;
        const contextLines = args.contextLines || 0;

        let grepOpts = "-rn";
        if (args.ignoreCase) grepOpts += "i";
        if (contextLines > 0) grepOpts += ` -C${contextLines}`;

        let includeOpt = "";
        if (args.filePattern) {
            includeOpt = ` --include="${args.filePattern}"`;
        }

        const cmd = [
            `if [ ! -d "${args.path}" ]; then echo "DIR_NOT_FOUND" && exit 1; fi`,
            `grep ${grepOpts}${includeOpt} "${args.pattern}" "${args.path}" 2>/dev/null | head -${maxResults * 2}`,
        ].join("; ");

        const result = await sshExec(args, cmd);

        if (result.output === "DIR_NOT_FOUND") {
            return sshError("DIR_NOT_FOUND", `${args.path} does not exist`, "Check directory path");
        }

        if (!result.output || result.output.trim() === "") {
            return okResult(`No matches for "${args.pattern}" in ${args.path}`);
        }

        // Hash-annotate and deduplicate results
        const rawLines = result.output.split("\n");
        const matchRe = /^(.+?):(\d+):(.*)$/;
        const annotated = [];
        for (const rl of rawLines) {
            const m = matchRe.exec(rl);
            if (m) {
                const tag = lineTag(fnv1a(m[3]));
                annotated.push(`${m[1]}:>>${tag}.${m[2]}\t${m[3]}`);
            } else {
                annotated.push(rl);
            }
        }
        const deduped = deduplicateLines(annotated);

        // Truncate to maxResults
        const limited = deduped.slice(0, maxResults);
        const skipped = deduped.length - limited.length;

        let text = limited.join("\n");
        if (skipped > 0) {
            text += `\n\n(${skipped} more results omitted)`;
        }

        return okResult(text);
    } catch (e) {
        return errResult(e.message);
    }
});


// ==================== ssh-write-chunk ====================

server.registerTool("ssh-write-chunk", {
    title: "SSH Write File",
    description:
        "Write content to remote files (rewrite or append mode). " +
        "Creates parent directories. For existing files, prefer ssh-edit-block (shows diff, verifies hashes).",
    inputSchema: {
        ...connProps,
        filePath: z.string().describe("Path to file on remote server"),
        content: z.string().describe("Content to write"),
        mode: z.enum(["rewrite", "append"]).optional().describe("Write mode (default: rewrite)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
}, async (rawArgs) => {
    const args = coerceParams(rawArgs);
    try {
        if (!args.host || !args.user || !args.filePath || args.content === undefined) {
            return errResult("Required: host, user, filePath, content");
        }

        validateRemotePath(args.filePath);

        const mode = args.mode || "rewrite";
        const marker = "HEX_SSH_EOF_" + Date.now();
        const redirect = mode === "append" ? ">>" : ">";

        const cmd = [
            `mkdir -p "$(dirname "${args.filePath}")"`,
            `cat ${redirect} "${args.filePath}" << '${marker}'`,
            args.content,
            marker,
            `echo "bytes=$(wc -c < "${args.filePath}") lines=$(wc -l < "${args.filePath}")"`,
        ].join("\n");

        const result = await sshExec(args, cmd);

        if (result.exitCode !== 0) {
            return sshError("WRITE_FAILED", `Write to ${args.filePath} failed: ${result.error || "unknown error"}`, "Check permissions and disk space");
        }

        const lineCount = args.content.split("\n").length;
        return okResult(`Written ${args.filePath} (${mode}, ~${lineCount} lines)\n${result.output}`);
    } catch (e) {
        return errResult(e.message);
    }
});


// ==================== ssh-verify ====================

server.registerTool("ssh-verify", {
    title: "SSH Verify Checksums",
    description:
        "Verify range checksums from prior ssh-read-lines calls without re-reading full content. " +
        "Single-line 'all valid' response when nothing changed. Avoids full re-read for staleness check.",
    inputSchema: {
        ...connProps,
        filePath: z.string().describe("Path to file on remote server"),
        checksums: z.string().describe('JSON array of checksum strings, e.g. ["1-50:f7e2a1b0", "51-100:abcd1234"]'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
}, async (rawArgs) => {
    const args = coerceParams(rawArgs);
    try {
        if (!args.host || !args.user || !args.filePath || !args.checksums) {
            return errResult("Required: host, user, filePath, checksums");
        }

        validateRemotePath(args.filePath);

        const checksums = JSON.parse(args.checksums);
        if (!Array.isArray(checksums) || checksums.length === 0) {
            return errResult("checksums must be a non-empty JSON array of strings");
        }

        // Parse all checksums to find the full range needed
        const parsed = checksums.map((cs) => parseChecksum(cs));
        const minLine = Math.min(...parsed.map((p) => p.start));
        const maxLine = Math.max(...parsed.map((p) => p.end));

        // Read just the needed range
        const readCmd = [
            `if [ ! -f "${args.filePath}" ]; then echo "FILE_NOT_FOUND" && exit 1; fi`,
            `total=$(wc -l < "${args.filePath}")`,
            `echo "$total"`,
            `sed -n '${minLine},${maxLine}p' "${args.filePath}"`,
        ].join("; ");

        const result = await sshExec(args, readCmd);

        if (result.exitCode !== 0 || result.output === "FILE_NOT_FOUND") {
            return sshError("FILE_NOT_FOUND", `${args.filePath} does not exist`, "Check path exists");
        }

        const outputLines = result.output.split("\n");
        const totalLines = parseInt(outputLines[0].trim(), 10);
        const contentLines = outputLines.slice(1);

        // Pre-compute hashes for the fetched range
        const lineHashes = contentLines.map((l) => fnv1a(l));

        const results = [];
        let allValid = true;

        for (let i = 0; i < parsed.length; i++) {
            const p = parsed[i];
            const cs = checksums[i];

            if (p.start < 1 || p.end > totalLines) {
                results.push(`${cs}: INVALID (range exceeds ${totalLines} lines)`);
                allValid = false;
                continue;
            }

            // Slice from fetched range (adjust offset: minLine-based)
            const offset = p.start - minLine;
            const count = p.end - p.start + 1;
            const currentHashes = lineHashes.slice(offset, offset + count);
            const current = rangeChecksum(currentHashes, p.start, p.end);
            const currentHex = current.split(":")[1];

            if (currentHex === p.hex) {
                results.push(`${cs}: valid`);
            } else {
                results.push(`${cs}: STALE -> current: ${current}`);
                allValid = false;
            }
        }

        if (allValid) {
            return okResult(`All ${checksums.length} checksum(s) valid for ${args.filePath}`);
        }

        return okResult(results.join("\n"));
    } catch (e) {
        return errResult(e.message);
    }
});


// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
void checkForUpdates("@levnikolaevich/hex-ssh-mcp", "1.0.0");
