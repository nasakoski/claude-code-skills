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
  "error": null
}
```

### Result File Format (when --output-file used)

```markdown
<!-- AGENT_REVIEW_RESULT -->
<!-- agent: codex-review -->
<!-- timestamp: 2026-02-11T14:30:00Z -->
<!-- duration_seconds: 12.40 -->
<!-- exit_code: 0 -->

{raw agent JSON response}

<!-- END_AGENT_REVIEW_RESULT -->
```

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

**NO artificial timeouts.** Review agents (`codex-review`, `gemini-review`) run until completion or crash. Registry `timeout_seconds: 0` means no limit.

| Condition | Action |
|-----------|--------|
| Agent running, producing output | WAIT — do not interrupt |
| Agent running, no output for 10+ min | WAIT — some analyses take time |
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
                                      --> DISAGREE/UNCERTAIN? --> Challenge Round (1 max)
                                                                    |
                                              Agent DEFEND (convincing) --> Accept agent's
                                              Agent DEFEND (weak) -------> Reject (Claude wins)
                                              Agent WITHDRAW ------------> Reject
                                              Agent MODIFY (acceptable) -> Accept modified
                                              Agent MODIFY (disagree) ---> Reject
```

**Challenge process:**
1. Build prompt from `shared/agents/prompt_templates/challenge_review.md`
2. Fill: original suggestion details + Claude's counterargument
3. Save to `.agent-review/{agent}/{id}_challenge_{N}_prompt.md`
4. Run same agent with challenge prompt + `--output-file`
5. Parse response (DEFEND/WITHDRAW/MODIFY)
6. Resolution: accept only if agent provides convincing new evidence (confidence >= 85)

**"Convincing" criteria:**
- Agent cites specific standard/RFC/benchmark Claude hadn't considered
- Agent shows concrete code path Claude missed
- Agent's `confidence_after_challenge` >= 85
- Claude cannot refute the new evidence

**Debate is limited to 1 round** — no back-and-forth. If agent is not convincing in 1 round, Claude's position wins.

## Reference Passing Pattern

Standard steps before launching agents (performed inside ln-311/ln-512):

1. **Get references:** Call Linear MCP `get_issue(storyId)` for Story URL + `list_issues(parent)` for Task URLs. If project stores tasks locally → use file paths.
2. **Ensure .agent-review/:** Create `.agent-review/{agent}/` dirs. Create `.agent-review/.gitignore` (with `*` + `!.gitignore`). Add `.agent-review/` to project root `.gitignore` if missing.
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
│   ├── PROJ-123_storyreview_prompt.md
│   ├── PROJ-123_storyreview_result.md
│   ├── PROJ-123_storyreview_challenge_1_prompt.md    # debate artifact
│   ├── PROJ-123_storyreview_challenge_1_result.md    # debate artifact
│   ├── PROJ-123_codereview_prompt.md
│   └── PROJ-123_codereview_result.md
└── gemini/
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
| Chain multiple agent calls | One call per task, stateless (challenge is a separate call) |
| Hard-depend on agent availability | Always have Opus fallback |
| Run health check in parent skill | Health check inside agent review worker (ln-311/ln-512) |
| Kill agent tasks with TaskStop | Let agents complete; no artificial timeouts |
| Skip agent review phase | Agent review is MANDATORY in ln-310 Phase 5 and ln-511 Step 7 |

---
**Version:** 3.0.0
**Last Updated:** 2026-02-11
