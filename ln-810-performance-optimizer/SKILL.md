---
name: ln-810-performance-optimizer
description: "Sequential diagnostic pipeline: profile → research → optimize with full-stack bottleneck analysis"
license: MIT
---

> **Paths:** File paths (`shared/`, `references/`, `../ln-*`) are relative to skills repo root. If not found at CWD, locate this SKILL.md directory and go up one level for repo root.

# ln-810-performance-optimizer

**Type:** L2 Domain Coordinator
**Category:** 8XX Optimization

Sequential diagnostic pipeline for performance optimization. Profiles the full request stack, classifies bottlenecks, researches industry solutions, and tests optimization hypotheses — rather than assuming the bottleneck type upfront.

---

## Overview

| Aspect | Details |
|--------|---------|
| **Input** | `target` (endpoint/function/pipeline) + `observed_metric` (e.g., "6300ms response time") + optional `target_metric` |
| **Output** | Optimized code with verification proof, or diagnostic report with recommendations |
| **Workers** | ln-811 (profiler) → ln-812 (researcher) → ln-813 (plan validator) → ln-814 (executor) |
| **Flow** | Sequential — each phase depends on the output of the previous |

---

## Workflow

**Phases:** Pre-flight → Parse Input → Profile → Wrong Tool Gate → Research → Set Target → Write Context → Validate Plan → Execute → Collect → Report → Meta-Analysis

---

## Phase 0: Pre-flight Checks

| Check | Required | Action if Missing |
|-------|----------|-------------------|
| Target identifiable | Yes | Block: "specify file, endpoint, or pipeline to optimize" |
| Observed metric provided | Yes | Block: "specify what metric is slow (e.g., response time, throughput)" |
| Git clean state | Yes | Block: "commit or stash changes first" |
| Test infrastructure | Yes | Block: "tests required for safe optimization" |
| Stack detection | Yes | Detect via ci_tool_detection.md |
| Service topology | No | Detect multi-service architecture (see below) |
| State file | No | If `.optimization/state.json` exists → resume from last completed gate |

**MANDATORY READ:** Load `shared/references/ci_tool_detection.md` for test/build detection.

### Service Topology Detection

Detect if optimization target spans multiple services with accessible code:

| Signal | How to Detect | Result |
|--------|--------------|--------|
| Git submodules | `git submodule status` — non-empty output | List of service paths |
| Monorepo | `ls` for `services/`, `packages/`, `apps/` directories with independent package files | List of service paths |
| Docker Compose | `docker-compose.yml` / `compose.yml` — map service names to build contexts | List of service paths + ports |
| Workspace config | `pnpm-workspace.yaml`, Cargo workspace, Go workspace | List of module paths |

**Output:** `service_topology` — map of service names to code paths. Pass to ln-811 for cross-service tracing.

If single-service (no signals): `service_topology = null` — standard single-codebase profiling.

### State Persistence

Save `.optimization/state.json` after each gate completion. Enables resume on interruption.

```json
{
  "target": "src/api/endpoint.py::handler",
  "last_gate": "gate_1",
  "profile_complete": true,
  "research_complete": false,
  "strike_complete": false
}
```

On startup: if state file exists, ask user: "Resume from {last_gate}?" or "Start fresh?"

---

## Phase 1: Parse Input

Parse user input into structured problem statement:

| Field | Source | Example |
|-------|--------|---------|
| target | User-specified | `src/api/alignment.py::align_endpoint`, `/api/v1/align`, `alignment pipeline` |
| observed_metric | User-specified | `{ value: 6300, unit: "ms", type: "response_time" }` |
| target_metric | User-specified OR Phase 5 | `{ value: 500, unit: "ms" }` or null |
| audit_report | Optional | Path to ln-650 output (additional hints for profiler) |

If `target_metric` not provided by user, defer to Phase 5 (after research establishes industry benchmark).

---

## Phase 2: Profile — DELEGATE to ln-811

**Do NOT trace code, read function bodies, or profile yourself. INVOKE the profiler skill.**

**Invoke:** `Skill(skill: "ln-811-performance-profiler")`

**Pass:** problem statement from Phase 1 + audit_report path (if provided).

ln-811 will: discover/create test → run baseline (multi-metric) → static analysis + suspicion stack → instrument → build performance map.

**Receive:** performance_map, suspicion_stack, optimization_hints, wrong_tool_indicators, e2e_test info.

---

## Phase 3: Wrong Tool Gate (4-Level Verdict)

Evaluate profiler results using structured verdict (adapted from ln-500 quality gate model).

