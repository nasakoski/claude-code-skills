# Worker Prompt Templates

Templates for spawning story-workers via Task tool with team_name.

## Message Format Contract

**CRITICAL:** All worker reports MUST use exact message formats defined in `references/message_protocol.md`. Lead parses messages by regex — deviations trigger escalation.

**Key rules:**
- Use `SendMessage(type: "message", recipient: "pipeline-lead")` for all reports
- `content` must match exact format from protocol (Stage N COMPLETE/ERROR for {id}...)
- `summary` must be `"{id} Stage {N} {result}"` (max 10 words)
- After reporting, WAIT for lead's command — never advance to next stage autonomously

**Diagnostic response:** When lead sends `"Status check"`, respond with:
```
Status for {id}: Stage {N} {EXECUTING|WAITING|ERROR}. Current step: {description}.
```

## Communication Rules

**All workers MUST follow these rules:**
- NEVER read `~/.claude/teams/*/inboxes/*.json` or any `~/.claude/` internal files
- NEVER use `sleep` loops or filesystem polling to check for messages
- Messages from lead arrive **automatically** as conversation turns
- Use **ONLY** `SendMessage` to communicate with lead
- After reporting, WAIT — do not poll, do not sleep, do not read inbox files

## Checkpoint Protocol

Workers write checkpoint files after significant steps to enable crash recovery. See `references/checkpoint_format.md` for schema.

```
Write .pipeline/checkpoint-{storyId}.json after each significant step:
{
  "storyId": "{storyId}",
  "stage": {N},
  "agentId": <your agent ID from Task context>,
  "tasksCompleted": [<completed task IDs>],
  "tasksRemaining": [<remaining task IDs>],
  "lastAction": "<description of last completed action>",
  "timestamp": "<ISO 8601>"
}
```

| Stage | When to Write |
|-------|--------------|
| 0 | After tasks created |
| 1 | After validation completes |
| 2 | After EACH task completes (critical — most work happens here) |
| 3 | After quality gate completes |

## Spawn Template

```
Task(
  name: "story-{storyId}",
  team_name: "pipeline-{date}",
  model: "sonnet",
  mode: "bypassPermissions",
  subagent_type: "general-purpose",
  prompt: <use appropriate template below based on target stage>
)
```

## Stage 0: Task Planning (ln-300)

```
You are a pipeline worker in team "pipeline-{date}".
Your assignment: Story {storyId} "{storyTitle}"

TASK: Execute Stage 0 — Task Planning (create implementation tasks).

Step 1: Invoke task coordinator:
  Skill(skill: "ln-300-task-coordinator", args: "{storyId}")

Step 2: After ln-300 completes, check result:
  - Tasks created successfully (1-8 tasks): Report success with task count
  - Error or plan score <2/4: Report failure with details

Step 3: Write checkpoint:
  Write .pipeline/checkpoint-{storyId}.json with stage=0, tasksCompleted=[], tasksRemaining=[created task IDs]

Step 4: Report to lead:
  SendMessage(type: "message", recipient: "pipeline-lead",
    content: "Stage 0 COMPLETE for {storyId}. {N} tasks created. Plan score: {score}/4.",
    summary: "{storyId} Stage 0 {N} tasks")

Then WAIT for lead's next instruction. Do NOT proceed to Stage 1 without lead's message.
NEVER read ~/.claude/ files. NEVER use sleep loops. Messages arrive automatically.

CONTEXT:
{businessAnswers}
```

## Stage 1: Validation (ln-310)

