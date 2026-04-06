---
name: ln-300-task-coordinator
description: "Analyzes Story and builds optimal task plan (1-8 tasks), then routes to create or replan. Use when Story needs task breakdown or replanning."
allowed-tools: Read, Grep, Glob, Bash, Skill, mcp__hex-graph__index_project, mcp__hex-graph__analyze_architecture, mcp__hex-graph__find_symbols, mcp__hex-graph__inspect_symbol
license: MIT
---

> **Paths:** File paths (`shared/`, `references/`, `../ln-*`) are relative to skills repo root. If not found at CWD, locate this SKILL.md directory and go up one level for repo root.

# Task Coordinator

**Type:** L2 Domain Coordinator
**Category:** 3XX Planning

Runtime-backed task planning coordinator. The runtime owns readiness gating, pause/resume, and worker result tracking.

## MANDATORY READ

Load these before execution:
- `shared/references/coordinator_runtime_contract.md`
- `shared/references/task_planning_runtime_contract.md`
- `shared/references/coordinator_summary_contract.md`
- `shared/references/environment_state_contract.md`
- `shared/references/storage_mode_detection.md`
- `shared/references/problem_solving.md`
- `shared/references/creation_quality_checklist.md`
- `shared/references/mcp_tool_preferences.md`
- `shared/references/mcp_integration_patterns.md`
- `shared/references/agent_delegation_pattern.md` (Phase 3 external validation)

## Purpose

- resolve Story context once
- build an ideal implementation task plan before checking existing tasks
- run a deterministic readiness gate
- detect `CREATE`, `ADD`, or `REPLAN`
- delegate to standalone workers

## Inputs

| Parameter | Required | Description |
|-----------|----------|-------------|
| `storyId` | Yes | Story to plan |
| `autoApprove` | No | If false, runtime may pause for readiness approval |

## Runtime

Runtime family: `task-planning-runtime`

Identifier:
- `story-{storyId}`

Phases:
1. `PHASE_0_CONFIG`
2. `PHASE_1_DISCOVERY`
3. `PHASE_2_DECOMPOSE`
4. `PHASE_3_READINESS_GATE`
5. `PHASE_4_MODE_DETECTION`
6. `PHASE_5_DELEGATE`
7. `PHASE_6_VERIFY`
8. `PHASE_7_SELF_CHECK`

Terminal phases:
- `DONE`
- `PAUSED`

## Phase Map

### Phase 1: Discovery

Resolve Story and collect only the inputs required for task planning:
- Story AC
- Technical Notes
- Context
- task provider
- project architecture and tech stack (`docs/project/architecture.md`, `docs/project/tech_stack.md`, or equivalent)
- For Stories that modify existing code in supported languages, build graph context once:
  - `index_project(path=project_root)`
  - `analyze_architecture(path=project_root, detail_level="compact")`
  - `find_symbols` + `inspect_symbol` for named components from Story AC or Technical Notes
- Use graph context to confirm real affected modules and entrypoints before decomposition

Do NOT load existing tasks here. Existing tasks load in Phase 4 only.

Checkpoint payload:
- `discovery_ready`

### Phase 2: Decompose

Build the ideal task plan from ACs only. Do not read or reference existing tasks.

Order of operations:
1. Build AC→Scenario traceability table with these exact columns: AC | Actor | (1) Trigger | (2) Entry Point | (3) Discovery | (4) Usage Context | (5) Outcome
2. Scan Entry Point, Discovery, and Usage Context cells for buildable artifacts
3. Group buildable artifacts by architectural layer using segment boundaries:
   - **Foundation:** the internal logic, data model, or service that does the work (what Entry Point calls into)
   - **Invocation:** the Entry Point itself — the named mechanism the actor uses (MCP tool, API route, CLI subcommand, UI component, chat handler)
   - **Knowledge:** the Usage Context — what the actor needs to correctly invoke the mechanism (system prompt, skill/workflow, help text, form labels, schema docs, processing templates)
   - **Wiring:** Discovery + integration — how the system finds/loads the mechanism and connects components (config registration, route mounting, startup loading, bridge wiring)
