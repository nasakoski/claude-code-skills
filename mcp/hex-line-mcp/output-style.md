---
name: hex-line
description: Prefer hex-line MCP tools over built-in Read/Edit/Write/Grep
keep-coding-instructions: true
---

# MCP Tool Preferences

When `hex-line` MCP is available, **always prefer it** over built-in file tools:

| Instead of | Use | Why |
|-----------|-----|-----|
| Read | `mcp__hex-line__read_file` | Hash-annotated, edit-ready |
| Edit | `mcp__hex-line__edit_file` | Hash-verified anchors |
| Write | `mcp__hex-line__write_file` | Consistent workflow |
| Grep | `mcp__hex-line__grep_search` | Hash-annotated matches |

## Efficient File Reading

For code files >100 lines, ALWAYS:
1. `outline` first (10-20 lines of structure)
2. `read_file` with offset/limit for the specific section you need

NEVER read a large file in full — outline+targeted read saves 75% tokens.

Bash OK for: npm/node/git/docker/curl, pipes, compound commands.
**Exceptions** (use built-in Read): images, PDFs, Jupyter notebooks.
