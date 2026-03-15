---
name: ln-811-performance-profiler
description: "Full-stack request tracing, time map estimation, and bottleneck classification"
license: MIT
---

> **Paths:** File paths (`shared/`, `references/`, `../ln-*`) are relative to skills repo root. If not found at CWD, locate this SKILL.md directory and go up one level for repo root.

# ln-811-performance-profiler

**Type:** L3 Worker
**Category:** 8XX Optimization

Traces the full request path from entry point to response, estimates time spent at each step, classifies bottleneck types, and reports whether the problem is optimizable or requires a different approach.

---

## Overview

| Aspect | Details |
|--------|---------|
| **Input** | Problem statement: target (file/endpoint/pipeline) + observed metric |
| **Output** | Call graph, time map, bottleneck classification, optimization hints |
| **Pattern** | Trace → Classify → Estimate → Report |

---

## Workflow

**Phases:** Trace Request Path → Classify Steps → Estimate Time Map → Bottleneck Report

---

## Phase 1: Trace Request Path

Starting from the user-specified target, trace the full call chain using depth-first traversal.

### Entry Point Resolution

| Target Type | How to Find Entry Point |
|-------------|------------------------|
| API endpoint URL | Grep for route registration (`@app.route`, `router.get`, `[HttpGet]`), find handler function |
| File path + function | Read file, locate function directly |
| Pipeline name | Find pipeline entry (CLI command handler, queue consumer, cron job) |

### Tracing Protocol

```
FOR target entry point:
  1. Read source code of entry point function
  2. Follow function calls (depth-first, max depth 5)
  3. Cross module boundaries (follow imports)
  4. Cross git submodule boundaries (read submodule code)
  5. For loops: note iteration count (from code context, variable names, or data shape)
  6. External library calls: classify type but do NOT recurse into library internals
  7. Record each step with location (file:line)
```

### What to Record per Step

| Field | Description |
|-------|-------------|
| step_id | Sequential number (1, 2, 3, 3.1 for nested) |
| location | `file_path:line_number` |
| function | Function/method name |
| type | `function_call` / `loop` / `conditional` / `http_call` / `db_query` / `file_io` / `cache_op` / `queue_op` |
| description | Brief description of what the step does |
| loop_count | Number of iterations (if loop) |
| data_dependency | Whether output feeds next step (for parallelism detection) |

### Tracing Depth Limits

| Boundary | Action |
|----------|--------|
| Max depth 5 | Stop recursion, note "analysis truncated at depth 5" |
| External library | Classify type from method name/signature, do not recurse |
| Compiled extension | Note "native code — classify by method name" |
| Dynamic dispatch | Note "dynamic dispatch — classification may be imprecise" |

---

## Phase 2: Classify Each Step

**MANDATORY READ:** Load [bottleneck_classification.md](references/bottleneck_classification.md)

For each step in the call graph, apply classification from the taxonomy.

### Classification Table

| Type | Code Indicators |
|------|----------------|
| CPU | Loops without I/O, sorting, regex, crypto, serialization, parsing |
| I/O-DB | ORM queries, raw SQL, `cursor.execute()`, `session.query()` |
| I/O-Network | `requests.*`, `httpx.*`, `fetch()`, `axios.*`, gRPC stubs, `HttpClient.*` |
| I/O-File | `open()`, `fs.*`, `File.*`, file streams |
| Architecture | Loop containing I/O (N+1), sequential I/O without data dependency, missing cache/batch |
| External | Third-party API calls (non-internal domain) |
| Cache | `redis.get/set`, `cache.get`, `@cached`, `lru_cache` |

### Architecture Pattern Detection

Check for structural patterns beyond individual step classification:

| Pattern | Detection Rule |
|---------|---------------|
| N+1 I/O | Loop body contains any I/O step (DB, HTTP, File) |
| Sequential-when-parallel | Multiple I/O steps with no data dependency between them |
| Missing batch | Client class has batch/bulk method, but caller uses single-item method in loop |
| Missing cache | Same function called with same args from multiple code paths |
| Redundant fetch | Same entity loaded by ID multiple times across call chain |

