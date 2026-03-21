---
name: ln-012-mcp-configurator
description: "Installs MCP servers, registers them in Claude Code, and grants user-level permissions. Use when MCP servers need setup or reconfiguration."
license: MIT
---

> **Paths:** File paths (`shared/`, `references/`) are relative to skills repo root. Locate this SKILL.md directory and go up one level for repo root.

# MCP Configurator

**Type:** L3 Worker
**Category:** 0XX Shared

Configures MCP servers in Claude Code: audits current state, registers missing servers via `claude mcp add`, grants user-level permissions, analyzes token budget impact.

---

## Input / Output

| Direction | Content |
|-----------|---------|
| **Input** | OS info, existing MCP state (optional, from scan), `dry_run` flag |
| **Output** | Per-server status (`configured` / `added` / `skipped` / `failed`), budget analysis |

---

## Server Registry

Two transport types: **stdio** (local process) and **HTTP** (cloud endpoint).

| Server | Transport | Source | Required | API Key |
|--------|-----------|--------|----------|---------|
| hex-line | stdio | `npm i -g @levnikolaevich/hex-line-mcp` → `hex-line-mcp` | Yes | No |
| hex-ssh | stdio | `npm i -g @levnikolaevich/hex-ssh-mcp` → `hex-ssh-mcp` | No | No |
| hex-graph | stdio | `npm i -g @levnikolaevich/hex-graph-mcp` → `hex-graph-mcp` | No | No |
| context7 | HTTP | `https://mcp.context7.com/mcp` | Yes | Optional |
| Ref | HTTP | `https://api.ref.tools/mcp` | Yes | Yes (prompt user) |
| linear | HTTP | `https://mcp.linear.app/mcp` | Ask user | No (OAuth) |

**hex-line/hex-ssh/hex-graph source selection:** Prefer global install (`npm i -g`). Hooks require stable absolute path — `npx` cache is ephemeral and rejected by `setup_hooks`. Use local `node {repo}/mcp/*/server.mjs` only for active MCP development.

---

## Workflow

Audit  -->  Configure  -->  Register  -->  Permissions  -->  Budget  -->  Report

### Phase 1: Audit Current MCP State

1. Run `claude mcp list` — canonical source of truth for configured servers
   - Parse output: server name, transport type, connection status
   - Fallback if `claude` CLI unavailable: read `~/.claude.json` + `~/.claude/settings.json`, merge by server name
2. Build table of configured vs missing servers (compare against registry)
3. Check for deprecated servers and flag for removal:

| Deprecated Server | Action |
|-------------------|--------|
| hashline-edit | Remove if found |
| pencil | Remove if found |
| lighthouse | Remove if found |
| playwright | Remove if found |
| browsermcp | Remove if found |

### Phase 2: Configure Missing Servers

For each server in registry not yet configured:

1. IF already configured AND `claude mcp list` shows connected → SKIP
2. IF `dry_run: true` → show planned `claude mcp add` command, do not execute
3. IF **linear** → ask user: "Do you use Linear for task management?" → no → SKIP

### Phase 3: Register via `claude mcp add`

Registration commands by server and source:

| Server | Command |
|--------|---------|
| hex-line (global) | `npm i -g @levnikolaevich/hex-line-mcp` then `claude mcp add -s user hex-line -- hex-line-mcp` |
| hex-ssh (global) | `npm i -g @levnikolaevich/hex-ssh-mcp` then `claude mcp add -s user hex-ssh -- hex-ssh-mcp` |
| hex-graph (global) | `npm i -g @levnikolaevich/hex-graph-mcp` then `claude mcp add -s user hex-graph -- hex-graph-mcp` |
| hex-line (dev) | `claude mcp add -s user hex-line -- node {repo}/mcp/hex-line-mcp/server.mjs` |
| hex-ssh (dev) | `claude mcp add -s user hex-ssh -- node {repo}/mcp/hex-ssh-mcp/server.mjs` |
| hex-graph (dev) | `claude mcp add -s user hex-graph -- node {repo}/mcp/hex-graph-mcp/server.mjs` |
| context7 | `claude mcp add -s user --transport http context7 https://mcp.context7.com/mcp` |
| Ref | `claude mcp add -s user --transport http Ref https://api.ref.tools/mcp` |
| linear | `claude mcp add -s user --transport http linear-server https://mcp.linear.app/mcp` |

**Post-registration verification:** After ALL servers are registered, run `claude mcp list` once. For each hex MCP (hex-line, hex-ssh, hex-graph): verify status is `Connected`. If any shows disconnected or missing — retry `claude mcp add`, then re-check. Report failures explicitly.

**Error handling:**

