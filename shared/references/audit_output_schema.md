# Audit Worker Output Schema

Standard output format for all L3 audit workers. Two delivery modes: **file-based** (primary) and **in-context JSON** (small coordinators).

## File-Based Output (Primary — ln-620, ln-640 workers)

Workers write markdown reports to `docs/project/.audit/` and return minimal summary in-context.

**Full template:** See `shared/templates/audit_worker_report_template.md` for file format, naming convention, AUDIT-META block, FINDINGS-EXTENDED spec (ln-623), and DATA-EXTENDED spec (ln-640 workers).

### Worker Return (In-Context)

Instead of full JSON, worker returns ~50 tokens:

```
Report written: docs/project/.audit/621-security.md
Score: 7.5/10 | Issues: 5 (C:0 H:2 M:2 L:1)
```

4-score workers (ln-641, ln-643) include sub-scores:
```
Report written: docs/project/.audit/641-pattern-job-processing.md
Score: 7.9/10 (C:72 K:85 Q:68 I:90) | Issues: 3 (H:1 M:2 L:0)
```

### When to Use File-Based

| Coordinator | Workers | Mode |
|-------------|---------|------|
| ln-620 (9 workers) | ln-621..ln-629 | **File-based** (prevents context overflow) |
| ln-640 (4 workers, domain-aware) | ln-641..ln-644 | **File-based** (up to 20+ invocations in domain-aware mode) |
| ln-650 (3 workers) | ln-651..ln-653 | In-context JSON (3 workers manageable) |
| ln-630 (5 workers) | ln-631..ln-635 | In-context JSON (5 workers manageable) |

**Rule of thumb:** File-based when coordinator has 7+ workers OR domain-aware mode with 4+ workers × N domains.

## In-Context JSON Output (Legacy/Other Coordinators)

```json
{
  "category": "Category Name",
  "score": 7.5,
  "total_issues": 12,
  "critical": 1,
  "high": 3,
  "medium": 5,
  "low": 3,
  "checks": [
    {
      "id": "check_identifier",
      "name": "Human-Readable Check Name",
      "status": "passed|failed|warning|skipped",
      "details": "Brief explanation of result"
    }
  ],
  "findings": [
    {
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "location": "path/to/file.ts:42",
      "issue": "Concise description of the problem",
      "principle": "Category / Specific Rule",
      "recommendation": "Actionable fix suggestion",
      "effort": "S|M|L"
    }
  ]
}
```

## Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `category` | string | Audit category name (e.g., "Security", "Build Health") |
| `score` | number | 0-10 scale, calculated per `audit_scoring.md` |
| `total_issues` | integer | Sum of all severity counts |
| `critical/high/medium/low` | integer | Issue counts by severity |
| `checks` | array | List of performed checks with status |
| `findings` | array | Detailed issues with recommendations |

## Checks Array

Each check represents a discrete audit rule:

| Status | Meaning |
|--------|---------|
| `passed` | No issues found |
| `failed` | Issues found (generates findings) |
| `warning` | Minor issues or incomplete check |
| `skipped` | Check not applicable for this codebase |

## Finding Object

| Field | Required | Description |
|-------|----------|-------------|
| `severity` | Yes | CRITICAL, HIGH, MEDIUM, or LOW |
| `location` | Yes | File path with line number (path:line) |
| `issue` | Yes | What is wrong |
| `principle` | Yes | Which rule/principle is violated |
| `recommendation` | Yes | How to fix it |
| `effort` | Yes | S (< 1h), M (1-4h), L (> 4h) |
| `pattern_id` | No | DRY type ID (e.g., `dry_1.2`). Used by ln-620 for cross-domain matching. Only for DRY findings from ln-623 |
| `pattern_signature` | No | Normalized pattern key (e.g., `validation_email`). Same signature across domains = cross-domain duplication. Only for DRY findings from ln-623 |

## Domain-Aware Worker Output (Optional)

For workers that scan per-domain (ln-623, ln-624, ln-634):

