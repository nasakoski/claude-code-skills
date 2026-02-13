---
name: ln-1000-pipeline-orchestrator
description: "Meta-orchestrator (L0): reads kanban board, drives Stories through pipeline 300->310->400->500 in parallel via TeamCreate. Max 2 concurrent Stories. Auto-PR on quality gate PASS."
---

> **Paths:** File paths (`shared/`, `references/`, `../ln-*`) are relative to skills repo root. If not found at CWD, locate this SKILL.md directory and go up one level for repo root.

# Pipeline Orchestrator

Meta-orchestrator that reads the kanban board, builds a priority queue of Stories, and drives them through the full pipeline (task planning -> validation -> execution -> quality gate) using Claude Code Agent Teams for parallel Story processing.

## Purpose & Scope
- Parse kanban board and build Story priority queue
- Ask business questions in ONE batch before execution; make technical decisions autonomously
- Spawn per-story workers via TeamCreate (max 2 concurrent)
- Drive each Story through 4 stages: ln-300 -> ln-310 -> ln-400 -> ln-500
- Auto-create PR after quality gate PASS
- Handle failures, retries, and escalation to user

## Hierarchy

```
L0: ln-1000-pipeline-orchestrator (TeamCreate lead, delegate mode)
  +-- Story Workers (Sonnet, per-story, persistent between stages)
       +-- L1: ln-300 / ln-310 / ln-400 / ln-500 (invoked via Skill tool, as-is)
            +-- L2/L3: existing hierarchy unchanged
```

**Key principle:** ln-1000 does NOT modify existing skills. Workers invoke ln-300/ln-310/ln-400/ln-500 through Skill tool exactly as a human operator would.

## Task Storage Mode

**MANDATORY READ:** Load `shared/references/storage_mode_detection.md` for Linear vs File mode detection and operations.

## When to Use
- Multiple Stories ready for processing across kanban board statuses
- Need end-to-end automation: task planning -> validation -> execution -> quality gate -> PR
- Want parallel Story processing with minimal manual intervention

## Pipeline: 4-Stage State Machine

**MANDATORY READ:** Load `references/pipeline_states.md` for transition rules and guards.

```
Backlog       --> Stage 0 (ln-300) --> Backlog      --> Stage 1 (ln-310) --> Todo
(no tasks)        create tasks         (tasks exist)      validate            |
                                                          | NO-GO             |
                                                          v                   v
                                                       [retry/ask]    Stage 2 (ln-400)
                                                                             |
                                                                             v
                                                                      To Review
                                                                             |
                                                                             v
                                                                      Stage 3 (ln-500)
                                                                       |          |
                                                                      PASS       FAIL
                                                                       |          v
                                                                     Done    To Rework -> Stage 2
                                                                     + PR      (max 2 cycles)
```

| Stage | Skill | Input Status | Output Status |
|-------|-------|-------------|--------------|
| 0 | ln-300-task-coordinator | Backlog (no tasks) | Backlog (tasks created) |
| 1 | ln-310-story-validator | Backlog (tasks exist) | Todo |
| 2 | ln-400-story-executor | Todo / To Rework | To Review |
| 3 | ln-500-story-quality-gate | To Review | Done / To Rework |

## Team Lead Responsibilities

This skill runs as a **team lead** in delegate mode. The agent executing ln-1000 MUST NOT write code or invoke skills directly.

| Responsibility | Description |
|---------------|-------------|
| **Coordinate** | Assign stages to workers, process completion reports, advance pipeline |
| **Verify** | Re-read kanban after each stage, ASSERT expected state transitions |
| **Update** | Single writer to kanban_board.md — workers never edit the board |
| **Escalate** | Route failures to user when retry limits exceeded |
| **Create PRs** | Auto-create PR after quality gate PASS (lead-only action) |
| **Shutdown** | Graceful worker shutdown, team cleanup |

**NEVER do as lead:** Invoke ln-300/ln-310/ln-400/ln-500 directly. Edit source code. Skip quality gate. Force-kill workers.

