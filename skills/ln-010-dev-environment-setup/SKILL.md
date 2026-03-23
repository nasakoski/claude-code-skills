---
name: ln-010-dev-environment-setup
description: "Installs agents, configures MCP servers, syncs configs, audits instructions. Use after setup or when agents/MCP need alignment."
disable-model-invocation: true
license: MIT
---

> **Paths:** File paths (`shared/`, `references/`, `../ln-*`) are relative to skills repo root. If not found at CWD, locate this SKILL.md directory and go up one level for repo root. If `shared/` is missing, fetch files via WebFetch from `https://raw.githubusercontent.com/levnikolaevich/claude-code-skills/master/skills/{path}`.

# Dev Environment Setup

**Type:** L2 Domain Coordinator
**Category:** 0XX Shared

Single-pass coordinator that installs CLI agents, configures MCP servers, syncs configs across agents, and audits instruction files. Delegates to 4 specialized workers.

## When to Use This Skill

- First-time project setup (no `docs/environment_state.json`)
- After installing/removing CLI agents (Codex, Gemini)
- After adding/removing MCP servers in Claude Code
- When hooks need reconfiguration or verification
- Periodic alignment check across all agents

## Input Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| targets | No | both | `gemini`, `codex`, or `both` |
| dry_run | No | false | Show planned actions without executing |

## Workflow

```
OS Detect → Install Agents → Configure → Verify & Report
```

### Phase 0: OS & Environment Detection

| Check | Command | Result |
|-------|---------|--------|
| OS | `uname` or platform | win32 / darwin / linux |
| Home | `$HOME` or `$USERPROFILE` | Config root |
| Node | `node --version` | Required for hooks/MCP |
| npm | `npm --version` | Required for agent install |

**Config paths by OS:**

| Agent | Windows | macOS / Linux |
|-------|---------|---------------|
| **Claude** (primary) | `%USERPROFILE%\.claude.json` | `~/.claude.json` |
| **Claude** (fallback) | `%USERPROFILE%\.claude\settings.json` | `~/.claude/settings.json` |
| **Gemini** | `%USERPROFILE%\.gemini\settings.json` | `~/.gemini/settings.json` |
| **Codex** | `%USERPROFILE%\.codex\config.toml` | `~/.codex/config.toml` |

**Load disabled flags:** Read `docs/environment_state.json` if exists. Extract `agents.{name}.disabled` for each agent.

### Phase 1: Install Agents

Invoke ln-011 via Skill tool. Single pass: install + verify per agent.

```
Skill(skill: "ln-011-agent-installer", args: "{OS} {disabled_flags} {dry_run}")
```

Result: CLI agents (Codex, Gemini, Claude) installed and verified. Status table displayed by worker.

### Phase 2: Configure (sequential)

Invoke 3 workers via Skill tool sequentially. Pass OS info, disabled flags, and dry_run.

| Step | Worker | Responsibility | Args |
|------|--------|---------------|------|
| 2a | ln-012-mcp-configurator | Install MCP packages, register servers, hooks, permissions, migrations | `{OS} {dry_run}` |
| 2b | ln-013-config-syncer | Sync Claude settings to Gemini/Codex via symlinks & format conversion | `{OS} {disabled_flags} {targets} {dry_run}` |
| 2c | ln-014-agent-instructions-auditor | Audit CLAUDE.md, AGENTS.md, GEMINI.md for quality and consistency | `{instruction_file_list} {dry_run}` |

**Invocation (each step):**
```
Skill(skill: "{worker}", args: "{args}")
```

### Phase 3: Verify & Report

Full verification pass after all workers complete. Probes ALL installed components.

**3a: Probe CLI Agents**
- `codex --version`, `gemini --version`, `claude --version` for each non-disabled agent
- Record: available, version

**3b: Probe MCP Servers**
- `claude mcp list` → verify all registered servers `Connected`
- Token budget: `server_count * 5000` tokens (% of 200K context)

| Server Count | Level | Message |
|--------------|-------|---------|
| 1-5 | OK | "Budget within limits" |
| 6-8 | WARN | "Consider disabling unused MCP servers" |
| >8 | WARN | "Significant context impact" |

**3c: Probe Hooks**

**MANDATORY READ:** Load `shared/references/hook_health_check.md`

- Validate hooks from `hooks/hooks.json` (plugin) and `.claude/settings.local.json` (project)
- Check JSON syntax, script existence, dependencies

**3d: CLAUDE.md Health**
- Exists in project root
- Line count (<100 recommended)
- No timestamps (breaks prompt cache)
- Has compact instructions section

**3e: Best Practices Audit**

