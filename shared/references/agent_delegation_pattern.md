# Agent Delegation Pattern

Standard pattern for skills delegating work to external CLI AI agents (Codex, Gemini) via `shared/agents/agent_runner.py`.

## When to Use

- Skill benefits from model specialization (planning, code analysis, structured review)
- Second opinion on generated plans or validation results
- Claude Opus remains meta-orchestrator; external agents are workers

## Agent Selection Matrix

| Skill Group | Primary Agent | Model | Fallback | Use Case |
|-------------|--------------|-------|----------|----------|
| 200 (Decomposition) | Gemini | gemini-3-flash-preview | Opus | Scope analysis, epic planning |
| 300 (Task Mgmt) | Codex | gpt-5.3-codex | Opus | Task decomposition, plan review |
| 400 (Execution) | Opus (native) | claude-opus-4-6 | -- | Direct code writing |
| 311 (Story Agent Review) | codex-review + gemini-review | parallel | Self-review (if both fail) | Story/Tasks review via ln-311 |
| 512 (Code Agent Review) | codex-review + gemini-review | parallel | Self-review (if both fail) | Code review via ln-512 |

## Dedicated Agent Review Skills

Agent review is encapsulated in dedicated worker skills, not inline in parent skills:

| Worker Skill | Parent | Purpose | Prompt Templates |
|-------------|--------|---------|-----------------|
| **ln-311-agent-reviewer** | ln-310 Phase 5 | Story/Tasks review | `story_review.md`, `challenge_review.md` |
| **ln-512-agent-reviewer** | ln-511 Step 7 | Code implementation review | `code_review.md`, `challenge_review.md` |

**Benefits:**
- Health check + prompt execution in single invocation (minimal timing gap)
- SRP: parent skills focus on their domain logic, agent communication is isolated
- Reference passing: Story/Tasks provided as Linear URLs or local file paths
- Critical verification: Claude independently verifies each suggestion
- Debate protocol: Claude challenges agent when disagreeing, accepts only convincing evidence

## Invocation Pattern

```bash
# Short prompt
python shared/agents/agent_runner.py --agent codex --prompt "Review this plan..."

# Large context via file with output (recommended)
python shared/agents/agent_runner.py --agent codex-review --prompt-file prompt.md --output-file result.md --cwd /project

# Resume session for debate (challenge/follow-up rounds only)
python shared/agents/agent_runner.py --agent codex-review --resume-session abc-123 --prompt-file challenge.md --output-file result.md --cwd /project

# Health check
python shared/agents/agent_runner.py --health-check
```

## Runner Output Contract

### Stdout (JSON)

```json
{
  "success": true,
  "agent": "codex-review",
  "response": "...",
  "duration_seconds": 12.4,
  "error": null,
  "session_id": "7f9f9a2e-1b3c-4c7a-9b0e-...",
  "session_resumed": false
}
```

- `session_id`: captured from agent output after execution (null if capture failed)
- `session_resumed`: true only when `--resume-session` was used and succeeded

### Result File Format (when --output-file used)

```markdown
<!-- AGENT_REVIEW_RESULT -->
<!-- agent: codex-review -->
<!-- timestamp: 2026-02-11T14:30:00Z -->
<!-- duration_seconds: 12.40 -->
<!-- exit_code: 0 -->
<!-- session_id: 7f9f9a2e-1b3c-4c7a-9b0e-... -->

{raw agent JSON response}

<!-- END_AGENT_REVIEW_RESULT -->
```

- `session_id` line is included only when captured (omitted if null)

**Behavior:**
- If agent writes to output file natively (codex `-o`): runner reads, wraps with metadata, rewrites
- If agent doesn't write (gemini): runner captures stdout, parses, writes file with metadata
- Result file always has metadata markers regardless of agent type

## Prompt Guidelines

1. **Be specific** -- state exactly what output format you expect
2. **Include filtering rules** -- confidence thresholds, impact minimums
3. **Use prompt-file** -- avoids Windows shell escaping for long text
4. **Request JSON** -- easier to parse programmatically
5. **Keep scope narrow** -- one task per call, not multi-step workflows
6. **Pass references** -- provide Linear URLs or file paths, let agents access content themselves
7. **Include CRITICAL CONSTRAINTS** -- enforce project-file read-only behavior via prompt