| Error | Response |
|-------|----------|
| `claude` CLI not found | FAIL, report "Claude CLI not in PATH" |
| Server already exists | SKIP, report "already configured" |
| Connection failed after add | WARN, report detail from `claude mcp list` |
| API key missing (Ref) | Prompt user for key, skip if declined |

### Phase 3b: Install Output Style

After hex-line registration, install Output Style via `mcp__hex-line__setup_hooks(agent="claude")`. This:
1. Copies `output-style.md` to `~/.claude/output-styles/hex-line.md`
2. Sets `outputStyle: "hex-line"` in `~/.claude/settings.json` if no style is active
3. If another style is active — preserves it, reports to user

### Phase 4: Grant Permissions

For each **configured** MCP server, add `mcp__{name}` to `~/.claude/settings.json` → `permissions.allow[]`.

| Server | Permission entry |
|---|---|
| hex-line | `mcp__hex-line` |
| hex-ssh | `mcp__hex-ssh` |
| hex-graph | `mcp__hex-graph` |
| context7 | `mcp__context7` |
| Ref | `mcp__Ref` |
| linear | `mcp__linear-server` |

1. Read `~/.claude/settings.json` (create if missing: `{"permissions":{"allow":[]}}`)
2. For each configured server: check if `mcp__{name}` already in `allow[]`
3. Missing → append
4. Write back (2-space indent JSON)
5. Report: `"Granted N permissions (M already present)"`

**Idempotent:** existing entries skipped.

### Phase 5: Budget Analysis

| Metric | Formula | Threshold |
|--------|---------|-----------|
| Server count | count of `mcpServers` keys | recommended 5 or fewer |
| Estimated tokens | count x 5000 | recommended 25,000 or fewer |
| Context percentage | tokens / 200,000 x 100 | recommended 12.5% or less |

Budget warnings:

| Server Count | Level | Message |
|--------------|-------|---------|
| 1-5 | OK | "Budget within limits" |
| 6-8 | WARN | "Consider disabling unused MCP servers to reduce context overhead" |
| >8 | WARN | "Significant context impact — review which servers are actively used" |

### Phase 6: Report

```
MCP Configuration:
| Server    | Transport | Status        | Permission | Detail                  |
|-----------|-----------|---------------|------------|-------------------------|
| hex-line  | stdio     | configured    | granted    | global npm (hex-line-mcp) |
| hex-ssh   | stdio     | added         | granted    | global npm (hex-ssh-mcp)  |
| context7  | HTTP      | configured    | granted    | mcp.context7.com        |
| Ref       | HTTP      | configured    | granted    | api.ref.tools (key set) |
| linear    | HTTP      | skipped       | skipped    | user declined           |

Budget: 4 servers ~ 20K tokens (10.0% of context) — OK
```

---

### Phase 7: Token Efficiency Benchmark

After hex-line is configured, run benchmark on user's repo:

```bash
node mcp/hex-line-mcp/benchmark.mjs
```

Display results to user — demonstrates value of the MCP setup just completed.

Key metrics shown:
- Outline vs full read savings (expect 57-93% on medium-XL files)
- Compact diff savings (expect 32-38% on edits)
- Hash overhead (expect ~0% — negligible)
- Break-even point (typically ~30 lines)

If benchmark shows >50% savings on outline+read → recommend adding hex-line hook for automatic reminders.

---

## Critical Rules

1. **Claude configs are read-only.** Use `claude mcp add` CLI to register servers. Never write directly to Claude JSON files
2. **Verify after add.** Always run `claude mcp list` after registration to confirm connection
3. **Ask before optional servers.** Linear requires explicit user consent
4. **Prefer global install.** Use `npm i -g` for hex-line/hex-ssh/hex-graph — hooks need stable paths. Local only for active MCP development
5. **Remove deprecated servers.** Clean up servers no longer in the registry
6. **Grant permissions.** After registration, add `mcp__{server}` to user `~/.claude/settings.json`

## Anti-Patterns

| DON'T | DO |
|-------|-----|
| Write directly to `~/.claude.json` | Use `claude mcp add` CLI |
| Skip verification after add | Always check `claude mcp list` |
| Auto-add optional servers | Ask user for Linear and other optional servers |
| Ignore budget impact | Always calculate and report token budget |
| Leave deprecated servers | Remove hashline-edit, pencil, etc. |

---

## Definition of Done

- [ ] Current MCP state audited (via `claude mcp list`)
- [ ] Deprecated servers flagged for removal
- [ ] Missing required servers registered via `claude mcp add`
- [ ] Each registered server verified via `claude mcp list`
- [ ] Token budget calculated and warnings shown if applicable
- [ ] Final status table displayed with all servers
- [ ] Permissions granted for all configured servers in user settings
- [ ] Token efficiency benchmark run and results shown

---

**Version:** 1.1.0
**Last Updated:** 2026-03-20