| # | Check | Pass | Fail | Source |
|---|-------|------|------|--------|
| 1 | MCP servers <=5 | <=25K tokens | WARN budget exceeded | 3b |
| 2 | CLAUDE.md exists | Found | SUGGEST creating | 3d |
| 3 | CLAUDE.md compact | <100 lines | INFO consider compacting | 3d |
| 4 | No timestamps in CLAUDE.md | Clean | WARN prompt cache breakage | 3d |
| 5 | Hooks configured and enabled | All hooks active | WARN missing hooks | 3c |
| 6 | Project MCP gate | `enableAllProjectMcpServers: false` | WARN security risk | 3b |
| 7 | Codex shell isolation | Env inheritance restricted | SUGGEST hardening | 3a |
| 8 | Gemini auto-compression | `chatCompression` set | SUGGEST enabling | 3a |
| 9 | Verification tools | test/lint in package.json | INFO missing tooling | 3b |

**3f: Write State**

1. **Read existing** `docs/environment_state.json` (preserve `disabled` flags)
2. **Build new state** validated against `references/environment_state_schema.json`:
   - `scanned_at`: ISO 8601 timestamp
   - `agents`: probe results merged with preserved `disabled`, plus config sync data per agent
   - `claude_md`: exists, line_count, has_timestamps, has_compact_instructions
   - `best_practices`: score and findings
   - **NOT persisted** (verify-time only): MCP servers, MCP budget, hooks — shown in report but not written to file (native CC settings are source of truth)
3. **Ensure** `docs/` directory exists
4. **Ensure gitignore:** If inside a git repo, check `.gitignore` for `docs/environment_state.json`. If not covered → append:
   ```
   # Machine-specific environment state (generated by ln-010)
   docs/environment_state.json
   ```
5. **Write** `docs/environment_state.json` (2-space indent)

**3g: Summary Report**

```
Dev Environment Setup Complete:
| Area          | Result   | Detail                        |
|---------------|----------|-------------------------------|
| CLI agents    | ok       | Gemini updated to 2025.6.15   |
| MCP servers   | ok       | 5 configured, budget OK       |
| Config sync   | ok       | Gemini: 2 new, Codex: skip    |
| Hooks         | ok       | output-filter added           |
| Best practices| 9/10     | 1 WARN (see above)            |

State: docs/environment_state.json
```

**If ANY problems found** → list them explicitly after the table with suggested fix per issue.

---

## Worker Invocation (MANDATORY)

| Phase | Worker | Context |
|-------|--------|--------|
| 1 | ln-011-agent-installer | Shared (Skill tool) — install/update CLI agents |
| 2a | ln-012-mcp-configurator | Shared (Skill tool) — MCP packages, servers, hooks, permissions |
| 2b | ln-013-config-syncer | Shared (Skill tool) — sync settings to Gemini/Codex |
| 2c | ln-014-agent-instructions-auditor | Shared (Skill tool) — audit instruction files |

**All workers:** Invoke via Skill tool sequentially — workers see coordinator context.

**TodoWrite format (mandatory):**
```
- OS & environment detection (pending)
- Invoke ln-011-agent-installer (pending)
- Invoke ln-012-mcp-configurator (pending)
- Invoke ln-013-config-syncer (pending)
- Invoke ln-014-agent-instructions-auditor (pending)
- Verify & report (pending)
```

## Critical Rules

| # | Rule | Detail |
|---|------|--------|
| 1 | Claude = source of truth | Read Claude configs as source. Writes ONLY via `claude mcp add`, `setup_hooks()`, and permissions in `settings.json` |
| 2 | Skip disabled agents | If `disabled: true` in environment_state.json, skip ALL operations for that agent |
| 3 | Preserve disabled field | Never overwrite user's `disabled` flags. Detection updates, preference stays |
| 4 | Idempotent | Safe to run multiple times. Already-correct state is skipped |
| 5 | Fail gracefully | One worker failure does not block others. Report per-area status independently |
| 6 | Verify last | All probes and checks run AFTER workers complete, not before |

## Anti-Patterns

| DON'T | DO |
|-------|-----|
| Scan before install (redundant) | Workers install and report, Phase 3 verifies |
| Duplicate budget checks | Calculate token budget once in Phase 3 |
| Block on single worker failure | Continue with remaining workers, report failure |
| Execute worker tasks inline | Invoke workers via Skill tool |
| Mark worker steps done without Skill invocation | Each worker MUST be invoked via Skill tool |

## Meta-Analysis

**MANDATORY READ:** Load `shared/references/meta_analysis_protocol.md`

Skill type: `execution-orchestrator`. Analyze this session per protocol §7. Output per protocol format.
---

## Definition of Done

- [ ] OS and environment detected (Phase 0)
- [ ] CLI agents installed and verified via ln-011 (Phase 1)
- [ ] MCP configured via ln-012, configs synced via ln-013, instructions audited via ln-014 (Phase 2)
- [ ] Full verification pass completed (Phase 3)
- [ ] Best practices audit table shown with 9 checks (Phase 3e)
- [ ] `docs/environment_state.json` written (Phase 3f)
- [ ] `docs/environment_state.json` covered in `.gitignore`
- [ ] Existing `disabled` flags preserved across rescan
- [ ] Summary report displayed with problems listed if any (Phase 3g)

---

**Version:** 1.1.0
**Last Updated:** 2026-03-23
