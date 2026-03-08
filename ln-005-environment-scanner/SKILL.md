---
name: ln-005-environment-scanner
description: "Probes all external tools and writes docs/environment_state.json — single source of truth for Phase 0"
license: MIT
---

> **Paths:** File paths (`shared/`, `references/`, `../ln-*`) are relative to skills repo root. If not found at CWD, locate this SKILL.md directory and go up one level for repo root.

# Environment Scanner (Standalone Utility)

**Type:** Standalone Utility
**Category:** 0XX Shared

Full environment scan: probes ALL external tools (MCP servers, CLI agents, git, platform), writes `docs/environment_state.json`. Other skills read this file in Phase 0 instead of live-probing each tool.

---

## When to Use This Skill

- First-time project setup (no `docs/environment_state.json` yet)
- After installing/removing MCP servers or CLI agents
- After `ln-004-agent-config-sync` (sync may change agent availability)
- When a skill reports unexpected tool unavailability
- Periodic environment refresh

---

## Output File

`docs/environment_state.json` — validated against `references/environment_state_schema.json`.

```json
{
  "$schema": "environment_state_v1",
  "scanned_at": "2026-03-08T14:30:00Z",
  "tools": {
    "linear":        { "available": true,  "team_id": "TEAM-abc", "detail": "3 teams found" },
    "ref":           { "available": true },
    "context7":      { "available": true },
    "hashline_edit": { "available": false, "detail": "MCP server not found" },
    "codex":         { "available": true,  "version": "0.1.2503" },
    "gemini":        { "available": false, "detail": "Command not found in PATH" },
    "git_worktree":  { "available": true }
  },
  "git": { "default_branch": "master" },
  "platform": { "os": "win32", "shell": "bash" }
}
```

### User Override

Users can add `"disabled": true` to any tool entry to opt out without losing detection state:

```json
"linear": { "available": true, "disabled": true, "team_id": "TEAM-abc", "detail": "3 teams" }
```

Scanner preserves `disabled` field on rescan — it overwrites `available`, `detail`, `version`, `team_id` but never touches `disabled`.

---

## Workflow

```
Probe MCP → Probe Agents → Probe Git → Detect Platform → Write JSON → Summary
```

### Phase 1: Probe MCP Tools

Probe each MCP tool with a lightweight call. Capture result as `available: true/false` + optional metadata.

| Tool | Probe Method | Success Fields |
|------|-------------|----------------|
| Linear | `list_teams()` | `available`, `team_id` (first team key), `detail` ("{N} teams found") |
| Ref | `ref_search_documentation(query="test")` | `available` |
| Context7 | `resolve-library-id(libraryName="react")` | `available` |
| Hashline-edit | `mcp__hashline-edit__read_file` on any project file | `available` |

**Error handling per probe:**

| Outcome | `available` | `detail` |
|---------|-------------|----------|
| Call succeeds | `true` | Probe-specific metadata |
| 401/403 (auth expired) | `false` | `"Auth expired: {error}"` |
| Tool not found / MCP server missing | `false` | `"MCP server not found"` |
| Timeout (>10s) | `false` | `"Probe timeout"` |

**Rules:**
- Each probe is independent — one failure does not block others
- Run probes sequentially (MCP calls cannot be parallelized)
- If a probe requires ToolSearch to load the deferred tool, load it first
- If ToolSearch returns no matching tool → `available: false`, `detail: "MCP server not found"`

### Phase 2: Probe CLI Agents

Single call to `agent_runner.py --health-check` probes all registered agents:

```bash
python shared/agents/agent_runner.py --health-check
```

**Path resolution:** `shared/agents/agent_runner.py` is relative to skills repo root. Locate via this SKILL.md directory → parent.

**Parse output** (JSON with per-agent status):

| Agent | Registry Key | State Fields |
|-------|-------------|--------------|
| Codex | `codex` (checks `codex --version`) | `available`, `version` (first line of version output) |
| Gemini | `gemini` (checks `gemini --version`) | `available`, `version` (first line of version output) |