## Workflow

### Phase 1: Discovery & Kanban Parsing

**MANDATORY READ:** Load `references/kanban_parser.md` for parsing patterns.

1. Auto-discover `docs/tasks/kanban_board.md` (or Linear API via storage mode detection)
2. Parse all status sections: Backlog, Todo, In Progress, To Review, To Rework
3. Extract Story list with: ID, title, status, Epic name, task presence
4. Build priority queue:
   ```
   Priority: To Review > To Rework > In Progress > Todo > Backlog
   ```
5. Filter: skip Stories in Done, Postponed, Canceled
6. Detect task presence per Story:
   - Has `_(tasks not created yet)_` → **no tasks** → Stage 0
   - Has task lines (4-space indent) → **tasks exist** → Stage 1+
7. Show pipeline plan to user:
   ```
   Pipeline Plan:
   | # | Story | Current Status | Tasks? | Target Stage | Action |
   |---|-------|---------------|--------|-------------|--------|
   | 1 | PROJ-42 | To Review | yes | Stage 3 | Quality gate |
   | 2 | PROJ-38 | To Rework | yes | Stage 2 | Re-execute with fix tasks |
   | 3 | PROJ-45 | Todo | yes | Stage 2 | Execute |
   | 4 | PROJ-50 | Backlog | yes | Stage 1 | Validate |
   | 5 | PROJ-55 | Backlog | no | Stage 0 | Create tasks |
   ```

### Phase 2: Pre-flight Questions (ONE batch)

1. Load Story descriptions (metadata only) for top stories in pipeline scope
2. Scan for business ambiguities — questions where:
   - Answer cannot be found in codebase, docs, or standards
   - Answer requires business/product decision (payment provider, auth flow, UI preference)
3. Collect ALL business questions into single AskUserQuestion:
   ```
   "Before starting pipeline:
    Story PROJ-42: Which payment provider? (Stripe/PayPal/both)
    Story PROJ-45: Auth flow — JWT or session-based?"
   ```
4. Technical questions — resolve autonomously:
   - Library versions: MCP Ref / Context7
   - Architecture patterns: project docs + CLAUDE.md
   - Standards compliance: ln-310 Phase 2 handles this
5. Store answers in shared context (pass to workers via spawn prompt)

**Skip Phase 2** if no business questions found. Proceed directly to Phase 3.

### Phase 3: Team Setup

**MANDATORY READ:** Load `references/settings_template.json` for required permissions and hooks.

#### 3.1 Pre-flight: Settings Verification

Verify `.claude/settings.local.json` in target project:
- `defaultMode` = `"bypassPermissions"` (required for workers)
- `hooks.Stop` registered → `pipeline-keepalive.sh`
- `hooks.TeammateIdle` registered → `worker-keepalive.sh`

If missing or incomplete → copy from `references/settings_template.json` and install hook scripts:
```
Copy references/hooks/pipeline-keepalive.sh → .claude/hooks/pipeline-keepalive.sh
Copy references/hooks/worker-keepalive.sh  → .claude/hooks/worker-keepalive.sh
```

#### 3.2 Initialize Pipeline State

```
Write .pipeline/state.json:
  { "complete": false, "active_workers": 0, "stories_remaining": N, "last_check": <now> }
```

#### 3.3 Create Team & Spawn Workers

1. Create team:
   ```
   TeamCreate(team_name: "pipeline-{YYYY-MM-DD}")
   ```

2. Spawn workers for top 2 Stories from priority queue:
   ```
   Task(
     name: "story-{storyId}",
     team_name: "pipeline-{date}",
     model: "sonnet",
     mode: "bypassPermissions",
     subagent_type: "general-purpose",
     prompt: <worker prompt from references/worker_prompts.md>
   )
   ```

3. Each worker receives:
   - Story ID and title
   - Current status and target stage
   - Business question answers (from Phase 2)
   - Instruction to wait for lead's stage command

