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
}, async (args) => {
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
}, async (args) => {
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
            return errResult(`File not found: ${args.filePath}`);
        }

        const outputLines = result.output.split("\n");
        const totalLines = parseInt(outputLines[0].trim(), 10) || 0;
        const contentLines = outputLines.slice(1);

        // Compute actual end line
        const actualEnd = args.endLine
            ? Math.min(args.endLine, totalLines)
            : Math.min(startLine + contentLines.length - 1, totalLines);

        // Hash-annotate lines
        const lineHashes = [];
        const formatted = contentLines.map((line, i) => {
            const num = startLine + i;
            const hash32 = fnv1a(line);
            lineHashes.push(hash32);
            if (plain) return `${num}|${line}`;
            return `${lineTag(hash32)}.${num}\t${line}`;
        });

        // Range checksum
        const cs = rangeChecksum(lineHashes, startLine, actualEnd);

        // Header
        let header = `File: ${args.filePath} (${totalLines} lines)`;
        if (startLine > 1 || actualEnd < totalLines) {
            header += ` [showing ${startLine}-${actualEnd}]`;
        }
        if (actualEnd < totalLines) {
            header += ` (${totalLines - actualEnd} more below)`;
        }

        const text = `${header}\n\n\`\`\`\n${formatted.join("\n")}\n\nchecksum: ${cs}\n\`\`\``;
        return okResult(text);
    } catch (e) {
        return errResult(e.message);
    }
});


// ==================== ssh-edit-block ====================

server.registerTool("ssh-edit-block", {
    title: "SSH Edit File",
    description:
        "Edit text blocks in remote files with optional hash verification. " +
        "If checksum is provided, verifies file hasn't changed before applying edit. " +
        "Use ssh-read-lines first to get checksums. Returns diff of changes.",
    inputSchema: {
        ...connProps,
        filePath: z.string().describe("Path to file on remote server"),
        oldText: z.string().describe("Text to find and replace"),
        newText: z.string().describe("Replacement text"),
        checksum: z.string().optional().describe("Range checksum from ssh-read-lines (e.g. '1-50:f7e2a1b0'). If provided, verifies file unchanged before edit."),
        expectedReplacements: flexNum().describe("Expected number of replacements (default: 1)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}, async (args) => {
    try {
        if (!args.host || !args.user || !args.filePath || args.oldText === undefined || args.newText === undefined) {
            return errResult("Required: host, user, filePath, oldText, newText");
        }

        validateRemotePath(args.filePath);

        // If checksum provided, verify file hasn't changed
        if (args.checksum) {
            const parsed = parseChecksum(args.checksum);
            const readCmd = `sed -n '${parsed.start},${parsed.end}p' "${args.filePath}"`;
            const readResult = await sshExec(args, readCmd);

            if (readResult.exitCode !== 0) {
                return errResult(`Cannot read ${args.filePath} for verification`);
            }

            const currentLines = readResult.output.split("\n");
            const currentHashes = currentLines.map((l) => fnv1a(l));
            const currentCs = rangeChecksum(currentHashes, parsed.start, parsed.end);
            const currentHex = currentCs.split(":")[1];

            if (currentHex !== parsed.hex) {
                return errResult(
                    `Stale checksum: expected ${args.checksum}, current ${currentCs}. ` +
                    `File changed since last read. Re-read with ssh-read-lines.`
                );
            }
        }

        // Read current content, apply replacement, write back
        const readResult = await sshExec(args, `cat "${args.filePath}"`);
        if (readResult.exitCode !== 0) {
            return errResult(`Cannot read ${args.filePath}: ${readResult.error || "unknown error"}`);
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
            return errResult(
                `Pattern not found in ${args.filePath}. ` +
                `Searched for: "${oldNorm.slice(0, 120)}${oldNorm.length > 120 ? "..." : ""}"`
            );
        }

        const expected = args.expectedReplacements || 1;
        if (count !== expected && expected > 0) {
            return errResult(
                `Found ${count} occurrences, expected ${expected}. ` +
                `Provide more context for unique match or set expectedReplacements=${count}.`
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
            return errResult(`Write failed: ${writeResult.error || "unknown error"}`);
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
}, async (args) => {
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
            return errResult(`Directory not found: ${args.path}`);
        }

        if (!result.output || result.output.trim() === "") {
            return okResult(`No matches for "${args.pattern}" in ${args.path}`);
        }

        // Deduplicate results
        const rawLines = result.output.split("\n");
        const deduped = deduplicateLines(rawLines);

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
}, async (args) => {
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
            return errResult(`Write failed: ${result.error || "unknown error"}`);
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
}, async (args) => {
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
            return errResult(`File not found: ${args.filePath}`);
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
