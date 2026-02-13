# Agent Teams Platform Guide

**Operational best practices for Claude Code Agent Teams (2026)**

<!-- SCOPE: Platform-level constraints, hooks, heartbeat, Windows compatibility, crash recovery, worker lifecycle. -->
<!-- DO NOT add here: skill architecture patterns -> SKILL_ARCHITECTURE_GUIDE.md, skill-specific workflows -> individual SKILL.md files -->

Based on: [Anthropic Agent Teams docs](https://code.claude.com/docs/en/agent-teams), [Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system), [Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk), and production experience with ln-1000-pipeline-orchestrator.

---

## 1. Subagents vs Agent Teams

| Dimension | Subagents (Task tool) | Agent Teams (TeamCreate) |
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

## 7. Concurrency & Worktrees

| Rule | Details |
|------|---------|
| Max 2 concurrent workers | Anthropic recommends right-sizing: "Too many subagents for simple queries" is anti-pattern |
| Worktrees created lazily | Only when 2nd worker starts (parallel mode). Solo worker uses project CWD |
| Each worker = own worktree | Anthropic: "Each agent works in independent Git Worktree, preventing overwrites" |
| Dependency guard before spawn | All prerequisites must be DONE before spawning dependent story's worker |
| Deadlock detection | If all remaining stories blocked + no active workers = ESCALATE |

## 8. State Persistence

Pipeline state persisted on **every heartbeat** to `.pipeline/state.json`. Recovery loses at most one heartbeat cycle.

| What is persisted | What is NOT persisted |
|-------------------|----------------------|
| story_state, worker_map, quality_cycles, validation_retries, crash_count, priority_queue_ids, story_results, infra_issues, worktree_map, depends_on | suspicious_idle (ephemeral, reset to false on recovery) |

**Recovery sequence:** Read state -> read checkpoints -> re-read kanban -> verify team config -> resume/respawn workers -> resume event loop.

## 9. Delegation Principles (from Anthropic)

| Principle | Application |
|-----------|-------------|
| Lead coordinates, never executes | Lead MUST NOT invoke ln-300/310/400/500 directly |
| Skills as-is | Workers call skills exactly as documented, no modifications |
| Single kanban writer | Only lead updates kanban_board.md. Workers report via SendMessage |
| Clear task boundaries per worker | Each subagent needs: objective, output format, tool guidance, boundaries |
| Don't add execution logic to orchestrator | Typecheck, git stash, linting = worker/skill responsibility, not lead's |

## 10. Token Efficiency

| Technique | Savings | Source |
|-----------|---------|--------|
| Metadata-only loading for lead | 10,000+ tokens per skill | SKILL_ARCHITECTURE_GUIDE.md |
| Fresh worker per stage (not reuse) | Prevents context exhaustion | Anthropic: "context exceeds 200K tokens -> truncated" |
| Checkpoint + resume | Avoids full restart on crash | Anthropic: "Avoid full restarts: expensive, frustrates users" |
| Unique naming (no duplicate spawns) | Prevents wasted stage budget | Production learning: duplicate workers = doubled cost |
| 60s heartbeat (not shorter) | ~1 heartbeat turn per minute | <30s doubles heartbeat token cost |

---

**Version:** 1.0.0
**Last Updated:** 2026-02-13
