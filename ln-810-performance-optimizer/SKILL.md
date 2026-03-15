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
| **Workers** | ln-811 (profiler) → ln-812 (researcher) → ln-813 (executor) |
| **Flow** | Sequential — each phase depends on the output of the previous |

---

## Workflow

**Phases:** Pre-flight → Parse Input → Profile → Wrong Tool Gate → Research → Set Target → Execute → Report → Meta-Analysis

---

## Phase 0: Pre-flight Checks

| Check | Required | Action if Missing |
|-------|----------|-------------------|
| Target identifiable | Yes | Block: "specify file, endpoint, or pipeline to optimize" |
| Observed metric provided | Yes | Block: "specify what metric is slow (e.g., response time, throughput)" |
| Git clean state | Yes | Block: "commit or stash changes first" |
| Test infrastructure | Yes | Block: "tests required for safe optimization" |
| Stack detection | Yes | Detect via ci_tool_detection.md |

**MANDATORY READ:** Load `shared/references/ci_tool_detection.md` for test/build detection.

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

## Phase 2: Delegate to Profiler (ln-811)

```
Skill(skill: "ln-811-performance-profiler")
```

**Delegation pattern:** Skill tool (shared context) — profiler results must be visible to researcher in Phase 4.

**Pass:** problem statement from Phase 1 + audit_report path (if provided, as hints).

**Receive:** call graph, time map, bottleneck classification, optimization hints, wrong tool indicators.

---

## Phase 3: Wrong Tool Gate

Evaluate profiler results. Exit early if optimization through code changes is not the right approach.

| Condition | Action |
|-----------|--------|
| `wrong_tool_indicators` contains `external_service_no_alternative` | EXIT: "Bottleneck is {service} latency ({X}ms). No code optimization path. Recommend: negotiate SLA / switch provider / add cache layer." |
| `wrong_tool_indicators` contains `within_industry_norm` | EXIT: "Current performance ({X}ms) is within industry norm ({Y}ms) for {operation_type}. No optimization needed." |
| `wrong_tool_indicators` contains `infrastructure_bound` | EXIT: "Bottleneck is infrastructure ({detail}). Recommend: scaling / caching / CDN." |
| `wrong_tool_indicators` contains `already_optimized` | EXIT: "Code already uses optimal patterns. Consider infrastructure scaling." |
| `wrong_tool_indicators` is empty | PROCEED to Phase 4 |

**Exit format:** Provide diagnostic report with profiling results even when exiting — the analysis itself is valuable.

---

## Phase 4: Delegate to Researcher (ln-812)

```
Skill(skill: "ln-812-optimization-researcher")
```

**Delegation pattern:** Skill tool (shared context) — researcher needs profiling results from Phase 2.

**Context available from shared conversation:** profile results, bottleneck classification, time map, optimization hints.

**Receive:** industry benchmarks, solution candidates, hypotheses (H1..H7), research sources.

---

## Phase 5: Set Target Metric

| Situation | Action |
|-----------|--------|
| User provided `target_metric` | Use as-is |
| User did not provide; ln-812 found industry benchmark | Set to industry benchmark value |
| Neither available | Set to 50% improvement as default target |

---

## Phase 6: Delegate to Executor (ln-813)

```
Agent(description: "Optimize via ln-813",
      prompt: "Execute optimization executor.

Step 1: Invoke worker:
  Skill(skill: \"ln-813-optimization-executor\")

CONTEXT:
{full context: problem statement, profile results, research hypotheses, target metric}",
      subagent_type: "general-purpose",
      isolation: "worktree")
```

**Delegation pattern:** Agent tool with worktree isolation — executor modifies code.

**MANDATORY READ:** Load `shared/references/git_worktree_fallback.md` — use optimization rows.

**Pass:** Problem statement + profile results + hypotheses + target metric.

---

## Phase 7: Collect Execution Results

**Receive from ln-813:**

| Field | Description |
|-------|-------------|
| branch | Worktree branch with optimizations |
| baseline | Original measurement |
| final | Measurement after optimizations |
| total_improvement_pct | Overall improvement |
| target_met | Whether target metric was reached |
| hypotheses_kept | List with details |
| hypotheses_discarded | List with reasons |
| files_modified | All changed files |

---

## Phase 8: Final Report

| Section | Content |
|---------|---------|
| Problem | Original target + observed metric |
| Diagnosis | Bottleneck type + detail from profiler |
| Industry Benchmark | From researcher (if found) |
| Target | User-provided or research-derived |
| Result | Final metric + improvement % |
| Optimizations Applied | Per-hypothesis: id, description, improvement % |
| Optimizations Discarded | Per-hypothesis: id, reason |
| Branch | Worker branch name for review/merge |
| Recommendations | Further improvements if target not met |

### If Target Not Met

Include gap analysis from ln-813:
- What was achieved (improvement %)
- Remaining bottlenecks from time map
- Infrastructure/architecture recommendations beyond code changes

---

## Phase 9: Meta-Analysis

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
| 6 (Execute) | All hypotheses fail | Report profiling + research as diagnostic value |
| 6 (Execute) | Worker timeout | Report partial results |

### Fatal Errors

| Error | Action |
|-------|--------|
| Target not resolvable | Block: "cannot find {target} in codebase" |
| No test infrastructure | Block: "tests required for safe optimization" |
| Dirty git state | Block: "commit or stash changes first" |

---

## References

- `../ln-811-performance-profiler/SKILL.md` (profiler worker)
- `../ln-812-optimization-researcher/SKILL.md` (researcher worker)
- `../ln-813-optimization-executor/SKILL.md` (executor worker)
- `shared/references/ci_tool_detection.md` (tool detection)
- `shared/references/git_worktree_fallback.md` (worktree isolation)
- `shared/references/meta_analysis_protocol.md` (meta-analysis)

---

## Definition of Done

- [ ] Input parsed into structured problem statement
- [ ] Full request path profiled by ln-811 (call graph, time map, bottleneck classification)
- [ ] Wrong tool gate evaluated — exit with diagnostic if optimization not feasible
- [ ] Solutions researched by ln-812 (competitive benchmarks, hypotheses)
- [ ] Target metric established (user-provided or research-derived)
- [ ] Hypotheses executed by ln-813 with keep/discard verification
- [ ] Final report with before/after metrics, applied optimizations, recommendations
- [ ] Meta-analysis completed

---

**Version:** 2.0.0
**Last Updated:** 2026-03-14
