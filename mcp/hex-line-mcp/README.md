# hex-line-mcp

Hash-verified file editing MCP + token efficiency hook for AI coding agents.

Every line carries an FNV-1a content hash. Every edit must present those hashes back -- proving the agent is editing what it thinks it's editing. No stale context, no silent corruption.

## Features

### 11 MCP Tools

| Tool | Description | Key Feature |
|------|-------------|-------------|
| `read_file` | Read file with hash-annotated lines and range checksums | Partial reads via `offset`/`limit` |
| `edit_file` | Hash-verified edits with anchor or text replacement | Returns compact diff via `diff` package |
| `write_file` | Create new file or overwrite, auto-creates parent dirs | Path validation, no hash overhead |
| `grep_search` | Search with ripgrep, returns hash-annotated matches | Edit-ready results -- search then edit directly |
| `outline` | AST-based structural overview via tree-sitter WASM | 95% token reduction (10 lines instead of 500) |
| `verify` | Check if held range checksums are still valid | Single-line response avoids full re-read |
| `directory_tree` | Compact directory tree with .gitignore support | Skips node_modules/.git, shows file sizes |
| `get_file_info` | File metadata without reading content | Size, lines, mtime, type, binary detection |
| `setup_hooks` | Configure PreToolUse + PostToolUse hooks for Claude/Gemini/Codex | One call sets up everything, idempotent |
| `changes` | Compare file against git ref, shows added/removed/modified symbols | AST-level semantic diff |
| `bulk_replace` | Search-and-replace across multiple files by glob | Per-file diffs, dry_run, max_files safety |

### Hooks (PreToolUse + PostToolUse)

| Event | Trigger | Action |
|-------|---------|--------|
| **PreToolUse** | Read/Edit/Write/Grep on text files | Blocks built-in, forces hex-line tools |
| **PreToolUse** | Bash with dangerous commands | Blocks `rm -rf /`, `git push --force`, etc. Agent must confirm with user |
| **PostToolUse** | Bash with 50+ lines output | RTK: deduplicates, truncates, summarizes |
| **SessionStart** | Session begins | Injects full tool preference list into agent context |


### Bash Redirects

PreToolUse also intercepts simple Bash commands: cat, head, tail, ls, tree, find, stat, wc -l, grep, rg, sed -i, diff — redirects to hex-line equivalents. Compound commands with pipes are allowed.
## Install

### MCP Server

```bash
claude mcp add -s user hex-line -- node path/to/mcp/hex-line-mcp/server.mjs
```

Then install dependencies:

```bash
cd mcp/hex-line-mcp && npm install
```

### Hooks

Automatic setup (run once after MCP install):

```
mcp__hex-line__setup_hooks(agent="claude")
```

Or manual — add to `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [{"matcher": "Read|Edit|Write|Grep|Bash", "hooks": [{"type": "command", "command": "node mcp/hex-line-mcp/hook.mjs", "timeout": 5}]}],
    "PostToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "node mcp/hex-line-mcp/hook.mjs", "timeout": 10}]}]
  }
}
```

## Token Efficiency

Benchmark v3 (46 code files, 9,134 lines, 18 scenarios):

| Scenario | Without | With Hex-line | Savings |
|----------|---------|---------------|--------|
| Read full (any size) | raw | hash-annotated | 6-8% |
| Outline+read (200-500L) | 10,723 ch | 3,347 ch | **69%** |
| Outline+read (500L+) | 39,617 ch | 9,531 ch | **76%** |
| Edit x5 sequential | 2,581 ch | 1,529 ch | **41%** |
| Verify checksums | 8,295 ch | 93 ch | **99%** |
| Directory tree | 80,853 ch | 22,120 ch | **73%** |
| File info | 368 ch | 195 ch | **47%** |
| bulk_replace (5 files) | 2,795 ch | 1,706 ch | **39%** |
| Changes (semantic diff) | 830 ch | 133 ch | **84%** |
| FILE_NOT_FOUND recovery | 2,020 ch | 283 ch | **86%** |
| Hash mismatch recovery | 8,918 ch | 423 ch | **95%** |
| Bash redirects (cat+ls+stat) | 54,658 ch | 25,153 ch | **54%** |
| Grep search | 3,938 ch | 4,091 ch | -4% |

**Average savings: 46%.** Break-even: ~50 lines. Hash overhead: negligible.

Reproduce: `node benchmark.mjs` or `node benchmark.mjs --repo /path/to/repo`

## Tools Reference

### read_file

Read a file with FNV-1a hash-annotated lines and range checksums. Supports directory listing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File or directory path |
| `offset` | number | no | Start line, 1-indexed (default: 1) |
| `limit` | number | no | Max lines to return (default: 2000, 0 = all) |
| `plain` | boolean | no | Omit hashes, output `lineNum\|content` instead |

Output format:

```
ab.1    import { resolve } from "node:path";
cd.2    import { readFileSync } from "node:fs";
...
checksum: 1-50:f7e2a1b0
```

### edit_file

Edit using hash-verified anchors or text replacement. Returns a unified diff.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File to edit |
| `edits` | string | yes | JSON array of edit operations (see below) |
| `dry_run` | boolean | no | Preview changes without writing |