**If `agent_runner.py` not found or errors:** Set both agents to `available: false`, `detail: "agent_runner.py not available"`.

### Phase 3: Probe Git

| Check | Command | Result |
|-------|---------|--------|
| Worktree support | `git worktree list` | Exit 0 → `git_worktree.available: true` |
| Default branch | `git symbolic-ref refs/remotes/origin/HEAD` | Parse branch name → `git.default_branch` |

**Fallback for default branch:** If symbolic-ref fails, check for `master` / `main` branches via `git branch -r`. If neither found, use `"master"`.

### Phase 4: Detect Platform

| Field | Source |
|-------|--------|
| `platform.os` | `uname -s` → map: MINGW*/MSYS* → `"win32"`, Darwin → `"darwin"`, Linux → `"linux"` |
| `platform.shell` | `echo $SHELL` basename, or `"bash"` if running in Git Bash on Windows |

### Phase 5: Write JSON

1. **Read existing state** (if `docs/environment_state.json` exists):
   - Preserve `disabled` fields from existing entries
   - Preserve any user-added custom fields
2. **Build new state:**
   - `$schema`: `"environment_state_v1"`
   - `scanned_at`: current ISO 8601 timestamp
   - `tools`: merge probe results (new `available`/`detail`/`version`/`team_id`) with preserved `disabled` flags
   - `git`: from Phase 3
   - `platform`: from Phase 4
3. **Ensure `docs/` directory exists** (create if missing)
4. **Write** `docs/environment_state.json` with 2-space indentation
5. **Validate** written file against `references/environment_state_schema.json` structure (key presence check, not full JSON Schema validation — keep it simple)

### Phase 6: Summary Report

Display results as a table:

```
Environment Scan Complete:
| Tool          | Status      | Detail                    |
|---------------|-------------|---------------------------|
| Linear        | available   | TEAM-abc (3 teams found)  |
| Ref           | available   |                           |
| Context7      | available   |                           |
| Hashline-edit | unavailable | MCP server not found      |
| Codex         | available   | 0.1.2503                  |
| Gemini        | unavailable | Command not found in PATH |
| Git worktree  | available   |                           |
| Platform      | win32       | bash                      |

State written to: docs/environment_state.json
```

If any tool has `disabled: true`, show status as `disabled` (not available/unavailable).

---

## Critical Rules

1. **Probe everything.** This skill always probes ALL tools, regardless of existing state. It is the full rescan.
2. **Preserve `disabled`.** Never overwrite user's `disabled: true` flags. Detection state updates, user preference stays.
3. **No side effects.** This skill only writes `docs/environment_state.json`. No other files modified.
4. **Fail gracefully.** Each probe is independent. One failure = one `available: false` entry, scan continues.
5. **No TTL.** State file has no expiration. It is refreshed only by running this skill or inline bootstrap.

## Anti-Patterns

| DON'T | DO |
|-------|-----|
| Skip probes for "known" tools | Always probe everything — this is a full scan |
| Delete `disabled` flags on rescan | Merge: overwrite detection fields, preserve `disabled` |
| Retry failed probes | One attempt per tool. Failure = `available: false` |
| Write tools_config.md | Write ONLY `docs/environment_state.json` |
| Add TTL or cache expiry logic | State is manual-refresh only |

---

## Definition of Done

| # | Criterion |
|---|-----------|
| 1 | All 7 tools probed (Linear, Ref, Context7, Hashline-edit, Codex, Gemini, Git worktree) |
| 2 | Platform detected (os + shell) |
| 3 | Git default branch detected |
| 4 | `docs/environment_state.json` written with valid structure |
| 5 | Existing `disabled` flags preserved across rescan |
| 6 | Summary table displayed to user |

---
**Version:** 1.0.0
**Last Updated:** 2026-03-08