### Phase 4: Execution Loop

**MANDATORY READ:** Load `references/message_protocol.md` for exact message formats and parsing regex.
**MANDATORY READ:** Load `references/worker_health_contract.md` for crash detection and respawn rules.

**Lead operates in delegate mode — coordination only, no code writing.**

**MANDATORY READ:** Load `references/checkpoint_format.md` for checkpoint schema and resume protocol.

#### Communication Rules

```
FORBIDDEN PATTERNS (lead and workers):
- Reading ~/.claude/teams/*/inboxes/*.json directly
- Bash sleep loops for polling messages
- Parsing internal JSON formats (permission_request, idle_notification)
- Any filesystem access to ~/.claude/ internal structures

CORRECT PATTERNS:
- Messages arrive automatically as conversation turns (TeammateIdle notifications)
- Use SendMessage(type: "message") for all communication
- Use SendMessage(type: "shutdown_request") for shutdown
- Lead processes messages in event-driven style (ON ... handlers below)
```

```
# --- INITIALIZATION ---
active_workers = 0                    # Current worker count (invariant: <= 2)
quality_cycles = {}                   # {storyId: count} — FAIL→retry counter, limit 2
validation_retries = {}               # {storyId: count} — NO-GO retry counter, limit 1
crash_count = {}                      # {storyId: count} — crash respawn counter, limit 1
suspicious_idle = {}                  # {storyId: bool} — crash detection flag
story_state = {}                      # {storyId: "STAGE_0"|"STAGE_1"|"STAGE_2"|"STAGE_3"|"DONE"|"PAUSED"}
worker_map = {}                       # {storyId: worker_name}

# Initialize counters for all queued stories
FOR EACH story IN priority_queue:
  quality_cycles[story.id] = 0
  validation_retries[story.id] = 0
  crash_count[story.id] = 0
  suspicious_idle[story.id] = false
  story_state[story.id] = "QUEUED"

# --- MAIN LOOP ---
WHILE ANY story_state[id] NOT IN ("DONE", "PAUSED"):

  # 1. Spawn workers for queued stories (respecting concurrency limit)
  WHILE active_workers < 2 AND priority_queue NOT EMPTY:
    story = priority_queue.pop()
    target_stage = determine_stage(story)    # See pipeline_states.md guards
    worker_name = "story-{story.id}"
    Task(name: worker_name, team_name: "pipeline-{date}",
         model: "sonnet", mode: "bypassPermissions",
         subagent_type: "general-purpose",
         prompt: worker_prompt(story, target_stage, business_answers))
    worker_map[story.id] = worker_name
    story_state[story.id] = "STAGE_{target_stage}"
    active_workers++
    Write .pipeline/worker-{worker_name}-active.flag     # For TeammateIdle hook
    Update .pipeline/state.json: active_workers, last_check
    SendMessage(recipient: worker_name,
                content: "Execute Stage {target_stage} for {story.id}",
                summary: "Stage {target_stage} assignment")

  # 2. Process worker messages (event handlers)
  ON "Stage 0 COMPLETE for {id}. {N} tasks created. Plan score: {score}/4":
    Re-read kanban board
    ASSERT tasks exist under Story {id}         # Guard: verify ln-300 output
    IF tasks missing: story_state[id] = "PAUSED"; ESCALATE; CONTINUE
    story_state[id] = "STAGE_1"
    SendMessage(recipient: worker_map[id],
                content: "Proceed to Stage 1", summary: "{id} → Stage 1")

  ON "Stage 0 ERROR for {id}: {details}":
    story_state[id] = "PAUSED"
    active_workers--
    ESCALATE to user: "Cannot create tasks for Story {id}: {details}"
    SendMessage(type: "shutdown_request", recipient: worker_map[id])
    # Loop continues → spawns next story from queue

  ON "Stage 1 COMPLETE for {id}. Verdict: GO. Readiness: {score}":
    Re-read kanban board
    ASSERT Story {id} status = Todo              # Guard: verify ln-310 output
    story_state[id] = "STAGE_2"
    SendMessage(recipient: worker_map[id],
                content: "Proceed to Stage 2", summary: "{id} → Stage 2")

  ON "Stage 1 COMPLETE for {id}. Verdict: NO-GO. Readiness: {score}":
    validation_retries[id]++
    IF validation_retries[id] <= 1:
      SendMessage(recipient: worker_map[id],
                  content: "Re-run Stage 1 (auto-fix attempt)", summary: "{id} Stage 1 retry")
    ELSE:
      story_state[id] = "PAUSED"
      active_workers--
      ESCALATE to user: "Story {id} failed validation twice: {reason}"
      SendMessage(type: "shutdown_request", recipient: worker_map[id])

  ON "Stage 2 COMPLETE for {id}. All tasks Done":
    Re-read kanban board
    ASSERT Story {id} status = To Review         # Guard: verify ln-400 output
    story_state[id] = "STAGE_3"
    SendMessage(recipient: worker_map[id],
                content: "Proceed to Stage 3", summary: "{id} → Stage 3")

  ON "Stage 3 COMPLETE for {id}. Verdict: PASS|CONCERNS|WAIVED. Quality Score: {score}":
    story_state[id] = "DONE"
    active_workers--
    Remove .pipeline/worker-{worker_map[id]}-active.flag
    Update .pipeline/state.json: active_workers, stories_remaining, last_check
    Auto PR (see Phase 4a below)
    Update kanban: Story → Done
    SendMessage(type: "shutdown_request", recipient: worker_map[id])
    # Loop continues → spawns next story from queue

  ON "Stage 3 COMPLETE for {id}. Verdict: FAIL. Quality Score: {score}":
    quality_cycles[id]++
    IF quality_cycles[id] < 2:
      story_state[id] = "STAGE_2"
      SendMessage(recipient: worker_map[id],
                  content: "Quality gate FAIL. Fix tasks created. Re-enter Stage 2.",
                  summary: "{id} FAIL → Stage 2")
    ELSE:
      story_state[id] = "PAUSED"
      active_workers--
      ESCALATE to user: "Story {id} failed quality gate {quality_cycles[id]} times"
      SendMessage(type: "shutdown_request", recipient: worker_map[id])

  ON worker TeammateIdle WITHOUT prior completion message for {id}:
    # Crash detection: 3-step protocol (see worker_health_contract.md)
    # Step 1: Flag suspicious
    suspicious_idle[id] = true
    # Step 2: Probe
    SendMessage(recipient: worker_map[id],
                content: "Status check: are you still working on Stage {N} for {id}?",
                summary: "{id} health check")
    # Step 3: Evaluate
    ON worker responds with parseable status:
      suspicious_idle[id] = false           # False alarm, continue
    ON TeammateIdle again WITHOUT response:
      crash_count[id]++
      IF crash_count[id] <= 1:
        active_workers--
        # Resume protocol (see checkpoint_format.md):
        checkpoint = read(".pipeline/checkpoint-{id}.json")
        IF checkpoint.agentId exists:
          Task(resume: checkpoint.agentId)          # Try 1: full context resume
        ELSE:
          new_prompt = worker_prompt(story, checkpoint.stage) + CHECKPOINT_RESUME block
          Task(name: "story-{id}-retry", team_name: "pipeline-{date}",
               mode: "bypassPermissions", subagent_type: "general-purpose",
               prompt: new_prompt)                  # Try 2: checkpoint-based new worker
        worker_map[id] = new_worker_name
        active_workers++
      ELSE:
        story_state[id] = "PAUSED"
        active_workers--
        ESCALATE: "Story {id} worker crashed twice at Stage {N}"
```

