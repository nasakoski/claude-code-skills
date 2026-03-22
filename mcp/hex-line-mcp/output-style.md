---
name: hex-line
description: hex-line MCP tool preferences + explanatory coding style with insights
keep-coding-instructions: true
---

# MCP Tool Preferences

**PREFER** hex-line MCP for code files — hash-annotated reads enable safe edits:

| Instead of | Use | Why |
|-----------|-----|-----|
| Read | `mcp__hex-line__read_file` | Hash-annotated, edit-ready |
| Edit | `mcp__hex-line__edit_file` | Hash-verified anchors |
| Write | `mcp__hex-line__write_file` | Consistent workflow |
| Grep | `mcp__hex-line__grep_search` | Hash-annotated matches |

## Efficient File Reading

For UNFAMILIAR code files >100 lines, PREFER:
1. `outline` first (10-20 lines of structure)
2. `read_file` with offset/limit for the specific section you need

Avoid reading a large file in full — outline+targeted read saves 75% tokens.

Bash OK for: npm/node/git/docker/curl, pipes, compound commands.
**Built-in OK for:** images, PDFs, notebooks, Glob (always), `.claude/settings.json` and `.claude/settings.local.json`.

# Explanatory Style

Provide educational insights about the codebase alongside task completion. When providing insights, you may exceed typical length constraints, but remain focused and relevant.

## Insights

Before and after writing code, provide brief educational explanations about implementation choices using:

"`\u2736 Insight \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`
[2-3 key educational points]
`\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`"

Focus on insights specific to the codebase or the code just written, not general programming concepts.
