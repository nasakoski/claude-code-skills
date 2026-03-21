# Tool Preferences for Code Editing

Hash-verified file operations via `hex-line-mcp` MCP server.

## hex-line-mcp (MCP — preferred)

MCP server at `mcp/hex-line-mcp/`. 6 tools with FNV-1a hash verification:

| Tool | Purpose | When to use |
|------|---------|-------------|
| `outline` | AST structural overview (10 lines vs 500) | Before reading large files |
| `read_file` | Hash-annotated read with range checksums | Examining file contents |
| `edit_file` | Hash-verified edits with diff output | Modifying code files |
| `write_file` | Create new files | New files only |
| `grep_search` | ripgrep with hash-annotated results | Finding code patterns |
| `verify` | Check if held checksums still valid | Before editing after a pause |

**Hash format:** `{tag}.{lineNum}\t{content}` where tag = 2-char FNV-1a.
**Checksums:** `checksum: start-end:8hex` after each read range.

## Detection Sequence

1. **hex-line-mcp MCP** — `read_file`/`outline` in tool list → use MCP
2. **Standard tools** — fallback. Built-in Read/Edit/Write/Grep

## When to Use

- **USE for CODE files** (.ts, .js, .py, .go, .rs, .java, etc.)
- **DO NOT use for:** small JSON configs, YAML, markdown
- **Workflow:** outline → read (specific ranges) → edit by anchor → verify

## Setup

```bash
npm i -g @levnikolaevich/hex-line-mcp
claude mcp add -s user hex-line -- hex-line-mcp
```

---
**Version:** 5.0.0
**Last Updated:** 2026-03-20