| Verdict | Condition | Action |
|---------|-----------|--------|
| **PROCEED** | `wrong_tool_indicators` empty, measurements stable | Continue to Phase 4 (research) |
| **CONCERNS** | Measurement variance > 20% OR baseline unstable OR partial metrics only | Continue with warning — note uncertainty in context file |
| **BLOCK** | `external_service_no_alternative` OR `infrastructure_bound` OR `already_optimized` OR `within_industry_norm` | EXIT with diagnostic report. The profiling data itself is valuable |
| **WAIVED** | User explicitly overrides BLOCK ("try anyway") | Continue despite indicators — log user override |

### BLOCK Diagnostics

| Indicator | Diagnostic Message |
|-----------|-------------------|
| `external_service_no_alternative` | "Bottleneck is {service} latency ({X}ms). Recommend: negotiate SLA / switch provider / add cache layer." |
| `within_industry_norm` | "Current performance ({X}ms) is within industry norm ({Y}ms). No optimization needed." |
| `infrastructure_bound` | "Bottleneck is infrastructure ({detail}). Recommend: scaling / caching / CDN." |
| `already_optimized` | "Code already uses optimal patterns. Consider infrastructure scaling." |

**Exit format:** Always provide diagnostic report with performance_map — the profiling data is valuable regardless of verdict.

---

## Phase 4: Research — DELEGATE to ln-812

**Do NOT research benchmarks or generate hypotheses yourself. INVOKE the researcher skill.**

**Invoke:** `Skill(skill: "ln-812-optimization-researcher")`

**Context available:** performance_map from Phase 2 (in shared conversation).

ln-812 will: competitive analysis → bottleneck-specific research → local codebase check → generate hypotheses H1..H7.

**Receive:** industry_benchmark, hypotheses (H1..H7 with conflicts_with), local_codebase_findings, research_sources.

---

## Phase 5: Set Target Metric

| Situation | Action |
|-----------|--------|
| User provided `target_metric` | Use as-is |
| User did not provide; ln-812 found industry benchmark | Set to industry benchmark value |
| Neither available | Set to 50% improvement as default target |

---

## Phase 6: Write Optimization Context

Serialize diagnostic results from Phases 2-5 into structured context.

- **Normal mode:** write `.optimization/context.md` in project root — input for ln-814
- **Plan mode:** write same structure to plan file (file writes restricted) → call ExitPlanMode

**Context file structure:**

| Section | Source | Content |
|---------|--------|---------|
| Problem Statement | Phase 1 | target, observed_metric, target_metric |
| Performance Map | ln-811 | Full performance_map (real measurements: baseline, per-step metrics, bottleneck classification) |
| Suspicion Stack | ln-811 | Confirmed + dismissed suspicions with evidence |
| Industry Benchmark | ln-812 | expected_range, source, recommended_target |
| Hypotheses | ln-812 | Table: ID, description, bottleneck_addressed, expected_impact, complexity, risk, files_to_modify, conflicts_with |
| Dependencies/Conflicts | ln-812 | H2 requires H1; H3 conflicts with H1 (used by ln-814 for contested vs uncontested triage) |
| Local Codebase Findings | ln-812 | Batch APIs, cache infra, connection pools found in code |
| Test Command | ln-811 | Command used for profiling (reused for post-optimization measurement) |
| E2E Test | ln-811 | E2E safety test command + source (functional gate for executor) |
| Instrumented Files | ln-811 | List of files with active instrumentation (ln-814 cleans up after strike) |

---

## Phase 7: Validate Plan — DELEGATE to ln-813

**Do NOT validate the plan yourself. INVOKE the plan validator.**

**Invoke:** `Skill(skill: "ln-813-optimization-plan-validator")`

ln-813 will: agent review (Codex + Gemini) + own feasibility check → GO/GO_WITH_CONCERNS/NO_GO.

**Receive:** verdict, corrections applied to context.md, agent feedback summary.

| Verdict | Action |
|---------|--------|
| GO | Proceed to Phase 8 |
| GO_WITH_CONCERNS | Proceed with warnings logged |
| NO_GO | Present issues to user. Ask: proceed (WAIVE) or stop |

---

## Phase 8: Execute — DELEGATE to ln-814

**In Plan Mode:** SKIP this phase. Context file from Phase 6 IS the plan. Call ExitPlanMode.

**Do NOT implement optimizations yourself. INVOKE the executor skill.**

**Invoke:** `Skill(skill: "ln-814-optimization-executor")`

ln-814 will: read context → create worktree → strike-first (apply all) → test → measure → bisect if needed → report.

**Receive:** branch, baseline, final, strike_result, hypotheses_applied/removed, contested_results, results_comparison.

---

## Phase 9: Collect Execution Results

**Receive from ln-814:**