**`determine_stage(story)` routing:** See `references/pipeline_states.md` Stage-to-Status Mapping table.

#### Phase 4a: Auto PR Creation

After Stage 3 PASS for each Story:
1. Verify feature branch exists: `git branch --list "feature/{id}-*"`
2. Push branch: `git push -u origin feature/{id}-{slug}`
3. Create PR:
   ```bash
   gh pr create --title "{storyId}: {Story Title}" --body "$(cat <<'EOF'
   ## Summary
   - Pipeline: ln-300 (tasks) -> ln-310 (validation) -> ln-400 (execution) -> ln-500 (quality gate)
   - Quality Score: {score}/100
   - Gate Verdict: PASS

   ## Stories & Tasks
   {task list with status}

   ## Test plan
   - [ ] Verify PR diff matches Story acceptance criteria
   - [ ] Run CI pipeline

   Generated by ln-1000-pipeline-orchestrator
   EOF
   )"
   ```
4. Store PR URL for final report

### Phase 5: Cleanup & Self-Verification

```
# 0. Signal pipeline complete (allows Stop hook to pass)
Write .pipeline/state.json: { "complete": true, ... }

# 1. Wait for all active workers to complete
ASSERT active_workers == 0

# 2. Self-verify against Definition of Done
verification = {
  kanban_parsed:    priority_queue was built          # Phase 1 ✓
  questions_asked:  business_answers stored OR none   # Phase 2 ✓
  team_created:     team exists                       # Phase 3 ✓
  all_processed:    ALL story_state[id] IN ("DONE", "PAUSED")  # Phase 4 ✓
  prs_created:      EVERY "DONE" story has PR URL     # Phase 4a ✓
}
IF ANY verification == false: WARN user with details

# 3. Show pipeline summary
```
```
Pipeline Complete:
| Story | Stage 0 | Stage 1 | Stage 2 | Stage 3 | PR | Final State |
|-------|---------|---------|---------|---------|-----|------------|
| PROJ-42 | skip | skip | skip | PASS 92 | #123 | DONE |
| PROJ-55 | 5 tasks | GO | Done | PASS 85 | #125 | DONE |
| PROJ-60 | skip | NO-GO | — | — | — | PAUSED |
```
```
# 4. Shutdown remaining workers (if any still active)
FOR EACH worker_name IN worker_map.values():
  SendMessage(type: "shutdown_request", recipient: worker_name)

# 5. Cleanup team
TeamDelete

# 6. Remove pipeline state files
Delete .pipeline/ directory

# 7. Report all PR URLs to user
```

