# Agent Teams Platform Guide

**Operational best practices for Claude Code Agent Teams (2026)**

<!-- SCOPE: Platform-level constraints, hooks, heartbeat, Windows compatibility, crash recovery, worker lifecycle. -->

Based on: [Anthropic Agent Teams docs](https://code.claude.com/docs/en/agent-teams), [Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system), [Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk), and production experience with ln-1000-pipeline-orchestrator.

---

## 1. Subagents vs Agent Teams

| Dimension | Subagents (Agent tool) | Agent Teams (TeamCreate) |
|-----------|----------------------|--------------------------|
| Context | Own window, results return to caller | Own window, fully independent |
| Communication | Report back to parent only | Teammates message each other directly |
| Coordination | Parent manages all work | Shared task list + self-coordination |
| Token cost | Lower (results summarized) | Higher (each teammate = separate instance) |
| Best for | Focused tasks, only result matters | Complex work requiring discussion |

**Decision rule:** Use subagents when workers are independent and report-only. Use Agent Teams when workers need coordination, shared state, or multi-stage lifecycle management.

## 2. Heartbeat & Event Loop

### How It Works

```
Lead turn ends -> Stop hook fires -> exit 2 -> NEW agentic loop
  -> Queued worker messages delivered in this cycle
  -> Lead processes ON handlers
  -> Turn ends -> next heartbeat
```

### Key Rules

| Rule | Rationale |
|------|-----------|
| Stop hook exit 2 = heartbeat trigger | Creates new processing cycle, not just "prevent exit" |
| Lead MUST NOT say "waiting" and stop | Turn ends = no more processing until next heartbeat |
| 60s sleep in hook is optimal | <30s = token waste, >120s = slow message processing |
| No event-driven optimization in hooks | Reading `~/.claude/` internals is forbidden (undocumented, fragile) |
| Messages arrive automatically | Claude Code delivers queued messages at start of each agentic loop |

### Anti-Patterns

| Pattern | Why Wrong | Correct |
|---------|-----------|---------|
| `sleep` + filesystem polling | Blocks agent, can't receive messages | Let turn end, hook drives heartbeat |
| Reading `~/.claude/teams/*/inboxes/` | Internal format, breaks between versions | Messages arrive as conversation turns |
| Parsing `idle_notification` JSON | Internal protocol | Use TeammateIdle hook or ON handlers |
| Hook checks inbox for pending messages | Forbidden internal access | Fixed 60s interval is correct |

## 3. Worker Lifecycle

```
SPAWNED -> EXECUTING -> REPORTING -> SHUTDOWN
              |
              +-> CRASHED (no completion, idle without report)
```

### Worker Prompt Patterns

Per `plugin-dev:agent-development` → `references/system-prompt-design.md`, worker system prompts follow 4 patterns:

| Stage | Pattern | Characteristics |
|-------|---------|----------------|
| 0 (ln-300) | Generation | Create artifacts (tasks) from requirements |
| 1 (ln-310) | Validation | Check criteria, produce GO/NO-GO verdict |
| 2 (ln-400) | Orchestration | Coordinate multi-step execution workflow |
| 3 (ln-500) | Validation | Check quality, produce PASS/FAIL verdict |

### Design Principles (from Anthropic)

| Principle | Implementation |
|-----------|---------------|
| Fresh worker per stage | Prevents context exhaustion across stages |
| One worker = one responsibility | Worker invokes single skill, reports result |
| Synchronous execution | Lead waits for worker completion via heartbeat (async is future work per Anthropic) |
| Graceful shutdown only | `shutdown_request` -> worker approves. Never force-kill |
| Embed effort budgets in prompts | Don't let agents decide effort level — specify "high"/"medium" explicitly |

### Spawn & Shutdown Timing

Shutdown is **asynchronous** — worker finishes current request before exiting. This creates a race condition window between shutdown_request and actual exit.

**Mitigations:**
1. **Unique worker names** — include stage + cycle counter: `story-{id}-s{stage}-fix{cycle}`
2. **State guard on message processing** — verify `story_state[id]` matches expected stage before acting
3. **Never wait for shutdown confirmation before spawning** — unique names make it safe to overlap

## 4. Message Processing Safety

### Two-Layer Validation

Every ON handler must check **both** before processing:

```
1. SENDER VALIDATION: message.sender == worker_map[id]
   (prevents stale messages from old/dead workers)

2. STATE GUARD: story_state[id] == expected stage
   (prevents duplicate processing across heartbeats)
```

**Why both layers:** Sender validation catches messages from wrong workers. State guard catches same message delivered twice (heartbeat context replay). Neither alone is sufficient.

### Message Deduplication

Claude Code may deliver the same message in consecutive heartbeat cycles (context replay). Without state guard, an ON handler fires twice -> double spawn.

**Root cause:** Heartbeat creates new agentic loop iteration. Prior unprocessed messages may re-appear in context. The lead's state transition (e.g., `story_state[id] = "STAGE_2"`) is the only reliable deduplication mechanism.

### ACK Protocol (Reliable Delivery)

Lead sends explicit ACK after processing each worker completion message. Workers defer done.flag write until ACK received.

| Step | Actor | Action |
|------|-------|--------|
| 1 | Worker | Sends completion report (no done.flag yet) |
| 2 | Lead | Processes ON handler, sends `"ACK Stage {N} for {id}"` |
| 3 | Worker | Receives ACK → writes done.flag → approves shutdown |

**Lost message handling:** No ACK → no done.flag → keepalive hook keeps worker alive → lead probes → worker retries report.

**Duplicate handling:** State guard detects duplicate → re-sends ACK (no reprocessing). This ensures retrying workers always get confirmation.

**Fallback:** After 1 retry without ACK, worker approves shutdown regardless. Lead's heartbeat verification (Phase 4, Step 3) is the final safety net.

## 5. Crash Detection

3-step protocol to distinguish normal idle from actual crash:

| Step | Action | Signal |
|------|--------|--------|
| 1. Flag | `suspicious_idle[id] = true` | TeammateIdle WITHOUT done.flag AND no COMPLETE/ERROR |
| 2. Probe | SendMessage "Status check" | Diagnostic request to worker |
| 3. Evaluate | Check response | Worker responds -> false alarm. Idle again -> crash confirmed |

**Respawn limits:** 1 retry (resume or fresh with checkpoint). 2nd crash -> PAUSED + escalate.

**What recovery cannot restore:**
- In-flight messages lost during lead downtime
- Partial kanban updates (pipeline state takes precedence)

## 6. Windows Compatibility

### Critical Issues

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| `$CLAUDE_PROJECT_DIR` undefined | Env var not available in hook shell context | Use relative paths: `bash .claude/hooks/script.sh` |
| CRLF in .sh files | Write tool uses platform default line endings | Use Bash `cp` (preserves LF from repo), not Write tool |
| Hook execution permission | Windows has no `chmod +x` | Prefix with `bash`: `bash .claude/hooks/script.sh` |

### Prevention

| Layer | Mechanism |
|-------|-----------|
| Repository | `.gitattributes` with `*.sh text eol=lf` |
| Installation | `cp` via Bash (not Write tool) for hook files |
| Settings | `bash` prefix in hook command (no env vars, no execute permission needed) |
| Troubleshooting | Check `file .claude/hooks/*.sh` — must show "ASCII text", not "CRLF" |

### Sleep Prevention (Windows)

Pipeline runs can exceed Windows idle timeout, causing the system to sleep mid-execution.

| Aspect | Details |
|--------|---------|
| API | `SetThreadExecutionState(ES_CONTINUOUS \| ES_SYSTEM_REQUIRED)` via PowerShell P/Invoke |
| Script | `references/hooks/prevent-sleep.ps1` — started as background process in Phase 3 |
| Lifecycle | Polls `.pipeline/state.json` every 30s. Self-terminates when `complete=true` or file disappears |
| Fallback | Process exit auto-releases execution state (Windows kernel guarantee) |
| Verify | `powercfg /requests` shows SYSTEM request from PowerShell while pipeline runs |

**DO NOT** call `SetThreadExecutionState` from Stop hook — hook fires every 60s, but the API needs a single call with `ES_CONTINUOUS` to hold state persistently.

### Codex CLI Performance on Windows

Codex uses PowerShell for all shell commands on Windows (hardcoded at Rust compile time: `cfg!(windows) -> ShellType::PowerShell`). Each invocation adds 5-15 seconds overhead.

**Mitigation:** `agent_runner.py` auto-detects Windows via `IS_WINDOWS` and prepends a performance hint to the prompt, directing Codex to prefer its built-in file read tool over shell commands. No manual configuration needed — works automatically for all agents.

| What works | What does NOT work |
|-----------|-------------------|
| Prompt hint to prefer built-in file read | `shell_environment_policy.set.SHELL` (env vars, not shell binary) |
| Batching shell commands in prompt | `allow_login_shell` (login semantics, not shell identity) |
| `agent_runner.py` auto-injection | Any `config.toml` setting (shell is compile-time) |

## 7. Concurrency & Worktrees

| Rule | Details |
|------|---------|
| Max 3 concurrent workers | Anthropic recommends right-sizing: "Too many subagents for simple queries" is anti-pattern |
| Self-detection pattern | Worker checks `git branch --show-current` at startup. If already on feature/optimize/upgrade/modernize branch → use it. If on develop/main → create worktree |
| Dependency guard before spawn | All prerequisites must be DONE before spawning dependent story's worker |

### Worktree Isolation Models

Two models depending on whether the skill runs standalone or within a pipeline:

| Model | Who Creates | Who Finalizes | When |
|-------|-------------|---------------|------|
| **Standalone** | Worker skill (ln-400) creates worktree + branch | ln-500 finalizes (commit, push, cleanup) | User invokes ln-400 directly |
| **Pipeline-Managed** | Orchestrator (ln-1000) creates worktree + branch in Phase 3.4 | ln-500 finalizes (commit, push, cleanup) | ln-1000 drives Story through 4 stages |

**Standalone model:** Each code-writing skill creates its own worktree + branch (per `shared/references/git_worktree_fallback.md`). Orchestrator only coordinates and reports.

**Pipeline-Managed model:** Orchestrator creates ONE worktree before spawning workers. All 4 stage workers (ln-300 → ln-310 → ln-400 → ln-500) inherit the same `feature/*` branch. Workers self-detect via `git branch --show-current` and skip their own worktree creation when already on a feature branch.

## 8. State Persistence

Pipeline state persisted on **every heartbeat** to `.pipeline/state.json`. Recovery loses at most one heartbeat cycle.

| What is persisted | What is NOT persisted |
|-------------------|----------------------|
| story_state, worker_map, quality_cycles, validation_retries, crash_count, story_results, infra_issues, stage_timestamps, git_stats | suspicious_idle (ephemeral, reset to false on recovery) |

**Recovery sequence:** Read state -> read checkpoints -> re-read kanban -> verify team config -> resume/respawn workers -> resume event loop.

## 9. Delegation Principles (from Anthropic)

| Principle | Application |
|-----------|-------------|
| Lead coordinates, never executes | Lead MUST NOT invoke ln-300/310/400/500 directly |
| Skills as-is | Workers call skills exactly as documented, no modifications |
| Single kanban writer | Only lead updates kanban_board.md. Workers report via SendMessage |
| Clear task boundaries per worker | Each subagent needs: objective, output format, tool guidance, boundaries |
| Don't add execution logic to orchestrator | Typecheck, git stash, linting = worker/skill responsibility, not lead's |
| bypassPermissions ≠ unrestricted tools | `mode: "bypassPermissions"` skips user prompts, but workers use only their assigned skills. Tool restriction via `tools` field not needed — skills self-limit tools internally (per agent-development least-privilege principle) |

**System Prompt Design:** For agent/worker prompt patterns (Analysis, Generation, Validation, Orchestration), see `plugin-dev:agent-development` → `references/system-prompt-design.md`. Pipeline worker prompts follow these patterns (see Section 3, Worker Prompt Patterns).

## 10. Token Efficiency

| Technique | Savings | Source |
|-----------|---------|--------|
| Metadata-only loading for lead | 10,000+ tokens per skill | SKILL_ARCHITECTURE_GUIDE.md |
| Fresh worker per stage (not reuse) | Prevents context exhaustion | Anthropic: "context exceeds 200K tokens -> truncated" |
| Checkpoint + resume | Avoids full restart on crash | Anthropic: "Avoid full restarts: expensive, frustrates users" |
| Unique naming (no duplicate spawns) | Prevents wasted stage budget | Production learning: duplicate workers = doubled cost |
| 60s heartbeat (not shorter) | ~1 heartbeat turn per minute | <30s doubles heartbeat token cost |
| Auto-compact at 80% | Prevents "agent dumb zone" | Community best practice (shanraisshan) |

### Context Degradation Prevention

Set `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80` in `settings.json` to trigger auto-compaction at 80% context usage instead of the default. Prevents degraded output quality when context fills up during long pipeline runs.

```json
{
  "env": {
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "80"
  }
}
```

Additional context management: manual `/compact` when context exceeds 50%. Use `/clear` when switching between unrelated stories. See `docs/best-practice/WORKFLOW_TIPS.md` for more tips.

---

**Version:** 1.0.0
**Last Updated:** 2026-02-13