## Agent Safety Model

External agents run in non-interactive mode (`exec` / `-p`) with tool access for analysis:

| Level | Codex | Gemini |
|-------|-------|--------|
| **CLI flags** | `--full-auto` (full tool access for analysis: read files, run commands, internet) | `--yolo` (auto-approve + sandbox, `permissive-open` profile — network allowed) |
| **Output** | `--json` (JSONL stream) + `-o {file}` (final result to file) + `-C {cwd}` (working dir) | `--output-format json` (JSON envelope) + `-m gemini-3-flash-preview` |
| **Prompt** | CRITICAL CONSTRAINTS: read-only for PROJECT files, may write to -o output | CRITICAL CONSTRAINTS: read-only for PROJECT files |

## Agent Timeout Policy

**NO artificial timeouts — WAIT for response.** Review agents (`codex-review`, `gemini-review`) run until completion or crash. Registry `timeout_seconds: 0` means no hard process kill. Agents are instructed via prompt constraint to complete within 10 minutes. The caller MUST wait for the agent to finish — do NOT proceed without the response, do NOT use TaskStop.

| Condition | Action |
|-----------|--------|
| Agent running, producing output | WAIT — do not interrupt |
| Agent running, no output for 10+ min | WAIT — agent was instructed to finish in 10 min but may take longer. Do NOT kill. |
| Agent exited with error (non-zero) | Mark as FAILED, use other agent's results |
| Agent process crashed/disappeared | Mark as FAILED |
| User explicitly requests cancellation | Only then use TaskStop |

**FORBIDDEN:** Using TaskStop to kill agent tasks. Using timeout to prematurely end analysis. Agents have no time limit as long as they have not crashed with an error.

## Fallback Rules

| Condition | Action |
|-----------|--------|
| `success == false` | Log error, continue with Opus (native) |
| Response unparseable | Treat as plain text, Claude interprets |
| Agent crashed (non-zero exit) | Log, use other agent's results |
| Low-quality response | Skill re-runs task natively |

## Integration Points in Orchestrator Lifecycle

```
Phase 1: DISCOVERY
Phase 2: PLAN ← external agent for analysis/decomposition
Phase 3: MODE DETECTION
Phase 4: AUTO-FIX ← 20 criteria, Penalty Points = 0 (ln-310)
Phase 5: AGENT REVIEW (MANDATORY) ← delegated to ln-311 (ln-310) or ln-512 (ln-511)
Phase 6: DELEGATE
Phase 7: AGGREGATE
Phase 8: REPORT
```

## Startup: Agent Availability Check

**Health check is performed inside the dedicated agent review skills (ln-311, ln-512), NOT in parent skills.**

```bash
python shared/agents/agent_runner.py --health-check
```

**HARD RULES:**
1. **ALWAYS execute the EXACT command above** — copy-paste, no modifications, no substitutions.
2. **Do NOT invent alternative checks** (e.g., `where`, `which`, `--version`, PATH lookup). ONLY the command above is valid.
3. **Only command output determines availability.** Do NOT reason about file existence, environment, or installation — run the command and read its output.
4. **If command fails** (file not found, import error, any exception) → treat as "all agents unavailable" → return SKIPPED verdict.

Filter output by `skill_groups` matching current skill (e.g., "311" for ln-311, "512" for ln-512).

| Command Output | Impact |
|----------------|--------|
| >=1 review agent OK | Run agents, return suggestions |
| All agents UNAVAILABLE | Return `{verdict: "SKIPPED"}` |
| Command error/not found | Same as UNAVAILABLE |

## Background Execution + Process-as-Arrive Pattern

Both agents run as background tasks. First-finished agent processed immediately while second is still running.

```
              +-- Agent A (background) --> completes first --> Step 6: Verify + Debate --+
Prompt ------+                                                                           +--> Merge verified suggestions
              +-- Agent B (background) --> completes second --> Step 6: Verify + Debate --+
                               both fail? -> Self-Review fallback
```

