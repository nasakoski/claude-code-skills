# Creation Quality Checklist

Prevention checklist for content creators (ln-220/221, ln-300/301). Maps to ln-310 validation criteria — following these rules prevents penalty points at validation stage.

For full validation rules and auto-fix logic, see `ln-310-story-validator/references/` (7 validation files).

## Story Creation Checklist

For ln-220-story-coordinator and ln-221-story-creator.

| # | Criterion | Penalty | Rule |
|---|-----------|---------|------|
| 1 | Story Structure | 1 | 8 sections per template: Statement, Description, AC, Technical Notes, Affected Components, Out of Scope, Dependencies, Test Strategy |
| 3 | Story Statement | 1 | Format: "As a {persona}, I want {capability}, so that {value}" — all 3 parts required |
| 4 | AC Quality | 3 | 3-5 Given/When/Then scenarios: happy path + error + edge case. Include HTTP codes, timing, exact messages |
| 5 | Standards Compliance | 10 | Every technical decision references specific RFC/OWASP/REST standard by number in Technical Notes. Use ln-001 research results |
| 6 | Library & Version | 5 | Latest stable versions in Technical Notes. Query Context7/MCP Ref to verify |
| 9 | Story Size | 3 | 3-5 AC, 6-20 hours total, 10-28 tests planned. If outside range — split or merge |
| 11 | YAGNI | 3 | Each AC = real user need. No speculative features. Every Task maps to >= 1 AC |
| 12 | KISS | 3 | Simplest approach. No task requires >3 new abstractions. If >3 — split or simplify |
| 14 | Documentation | 5 | Pattern docs (from ln-002 research) referenced in Technical Notes. No orphan patterns |
| 16 | Story-Task Alignment | 3 | Each Task title contains keyword from Story AC (grep-verifiable) |
| 17 | AC-Task Coverage | 3 | Coverage matrix: every AC covered by >= 1 Task. No empty rows |
| 18 | Story Dependencies | 10 | No forward dependencies on Stories not yet created. Only reference earlier Stories |

**Total exposure:** 50 penalty points if all violated.

## Task Creation Checklist

For ln-300-task-coordinator and ln-301-task-creator.

| # | Criterion | Penalty | Rule |
|---|-----------|---------|------|
| 2 | Tasks Structure | 1/task | 7 sections per template: Title, Description, AC, Technical Approach, Affected Components, Existing Code Impact, Dependencies |
| 8 | Doc Integration | 3 | No standalone doc-only tasks. Doc updates fold into implementation task DoD |
| 13 | Task Order | 3 | Foundation-First: DB -> Service -> API -> UI. Each layer builds on previous |
| 15 | Code Quality | 3 | No hardcoded values in Technical Approach. Use config/env/constants |
| 19 | Task Dependencies | 3 | Task N uses only Tasks 1..N-1. No forward references to N+1, N+2 |

**Total exposure:** 13+ penalty points (criterion #2 multiplies per task).

## Validation-Only Criteria

These 2 criteria are handled by ln-310 during validation, NOT by creators:

| # | Criterion | Why validation-only |
|---|-----------|---------------------|
| 7 | Test Strategy | Section is placeholder at creation; filled by test planning later |
| 10 | Test Task Cleanup | Cleanup action during validation; no premature test tasks expected |

---
**Version:** 1.0.0
**Last Updated:** 2026-02-08