4. Each layer group becomes at least one task. A single task MUST NOT span more than one layer unless the artifact is trivially small (a config line or constant, not a new file, class, or module). When in doubt, separate.
5. When graph context exists, use it to:
   - split tasks by actual modules or symbol ownership, not guessed file groups
   - keep dependency order aligned with real callers, framework entrypoints, and public APIs
   - enrich Affected Components with real modules/symbols returned by graph analysis
6. Verify foundation-first ordering and 1-8 task count
7. Save the traceability table and layer grouping to `.hex-skills/task-planning/{identifier}_traceability.md`

Rules:
- implementation tasks only
- no tests or refactoring tasks here
- infrastructure-only tasks do not satisfy ACs that require something to *use* that infrastructure
- an invocation-layer task (builds the mechanism) does not satisfy ACs that require the actor to *know how* to use that mechanism — that is a knowledge-layer artifact
- see #17b, #17c, #17d in creation_quality_checklist.md

Checkpoint payload:
- `ideal_plan_summary`
- `traceability_table_path`

### Phase 3: Readiness Gate

Score the plan before delegation using self-check + external validation.

#### Step 1: Self-score

Scoring policy:
- `6-7` -> continue
- `4-5` -> `PAUSED` for approval or improvement
- `<4` -> blocked until plan is corrected

Self-check: verify each layer (Foundation, Invocation, Knowledge, Wiring) has at least one task when the traceability table contains buildable artifacts in the corresponding segments.

#### Step 2: External traceability validation

Launch an external agent to independently cross-reference the traceability table against the task list. The validator has no investment in the plan being correct and cannot rationalize gaps.

1. Run agent health check:
```bash
node shared/agents/agent_runner.mjs --health-check --json
```

2. If an agent is available (prefer `gemini-review`, fallback `codex-review`):
   a. Build the validation prompt from `shared/agents/prompt_templates/traceability_validator.md`
   b. Fill placeholders with Phase 1 discovery (architecture context, ACs) and Phase 2 output (traceability table, task list)
   c. Save filled prompt to `.hex-skills/task-planning/{identifier}_traceability_prompt.md`
   d. Launch agent:
```bash
node shared/agents/agent_runner.mjs \
  --agent {agent} \
  --prompt-file .hex-skills/task-planning/{identifier}_traceability_prompt.md \
  --output-file .hex-skills/task-planning/{identifier}_traceability_result.md \
  --cwd {project_dir}
```
   e. Parse result JSON for `gaps` array
   f. For each gap with `issue: "MISSING"`: readiness_score -= 1
   g. For each gap with `issue: "BUNDLED"`: readiness_score -= 0.5 (flag for review but not as severe as missing)
   h. If any MISSING gaps found: re-enter Phase 2 to address gaps before proceeding. Max 1 re-decomposition — if gaps persist after retry, PAUSE for user review.

3. If no agent is available:
   - Log: "External traceability validation skipped — no agents available"
   - Apply self-check buildable artifact gate as fallback: for each Discovery or Usage Context cell containing a buildable artifact, verify the covering task scope explicitly includes creating it. Unmatched artifact = -1.
   - Continue with degraded confidence

Checkpoint payload:
- `readiness_score`
- `readiness_findings`
- `traceability_validation` (`agent_validated`, `self_check_only`, or `redecomposed`)

### Phase 4: Mode Detection

Load existing tasks here (not before).

Detect:
- `CREATE`
- `ADD`
- `REPLAN`

Pause when mode is ambiguous.

Checkpoint payload:
- `mode_detection`

### Phase 5: Delegate

Delegate to exactly one worker:
- `ln-301-task-creator`
- `ln-302-task-replanner`