**Rules:**
1. Launch BOTH agents as background Bash tasks (`run_in_background=true`)
2. Both agents receive identical prompt, run simultaneously with `--output-file`
3. When first agent completes (background task notification): read result file, proceed to Critical Verification
4. When second agent completes: read result file, verify, merge with first batch
5. Agents have **NO time limit** — do NOT kill background tasks (see Agent Timeout Policy)
6. If an agent fails: log failure, continue with available results
7. Log all attempts for user visibility (agent name, duration, suggestion count)

## Critical Verification + Debate Protocol

Claude MUST independently verify each agent suggestion. Do NOT trust blindly.

```
Agent Suggestion --> Claude Evaluation --> AGREE? --> Accept as-is
                                      --> DISAGREE/UNCERTAIN? --> Challenge Round 1
                                                                    |
                                              Agent DEFEND (convincing, conf >= 85) --> Accept
                                              Agent WITHDRAW -----------------------> Reject (final)
                                              Agent DEFEND (weak) ------------------> Follow-Up Round
                                              Agent MODIFY (acceptable) ------------> Accept modified
                                              Agent MODIFY (disagree) --------------> Follow-Up Round
                                                                                         |
                                              Agent DEFEND (new evidence, conf >= 85) -> Accept
                                              Agent DEFEND (same/weaker) -------------> Reject (final)
                                              Agent WITHDRAW -------------------------> Reject (final)
                                              Agent MODIFY (acceptable) --------------> Accept modified
                                              Agent MODIFY (disagree) ----------------> Reject (final)
```

### Session Resume for Debate Rounds

Challenge and follow-up rounds resume the agent's original review session to preserve full context (file analysis, reasoning, codebase understanding). Initial review always runs stateless.

1. After initial review: parse `session_id` from runner JSON output, write to `.agent-review/{agent}/{identifier}_session.json`
2. Before challenge/follow-up: read `session_id` from session file
3. Pass `--resume-session {session_id}` to runner — agent continues in same session
4. If resume fails: runner falls back to stateless execution automatically (logged as warning)

Session file format: `{"agent": "codex-review", "session_id": "...", "review_type": "storyreview", "created_at": "..."}`

### Challenge Round 1

1. Build prompt from `shared/agents/prompt_templates/challenge_review.md`
2. Fill: original suggestion details + Claude's specific counterargument
3. Save to `.agent-review/{agent}/{id}_{reviewtype}_challenge_{N}_prompt.md`
4. Read `session_id` from `.agent-review/{agent}/{identifier}_session.json`
5. Run same agent with `--resume-session {session_id}` + challenge prompt + `--output-file`
6. Parse response (DEFEND/WITHDRAW/MODIFY)

**Round 1 Resolution:**

| Agent Response | Action |
|----------------|--------|
| DEFEND + convincing evidence (confidence >= 85) | Accept agent's suggestion |
| WITHDRAW | Reject (final) |
| DEFEND + weak evidence | Proceed to Follow-Up Round |
| MODIFY + acceptable revision | Accept modified version |
| MODIFY + still disagree | Proceed to Follow-Up Round |

### Follow-Up Round (1 max, only for suggestions not resolved in Round 1)

1. Build prompt from `shared/agents/prompt_templates/challenge_review.md` with updated placeholders:
   - `{counterargument}` = Claude's specific rejection reason from Round 1, including: what evidence was insufficient, what was checked, why revision was not accepted
2. Save to `.agent-review/{agent}/{id}_{reviewtype}_followup_{N}_prompt.md`
3. Read `session_id` from `.agent-review/{agent}/{identifier}_session.json`
4. Run same agent with `--resume-session {session_id}` + follow-up prompt + `--output-file`
5. Parse response

**Follow-Up Resolution (final, no further rounds):**

| Agent Response | Action |
|----------------|--------|
| DEFEND + new evidence not seen in Round 1 (confidence >= 85) | Accept agent's suggestion |
| DEFEND + same/weaker evidence | Reject (final) |
| WITHDRAW | Reject (final) |
| MODIFY + acceptable revision | Accept modified version |
| MODIFY + still disagree | Reject (final) |

### "Convincing" Criteria

- Agent cites specific standard/RFC/benchmark Claude hadn't considered
- Agent shows concrete code path Claude missed
- Agent's `confidence_after_challenge` >= 85
- Claude cannot refute the new evidence

