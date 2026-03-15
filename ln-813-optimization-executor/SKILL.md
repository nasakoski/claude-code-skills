---
name: ln-813-optimization-executor
description: "Multi-file hypothesis testing with keep/discard loop, compound baselines, and experiment logging"
license: MIT
---

> **Paths:** File paths (`shared/`, `references/`, `../ln-*`) are relative to skills repo root. If not found at CWD, locate this SKILL.md directory and go up one level for repo root.

# ln-813-optimization-executor

**Type:** L3 Worker
**Category:** 8XX Optimization

Executes optimization hypotheses from the researcher using keep/discard autoresearch loop. Supports multi-file changes, compound baselines, and any optimization type (algorithm, architecture, query, caching, batching).

---

## Overview

| Aspect | Details |
|--------|---------|
| **Input** | Hypotheses (H1..H7) + profile results + problem statement |
| **Output** | Optimized code on isolated branch, per-hypothesis results, experiment log |
| **Pattern** | Autoresearch: implement → test → measure → keep/discard (compound baselines) |

---

## Workflow

**Phases:** Pre-flight → Baseline → Hypothesis Execution Loop → Report → Gap Analysis

---

## Phase 0: Pre-flight Checks

| Check | Required | Action if Missing |
|-------|----------|-------------------|
| Hypotheses provided (H1..H7) | Yes | Block — nothing to execute |
| Test infrastructure | Yes | Block (see ci_tool_detection.md) |
| Git clean state | Yes | Block (need clean baseline for revert) |
| Worktree isolation | Yes | Create per git_worktree_fallback.md |
| E2E safety test | No (recommended) | WARN — full test suite as fallback gate |

**MANDATORY READ:** Load `shared/references/git_worktree_fallback.md` — use optimization rows.
**MANDATORY READ:** Load `shared/references/ci_tool_detection.md` — use Test Frameworks + Benchmarks sections.
**MANDATORY READ:** Load [benchmark_generation.md](references/benchmark_generation.md) for auto-generating benchmarks when none exist.

### E2E Safety Test Discovery

Locate an existing e2e/integration test that exercises the optimization target's entry point. Do NOT generate new tests — only discover existing ones.

**Discovery protocol** (stop at first match):

| Priority | Method | How |
|----------|--------|-----|
| 1 | User-provided | User specifies e2e test command in problem statement |
| 2 | Route-based search | Grep e2e/integration test files for `entry_point_info.route` |
| 3 | Function-based search | Grep e2e/integration test files for `entry_point_info.function` |
| 4 | Module-based search | Grep e2e/integration test files for import of entry point module |

**Search locations** (per ci_tool_detection.md Test Frameworks):

| Stack | Glob Patterns |
|-------|--------------|
| JS/TS | `tests/e2e/**/*.{js,ts}`, `**/*.e2e.{js,ts}`, `**/*.e2e-spec.{js,ts}` |
| Python | `tests/e2e/**/*.py`, `tests/integration/**/*.py` |
| Go | `**/*_test.go` (filter by entry point reference) |
| .NET | `**/*.Tests/**/*.cs` (filter by entry point reference) |

**Output:**

| Field | Description |
|-------|-------------|
| e2e_test_command | Full command to run discovered test (e.g., `npx jest tests/e2e/alignment.test.ts`) |
| e2e_test_source | Discovery method: user / route / function / module / none |

**If not found:** Set `e2e_test_command = null`, log: `WARNING: No e2e test covers {entry_point}. Full test suite serves as functional gate.`

---

## Phase 1: Establish Baseline

Unlike function-level benchmarks, measure the **actual user-facing metric** matching the observed metric type.

### Metric Type Detection

| Observed Metric Type | How to Measure |
|---------------------|----------------|
| API response time | `curl -w "%{time_total}" -o /dev/null -s {endpoint}` or test harness |
| Function execution time | Generate benchmark per [benchmark_generation.md](references/benchmark_generation.md) |
| Pipeline throughput | Time full pipeline execution |
| Build time | `time {build_command}` |
| Query count | Instrument or count DB calls in test |

### Baseline Protocol

| Parameter | Value |
|-----------|-------|
| Runs | 5 |
| Metric | Median |
| Warm-up | 1 discarded run |
| Output | `baseline_median`, `baseline_p95` |

If measurement is not automatable (e.g., external endpoint not available in dev), use test-based proxy:
- Write/find integration test that exercises the same code path
- Measure test execution time as proxy metric

### E2E Baseline Verification

If `e2e_test_command` is not null:

| Step | Action |
|------|--------|
| 1 | Run `e2e_test_command` |
| 2 | IF PASS → record `e2e_baseline = PASS` |
| 3 | IF FAIL → BLOCK: "E2E test fails on unmodified code — cannot use as safety gate. Proceed without e2e gate." |

---

## Phase 2: Hypothesis Execution Loop

**MANDATORY READ:** Load [optimization_categories.md](references/optimization_categories.md) for pattern reference during implementation.

### Per-Hypothesis Cycle

```
FOR each hypothesis (H1..H7, ordered by expected_impact DESC):
  1. CHECK dependencies:
     IF depends on a DISCARDED hypothesis → SKIP
     IF conflicts with a KEPT hypothesis → SKIP
  2. SCOPE: Identify all files to modify (may be multiple)
  3. APPLY: Edit code
  4. VERIFY: Run tests
     IF tests FAIL (assertion) → DISCARD (revert all changes) → next
     IF tests CRASH:
       IF fixable (typo, missing import) → fix & re-run ONCE
       IF fundamental → DISCARD + log "crash: {reason}"
  4b. E2E GATE (if e2e_test_command not null):
      Run e2e_test_command
      IF FAIL → DISCARD (revert all changes) + log "e2e_regression: {details}" → next
  5. MEASURE: Run baseline measurement (same method as Phase 1), 5 runs, median
  6. COMPARE: improvement = (baseline - new) / baseline x 100
     IF improvement >= threshold → KEEP:
       git add {all_affected_files}
       git commit -m "perf(H{N}): {description} (+{improvement}%)"
       new baseline = new median
     IF improvement < threshold → DISCARD (revert all changes)
  7. LOG: Record result to experiment log
```