```
You are a pipeline worker in team "pipeline-{date}".
Your assignment: Story {storyId} "{storyTitle}"

TASK: Execute Stage 1 — Story Validation.

Step 1: Invoke validation:
  Skill(skill: "ln-310-story-validator", args: "{storyId}")

Step 2: After ln-310 completes, check result:
  - If GO (Readiness >= 5, Penalty = 0): Report success to lead
  - If NO-GO: Report failure with reason to lead

Step 3: Write checkpoint:
  Write .pipeline/checkpoint-{storyId}.json with stage=1, tasksCompleted=[], tasksRemaining=[]

Step 4: Report to lead (use EXACT format per verdict):
  IF GO:
    SendMessage(type: "message", recipient: "pipeline-lead",
      content: "Stage 1 COMPLETE for {storyId}. Verdict: GO. Readiness: {score}.",
      summary: "{storyId} Stage 1 GO")
  IF NO-GO:
    SendMessage(type: "message", recipient: "pipeline-lead",
      content: "Stage 1 COMPLETE for {storyId}. Verdict: NO-GO. Readiness: {score}. Reason: {reason}",
      summary: "{storyId} Stage 1 NO-GO")

Then WAIT for lead's next instruction. Do NOT proceed to Stage 2 without lead's message.
NEVER read ~/.claude/ files. NEVER use sleep loops. Messages arrive automatically.

CONTEXT:
{businessAnswers}
```

## Stage 2: Execution (ln-400)

```
You are a pipeline worker in team "pipeline-{date}".
Your assignment: Story {storyId} "{storyTitle}"

TASK: Execute Stage 2 — Story Execution.

Step 1: Invoke executor:
  Skill(skill: "ln-400-story-executor", args: "{storyId}")

  CHECKPOINT: After EACH task completes within ln-400, update checkpoint:
    Write .pipeline/checkpoint-{storyId}.json with stage=2,
    move completed task ID from tasksRemaining to tasksCompleted

Step 2: After ln-400 completes, check result:
  - All tasks Done, Story = To Review: Report success
  - Any task stuck or error: Report issue with details

Step 3: Write final checkpoint:
  Write .pipeline/checkpoint-{storyId}.json with stage=2, all tasks in tasksCompleted

Step 4: Report to lead:
  SendMessage(type: "message", recipient: "pipeline-lead",
    content: "Stage 2 COMPLETE for {storyId}. All tasks Done. Story set to To Review.",
    summary: "{storyId} Stage 2 Done")

Then WAIT for lead's next instruction.
NEVER read ~/.claude/ files. NEVER use sleep loops. Messages arrive automatically.

CONTEXT:
{businessAnswers}
```

## Stage 3: Quality Gate (ln-500)

```
You are a pipeline worker in team "pipeline-{date}".
Your assignment: Story {storyId} "{storyTitle}"

TASK: Execute Stage 3 — Quality Gate.

Step 1: Invoke quality gate:
  Skill(skill: "ln-500-story-quality-gate", args: "{storyId}")

Step 2: After ln-500 completes, check verdict:
  - PASS: Report success with Quality Score
  - CONCERNS: Report success with notes
  - FAIL: Report failure with issues list
  - WAIVED: Report success with waiver reason

Step 3: Write checkpoint:
  Write .pipeline/checkpoint-{storyId}.json with stage=3, all tasks in tasksCompleted

Step 4: Report to lead (use EXACT format per verdict):
  IF PASS/CONCERNS/WAIVED:
    SendMessage(type: "message", recipient: "pipeline-lead",
      content: "Stage 3 COMPLETE for {storyId}. Verdict: {PASS|CONCERNS|WAIVED}. Quality Score: {score}/100.",
      summary: "{storyId} Stage 3 {verdict}")
  IF FAIL:
    SendMessage(type: "message", recipient: "pipeline-lead",
      content: "Stage 3 COMPLETE for {storyId}. Verdict: FAIL. Quality Score: {score}/100. Issues: {issues list}",
      summary: "{storyId} Stage 3 FAIL")

Then WAIT for lead's next instruction.
NEVER read ~/.claude/ files. NEVER use sleep loops. Messages arrive automatically.

CONTEXT:
{businessAnswers}
```

## Stage Continuation Prompt

When lead sends "Proceed to Stage N", worker uses:

```
SendMessage received from lead: "Proceed to Stage {N}"

Execute Stage {N} as described above.
```

## Re-entry Prompt (after FAIL)

When lead sends "Re-enter Stage 2" after quality gate FAIL:

```
SendMessage received from lead: "Quality gate FAIL. Fix tasks created. Re-enter Stage 2."

Execute Stage 2 again. ln-400 will pick up fix tasks created by ln-500
and process them through the standard To Rework -> ln-403 -> ln-402 loop.
```

---
**Version:** 1.0.0
**Last Updated:** 2026-02-13
