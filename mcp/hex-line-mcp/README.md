# hex-line-mcp

Hash-verified file editing MCP + token efficiency hook for AI coding agents.

[![npm](https://img.shields.io/npm/v/@levnikolaevich/hex-line-mcp)](https://www.npmjs.com/package/@levnikolaevich/hex-line-mcp)
[![downloads](https://img.shields.io/npm/dm/@levnikolaevich/hex-line-mcp)](https://www.npmjs.com/package/@levnikolaevich/hex-line-mcp)
[![license](https://img.shields.io/npm/l/@levnikolaevich/hex-line-mcp)](./LICENSE)
![node](https://img.shields.io/node/v/@levnikolaevich/hex-line-mcp)

Every line carries an FNV-1a content hash. Every edit must present those hashes back -- proving the agent is editing what it thinks it's editing. No stale context, no silent corruption.

## Features

### 11 MCP Tools

| Tool | Description | Key Feature |
|------|-------------|-------------|
| `read_file` | Read file with hash-annotated lines and range checksums | Partial reads via `offset`/`limit` |
| `edit_file` | Hash-verified edits with anchor or text replacement | Returns compact diff via `diff` package |
| `write_file` | Create new file or overwrite, auto-creates parent dirs | Path validation, no hash overhead |
| `grep_search` | Search with ripgrep, 3 output modes, per-group checksums | Edit-ready: grep -> edit directly with checksums |
| `outline` | AST-based structural overview via tree-sitter WASM | 95% token reduction (10 lines instead of 500) |
| `verify` | Check if held range checksums are still valid | Single-line response avoids full re-read |
| `directory_tree` | Compact directory tree with root .gitignore support | Skips node_modules/.git, shows file sizes |
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
npm i -g @levnikolaevich/hex-line-mcp
claude mcp add -s user hex-line -- hex-line-mcp
```

### Hooks

Automatic setup (run once after MCP install):

```
mcp__hex-line__setup_hooks(agent="claude")
```

Hooks are written to global `~/.claude/settings.json` with absolute path to `hook.mjs` from the global npm install. Manual configuration is not needed.

### Output Style

Optional: install a persistent Output Style that embeds tool preferences directly in Claude's system prompt. Reduces hook firings by making Claude prefer hex-line tools from the start.

```
mcp__hex-line__setup_hooks(agent="claude")
```

The `setup_hooks` tool automatically installs the output style to `~/.claude/output-styles/hex-line.md` and activates it if no other style is set. To activate manually: `/config` > Output style > hex-line.

## Token Efficiency

Benchmark v3 (21 code files, 4,801 lines, 18 scenarios):

| # | Scenario | Baseline | Hex-line | Savings | Ops | Steps |
|---|----------|----------|----------|---------|-----|-------|
| 1 | Read full (<50L) | 1,837 ch | 1,676 ch | 9% | 1→1 | 1→1 |
| 1 | Read full (50-200L) | 4,976 ch | 4,609 ch | 7% | 1→1 | 1→1 |
| 1 | Read full (200-500L) | 11,702 ch | 10,796 ch | 8% | 1→1 | 1→1 |
| 1 | Read full (500L+) | 76,079 ch | 71,578 ch | 6% | 1→1 | 1→1 |
| 2 | Outline+read (200-500L) | 11,702 ch | 3,620 ch | **69%** | 1→2 | 1→2 |
| 2 | Outline+read (500L+) | 76,079 ch | 19,020 ch | **75%** | 1→2 | 1→2 |
| 3 | Grep search | 2,816 ch | 2,926 ch | -4% | 1→1 | 1→1 |
| 4 | Directory tree | 1,967 ch | 699 ch | **64%** | 1→1 | 1→1 |
| 5 | File info | 371 ch | 197 ch | **47%** | 1→1 | 1→1 |
| 6 | Create file (200L) | 113 ch | 85 ch | **25%** | 1→1 | 1→1 |
| 7 | Edit x5 sequential | 2,581 ch | 1,529 ch | **41%** | 5→5 | 5→5 |
| 8 | Verify checksums (4 ranges) | 8,295 ch | 93 ch | **99%** | 4→1 | 4→1 |
| 9 | Multi-file read (2 files) | 3,674 ch | 3,358 ch | 9% | 2→1 | 1→1 |
| 10 | bulk_replace dry_run (5 files) | 2,795 ch | 1,706 ch | **39%** | 5→1 | 5→1 |
| 11 | Changes (semantic diff) | 830 ch | 271 ch | **67%** | 1→1 | 1→1 |
| 12 | FILE_NOT_FOUND recovery | 2,071 ch | 101 ch | **95%** | 3→1 | 3→1 |
| 13 | Hash mismatch recovery | 8,918 ch | 423 ch | **95%** | 3→1 | 3→1 |
| 14 | Bash redirects (cat+ls+stat) | 5,602 ch | 4,695 ch | **16%** | 3→3 | 1→1 |
| 15 | HASH_HINT multi-match recovery | 8,888 ch | 653 ch | **93%** | 3→2 | 3→1 |

**Average savings: 45% (flat) / 52% (weighted) | 39→28 ops (28% fewer) | 36→25 steps.**

Reproduce: `node benchmark.mjs` or `node benchmark.mjs --with-graph --repo /path/to/repo`

## Tools Reference

### read_file

Read a file with FNV-1a hash-annotated lines and range checksums. Supports directory listing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File or directory path |
| `paths` | string[] | no | Array of file paths to read (batch mode) |
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

Edit using hash-verified anchors or text replacement. Returns diff + post-edit checksums for chaining edits.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File to edit |
| `edits` | string | yes | JSON array of edit operations (see below) |
| `dry_run` | boolean | no | Preview changes without writing |
| `restore_indent` | boolean | no | Auto-fix indentation to match anchor context (default: false) |

Edit operations (JSON array):

```json
[
  {"set_line": {"anchor": "ab.12", "new_text": "replacement line"}},
  {"replace_lines": {"start_anchor": "ab.10", "end_anchor": "cd.15", "new_text": "..."}},
  {"insert_after": {"anchor": "ab.20", "text": "inserted line"}},
  {"replace": {"old_text": "unique text", "new_text": "replacement"}},
  {"replace": {"old_text": "find all", "new_text": "replace all", "all": true}}
]
```

### write_file

Create a new file or overwrite an existing one. Creates parent directories automatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | File path |
| `content` | string | yes | File content |

### grep_search

Search file contents using ripgrep. Three output modes: `content` (hash-annotated with checksums), `files` (paths only), `count` (match counts).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | yes | Search pattern (regex by default, literal if `literal:true`) |
| `path` | string | no | Directory or file to search (default: cwd) |
| `glob` | string | no | Glob filter, e.g. `"*.ts"` |
| `type` | string | no | File type filter, e.g. `"js"`, `"py"` |
| `output` | enum | no | Output format: `"content"` (default), `"files"`, `"count"` |
| `case_insensitive` | boolean | no | Ignore case |
| `smart_case` | boolean | no | CI when lowercase, CS when uppercase (`-S`) |
| `literal` | boolean | no | Literal string search, no regex (`-F`) |
| `multiline` | boolean | no | Pattern can span multiple lines (`-U`) |
| `context` | number | no | Symmetric context lines around matches (`-C`) |
| `context_before` | number | no | Context lines BEFORE match (`-B`) |
| `context_after` | number | no | Context lines AFTER match (`-A`) |
| `limit` | number | no | Max matches per file (default: 100) |
| `total_limit` | number | no | Total match events across all files; multiline matches count as 1 (0 = unlimited) |
| `plain` | boolean | no | Omit hash tags, return `file:line:content` |

**Content mode** returns per-group checksums enabling direct `replace_lines` from grep results without intermediate `read_file`.

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

Compact directory tree with root .gitignore support (path-based rules, negation, dir-only). Nested .gitignore files are not loaded.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Directory path |
| `pattern` | string | no | Glob filter on names (e.g. `"*-mcp"`, `"*.mjs"`). Returns flat match list instead of tree |
| `type` | string | no | `"file"`, `"dir"`, or `"all"` (default). Like `find -type f/d` |
| `max_depth` | number | no | Max recursion depth (default: 3, or 20 in pattern mode) |
| `gitignore` | boolean | no | Respect root .gitignore patterns (default: true). Nested .gitignore not supported |
| `format` | string | no | `"compact"` = names only, no sizes, depth 1. `"full"` = default with sizes |

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


## FAQ

<details>
<summary><b>Does it work without Claude Code?</b></summary>

Yes. hex-line-mcp is a standard MCP server (stdio transport). It works with any MCP-compatible client -- Claude Code, Gemini CLI, Codex CLI, or custom integrations. Hooks are Claude/Gemini/Codex-specific.

</details>

<details>
<summary><b>What happens if a hash is stale?</b></summary>

The edit is rejected with an error showing which lines changed since the last read. The agent must re-read the affected range and retry. This prevents silent overwrites from stale context.

</details>

<details>
<summary><b>Is outline available for all file types?</b></summary>

Outline works on code files only (15+ languages via tree-sitter WASM). For markdown, JSON, YAML, and text files use `read_file` directly -- these formats don't benefit from structural outline.

</details>

<details>
<summary><b>How does the RTK filter reduce tokens?</b></summary>

The PostToolUse hook normalizes Bash output (replaces UUIDs, timestamps, IPs with placeholders), deduplicates identical lines, and truncates to first 12 + last 12 lines. Average savings: 45% (flat) / 52% (weighted) across 18 benchmark scenarios.

</details>

<details>
<summary><b>Can I disable the built-in tool blocking?</b></summary>

Yes. Remove the PreToolUse hook from `.claude/settings.local.json`. The MCP tools will still work, but agents will be free to use built-in Read/Edit/Write/Grep alongside hex-line tools.

</details>

## Hex Family

| Package | Purpose | npm |
|---------|---------|-----|
| [hex-line-mcp](https://www.npmjs.com/package/@levnikolaevich/hex-line-mcp) | Local file editing with hash verification + hooks | [![npm](https://img.shields.io/npm/v/@levnikolaevich/hex-line-mcp)](https://www.npmjs.com/package/@levnikolaevich/hex-line-mcp) |
| [hex-ssh-mcp](https://www.npmjs.com/package/@levnikolaevich/hex-ssh-mcp) | Remote file editing over SSH | [![npm](https://img.shields.io/npm/v/@levnikolaevich/hex-ssh-mcp)](https://www.npmjs.com/package/@levnikolaevich/hex-ssh-mcp) |
| [hex-graph-mcp](https://www.npmjs.com/package/@levnikolaevich/hex-graph-mcp) | Code knowledge graph with AST indexing | [![npm](https://img.shields.io/npm/v/@levnikolaevich/hex-graph-mcp)](https://www.npmjs.com/package/@levnikolaevich/hex-graph-mcp) |

## License

MIT