---

## Phase 3: Estimate Time Map

**MANDATORY READ:** Load [latency_estimation.md](references/latency_estimation.md)

### Estimation Priority

| Priority | Method | Accuracy |
|----------|--------|----------|
| 1 | Existing logs/traces/APM data in project | HIGH |
| 2 | Existing benchmarks | HIGH |
| 3 | Code structure analysis + heuristics from latency_estimation.md | MEDIUM |

### Time Map Construction

For each step:
1. Look up estimated latency from `latency_estimation.md` based on type
2. Apply loop multiplier: `total = single_operation x iteration_count`
3. Calculate time share: `share = step_time / total_time x 100`
4. Flag as bottleneck if `share > 20%` or `step_time > 100ms`

### Output Format

| Field | Type | Description |
|-------|------|-------------|
| step_id | string | Step identifier |
| location | string | file:line |
| type | string | Classification type |
| estimated_ms | number | Estimated time in milliseconds |
| time_share_pct | number | Percentage of total estimated time |
| is_bottleneck | boolean | True if significant time consumer |
| confidence | string | HIGH / MEDIUM / LOW |
| note | string | Additional context (e.g., "batch API available") |

---

## Phase 4: Bottleneck Report

### Report Structure

```
profile_result:
  entry_point_info:                    # Entry point metadata from Phase 1
    type: <string>                     # "api_endpoint" | "function" | "pipeline"
    location: <string>                 # file:line of entry point
    route: <string|null>               # Route path if API endpoint (e.g., "/api/v1/align")
    function: <string>                 # Entry point function name
  call_graph: [...]                    # Full trace from Phase 1
  time_map: [...]                      # Per-step estimates from Phase 3
  total_estimated_ms: <number>         # Sum of all steps
  bottleneck_classification: <string>  # Primary bottleneck type
  bottleneck_detail: <string>          # Human-readable description
  top_bottlenecks:                     # Top 3 by time share
    - step, type, share, description
  optimization_hints:                  # Observations from tracing
    - "Batch API exists: Client.batch_method()"
    - "Cache infrastructure available: Redis configured"
    - "No data dependency between steps 3 and 4 — parallelizable"
  wrong_tool_indicators: []            # Empty = proceed, non-empty = coordinator should exit
```

### Wrong Tool Indicators

Populated when optimization through code changes is not feasible:

| Indicator | Condition |
|-----------|-----------|
| `external_service_no_alternative` | 90%+ time in external service, no batch/cache/parallel path |
| `within_industry_norm` | Total time within expected range for operation type |
| `infrastructure_bound` | Bottleneck is hardware (disk IOPS, network bandwidth, memory) |
| `already_optimized` | Code already uses best patterns (batch, cache, parallel) |

---

## Error Handling

| Error | Recovery |
|-------|----------|
| Cannot resolve entry point | Block: "file/function not found at {path}" |
| Call chain too deep (> 5 levels) | Stop at depth 5, note truncation in report |
| Cannot classify step type | Default to "Unknown", include raw code snippet |
| No I/O detected (pure CPU) | Classify as CPU, note "function-level optimization appropriate" |
| Submodule not checked out | Warn: "submodule {name} not available, trace incomplete" |

---

## References

- [bottleneck_classification.md](references/bottleneck_classification.md) — classification taxonomy
- [latency_estimation.md](references/latency_estimation.md) — latency heuristics
- `shared/references/ci_tool_detection.md` — tool/infra detection

---

## Definition of Done

- [ ] Entry point resolved from target specification
- [ ] Full call graph traced (depth ≤ 5, cross-module, cross-submodule)
- [ ] Each step classified by bottleneck type
- [ ] Time map estimated with confidence levels
- [ ] Top 3 bottlenecks identified with time share percentages
- [ ] Architecture patterns detected (N+1, missing batch, missing cache, sequential-when-parallel)
- [ ] Wrong tool indicators populated if optimization not feasible
- [ ] Optimization hints provided from tracing observations
- [ ] Report returned to coordinator

---

**Version:** 2.0.0
**Last Updated:** 2026-03-14
