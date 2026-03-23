---
name: ln-012-mcp-configurator
description: "Installs MCP packages, registers servers in Claude Code, configures hooks, permissions, and migrations. Use when MCP needs setup or reconfiguration."
license: MIT
---

> **Paths:** File paths (`shared/`, `references/`) are relative to skills repo root. Locate this SKILL.md directory and go up one level for repo root.

# MCP Configurator

**Type:** L3 Worker
**Category:** 0XX Shared

Configures MCP servers in Claude Code: installs npm packages, registers servers, installs hooks and output style, migrates allowed-tools, updates instruction files, grants permissions.

---

## Input / Output

| Direction | Content |
|-----------|---------|
| **Input** | OS info, `dry_run` flag |
| **Output** | Per-server status (`configured` / `added` / `skipped` / `failed`) |

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


---

## Workflow

```
Install → Register & Configure → Hooks → Permissions → Migrate → Report
```

### Phase 1: Install & Verify MCP Packages

For each hex MCP package, single pass: install then verify.

| Package | Install | Verify |
|---------|---------|--------|
| hex-line | `npm i -g @levnikolaevich/hex-line-mcp` | `npm ls -g @levnikolaevich/hex-line-mcp --json` |
| hex-ssh | `npm i -g @levnikolaevich/hex-ssh-mcp` | `npm ls -g @levnikolaevich/hex-ssh-mcp --json` |
| hex-graph | `npm i -g @levnikolaevich/hex-graph-mcp` | `npm ls -g @levnikolaevich/hex-graph-mcp --json` |

**Skip conditions:**

| Condition | Action |
|-----------|--------|
| `disabled: true` | SKIP |
| `dry_run: true` | Show planned command |

### Phase 2: Register & Configure

One pass: audit state → remove deprecated → register missing → verify connected.

1. Run `claude mcp list` — parse server name, transport, connection status
   - Fallback: read `~/.claude.json` + `~/.claude/settings.json`
2. Remove deprecated servers:

| Deprecated Server | Action |
|-------------------|--------|
| hashline-edit | Remove if found |
| pencil | Remove if found |
| lighthouse | Remove if found |
| playwright | Remove if found |
| browsermcp | Remove if found |

3. Register missing servers:
   - IF already configured AND connected → SKIP
   - IF `dry_run: true` → show planned command
   - IF **linear** → ask user: "Do you use Linear?" → no → SKIP

Registration commands:

| Server | Command |
|--------|----------|
| hex-line | `claude mcp add -s user hex-line -- hex-line-mcp` |
| hex-ssh | `claude mcp add -s user hex-ssh -- hex-ssh-mcp` |
| hex-graph | `claude mcp add -s user hex-graph -- hex-graph-mcp` |
| context7 | `claude mcp add -s user --transport http context7 https://mcp.context7.com/mcp` |
| Ref | `claude mcp add -s user --transport http Ref https://api.ref.tools/mcp` |
| linear | `claude mcp add -s user --transport http linear-server https://mcp.linear.app/mcp` |

4. Verify: `claude mcp list` once → check all registered show `Connected`. Retry + report failures.

**Error handling:**

| Error | Response |
|-------|----------|
| `claude` CLI not found | FAIL, report "Claude CLI not in PATH" |
| Server already exists | SKIP, report "already configured" |
| Connection failed after add | WARN, report detail from `claude mcp list` |
| API key missing (Ref) | Prompt user for key, skip if declined |

### Phase 3: Hooks & Output Style [CRITICAL]

MUST call `mcp__hex-line__setup_hooks(agent="claude")` immediately after hex-line registration. This configures:

**Hooks** (in `~/.claude/settings.json`):
1. `PreToolUse` hook — redirects built-in Read/Edit/Write/Grep to hex-line equivalents
2. `PostToolUse` hook — compresses verbose tool output (RTK filter)
3. `SessionStart` hook — injects MCP Tool Preferences reminder
4. Sets `disableAllHooks: false`

**Output Style:**
5. Copies `output-style.md` to `~/.claude/output-styles/hex-line.md`
6. Sets `outputStyle: "hex-line"` if no style is active (preserves existing style)

**Verification:** Response must contain `Hooks configured for`. If `SKIPPED`, `UNKNOWN_AGENT`, `Error`, or `failed` — STOP.

### Phase 4: Graph Indexing

After hex-graph registration + connected status:
1. `mcp__hex-graph__index_project({ path: "{project_path}" })` — build initial code knowledge graph
2. `mcp__hex-graph__watch_project({ path: "{project_path}" })` — enable live incremental updates

Skip if hex-graph not registered or not connected.

### Phase 5: Migrate allowed-tools [CRITICAL]

Scan project commands/skills to replace built-in tools with hex-line equivalents in `allowed-tools` frontmatter.