Pass the coordinator's context to the worker — do not delegate with only a story ID:
- `idealPlan`: the full ideal plan from Phase 2 (task list, scopes, AC mappings, layer classifications)
- `traceabilityTablePath`: path to the materialized traceability table from Phase 2
- `discoveryContext`: Phase 1 findings (architecture, tech stack, key files, integration points)
- In ADD mode: specify which tasks to create. The worker writes the 7-section document — it does not decide whether the task is needed.

Workers remain standalone-capable. They may optionally write `task-plan` summary artifacts, but must always return the same structured summary even without artifact writing.

Record the result through runtime `record-plan`.

### Phase 6: Verify

Verify worker result and resulting task plan outcome.

**Template compliance gate:** Fetch each created Task via `get_issue`. Run `validateTemplateCompliance(description, 'task')` from `planning-runtime/lib/template-compliance.mjs`. All tasks must pass (7 sections in order). Record `template_compliance_passed` in state. Guard blocks SELF_CHECK without it.

Checkpoint payload:
- `verification_summary`
- `final_result`
- `template_compliance_passed`

### Phase 7: Self-Check

Confirm:
- phase coverage
- readiness gate was respected
- worker result was recorded
- verification completed

Checkpoint payload:
- `pass`
- `final_result`

## Pending Decisions

Use runtime `PAUSED + pending_decision` for:
- ambiguous `ADD` vs `REPLAN`
- readiness approval for score `4-5`
- missing critical Story context

## Worker Contract

Workers:
- do not know the coordinator
- do not read runtime state
- remain standalone
- may receive `summaryArtifactPath`
- return shared summary envelope either way

Expected summary kind:
- `task-plan`

## Worker Invocation (MANDATORY)

| Phase | Worker | Context |
|-------|--------|---------|
| 5 | `ln-301-task-creator` | CREATE or ADD path |
| 5 | `ln-302-task-replanner` | REPLAN path |

```text
Skill(skill: "ln-301-task-creator", args: "{storyId} --ideal-plan {idealPlanJSON} --traceability {tablePath} --discovery {discoveryJSON}")
Skill(skill: "ln-302-task-replanner", args: "{storyId} --ideal-plan {idealPlanJSON} --traceability {tablePath} --discovery {discoveryJSON}")
```

## TodoWrite format (mandatory)

```text
- Phase 1: Discover Story context (pending)
- Phase 2: Build ideal task plan (pending)
- Phase 3a: Self-score readiness (pending)
- Phase 3b: External traceability validation (pending)
- Phase 4: Detect mode (pending)
- Phase 5: Delegate to worker (pending)
- Phase 6: Verify worker result (pending)
- Phase 7: Self-check (pending)
```

## Critical Rules

- Build the ideal plan before looking at existing tasks.
- Readiness gate is the only source of delegation readiness.
- Do not create test or refactoring tasks in this skill.
- Do not keep approval state in chat-only form.
- Consume worker summaries, not free-text worker prose.
- If Story affects existing code and hex-graph is available, do one graph discovery pass before decomposition.
- Use graph output to reduce planning ambiguity; do not invent affected components when symbol or module evidence is available.

## Definition of Done

- [ ] Runtime started with Story-scoped identifier
- [ ] Discovery checkpointed
- [ ] Ideal plan checkpointed
- [ ] Readiness gate checkpointed (includes external traceability validation or degraded-mode justification)
- [ ] Mode detection checkpointed
- [ ] Task-plan worker summary recorded
- [ ] Verification checkpointed
- [ ] Template compliance passed for all created Tasks
- [ ] Final result recorded
- [ ] Self-check passed

## Meta-Analysis

**MANDATORY READ:** Load `shared/references/meta_analysis_protocol.md`

Skill type: `planning-coordinator`. Run after all phases complete. Output to chat using the protocol format.

---
**Version:** 4.0.0
**Last Updated:** 2026-02-03