### Improvement Thresholds

| Bottleneck Type | Threshold | Rationale |
|-----------------|-----------|-----------|
| Architecture (batching, parallelism, caching) | 30% | Structural changes should yield large improvements |
| I/O (connection pooling, async, streaming) | 20% | I/O improvements are measurable but variable |
| CPU (algorithm, data structure, vectorization) | 10% | CPU gains tend to be smaller but reliable |

### Scope Rules

| Rule | Description |
|------|-------------|
| File scope | Multiple files allowed (not limited to single function) |
| Signature changes | Allowed if tests still pass |
| New files | Allowed (cache wrapper, batch adapter, utility) |
| New dependencies | Allowed if already in project ecosystem (e.g., using configured Redis) |
| Time budget | 45 minutes total for all hypotheses |

### Revert Protocol

| Scope | Command |
|-------|---------|
| Single file | `git checkout -- {file}` |
| Multiple files | `git checkout -- {file1} {file2} ...` |
| New files created | `git checkout -- . && git clean -fd` (safe in worktree) |

### Safety Rules

| Rule | Description |
|------|-------------|
| Compound baselines | Each KEEP becomes new baseline for next hypothesis |
| Traceability | Each KEEP = separate git commit with hypothesis ID |
| Isolation | All work in isolated worktree; never modify main worktree |
| Simplicity criterion | Marginal gain (within 2x of threshold) + significant complexity increase → prefer DISCARD |
| Dependency tracking | KEPT/DISCARDED hypotheses tracked; conflicting/dependent hypotheses auto-managed |
| Crash triage | Runtime crash → fix once if trivial (typo, import), else DISCARD |

---

## Phase 3: Report Results

### Report Schema

| Field | Description |
|-------|-------------|
| baseline | Original measurement (metric + value) |
| final | Final measurement after all kept optimizations |
| total_improvement_pct | Overall percentage improvement |
| target_met | Boolean — did we reach the target metric? |
| hypotheses_tested | Count |
| hypotheses_kept | Count with details (id, description, improvement%) |
| hypotheses_discarded | Count with reasons |
| hypotheses_skipped | Count (dependency/conflict skips) |
| branch | Worktree branch name |
| files_modified | List of all modified files across kept hypotheses |
| e2e_test | `{ command, source, baseline_passed, final_passed }` or null if unavailable |

### Experiment Log

Write to `{project_root}/.optimization/ln-813-log.tsv`:

| Column | Description |
|--------|-------------|
| timestamp | ISO 8601 |
| hypothesis_id | H1..H7 |
| description | What changed |
| bottleneck_type | Classification from profiler |
| baseline_ms | Baseline before this hypothesis |
| result_ms | New measurement after change |
| improvement_pct | Percentage change |
| status | keep / discard / skip / crash |
| commit | Git commit hash (if kept) |
| files | Comma-separated list of modified files |
| e2e_status | pass / fail / skipped (skipped when no e2e test available) |

Append to existing file if present (enables tracking across multiple runs).

---

## Phase 4: Gap Analysis (If Target Not Met)

If target metric not reached after all hypotheses:

| Section | Content |
|---------|---------|
| Achievement | What was achieved (original → final, improvement %) |
| Remaining bottlenecks | From time map: which steps still dominate |
| Infrastructure recommendations | If bottleneck requires infra changes (scaling, caching layer, CDN) |
| Further research | Optimization directions not explored in this run |

---

## Error Handling

| Error | Recovery |
|-------|----------|
| All hypotheses discarded | Report "no improvements achieved" — coordinator handles |
| Measurement inconsistent (high variance) | Increase runs to 10, use median |
| Worktree creation fails | Fall back to branch per git_worktree_fallback.md |
| Time budget exceeded | Stop loop, report partial results with hypotheses remaining |
| Multi-file revert fails | `git checkout -- .` in worktree (safe — worktree is isolated) |

---

## References

- [benchmark_generation.md](references/benchmark_generation.md) — benchmark templates per stack
- [optimization_categories.md](references/optimization_categories.md) — optimization pattern checklist
- `shared/references/ci_tool_detection.md` (test + benchmark detection)
- `shared/references/git_worktree_fallback.md` (worktree isolation)

---

## Definition of Done

- [ ] Baseline established using same metric type as observed problem
- [ ] Each hypothesis executed: implement → test → measure → keep/discard
- [ ] Compound baselines applied (each KEEP becomes new baseline)
- [ ] Dependency/conflict tracking prevents invalid hypothesis combinations
- [ ] Each kept optimization = separate git commit with hypothesis ID
- [ ] Simplicity criterion applied (marginal gain + complexity = prefer discard)
- [ ] Tests pass after all kept optimizations
- [ ] E2E safety test passes after all kept optimizations (or documented as unavailable)
- [ ] Experiment log written to `.optimization/ln-813-log.tsv`
- [ ] Report returned with baseline, final, improvement%, per-hypothesis results
- [ ] All changes on isolated branch, pushed to remote
- [ ] Gap analysis provided if target metric not met

---

**Version:** 2.0.0
**Last Updated:** 2026-03-14
