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
| 512 (Code Agent Review) | codex-review + gemini-review | parallel | Self-review (if both fail) | Code review via ln-512 |

## Dedicated Agent Review Skills

Agent review is encapsulated in dedicated worker skills, not inline in parent skills:

| Worker Skill | Parent | Purpose | Prompt Template |
|-------------|--------|---------|-----------------|
| **ln-311-agent-reviewer** | ln-310 Phase 5 | Story/Tasks review | `story_review.md` |
| **ln-512-agent-reviewer** | ln-511 Step 7 | Code implementation review | `code_review.md` |

**Benefits:**
- Health check + prompt execution in single invocation (minimal timing gap — solves API limit detection problem)
- SRP: parent skills focus on their domain logic, agent communication is isolated
- Reference passing: Story/Tasks provided as Linear URLs or local file paths — agents access content themselves

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
6. **Pass references** -- provide Linear URLs or file paths, let agents access content themselves
7. **Include CRITICAL CONSTRAINTS** -- enforce read-only behavior via prompt (agents must NOT modify files)

## Agent Safety Model

External agents run in non-interactive mode (`exec` / `-p`) — they process a single prompt and exit. Read-only behavior is enforced at two levels:

| Level | Codex | Gemini |
|-------|-------|--------|
| **CLI flags** | `-a never` (never prompt for approval, no sandbox — full internet access) | `--yolo` (auto-approve + sandbox enabled, `permissive-open` profile — network allowed) |
| **Prompt** | CRITICAL CONSTRAINTS section | CRITICAL CONSTRAINTS section |

**Why prompt-level enforcement:** No CLI flag combination provides "read-only + internet access" for Codex. Gemini `--yolo` enables auto-approve (required for non-interactive `-p` mode) + sandbox with default profile allows network. Prompt CRITICAL CONSTRAINTS section enforces read-only behavior as primary control layer for both agents.

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
Phase 5: AGENT REVIEW ← delegated to ln-311 (ln-310) or ln-512 (ln-511)
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
| ln-512-agent-reviewer | codex-review + gemini-review | SKIPPED -> ln-511 Self-Review | code_review.md |

## Reference Passing Pattern

Standard steps before launching agents (performed inside ln-311/ln-512):

1. **Get references:** Call Linear MCP `get_issue(storyId)` for Story URL + `list_issues(parent)` for Task URLs. If project stores tasks locally → use file paths.
2. **Ensure .agent-review/:** Create `.agent-review/{agent}/` dirs. Create `.agent-review/.gitignore` (with `*` + `!.gitignore`). Add `.agent-review/` to project root `.gitignore` if missing.
3. **Build prompt:** Load template, replace `{story_ref}` and `{task_refs}` with actual references (Linear URLs or file paths).
4. **Save prompt:** To `.agent-review/{agent_name}/{identifier}_{review_type}_prompt.md`
5. **Run agents:** `--prompt-file {prompt_path} --cwd {project_dir}` — agents access Story/Tasks via references
6. **Save results:** To `.agent-review/{agent_name}/{identifier}_{review_type}_result.md`
7. **No cleanup** — `.agent-review/` persists as audit trail

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
| Delete review artifacts after agents complete | Persist prompts and results in `.agent-review/{agent}/` |
| Trust agent output blindly | Claude validates/analyzes response |
| Use agents for file writes | Use agents for analysis/planning only |
| Chain multiple agent calls | One call per task, stateless |
| Hard-depend on agent availability | Always have Opus fallback |
| Run health check in parent skill | Health check inside agent review worker (ln-311/ln-512) |

---
**Version:** 2.0.0 (BREAKING: Agent review extracted to dedicated skills ln-311/ln-512. Reference-based prompts. Health check moved inside worker skills.)
**Last Updated:** 2026-02-08
