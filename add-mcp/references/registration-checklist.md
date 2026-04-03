# MCP Registration Checklist

Quick-reference for verifying completeness. Every tool name must appear in
all "Required" files.

## Required for ALL MCPs

| # | File | What to Add | Key |
|---|------|-------------|-----|
| 1 | `bot/lib/autonomy.js` | Tool tier in `EXTERNAL_TOOL_TIERS` or `JARVIS_TOOL_TIERS` | Use base name (no `mcp__` prefix) |
| 2 | `bot/lib/autonomy.js` | `GATEWAY_WRITE_ACTIONS` + `describeWriteAction()` | Only if gateway with writes |
| 3 | `bot/lib/messenger.js` | `TOOL_DISPLAY_NAMES` entry per tool | Present participle form |
| 4 | `bot/lib/messenger.js` | `GATEWAY_ACTION_NAMES` + `GATEWAYS` set | Only for gateway MCPs |
| 5 | `bot/lib/providers/agent-sdk.js` | `TOOL_INSTRUCTIONS` documentation section | Before BUILT-IN section |
| 6 | `bot/workflows/<name>.md` | Workflow with YAML frontmatter | Auto-discovered at startup |
| 7 | `start.sh` | Secret decryption block | Only if auth required |

## Additional for Direct Stdio MCPs

| # | File | What to Add |
|---|------|-------------|
| 8 | `bot/lib/providers/agent-sdk.js` | Entry in `mcpServers` object (~line 289) |
| 9 | `.mcp.json` | Server definition for Claude Code dev |

## Additional for HTTP Gateway MCPs

| # | File | What to Add |
|---|------|-------------|
| 10 | `bot/tools/<name>.js` | Gateway tool file (mirror `notion.js`) |
| 11 | `bot/tools/index.js` | Import + `ALL_TOOLS` + `RESTRICTED_TOOLS` |

## Verification Command

```bash
grep -r "tool_name" bot/lib/autonomy.js bot/lib/messenger.js bot/lib/providers/agent-sdk.js
```

Each tool must appear in all three files.

## Common Mistakes

- Adding to `.mcp.json` only (dev tool config, not bot runtime)
- Forgetting autonomy.js (tools blocked by default — silent "not recognized" error)
- Forgetting messenger.js (progress messages show raw tool names)
- Forgetting TOOL_INSTRUCTIONS (model doesn't know the tools exist)
- For gateways: forgetting `GATEWAYS` set (progress shows gateway name, not action)
