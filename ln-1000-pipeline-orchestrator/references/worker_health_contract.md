# Worker Health Contract

Worker lifecycle, health monitoring, and crash recovery for pipeline story workers.

## Worker Lifecycle

```
SPAWNED ──→ EXECUTING ──→ REPORTING ──→ IDLE ──→ EXECUTING (next stage)
                │                         │
                │                         └──→ SHUTDOWN (graceful, lead request)
                │
                └──→ CRASHED (no completion message, idle without report)
```

| State | Description | Duration |
|-------|------------|----------|
| SPAWNED | Task() called, worker initializing | Seconds |
| EXECUTING | Worker running ln-300/310/400/500 via Skill tool | Minutes to hours (ln-400 can be long) |
| REPORTING | Worker sends "Stage N COMPLETE/ERROR" to lead | Seconds |
| IDLE | TeammateIdle notification, waiting for lead command | Until lead sends next command |
| SHUTDOWN | Worker received shutdown_request, approved, exiting | Seconds |
| CRASHED | Worker stopped without sending completion message | Detected by lead |

## Health Signal Matrix

| Signal | Meaning | Lead Action |
|--------|---------|-------------|
| Worker sends "Stage N COMPLETE" | Healthy, stage done | Process result, advance per pipeline_states.md |
| Worker sends "Stage N ERROR" | Healthy, stage failed | Process error, decide retry/pause |
| TeammateIdle WITH prior COMPLETE/ERROR in same turn | Normal: reporting then idle | Assign next stage or shutdown |
| TeammateIdle WITHOUT prior COMPLETE/ERROR | Suspicious: possible crash | Enter Crash Detection Protocol |
| No notification at all | Worker still executing | WAIT — do NOT interrupt. ln-400/ln-500 can run 30+ min |

**Critical rule:** TeammateIdle is NORMAL between turns. Do NOT treat idle as error. Only suspicious when idle arrives without completion message for current stage.

## Crash Detection Protocol

3-step protocol. Goal: distinguish normal idle from actual crash with minimal false positives.

```
# Step 1: Flag suspicious
ON TeammateIdle for worker_map[id] WITHOUT "Stage N COMPLETE/ERROR":
  suspicious_idle[id] = true
  last_known_stage[id] = story_state[id]

# Step 2: Probe
SendMessage(recipient: worker_map[id],
            content: "Status check: are you still working on Stage {N} for {id}?",
            summary: "{id} health check")

# Step 3: Evaluate response
ON worker responds with parseable status:
  suspicious_idle[id] = false              # False alarm, worker alive
  # Continue normal operation

ON TeammateIdle again WITHOUT response:
  # Confirmed crash
  crash_count[id]++
  IF crash_count[id] <= 1:
    Respawn (see Respawn Rules below)
  ELSE:
    story_state[id] = "PAUSED"
    active_workers--
    ESCALATE: "Story {id} worker crashed twice at Stage {N}. Manual intervention required."
```

## Respawn Rules (Resume + Checkpoint)

When crash confirmed (Step 3). See `references/checkpoint_format.md` for checkpoint schema.

1. **Shutdown old worker** (best effort — may already be dead):
   ```
   SendMessage(type: "shutdown_request", recipient: worker_map[id])
   ```

2. **Decrement counter:**
   ```
   active_workers--
   ```

3. **Try resume with agentId** (preserves full conversation context):
   ```
   checkpoint = read(".pipeline/checkpoint-{id}.json")
   IF checkpoint.agentId exists:
     Task(resume: checkpoint.agentId)
     # If resume succeeds → worker continues exactly where it left off
   ```

4. **Fallback: new worker with checkpoint context** (if resume fails or no checkpoint):
   ```
   new_worker = "story-{id}-retry"
   new_prompt = worker_prompt(story, checkpoint.stage, business_answers) + """
     CHECKPOINT RESUME — DO NOT re-execute completed work.
     Tasks already completed: {checkpoint.tasksCompleted}
     Tasks remaining: {checkpoint.tasksRemaining}
     Last action: {checkpoint.lastAction}
     Continue from remaining tasks only.
   """
   Task(name: new_worker, team_name: "pipeline-{date}",
        model: "sonnet", mode: "bypassPermissions",
        subagent_type: "general-purpose", prompt: new_prompt)
   worker_map[id] = new_worker
   active_workers++
   ```

## Respawn Limits

| Counter | Initial | Limit | On Limit |
|---------|---------|-------|----------|
| `crash_count[id]` | 0 | 1 | 2nd crash → PAUSED + escalate |

**Rationale:** Single respawn handles transient failures (context overflow, network glitch). Double crash = systematic issue requiring human input.

## Graceful Shutdown Protocol

Lead-initiated shutdown sequence:

```
# 1. Lead sends request
SendMessage(type: "shutdown_request", recipient: worker_map[id],
            content: "Pipeline complete for {id}. Shutting down.")

# 2. Worker responds
#    - approve: true  → worker exits cleanly
#    - approve: false → worker still working, lead waits

# 3. If worker doesn't respond (already crashed)
#    → No action needed, worker already gone
#    → Lead proceeds to next story or cleanup
```

**Rule:** Always attempt graceful shutdown before cleanup. Never force-kill via TaskStop.

## Keepalive Hooks

Two hooks prevent premature termination. Installed by lead in Phase 3 from `references/hooks/`.

| Hook | File | Trigger | Exit 2 Condition |
|------|------|---------|-----------------|
| Stop | `pipeline-keepalive.sh` | Claude tries to stop | `.pipeline/state.json` has `complete: false` |
| TeammateIdle | `worker-keepalive.sh` | Worker goes idle | `.pipeline/worker-{name}-active.flag` exists |

**Lead responsibilities:**
- Write `.pipeline/state.json` with `complete: false` at pipeline start (Phase 3)
- Create `.pipeline/worker-{name}-active.flag` when assigning stage
- Remove flag when worker reports stage completion
- Set `complete: true` in Phase 5 before cleanup

## Forbidden Patterns

Workers and lead MUST NOT use any of these patterns:

| Pattern | Why Forbidden | Correct Alternative |
|---------|-------------|-------------------|
| Read `~/.claude/teams/*/inboxes/*.json` | Internal format, undocumented, fragile | Messages arrive automatically as conversation turns |
| `sleep N` + poll loop | Blocks agent, can't receive messages while sleeping | WAIT (idle) — Claude Code delivers messages |
| Parse `permission_request` JSON | Internal protocol, changes without notice | Use `mode: "bypassPermissions"` at spawn |
| Parse `idle_notification` JSON | Internal protocol | Use TeammateIdle hook or ON handlers |
| `Bash(cat ~/.claude/...)` | Internal file structure | Use SendMessage for all communication |

---
**Version:** 1.0.0
**Last Updated:** 2026-02-13
