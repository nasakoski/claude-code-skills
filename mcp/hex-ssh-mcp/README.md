# hex-ssh-mcp

Token-efficient SSH MCP server with hash-verified remote file editing.

Every remote file read returns FNV-1a hash-annotated lines and range checksums. Edits verify those checksums before applying changes -- preventing stale-context corruption across SSH boundaries. Command output is normalized and deduplicated for minimal token usage.

## Features

### 6 MCP Tools

| Tool | Description | Key Feature |
|------|-------------|-------------|
| `remote-ssh` | Execute shell commands on remote servers | Output normalization + deduplication |
| `ssh-read-lines` | Read remote file with hash-annotated lines | Partial reads via `startLine`/`endLine`/`maxLines` |
| `ssh-edit-block` | Hash-verified text replacement in remote files | Checksum verification + compact diff output |
| `ssh-search-code` | Search remote files with grep | Deduplicated results with `(xN)` counts |
| `ssh-write-chunk` | Write or append to remote files | Auto-creates parent directories |
| `ssh-verify` | Check if held checksums are still valid | Single-line response avoids full re-read |

### Output Normalization

Built into `remote-ssh` and `ssh-search-code`. Pipeline:

1. **Normalize** -- replaces UUIDs, timestamps, IPs, hex IDs, large numbers with placeholders
2. **Deduplicate** -- collapses identical normalized lines with `(xN)` counts
3. **Truncate** -- keeps first 40 + last 20 lines, omits the middle

## Install

```bash
claude mcp add -s user hex-ssh -e ALLOWED_HOSTS=server1,server2 -- node path/to/mcp/hex-ssh-mcp/server.mjs
```

Then install dependencies:

```bash
cd mcp/hex-ssh-mcp && npm install
```

Requires Node.js >= 18.0.0.

## Security

### ALLOWED_HOSTS (recommended)

Comma-separated list of permitted hostnames/IPs. When set, connections to unlisted hosts are rejected.

```
ALLOWED_HOSTS=prod-web,prod-db,10.0.0.5
```

When unset, all hosts are permitted.

### ALLOWED_DIRS (optional)

Comma-separated list of permitted remote directory prefixes. When set, file operations outside these paths are rejected.

```
ALLOWED_DIRS=/home/deploy,/var/www,/etc/nginx
```

When unset, all remote paths are permitted.

### SSH Key Authentication

Key-only authentication (no passwords). Resolution order:

1. `privateKeyPath` tool parameter (explicit per-call)
2. `SSH_PRIVATE_KEY` env var (path or raw key content starting with `-----`)
3. Default paths: `~/.ssh/id_rsa`, `~/.ssh/id_ed25519`, `~/.ssh/id_ecdsa`

Supported key types: RSA, ED25519, ECDSA.

## Tools Reference

### remote-ssh

Execute shell commands on remote servers. Output is normalized and deduplicated.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host` | string | yes | Remote hostname or IP |
| `user` | string | yes | SSH username |
| `command` | string | yes | Shell command to execute |
| `privateKeyPath` | string | no | Path to SSH private key |
| `port` | number | no | SSH port (default: 22) |

### ssh-read-lines

Read remote file with FNV-1a hash-annotated lines and range checksums. Always prefer over `remote-ssh cat` -- returns edit-ready hashes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host` | string | yes | Remote hostname or IP |
| `user` | string | yes | SSH username |
| `filePath` | string | yes | Path to file on remote server |
| `startLine` | number | no | Start line, 1-based (default: 1) |
| `endLine` | number | no | End line (reads to limit if not set) |
| `maxLines` | number | no | Max lines to read (default: 200) |
| `plain` | boolean | no | Omit hashes, output `lineNum\|content` instead |
| `privateKeyPath` | string | no | Path to SSH private key |
| `port` | number | no | SSH port (default: 22) |

Output format:

```
File: /etc/nginx/nginx.conf (85 lines) [showing 1-50] (35 more below)

ab.1    worker_processes auto;
cd.2    error_log /var/log/nginx/error.log;
...
checksum: 1-50:f7e2a1b0
```

### ssh-edit-block