### Debate Limits

**Maximum 2 rounds per suggestion** (1 challenge + 1 follow-up). Follow-up only triggers for non-final rejections in Round 1. WITHDRAW in any round is always final.

## Reference Passing Pattern

Standard steps before launching agents (performed inside ln-311/ln-512):

1. **Get references:** Call Linear MCP `get_issue(storyId)` for Story URL + `list_issues(parent)` for Task URLs. If project stores tasks locally → use file paths.
2. **Ensure .agent-review/:** If `.agent-review/` exists, reuse as-is. If not, create it with `.gitignore` (content: `*` + `!.gitignore`). Create `.agent-review/{agent}/` subdirs only if they don't exist. Do NOT add `.agent-review/` to project root `.gitignore`.
3. **Build prompt:** Load template, replace `{story_ref}` and `{task_refs}` with actual references (Linear URLs or file paths).
4. **Save prompt:** To `.agent-review/{agent_name}/{identifier}_{review_type}_prompt.md`
5. **Run agents:** `--prompt-file {prompt_path} --output-file {result_path} --cwd {project_dir}` — agents access Story/Tasks via references, runner writes result file
6. **No cleanup** — `.agent-review/` persists as audit trail

**Why reference passing instead of content materialization:**
- Agents have internet access — they can read Linear directly
- No need to load full content into files (simpler workflow, fewer steps)
- If agent cannot access Linear — it reports the error clearly, user configures access
- Prompts stay focused (references instead of full content dumps)

## Review Persistence Pattern

```
.agent-review/
├── .gitignore              # * + !.gitignore
├── codex/
│   ├── PROJ-123_session.json                        # Session tracking for debate resume
│   ├── PROJ-123_storyreview_prompt.md
│   ├── PROJ-123_storyreview_result.md
│   ├── PROJ-123_storyreview_challenge_1_prompt.md    # Round 1 debate
│   ├── PROJ-123_storyreview_challenge_1_result.md    # Round 1 debate
│   ├── PROJ-123_storyreview_followup_1_prompt.md     # Follow-up (if Round 1 not resolved)
│   ├── PROJ-123_storyreview_followup_1_result.md     # Follow-up result
│   ├── PROJ-123_codereview_prompt.md
│   └── PROJ-123_codereview_result.md
└── gemini/
    ├── PROJ-123_session.json                        # Session tracking for debate resume
    ├── PROJ-123_storyreview_prompt.md
    ├── PROJ-123_storyreview_result.md
    ├── PROJ-123_codereview_prompt.md
    └── PROJ-123_codereview_result.md
```

**Benefits:**
- Full audit trail of what was asked and what was returned
- Debug agent issues by comparing prompt vs result
- Track review history across multiple Stories
- Per-agent isolation — easy to compare Codex vs Gemini quality
- Challenge artifacts show debate reasoning for transparency

## Verdict Escalation Rules

| Worker | Escalation? | Mechanism |
|--------|-------------|-----------|
| ln-311 (Story Review) | No | Suggestions are editorial; ln-310 Gate verdict unchanged |
| ln-512 (Code Quality) | Yes | Findings with `area=security` or `area=correctness` can escalate PASS -> CONCERNS in ln-511 |

## Anti-Patterns

| DON'T | DO |
|-------|-----|
| Auto-retry in runner | Let skill decide fallback |
| Embed full story/task content in prompt | Pass references (Linear URLs / file paths) |
| Delete review artifacts after agents complete | Persist prompts, results, and challenges in `.agent-review/{agent}/` |
| Trust agent output blindly | Claude critically verifies each suggestion + debates if disagreeing |
| Use agents for project file writes | Agents write only to `-o` output file; analysis-only |
| Chain multiple agent calls | One call per task; challenge/follow-up use `--resume-session` for context continuity |
| Hard-depend on agent availability | Always have Opus fallback |
| Run health check in parent skill | Health check inside agent review worker (ln-311/ln-512) |
| Kill agent tasks with TaskStop | Let agents complete; no artificial timeouts |
| Skip agent review phase | Agent review is MANDATORY in ln-310 Phase 5 and ln-511 Step 7 |

---
**Version:** 3.0.0
**Last Updated:** 2026-02-11