| Field | Description |
|-------|-------------|
| branch | Worktree branch with optimizations |
| baseline | Original measurement |
| final | Measurement after optimizations |
| total_improvement_pct | Overall improvement |
| target_met | Whether target metric was reached |
| strike_result | `clean` / `bisected` / `failed` |
| hypotheses_applied | IDs applied in strike |
| hypotheses_removed | IDs removed during bisect (with reasons) |
| contested_results | Per-group: alternatives tested, winner, measurement |
| files_modified | All changed files |

---

## Phase 10: Final Report

| Section | Content |
|---------|---------|
| Problem | Original target + observed metric |
| Diagnosis | Bottleneck type + detail from profiler |
| Industry Benchmark | From researcher (if found) |
| Target | User-provided or research-derived |
| Result | Final metric + improvement % + strike result (clean/bisected/failed) |
| Optimizations Applied | Hypotheses applied in strike: id, description |
| Optimizations Removed | Hypotheses removed during bisect: id, reason |
| Contested Alternatives | Per-group: alternatives tested, winner, measurement delta |
| Branch | Worker branch name for review/merge |
| Recommendations | Further improvements if target not met |

### If Target Not Met

Include gap analysis from ln-814:
- What was achieved (improvement %)
- Remaining bottlenecks from time map
- Infrastructure/architecture recommendations beyond code changes

---

## Phase 11: Meta-Analysis

**MANDATORY READ:** Load `shared/references/meta_analysis_protocol.md`

Skill type: `optimization-coordinator`.

---

## Error Handling

### Per-Phase Errors

| Phase | Error | Recovery |
|-------|-------|----------|
| 2 (Profile) | Cannot trace target | Report "cannot identify code path for {target}" |
| 3 (Gate) | Wrong tool exit | Report diagnosis + recommendations, do NOT proceed |
| 4 (Research) | No solutions found | Report bottleneck but "no known optimization pattern for {type}" |
| 7 (Validate) | NO_GO verdict | Present issues to user, offer WAIVE or stop |
| 8 (Execute) | All hypotheses fail | Report profiling + research as diagnostic value |
| 8 (Execute) | Worker timeout | Report partial results |

### Fatal Errors

| Error | Action |
|-------|--------|
| Target not resolvable | Block: "cannot find {target} in codebase" |
| No test infrastructure | Block: "tests required for safe optimization" |
| Dirty git state | Block: "commit or stash changes first" |

---

## Plan Mode Support: Phased Gate Pattern

Alternates between plan mode (approval gates) and execution.

```
GATE 1 — Plan profiling
  Plan Mode: Phase 0-1 (preflight, parse input)
  → Present: what will be profiled, which test, which metrics
  → ExitPlanMode (user approves profiling)

EXECUTE 1 — Run profiling
  Phase 2: Skill("ln-811") — runtime profiling (needs Bash)
  Phase 3: Wrong Tool Gate (evaluate real measurements)
  → If wrong tool → EXIT with diagnostic

GATE 2 — Plan research & execution
  EnterPlanMode: present performance_map to user
  Phase 4: Skill("ln-812") — research (read-only, runs in plan mode)
  Phase 5: Set target metric
  Phase 6: Write context file
  → Present: hypotheses, target, execution plan
  → ExitPlanMode (user approves strike)

EXECUTE 2 — Validate + Execute
  Phase 7: Skill("ln-813") — agent-validated plan review (GO/NO_GO)
  Phase 8: Skill("ln-814") — strike execution
  Phase 9-11: Collect, report, meta-analysis
```

---

## References

- `../ln-811-performance-profiler/SKILL.md` (profiler worker)
- `../ln-812-optimization-researcher/SKILL.md` (researcher worker)
- `../ln-813-optimization-plan-validator/SKILL.md` (plan validator worker)
- `../ln-814-optimization-executor/SKILL.md` (executor worker)
- `shared/references/ci_tool_detection.md` (tool detection)
- `shared/references/meta_analysis_protocol.md` (meta-analysis)

---

## Definition of Done

- [ ] Input parsed into structured problem statement
- [ ] Full request path profiled by ln-811 (call graph, time map, suspicion stack)
- [ ] Wrong tool gate evaluated — exit with diagnostic if optimization not feasible
- [ ] Solutions researched by ln-812 (benchmarks, hypotheses with conflicts_with)
- [ ] Target metric established (user-provided or research-derived)
- [ ] Context file written (.optimization/context.md)
- [ ] Plan validated by ln-813 (agent review + feasibility check → GO/NO_GO)
- [ ] Strike-first execution by ln-814 (applied/removed/contested)
- [ ] Final report with before/after metrics, strike result, contested alternatives
- [ ] Meta-analysis completed

---

**Version:** 2.0.0
**Last Updated:** 2026-03-14
