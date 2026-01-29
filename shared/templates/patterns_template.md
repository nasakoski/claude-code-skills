# Patterns Catalog

Architectural patterns with 4-score evaluation.

> **SCOPE:** Pattern inventory with scores, rationale links. Updated by ln-640 Pattern Evolution Auditor.
> **Last Audit:** YYYY-MM-DD

---

## Score Legend

| Score | Measures | Threshold |
|-------|----------|-----------|
| **Compliance** | Industry standards, ADR/Guide exists, naming, layer boundaries | 70% |
| **Completeness** | All components, error handling, tests, docs | 70% |
| **Quality** | Readability, maintainability, SOLID, no smells, no duplication | 70% |
| **Implementation** | Code exists, production use, monitored | 70% |

---

## Pattern Inventory

| # | Pattern | Rationale | Compl | Complt | Qual | Impl | Avg | Story |
|---|---------|-----------|-------|--------|------|------|-----|-------|
| 1 | *Example* | [ADR-NNN](link) | —% | —% | —% | —% | **—%** | - |

**Rationale column:**
- `[ADR-NNN]` — Architecture Decision Record (strategic decisions)
- `[G-NN]` — Guide (implementation patterns, GoF, best practices)
- Can reference both: `[ADR-026](link) [G-39](link)`

---

## Layer Boundary Status

Audit results from ln-642-layer-boundary-auditor.

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Layer Violations | X | 0 | ✅/⚠️/❌ |
| HTTP Abstraction Coverage | XX% | 90% | ✅/⚠️/❌ |
| Error Handling Centralized | Yes/No | Yes | ✅/❌ |

### Active Layer Violations

<!-- Populated by ln-642 -->

| # | File | Line | Violation | Allowed In | Story |
|---|------|------|-----------|------------|-------|
| 1 | *app/domain/X.py* | *45* | *HTTP Client in domain* | *infrastructure/http/* | [ID](link) |

---

## Quick Wins (< 4h effort)

| Pattern | Issue | Effort | Impact |
|---------|-------|--------|--------|
| *Example* | Missing @decorator | 1-2h | +5% completeness |

---

## Patterns Requiring Attention

### Score < 70% (Story Required)

- **{{Pattern}} (XX%)** — {{detailed_problem}}
  - Issue 1: {{specific}}
  - Issue 2: {{specific}}
  - **Story: [PROJ-XXX](link)** (Xh, Status)

### Score 70-80% (Improvement Planned)

1. **{{Pattern}} (XX%)** — {{problem}}
   - **Story: [PROJ-XXX](link)**

### Layer Violations (Architectural Debt)

- **{{file}}:{{line}}** — {{violation_type}} in {{layer}}
  - Code: `{{code_snippet}}`
  - Move to: {{allowed_location}}
  - **Story: [PROJ-XXX](link)**

---

## Summary

**Architecture Health Score:** XX% (Healthy|Warning|Critical)

**Trend:** +X% (reason)

| Status | Count | Patterns |
|--------|-------|----------|
| Healthy (90%+) | X | list |
| Warning (70-89%) | X | list |
| Critical (<70%) | X | list |

---

## Maintenance

**Updated by:** ln-640-pattern-evolution-auditor
**Layer audit by:** ln-642-layer-boundary-auditor

**Update Triggers:**
- New pattern implemented
- Pattern refactored (run ln-640 audit)
- ADR/Guide created or updated
- Layer violation fixed

**Next Audit:** YYYY-MM-DD (30 days)

---
**Template Version:** 2.0.0