Edit operations (JSON array):

```json
[
  {"set_line": {"anchor": "ab.12", "new_text": "replacement line"}},
  {"replace_lines": {"start_anchor": "ab.10", "end_anchor": "cd.15", "new_text": "..."}},
  {"insert_after": {"anchor": "ab.20", "text": "inserted line"}},
  {"replace": {"old_text": "find this", "new_text": "replace with", "all": false}}
]
```

### write_file

Create a new file or overwrite an existing one. Creates parent directories automatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File path |
| `content` | string | yes | File content |

### grep_search

Search file contents using ripgrep with hash-annotated results.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | yes | Regex search pattern |
| `path` | string | no | Directory or file to search (default: cwd) |
| `glob` | string | no | Glob filter, e.g. `"*.ts"` |
| `type` | string | no | File type filter, e.g. `"js"`, `"py"` |
| `case_insensitive` | boolean | no | Ignore case |
| `context` | number | no | Context lines around matches |
| `limit` | number | no | Max matches per file (default: 100) |

### outline

AST-based structural outline: functions, classes, interfaces with line ranges.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Source file path |

Supported languages: JavaScript, TypeScript (JSX/TSX), Python, Go, Rust, Java, C, C++, C#, Ruby, PHP, Kotlin, Swift, Bash -- 15+ via tree-sitter WASM.

Not for `.md`, `.json`, `.yaml`, `.txt` -- use `read_file` directly for those.

### verify

Check if range checksums from a prior read are still valid.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File path |
| `checksums` | string | yes | JSON array of checksum strings, e.g. `["1-50:f7e2a1b0"]` |

Returns a single-line confirmation or lists changed ranges.

### directory_tree

Compact directory tree with .gitignore support and file sizes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Directory path |
| `max_depth` | number | no | Max recursion depth (default: 3) |
| `gitignore` | boolean | no | Respect .gitignore patterns (default: true) |

Skips `node_modules`, `.git`, `dist`, `build`, `__pycache__`, `.next`, `coverage` by default.

### get_file_info

File metadata without reading content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File path |

Returns: size, line count, modification time (absolute + relative), file type, binary detection.

## Hook

The unified PostToolUse hook (`hook.mjs`) handles two concerns:

### Hex-line Reminder

Triggers on built-in `Read`, `Edit`, `Write`, `Grep` tool usage for text files. Outputs a short reminder to stderr (exit code 2) nudging the agent to use the corresponding hex-line tool instead.

Binary files (images, PDFs, notebooks, archives, executables, fonts, media) are excluded -- those should use built-in tools.

### RTK Output Filter

Triggers on `Bash` tool output exceeding 50 lines. Pipeline:

1. **Detect command type** -- npm install, test, build, pip install, git verbose, or generic
2. **Type-specific summary** -- extracts key metrics (e.g., `npm install: 42 added, 3 warnings`)
3. **Normalize** -- replaces UUIDs, timestamps, IPs, hex values, large numbers with placeholders
4. **Deduplicate** -- collapses identical normalized lines with `(xN)` counts
5. **Truncate** -- keeps first 12 + last 12 lines, omits the middle

Configuration constants in `hook.mjs`:

| Constant | Default | Purpose |
|----------|---------|---------|
| `LINE_THRESHOLD` | 50 | Minimum lines to trigger filtering |
| `TRUNCATE_LIMIT` | 30 | Lines below this are kept as-is after dedup |
| `HEAD_LINES` | 12 | Lines to keep from start |
| `TAIL_LINES` | 12 | Lines to keep from end |

## Architecture

```
hex-line-mcp/
  server.mjs          MCP server (stdio transport, 6 tools)
  hook.mjs            PostToolUse hook (reminder + RTK filter)
  package.json
  lib/
    hash.mjs          FNV-1a hashing, 2-char tags, range checksums
    read.mjs          File reading with hash annotation
    edit.mjs          Anchor-based and text-based edits, diff output
    search.mjs        ripgrep wrapper with hash-annotated results
    outline.mjs       tree-sitter WASM AST outline
    verify.mjs        Range checksum verification
    security.mjs      Path validation, binary detection, size limits
    normalize.mjs     Output normalization, deduplication, truncation
```

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

### Security

- Path canonicalization via `realpathSync` (resolves symlinks)
- Binary file detection (null byte scan in first 8KB)
- 10 MB file size limit
- Write path validation (ancestor directory must exist)
- Directory restrictions delegated to Claude Code sandbox

## Differences from trueline-mcp

| Aspect | hex-line-mcp | trueline-mcp |
|--------|---------------|--------------|
| Hash algorithm | FNV-1a (pure JS, zero dependencies) | xxHash (native addon) |
| Diff output | Compact unified diff via `diff` npm package | Custom diff implementation |
| Hook | Unified `hook.mjs` (reminder + RTK filter) | Separate hook scripts |
| Path security | Canonicalization + binary detection, no ALLOWED_DIRS | Explicit ALLOWED_DIRS allowlist |
| Transport | stdio only | stdio |
| Outline | tree-sitter WASM (15+ languages) | tree-sitter WASM |

## License

MIT
