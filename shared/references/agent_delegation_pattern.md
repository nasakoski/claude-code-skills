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
| 311 (Story Agent Review) | codex-review + gemini-review | parallel | Self-review (if both fail) | Story/Tasks review via ln-311 |
| 502 (Code Agent Review) | codex-review + gemini-review | parallel | Self-review (if both fail) | Code review via ln-502 |

## Dedicated Agent Review Skills

Agent review is encapsulated in dedicated worker skills, not inline in parent skills:

| Worker Skill | Parent | Purpose | Prompt Template |
|-------------|--------|---------|-----------------|
| **ln-311-agent-reviewer** | ln-310 Phase 5 | Story/Tasks review | `story_review.md` |
| **ln-502-agent-reviewer** | ln-501 Step 7 | Code implementation review | `code_review.md` |

**Benefits:**
- Health check + prompt execution in single invocation (minimal timing gap — solves API limit detection problem)
- SRP: parent skills focus on their domain logic, agent communication is isolated
- Content materialization: Story/Tasks loaded from Linear, saved to `.agent-review/` in CWD for sandbox-safe agent access

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
6. **Materialize content** -- save Story/Tasks to `.agent-review/` files, reference by path in prompt

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
Phase 5: AGENT REVIEW ← delegated to ln-311 (ln-310) or ln-502 (ln-501)
Phase 6: DELEGATE
Phase 7: AGGREGATE
Phase 8: REPORT
```

## Startup: Agent Availability Check

**Health check is performed inside the dedicated agent review skills (ln-311, ln-502), NOT in parent skills.**

```bash
python shared/agents/agent_runner.py --health-check
```

**HARD RULES:**
1. **ALWAYS execute the EXACT command above** — copy-paste, no modifications, no substitutions.
2. **Do NOT invent alternative checks** (e.g., `where`, `which`, `--version`, PATH lookup). ONLY the command above is valid.
3. **Only command output determines availability.** Do NOT reason about file existence, environment, or installation — run the command and read its output.
4. **If command fails** (file not found, import error, any exception) → treat as "all agents unavailable" → return SKIPPED verdict.

Filter output by `skill_groups` matching current skill (e.g., "311" for ln-311, "502" for ln-502).

| Command Output | Impact |
|----------------|--------|
| >=1 review agent OK | Run agents, return suggestions |
| All agents UNAVAILABLE | Return `{verdict: "SKIPPED"}` |
| Command error/not found | Same as UNAVAILABLE |

## Parallel Aggregation Pattern

Run multiple agents in parallel, aggregate results from all successful responses:

```
             +-- Agent A --> success? --> collect suggestions --+
Prompt ------+                                                  +---> Dedup + Filter -> Claude Validates -> Apply accepted
             +-- Agent B --> success? --> collect suggestions --+
                              both fail? -> Self-Review fallback
```

**Rules:**
1. Each call is stateless (same prompt, same CWD, no session resume)
2. Both agents receive identical prompt and run simultaneously
3. Collect `suggestions[]` from all successful responses
4. Deduplicate by `(area, issue)` — keep higher confidence
5. Filter: `confidence >= 90` AND `impact_percent > 2`
6. Fallback logic:
   - Both succeed -> aggregate suggestions from both agents
   - One fails -> use successful agent's suggestions only, log failed agent
   - Both fail -> return SKIPPED; parent skill falls back to Self-Review
7. Log all attempts for user visibility (agent name, duration, suggestion count)
8. Same JSON schema expected from all agents

**Active Configurations:**

| Worker Skill | Agents (parallel) | Fallback | Prompt Template |
|-------------|-------------------|----------|-----------------|
| ln-311-agent-reviewer | codex-review + gemini-review | SKIPPED -> ln-310 Self-Review | story_review.md |
| ln-502-agent-reviewer | codex-review + gemini-review | SKIPPED -> ln-501 Self-Review | code_review.md |

## Content Materialization Pattern

Standard steps before launching agents (performed inside ln-311/ln-502):

1. **Load from Linear:** `get_issue(storyId)` + `list_issues(parent: storyId)` via MCP
2. **Materialize:** Create `.agent-review/` in project CWD, save `story-{id}.md` + `tasks-{id}.md`
3. **Ensure `.gitignore`:** Add `.agent-review/` entry if missing
4. **Build prompt:** Load template, replace `{story_url}` (Linear URL), `{story_file}` and `{tasks_file}` (filenames)
5. **Save prompt:** To temp file (`%TEMP%` on Windows, `/tmp` on Unix)
6. **Run agents:** `--prompt-file {temp_file} --cwd {project_dir}` — agents read `.agent-review/` files from CWD
7. **Cleanup:** Delete `.agent-review/` directory after agents complete

**Why `.agent-review/` inside project CWD:**
- Codex `--sandbox read-only` restricts file access to `--cwd` — temp files outside CWD are inaccessible
- Gemini runs in CWD by default — relative paths work reliably
- Dual reference in prompt: Linear URL (informational) + file path (for reading)

## Verdict Escalation Rules

| Worker | Escalation? | Mechanism |
|--------|-------------|-----------|
| ln-311 (Story Review) | No | Suggestions are editorial; ln-310 Gate verdict unchanged |
| ln-502 (Code Quality) | Yes | Findings with `area=security` or `area=correctness` can escalate PASS -> CONCERNS in ln-501 |

## Anti-Patterns

| DON'T | DO |
|-------|-----|
| Auto-retry in runner | Let skill decide fallback |
| Embed full story/task content in prompt | Materialize to `.agent-review/` files in CWD |
| Save temp files outside project CWD | Save in `.agent-review/` inside project (sandbox-safe) |
| Trust agent output blindly | Claude validates/analyzes response |
| Use agents for file writes | Use agents for analysis/planning only |
| Chain multiple agent calls | One call per task, stateless |
| Hard-depend on agent availability | Always have Opus fallback |
| Run health check in parent skill | Health check inside agent review worker (ln-311/ln-502) |

---
**Version:** 2.0.0 (BREAKING: Agent review extracted to dedicated skills ln-311/ln-502. Reference-based prompts. Health check moved inside worker skills.)
**Last Updated:** 2026-02-08
