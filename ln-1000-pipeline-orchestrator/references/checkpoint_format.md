# Checkpoint Format & Resume Protocol

Checkpoint files enable crash recovery without restarting stages from scratch.

## File Location

```
{project_root}/.pipeline/
  state.json              # Global pipeline state (lead writes)
  checkpoint-{storyId}.json  # Per-story checkpoint (worker writes)
```

## Checkpoint Schema

| Field | Type | Description |
|-------|------|-------------|
| `storyId` | string | Story identifier (e.g., "PROJ-42") |
| `stage` | number | Current stage (0-3) |
| `agentId` | string | Worker's agent ID for Task resume |
| `tasksCompleted` | string[] | Task IDs already finished |
| `tasksRemaining` | string[] | Task IDs still pending |
| `lastAction` | string | Description of last completed action |
| `timestamp` | string | ISO 8601 timestamp |

**Example:**
```json
{
  "storyId": "PROJ-42",
  "stage": 2,
  "agentId": "abc-123-def",
  "tasksCompleted": ["PROJ-101", "PROJ-102", "PROJ-103"],
  "tasksRemaining": ["PROJ-104", "PROJ-105"],
  "lastAction": "PROJ-103 completed, moved to To Review",
  "timestamp": "2026-02-13T14:30:00Z"
}
```

## Pipeline State Schema

| Field | Type | Description |
|-------|------|-------------|
| `complete` | boolean | `false` while pipeline running, `true` before cleanup |
| `active_workers` | number | Current worker count |
| `stories_remaining` | number | Stories not yet DONE/PAUSED |
| `last_check` | string | ISO 8601 timestamp of last state update |

## Resume Protocol

Lead executes on confirmed crash (3-step protocol passed):

```
1. Read checkpoint: .pipeline/checkpoint-{id}.json

2. Try resume (preserves full agent context):
   Task(resume: checkpoint.agentId)
   IF resume succeeds → worker continues where it left off → DONE

3. Fallback — new worker with checkpoint context:
   prompt = worker_prompt(story, checkpoint.stage) + CHECKPOINT_RESUME block
   Task(name: "story-{id}-retry", prompt: prompt, mode: "bypassPermissions", ...)
```

**CHECKPOINT_RESUME block** (appended to worker prompt):
```
CHECKPOINT RESUME — DO NOT re-execute completed work.
Tasks already completed: {tasksCompleted joined by ", "}
Tasks remaining: {tasksRemaining joined by ", "}
Last action: {lastAction}
Continue from remaining tasks only.
```

## Worker Write Protocol

Workers write checkpoints at these points:

| Stage | When to Write | Key Fields |
|-------|--------------|------------|
| 0 (ln-300) | After tasks created | tasksCompleted=[], tasksRemaining=[created task IDs] |
| 1 (ln-310) | After validation | tasksCompleted=[], tasksRemaining=[] (validation is atomic) |
| 2 (ln-400) | After EACH task completes | Move task ID from remaining to completed |
| 3 (ln-500) | After quality gate | tasksCompleted=[all], tasksRemaining=[] |

**Stage 2 is critical** — most work happens here, checkpoints after each task prevent losing progress.

---
**Version:** 1.0.0
**Last Updated:** 2026-02-13