Edit text blocks in remote files with optional hash verification. Use `ssh-read-lines` first to get checksums.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host` | string | yes | Remote hostname or IP |
| `user` | string | yes | SSH username |
| `filePath` | string | yes | Path to file on remote server |
| `oldText` | string | yes | Text to find and replace |
| `newText` | string | yes | Replacement text |
| `checksum` | string | no | Range checksum from `ssh-read-lines` (e.g. `1-50:f7e2a1b0`) |
| `expectedReplacements` | number | no | Expected occurrence count (default: 1) |
| `privateKeyPath` | string | no | Path to SSH private key |
| `port` | number | no | SSH port (default: 22) |

Returns a compact diff of applied changes. If checksum is stale, returns an error with the current checksum.

### ssh-search-code

Search remote files with grep. Results are deduplicated (identical normalized lines collapsed with `(xN)` counts).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host` | string | yes | Remote hostname or IP |
| `user` | string | yes | SSH username |
| `path` | string | yes | Directory to search on remote server |
| `pattern` | string | yes | Text or regex pattern |
| `filePattern` | string | no | Glob filter (e.g. `"*.js"`, `"*.py"`) |
| `ignoreCase` | boolean | no | Case-insensitive search (default: false) |
| `maxResults` | number | no | Max result lines (default: 50) |
| `contextLines` | number | no | Context lines around matches (default: 0) |
| `privateKeyPath` | string | no | Path to SSH private key |
| `port` | number | no | SSH port (default: 22) |

### ssh-write-chunk

Write content to remote files (rewrite or append). Creates parent directories. For existing files, prefer `ssh-edit-block` (shows diff, verifies hashes).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host` | string | yes | Remote hostname or IP |
| `user` | string | yes | SSH username |
| `filePath` | string | yes | Path to file on remote server |
| `content` | string | yes | Content to write |
| `mode` | string | no | `"rewrite"` or `"append"` (default: `"rewrite"`) |
| `privateKeyPath` | string | no | Path to SSH private key |
| `port` | number | no | SSH port (default: 22) |

### ssh-verify

Verify range checksums from prior `ssh-read-lines` calls without re-reading full content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host` | string | yes | Remote hostname or IP |
| `user` | string | yes | SSH username |
| `filePath` | string | yes | Path to file on remote server |
| `checksums` | string | yes | JSON array of checksum strings, e.g. `["1-50:f7e2a1b0"]` |
| `privateKeyPath` | string | no | Path to SSH private key |
| `port` | number | no | SSH port (default: 22) |

Returns a single-line confirmation when all valid, or lists changed ranges with current checksums.

## Output Normalization

The `normalize.mjs` module reduces token waste in command output. Applied automatically by `remote-ssh` and used internally by `ssh-search-code`.

### Normalization Rules

| Pattern | Replacement | Example |
|---------|-------------|---------|
| UUIDs | `<UUID>` | `550e8400-e29b-41d4-...` -> `<UUID>` |
| Timestamps | `<TS>` | `2026-03-19 14:30:00` -> `<TS>` |
| IP addresses | `<IP>` | `192.168.1.100:8080` -> `<IP>` |
| Hex IDs in paths | `/<ID>` | `/a1b2c3d4e5` -> `/<ID>` |
| Large numbers | `<N>` | `1234567` -> `<N>` |
| Trace IDs | `trace_id=<TRACE>` | `trace_id=f7e2a1b0` -> `trace_id=<TRACE>` |

### Deduplication

Identical lines (after normalization) are collapsed into a single line with `(xN)` count, sorted by frequency descending.

### Smart Truncation

Output exceeding 60 lines (40 head + 20 tail) is truncated with a gap indicator showing the number of omitted lines.

## Architecture

```
hex-ssh-mcp/
  server.mjs          MCP server (stdio transport, 6 tools)
  package.json
  lib/
    ssh-client.mjs    SSH connection, host/path validation, key resolution
    hash.mjs          FNV-1a hashing, 2-char tags, range checksums
    normalize.mjs     Output normalization, deduplication, truncation
```

### Relationship to hex-line-mcp

Both servers share the same FNV-1a hash format and line annotation convention (`tag.lineNum\tcontent`). Checksums from `ssh-read-lines` are structurally identical to those from hex-line's `read_file`.

Key differences:

| Aspect | hex-ssh-mcp | hex-line-mcp |
|--------|---------------|---------------|
| Target | Remote servers via SSH | Local filesystem |
| Security model | `ALLOWED_HOSTS` + `ALLOWED_DIRS` (explicit allowlists for remote trust boundary) | Claude Code sandbox (local trust) |
| Output normalization | Built into `remote-ssh` tool | Separate PostToolUse hook |
| Outline tool | Not available (no tree-sitter on remote) | AST-based via tree-sitter WASM |
| Hook | None (hex-line hook handles reminders) | Unified `hook.mjs` (reminder + RTK filter) |
| SSH library | `ssh2` (key-only auth) | N/A (direct filesystem access) |

### Hash Format

```
ab.42    const x = calculateTotal(items);
```

- `ab` -- 2-char FNV-1a tag derived from content (whitespace-normalized)
- `42` -- line number (1-indexed)
- Tab separator, then original content
- Tag alphabet: `abcdefghijklmnopqrstuvwxyz234567` (32 symbols, bitwise selection)

### Range Checksums

```
checksum: 1-50:f7e2a1b0
```

FNV-1a accumulator over all line hashes in the range (little-endian byte feed). Detects changes to any line, even ones not being edited.

## License

MIT