**Tool mapping:**

| Built-in | Hex equivalent |
|----------|----------------|
| `Read` | `mcp__hex-line__read_file` |
| `Edit` | `mcp__hex-line__edit_file` |
| `Write` | `mcp__hex-line__write_file` |
| `Grep` | `mcp__hex-line__grep_search` |

**Steps:**

1. Glob `.claude/commands/*.md` + `.claude/skills/*/SKILL.md` in current project
2. For each file: parse YAML frontmatter, extract `allowed-tools`
3. For each mapping entry:
   a. If built-in present AND hex equivalent absent → add hex equivalent, remove built-in (except `Read` and `Bash`)
   b. If built-in present AND hex equivalent already present → remove built-in (except `Read` and `Bash`)
   c. Preserve ALL existing `mcp__*` tools not in the replacement table
4. Write back updated frontmatter (preserve quoting style)


**Skip conditions:**

| Condition | Action |
|-----------|--------|
| No `.claude/` directory | Skip entire phase |
| File has no `allowed-tools` | Skip file |
| All hex equivalents present | Skip file, report "already migrated" |
| `dry_run: true` | Show planned changes |

### Phase 6: Update Instruction Files [CRITICAL]

Ensure instruction files have MCP Tool Preferences section.

**MANDATORY READ:** Load `mcp/hex-line-mcp/output-style.md` → use its `# MCP Tool Preferences` section as template.

**Steps:**

1. For each file: CLAUDE.md, GEMINI.md, AGENTS.md (if exists in project)
2. Search for `## MCP Tool Preferences` or `### MCP Tool Preferences`
3. If MISSING → insert before `## Navigation` (or at end of conventions/rules block)
4. If PRESENT but OUTDATED → update table rows to match template
5. For GEMINI.md: adapt tool names (`Read` → `read_file`, `Edit` → `edit_file`, `Grep` → `search_files`)

**Skip conditions:**

| Condition | Action |
|-----------|--------|
| File doesn't exist | Skip |
| Section already matches template | Skip, report "up to date" |

### Phase 7: Grant Permissions

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

**Idempotent:** existing entries skipped.

### Phase 8: Report + Benchmark

**Status table:**

```
MCP Configuration:
| Server    | Transport | Status        | Permission | Detail                  |
|-----------|-----------|---------------|------------|-------------------------|
| hex-line  | stdio     | configured    | granted    | global npm (hex-line-mcp) |
| hex-ssh   | stdio     | added         | granted    | global npm (hex-ssh-mcp)  |
| context7  | HTTP      | configured    | granted    | mcp.context7.com        |
| Ref       | HTTP      | configured    | granted    | api.ref.tools (key set) |
| linear    | HTTP      | skipped       | skipped    | user declined           |
```

**Token efficiency benchmark:**

```bash
node "$(npm root -g)/@levnikolaevich/hex-line-mcp/benchmark/index.mjs"
```

Key metrics: outline vs full read savings, compact diff savings, hash overhead, break-even point.

---

## Critical Rules

1. **Write only via sanctioned paths.** Register servers via `claude mcp add`. Write to `~/.claude/settings.json` ONLY for hooks (via `setup_hooks`), permissions (`permissions.allow[]`), and `outputStyle`
2. **Verify after add.** Always run `claude mcp list` after registration to confirm connection
3. **Ask before optional servers.** Linear requires explicit user consent
4. **Global install only.** Always `npm i -g` for hex MCP — hooks need stable absolute paths
5. **Remove deprecated servers.** Clean up servers no longer in the registry
6. **Grant permissions.** After registration, add `mcp__{server}` to user settings

## Anti-Patterns

| DON'T | DO |
|-------|-----|
| Write arbitrary fields to `~/.claude.json` | Use `claude mcp add` for servers, `setup_hooks` for hooks |
| Skip verification after add | Always check `claude mcp list` |
| Auto-add optional servers | Ask user for Linear and other optional servers |
| Leave deprecated servers | Remove hashline-edit, pencil, etc. |
| Calculate token budget | Not this worker's responsibility |

---

## Definition of Done

- [ ] MCP packages installed and versions verified (Phase 1)
- [ ] Missing servers registered and verified connected (Phase 2)
- [ ] Hooks installed (PreToolUse, PostToolUse, SessionStart) and `disableAllHooks: false` (Phase 3)
- [ ] Output style installed (Phase 3)
- [ ] Permissions granted for all configured servers (Phase 7)
- [ ] Project allowed-tools migrated (Phase 5)
- [ ] MCP Tool Preferences in all instruction files (Phase 6)
- [ ] Status table displayed (Phase 8)
- [ ] Token efficiency benchmark run (Phase 8)

---

**Version:** 1.2.0
**Last Updated:** 2026-03-23
