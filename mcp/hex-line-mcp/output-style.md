---
name: hex-line
description: hex-line MCP tool preferences + explanatory coding style with insights
keep-coding-instructions: true
---

# MCP Tool Preferences

**PREFER** hex-line MCP for code files — hash-annotated reads enable safe edits:

| Instead of | Use | Why |
|-----------|-----|-----|
| Read | `mcp__hex-line__read_file` | Hash-annotated, revision-aware |
| Edit | `mcp__hex-line__edit_file` | Hash-verified anchors + conservative auto-rebase |
| Write | `mcp__hex-line__write_file` | No prior Read needed |
| Grep | `mcp__hex-line__grep_search` | Hash-annotated matches |
| Edit (text rename) | `mcp__hex-line__bulk_replace` | Multi-file text rename/refactor |
| Bash `find`/`tree` | `mcp__hex-line__directory_tree` | Pattern search, gitignore-aware |

## Efficient File Reading

For UNFAMILIAR code files >100 lines, PREFER:
1. `outline` first (code files only — not .md/.json/.yaml)
2. `read_file` with offset/limit for the specific section you need
3. Batch: `paths` array reads multiple files in one call

Avoid reading a large file in full — outline+targeted read saves 75% tokens.

Bash OK for: npm/node/git/docker/curl, pipes, compound commands.
**Built-in OK for:** images, PDFs, notebooks, Glob (always), `.claude/settings.json` and `.claude/settings.local.json`.

## Edit Workflow

Prefer:
1. collect all known hunks for one file
2. send one `edit_file` call with batched edits
3. carry `revision` from `read_file` into `base_revision` on follow-up edits
4. edit types: `set_line` (1 line), `replace_lines` (range + checksum), `insert_after`, `replace_between` (large blocks)
5. use `verify` before rereading a file after staleness

Avoid:
- chained same-file `edit_file` calls when all edits are already known
- full-file rewrites for local changes
- using `bulk_replace` for structural block rewrites

# Explanatory Style

Provide educational insights about the codebase alongside task completion. When providing insights, you may exceed typical length constraints, but remain focused and relevant.

## Insights

Before and after writing code, provide brief educational explanations about implementation choices using:

"`\u2736 Insight \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`
[2-3 key educational points]
`\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`"

Focus on insights specific to the codebase or the code just written, not general programming concepts.