## Kanban as Single Source of Truth

- **Lead = single writer** to kanban_board.md. Workers report results via SendMessage; lead updates the board
- **Re-read board** after each stage completion for fresh state
- **Update algorithm:** Follow `shared/references/kanban_update_algorithm.md` for Epic grouping and indentation

## Error Handling

| Situation | Detection | Action |
|-----------|----------|--------|
| ln-300 task creation fails | Worker reports error | Escalate to user: "Cannot create tasks for Story {id}" |
| ln-310 NO-GO (Score <5) | Worker reports NO-GO | Retry once (ln-310 auto-fixes). If still NO-GO -> ask user |
| Task in To Rework 3+ times | Worker reports rework loop | Escalate: "Task X reworked 3 times, need input" |
| ln-500 FAIL | Worker reports FAIL verdict | Fix tasks auto-created by ln-500. Stage 2 re-entry. Max 2 quality cycles |
| Worker crash | TeammateIdle without completion msg | Re-spawn worker, resume from last stage |
| All Stories blocked | Empty actionable queue | Report to user, cleanup team |
| Business question mid-execution | Worker encounters ambiguity | Worker -> lead -> user -> lead -> worker (message chain) |
| PR creation fails | gh CLI error | Report error, Story stays Done, user creates PR manually |

## Critical Rules

