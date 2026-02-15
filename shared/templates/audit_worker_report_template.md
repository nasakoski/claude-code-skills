# Audit Worker Report Template

Standardized markdown format for L3 audit workers writing file-based reports.

## Why File-Based

Workers write reports to `docs/project/.audit/` instead of returning full JSON in-context. This prevents coordinator context overflow when aggregating 9+ worker results.

## File Naming

| Worker Type | Pattern | Example |
|-------------|---------|---------|
| Global workers | `62X-{slug}.md` | `621-security.md` |
| Domain-aware (domain mode) | `62X-{slug}-{domain}.md` | `623-principles-users.md` |
| Domain-aware (global fallback) | `62X-{slug}.md` | `623-principles.md` |

**Slug mapping:**

| Worker | Slug |
|--------|------|
| ln-621 | `security` |
| ln-622 | `build` |
| ln-623 | `principles` |
| ln-624 | `quality` |
| ln-625 | `dependencies` |
| ln-626 | `dead-code` |
| ln-627 | `observability` |
| ln-628 | `concurrency` |
| ln-629 | `lifecycle` |

## Report Structure

```markdown
# {Category Name} Audit Report

<!-- AUDIT-META
worker: ln-62X
category: {Category Name}
domain: {domain_name|global}
scan_path: {scan_path|.}
score: {X.X}
total_issues: {N}
critical: {N}
high: {N}
medium: {N}
low: {N}
status: complete
-->

## Checks

| ID | Check | Status | Details |
|----|-------|--------|---------|
| {check_id} | {Human-Readable Name} | {passed/failed/warning/skipped} | {Brief explanation} |

## Findings

| Severity | Location | Issue | Principle | Recommendation | Effort |
|----------|----------|-------|-----------|----------------|--------|
| CRITICAL | path/file.ts:42 | What is wrong | Rule / Sub-rule | How to fix | S |
| HIGH | path/file.ts:88 | What is wrong | Rule / Sub-rule | How to fix | M |
```

## Field Reference

### AUDIT-META Block

HTML comment block parsed by coordinator via Grep. One key-value pair per line.

| Field | Type | Description |
|-------|------|-------------|
| `worker` | string | Worker skill ID (e.g., `ln-621`) |
| `category` | string | Audit category matching `codebase_audit_template.md` sections |
| `domain` | string | Domain name or `global` for non-domain-aware workers |
| `scan_path` | string | Path scanned (e.g., `src/users`) or `.` for global |
| `score` | number | 0-10 scale per `audit_scoring.md` |
| `total_issues` | integer | Sum of all severity counts |
| `critical` | integer | CRITICAL severity count |
| `high` | integer | HIGH severity count |
| `medium` | integer | MEDIUM severity count |
| `low` | integer | LOW severity count |
| `status` | string | `complete` or `error` |

### Checks Table

Matches `audit_output_schema.md` checks array. Status values: `passed`, `failed`, `warning`, `skipped`.

### Findings Table

Columns match `codebase_audit_template.md` category sections. Coordinator copies rows directly into final report.

| Column | Required | Description |
|--------|----------|-------------|
| Severity | Yes | CRITICAL, HIGH, MEDIUM, LOW |
| Location | Yes | `path/to/file.ts:42` |
| Issue | Yes | Concise problem description |
| Principle | Yes | Category / Specific Rule |
| Recommendation | Yes | Actionable fix |
| Effort | Yes | S (<1h), M (1-4h), L (>4h) |

## FINDINGS-EXTENDED Block (ln-623 Only)

Only ln-623-code-principles-auditor includes this block for cross-domain DRY analysis. Contains JSON array with `pattern_signature` field that coordinator uses to detect same violations across domains.

```markdown
<!-- FINDINGS-EXTENDED
[{"severity":"HIGH","location":"src/users/validators/email.ts:12","issue":"Email validation duplicated","principle":"DRY","pattern_signature":"validation_email","domain":"users"}]
-->
```

Other workers do NOT include this block.

## Worker Return Value (In-Context)

After writing the report file, worker returns minimal summary to coordinator:

```
Report written: docs/project/.audit/621-security.md
Score: 7.5/10 | Issues: 5 (C:0 H:2 M:2 L:1)
```

This gives coordinator enough data for Compliance Score and Severity Summary tables without reading files.

## Writing Rules

- Build **entire report content in memory** before writing (atomic single Write call)
- If worker encounters error before completing: return error status, do NOT write partial file
- Findings table rows sorted by severity: CRITICAL first, then HIGH, MEDIUM, LOW

## Usage in Worker SKILL.md