```json
{
  "category": "Architecture & Design",
  "score": 6,
  "domain": "users",
  "scan_path": "src/users",
  "total_issues": 4,
  "critical": 1,
  "high": 2,
  "medium": 1,
  "low": 0,
  "checks": [
    {"id": "layer_separation", "name": "Layer Separation", "status": "failed", "details": "Controller→Repository bypass"}
  ],
  "findings": [
    {
      "severity": "CRITICAL",
      "location": "src/users/controllers/UserController.ts:45",
      "issue": "Controller directly uses Repository",
      "principle": "Layer Separation (Clean Architecture)",
      "recommendation": "Create UserService between Controller and Repository",
      "effort": "L",
      "domain": "users"
    }
  ]
}
```

**Additional fields for domain-aware:**
| Field | Type | Description |
|-------|------|-------------|
| `domain` | string | Domain name (e.g., "users", "orders") |
| `scan_path` | string | Path scanned (e.g., "src/users") |

## L2 Coordinator Aggregation

```json
{
  "domain": "Codebase Health",
  "overall_score": 7.2,
  "worker_results": [
    {"worker": "ln-621", "category": "Security", "score": 8.0},
    {"worker": "ln-622", "category": "Build Health", "score": 6.5}
  ],
  "summary": {
    "total_critical": 2,
    "total_high": 5,
    "total_medium": 12,
    "total_low": 8
  }
}
```

## Examples by Audit Type

### Security Audit (ln-621)
```json
{
  "category": "Security",
  "score": 6.0,
  "total_issues": 3,
  "critical": 1, "high": 1, "medium": 1, "low": 0,
  "checks": [
    {"id": "hardcoded_secrets", "name": "Hardcoded Secrets", "status": "failed", "details": "1 API key found"},
    {"id": "sql_injection", "name": "SQL Injection", "status": "passed", "details": "Parameterized queries used"},
    {"id": "xss_prevention", "name": "XSS Prevention", "status": "warning", "details": "Missing sanitization in 2 places"}
  ],
  "findings": [
    {"severity": "CRITICAL", "location": "src/config/api.ts:12", "issue": "Hardcoded API key", "principle": "Secrets Management", "recommendation": "Move to environment variable", "effort": "S"}
  ]
}
```

### Code Quality Audit (ln-624)
```json
{
  "category": "Code Quality",
  "score": 7.5,
  "domain": "orders",
  "scan_path": "src/orders",
  "total_issues": 5,
  "critical": 0, "high": 2, "medium": 2, "low": 1,
  "checks": [
    {"id": "cyclomatic_complexity", "name": "Cyclomatic Complexity", "status": "failed", "details": "2 functions >15"},
    {"id": "magic_numbers", "name": "Magic Numbers", "status": "warning", "details": "5 instances found"}
  ],
  "findings": [
    {"severity": "HIGH", "location": "src/orders/services/OrderService.ts:120", "issue": "Complexity 25 (threshold 15)", "principle": "Maintainability / Cyclomatic Complexity", "recommendation": "Extract helper methods", "effort": "M", "domain": "orders"}
  ]
}
```

### Test Coverage Audit (ln-634)
```json
{
  "category": "Coverage Gaps",
  "score": 5.0,
  "domain": "payments",
  "scan_path": "src/payments",
  "total_issues": 6,
  "critical": 2, "high": 2, "medium": 2, "low": 0,
  "checks": [
    {"id": "critical_paths", "name": "Critical Path Coverage", "status": "failed", "details": "2 money flows untested"},
    {"id": "security_paths", "name": "Security Path Coverage", "status": "failed", "details": "1 auth flow untested"}
  ],
  "findings": [
    {"severity": "CRITICAL", "location": "src/payments/services/PaymentService.ts:45", "issue": "processRefund() untested (Priority 25)", "principle": "E2E Critical Coverage / Money Flow", "recommendation": "Add E2E test for refund flow", "effort": "M", "domain": "payments"}
  ]
}
```

## Usage in SKILL.md

Reference this file instead of duplicating schema:

```markdown
## Output Format

See `shared/references/audit_output_schema.md` for JSON structure.

Return JSON with:
- category: "[Your Category]"
- checks: [list your specific checks]
- findings: [detected issues]
```

---
**Version:** 2.0.0
**Last Updated:** 2026-02-15