1. **Max 2 concurrent Stories.** Never spawn more than 2 story-workers simultaneously
2. **Delegate mode.** Lead coordinates only — never invoke ln-310/ln-400/ln-500 directly. Workers do all execution
3. **Skills as-is.** Never modify or bypass existing skill logic. Workers call `Skill("ln-310-story-validator", args)` exactly as documented
4. **Single kanban writer.** Only lead updates kanban_board.md. Workers report via SendMessage
5. **Quality cycle limit.** Max 2 FAIL->retry cycles per Story. After 2nd FAIL, escalate to user
6. **PR per Story.** Each Story that passes quality gate gets its own PR. No batch PRs
7. **Re-read kanban.** After every stage completion, re-read board for fresh state. Never cache
8. **Graceful shutdown.** Always shutdown workers via shutdown_request. Never force-kill

## Anti-Patterns
- Running ln-300/ln-310/ln-400/ln-500 directly from lead instead of delegating to workers
- Spawning >2 workers simultaneously
- Updating kanban from worker (only lead updates)
- Skipping quality gate after execution
- Creating PR before quality gate PASS
- Caching kanban state instead of re-reading
- Reading `~/.claude/teams/*/inboxes/*.json` directly (messages arrive automatically)
- Using `sleep` + filesystem polling for message checking
- Parsing internal Claude Code JSON formats (permission_request, idle_notification)

## Plan Mode Support

When invoked in Plan Mode, generate execution plan without creating team:

1. Parse kanban board (Phase 1)
2. Build priority queue
3. Show pipeline plan table (which Stories, which stages)
4. Write plan to plan file, call ExitPlanMode

**Plan Output Format:**
```
## Pipeline Plan for {date}

| # | Story | Status | Stage | Skill | Expected Outcome |
|---|-------|--------|-------|-------|-----------------|
| 1 | {ID}: {Title} | To Review | 3 | ln-500 | Done + PR |
| 2 | {ID}: {Title} | Todo | 2 | ln-400 | To Review |

### Execution Sequence
1. TeamCreate("pipeline-{date}")
2. Spawn story-worker for {Story-1} -> Stage 3 (ln-500)
3. Spawn story-worker for {Story-2} -> Stage 2 (ln-400)
4. Wait for completions, advance stages, create PRs
5. Cleanup
```

## Definition of Done (self-verified in Phase 5)

| # | Criterion | Verified By |
|---|-----------|-------------|
| 1 | Kanban board parsed, priority queue built | `priority_queue` was populated |
| 2 | Business questions asked in single batch (or none found) | `business_answers` stored OR skip |
| 3 | Team created, workers spawned (max 2 concurrent) | `active_workers` never exceeded 2 |
| 4 | ALL Stories processed: state = DONE or PAUSED | `ALL story_state[id] IN ("DONE", "PAUSED")` |
| 5 | PR created for every DONE Story | Every DONE story has PR URL |
| 6 | Pipeline summary shown with PR URLs | Phase 5 table output |
| 7 | Team cleaned up (workers shutdown, TeamDelete) | `active_workers == 0`, TeamDelete called |

## Reference Files
- **Message protocol:** `references/message_protocol.md`
- **Worker health:** `references/worker_health_contract.md`
- **Checkpoint format:** `references/checkpoint_format.md`
- **Settings template:** `references/settings_template.json`
- **Hooks:** `references/hooks/pipeline-keepalive.sh`, `references/hooks/worker-keepalive.sh`
- **Kanban parsing:** `references/kanban_parser.md`
- **Pipeline states:** `references/pipeline_states.md`
- **Worker prompts:** `references/worker_prompts.md`
- **Kanban update algorithm:** `shared/references/kanban_update_algorithm.md`
- **Storage mode detection:** `shared/references/storage_mode_detection.md`
- **Auto-discovery patterns:** `shared/references/auto_discovery_pattern.md`
- **Skills invoked:** `../ln-300-task-coordinator/SKILL.md`, `../ln-310-story-validator/SKILL.md`, `../ln-400-story-executor/SKILL.md`, `../ln-500-story-quality-gate/SKILL.md`

---
**Version:** 1.0.0
**Last Updated:** 2026-02-13