```markdown
## Write Report

**MANDATORY READ:** Load `shared/templates/audit_worker_report_template.md` for file format.

Build report in memory, write to `{output_dir}/62X-{slug}.md`.
Return summary line to coordinator.
```

---

# Pattern Evolution Workers (ln-640)

ln-640 workers use the same file-based approach with two extensions: **4-score AUDIT-META** and **DATA-EXTENDED** block for cross-domain aggregation.

## File Naming (ln-640)

| Worker | Slug | Mode | Example |
|--------|------|------|---------|
| ln-641 | `pattern-{name}` | global only | `641-pattern-job-processing.md` |
| ln-642 | `layer-boundary` | domain-aware | `642-layer-boundary-users.md` / `642-layer-boundary.md` |
| ln-643 | `api-contract` | domain-aware | `643-api-contract-users.md` / `643-api-contract.md` |
| ln-644 | `dep-graph` | domain-aware | `644-dep-graph-users.md` / `644-dep-graph.md` |

**Pattern name slug:** lowercase, hyphens, no spaces: `Job Processing` → `job-processing`.

## AUDIT-META: 4-Score Variant

Workers using 4-score model (ln-641, ln-643) add sub-score fields:

```
<!-- AUDIT-META
worker: ln-641
category: Pattern Analysis
pattern: Job Processing
domain: global
scan_path: .
score: 7.9
score_compliance: 72
score_completeness: 85
score_quality: 68
score_implementation: 90
total_issues: 3
critical: 0
high: 1
medium: 2
low: 0
status: complete
-->
```

Additional fields vs standard AUDIT-META:

| Field | Type | Workers | Description |
|-------|------|---------|-------------|
| `pattern` | string | ln-641, ln-643 | Pattern name being analyzed |
| `score_compliance` | integer | ln-641, ln-643 | Compliance score 0-100 |
| `score_completeness` | integer | ln-641, ln-643 | Completeness score 0-100 |
| `score_quality` | integer | ln-641, ln-643 | Quality score 0-100 |
| `score_implementation` | integer | ln-641, ln-643 | Implementation score 0-100 |

Workers using penalty-based scoring (ln-642, ln-644) use the standard AUDIT-META format with single `score` field.

## DATA-EXTENDED Block

JSON in HTML comment for coordinator cross-domain aggregation. All ln-640 workers include this block.

```markdown
<!-- DATA-EXTENDED
{JSON object}
-->
```

### Per-Worker DATA-EXTENDED Content

**ln-641 (Pattern Analyzer):**
```json
{"pattern":"Job Processing","codeReferences":["src/jobs/processor.ts","src/workers/base.ts"],"gaps":{"missingComponents":["Dead letter queue"],"inconsistencies":["Retry config exists but no backoff strategy"]},"recommendations":["Add DLQ configuration for failed jobs"]}
```

**ln-642 (Layer Boundary):**
```json
{"architecture":{"type":"Layered","layers":["api","services","domain","infrastructure"]},"coverage":{"http_abstraction":75,"error_centralization":false,"transaction_boundary_consistent":false,"session_ownership_consistent":true}}
```

**ln-643 (API Contract):**
```json
[{"severity":"HIGH","location":"app/services/user/service.py:23","issue":"Service accepts parsed_body","principle":"API Contract / Layer Leakage","domain":"users"}]
```

**ln-644 (Dependency Graph):**
```json
{"graph_stats":{"modules_analyzed":12,"edges":34,"cycles_detected":2,"ccd":42,"nccd":1.3},"cycles":[{"type":"transitive","path":["auth","billing","notify","auth"],"severity":"CRITICAL"}],"boundary_violations":[{"rule_type":"forbidden","from":"domain","to":"infrastructure","severity":"CRITICAL"}],"sdp_violations":[{"from":"domain","to":"utils","I_from":0.2,"I_to":0.8,"severity":"HIGH"}],"metrics":{"users":{"Ca":3,"Ce":5,"I":0.625}},"baseline":{"new":3,"resolved":1,"frozen":4}}
```

## Worker Return Value (ln-640)

### 4-Score Workers (ln-641, ln-643)

```
Report written: docs/project/.audit/641-pattern-job-processing.md
Score: 7.9/10 (C:72 K:85 Q:68 I:90) | Issues: 3 (H:1 M:2 L:0)
```

Format: `C`=Compliance, `K`=Completeness, `Q`=Quality, `I`=Implementation.

### Penalty-Based Workers (ln-642, ln-644)

```
Report written: docs/project/.audit/642-layer-boundary-users.md
Score: 4.5/10 | Issues: 8 (C:1 H:3 M:4 L:0)
```

Same format as ln-620 workers.

---
**Version:** 2.0.0
**Last Updated:** 2026-02-15
