# Agent Delegation Pattern

Standard pattern for skills delegating work to external CLI AI agents (Codex, Gemini, OpenCode) via `shared/agents/agent_runner.py`.

## When to Use

- Skill benefits from model specialization (planning, code analysis, structured review)
- Second opinion on generated plans or validation results
- Claude Opus remains meta-orchestrator; external agents are workers

## Agent Selection Matrix

| Skill Group | Primary Agent | Model | Fallback | Use Case |
|-------------|--------------|-------|----------|----------|
| 200 (Decomposition) | Gemini | gemini-3-pro | Opus | Scope analysis, epic planning |
| 300 (Task Mgmt) | Codex | gpt-5.3-codex | Opus | Task decomposition, plan review |
| 400 (Execution) | Opus (native) | claude-opus-4-6 | -- | Direct code writing |
| 310 (Validation) | codex-review + gemini-review | parallel | Self-review (if both fail) | Story/Tasks review (Phase 5) |
| 402 (Code Review) | codex-review + gemini-review | parallel | Self-review (if both fail) | Code implementation review (Step 6) |

## Invocation Pattern

```bash
# Short prompt
python shared/agents/agent_runner.py --agent codex --prompt "Review this plan..."

# Large context via file (recommended for Windows)
python shared/agents/agent_runner.py --agent gemini --prompt-file /tmp/prompt.md --cwd /project

# With timeout
python shared/agents/agent_runner.py --agent codex --prompt-file /tmp/plan.md --timeout 600
```

## Runner Output Contract

```json
{
  "success": true,
  "agent": "codex",
  "response": "...",
  "duration_seconds": 12.4,
  "error": null
}
```

## Prompt Guidelines

1. **Be specific** -- state exactly what output format you expect
2. **Include filtering rules** -- confidence thresholds, impact minimums
3. **Use prompt-file** -- avoids Windows shell escaping for long text
4. **Request JSON** -- easier to parse programmatically
5. **Keep scope narrow** -- one task per call, not multi-step workflows

## Fallback Rules

| Condition | Action |
|-----------|--------|
| `success == false` | Log error, continue with Opus (native) |
| Response unparseable | Treat as plain text, Claude interprets |
| Timeout | Log, continue with Opus |
| Low-quality response | Skill re-runs task natively |

## Integration Points in Orchestrator Lifecycle

```
Phase 1: DISCOVERY
Phase 2: PLAN ← external agent for analysis/decomposition
Phase 3: MODE DETECTION
Phase 4: AUTO-FIX ← 19 criteria, Penalty Points = 0 (ln-310)
Phase 5: AGENT REVIEW ← parallel: codex+gemini, fallback: self (ln-310)
Phase 6: DELEGATE
Phase 7: AGGREGATE
Phase 8: REPORT
```

## Parallel Aggregation Pattern

Run multiple agents in parallel, aggregate results from all successful responses:

```
             ┌─ Agent A ──→ success? ──→ collect suggestions ─┐
Prompt ──────┤                                                 ├──→ Dedup + Filter → Claude Validates → Apply accepted
             └─ Agent B ──→ success? ──→ collect suggestions ─┘
                              both fail? → Self-Review fallback
```

**Rules:**
1. Each call is stateless (same prompt, same CWD, no session resume)
2. Both agents receive identical prompt and run simultaneously
3. Collect `suggestions[]` from all successful responses
4. Deduplicate by `(area, issue)` — keep higher confidence
5. Filter: `confidence >= 90` AND `impact_percent > 10`
6. Fallback logic:
   - Both succeed → aggregate suggestions from both agents
   - One fails → use successful agent's suggestions only, log failed agent
   - Both fail → Self-Review fallback (native Claude, always succeeds)
7. Log all attempts for user visibility (agent name, duration, suggestion count)
8. Same JSON schema expected from all agents

**Active Configurations:**

| Skill | Agents (parallel) | Fallback | Prompt Template |
|-------|-------------------|----------|-----------------|
| ln-310 Phase 5 | codex-review + gemini-review | Self-Review | story_review.md |
| ln-402 Step 6 | codex-review + gemini-review | Self-Review | code_review.md |

## Prompt Preparation

Standard steps before launching agents (applies to all Parallel Aggregation calls):

1. Load template: `Read("shared/agents/prompt_templates/{template}.md")`
2. Replace placeholders: `{story_content}`, `{tasks_content}`, `{task_content}` with actual text from prior phases
3. Save expanded prompt to scratchpad temp file (NOT `/tmp` on Windows)
4. Pass `--prompt-file {temp_file} --cwd {project_dir}` to agent_runner.py

## Verdict Escalation Rules

| Skill | Escalation? | Mechanism |
|-------|-------------|-----------|
| ln-310 (Story Review) | No | ACCEPTED suggestions modify Story/Tasks text only; Gate verdict unchanged |
| ln-402 (Code Review) | Yes | Findings with `area=security` or `area=correctness` can escalate Done → To Rework |

**Key difference:** ln-310 reviews plans (text), so suggestions are editorial. ln-402 reviews code, so security/correctness findings are blocking.

## Anti-Patterns

| DON'T | DO |
|-------|-----|
| Auto-retry in runner | Let skill decide fallback |
| Pass entire codebase as text | Run agent in project cwd (sees files) |
| Trust agent output blindly | Claude validates/analyzes response |
| Use agents for file writes | Use agents for analysis/planning only |
| Chain multiple agent calls | One call per task, stateless |
| Hard-depend on agent availability | Always have Opus fallback |

---
**Version:** 1.0.0
**Last Updated:** 2026-02-07
