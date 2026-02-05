# Risk-Based Testing Strategy

Kent Beck's principle: **"Test. Not too many. Mostly integration."**

## Priority Formula

```
Priority = Impact (1-5) × Probability (1-5)
```

| Priority | Action | Description |
|----------|--------|-------------|
| ≥15 | **MUST test** | Money flows, Security, Data integrity |
| 10-14 | **SHOULD test** | Core user journeys, Important features |
| 5-9 | **MAY test** | Nice-to-have, Edge cases |
| <5 | **SKIP** | Low impact, Rare scenarios |

## Test Type Caps (per Story)

| Type | Min | Max | Focus |
|------|-----|-----|-------|
| E2E | 2 | 5 | Critical user journeys |
| Integration | 3 | 8 | Component interactions |
| Unit | 5 | 15 | Complex business logic |
| **Total** | **10** | **28** | — |

## Decision Tree

```
For each AC or feature:
  1. Calculate Priority = Impact × Probability
  2. If Priority ≥ 15 → MUST write test
  3. If Priority 10-14 → SHOULD write test (if under caps)
  4. If Priority < 10 → SKIP unless under minimum caps
```

## Impact Scale

| Score | Impact | Examples |
|-------|--------|----------|
| 5 | Critical | Payment failure, Data loss, Security breach |
| 4 | High | Core feature broken, User cannot complete task |
| 3 | Medium | Feature degraded, Workaround exists |
| 2 | Low | Minor inconvenience, Cosmetic issue |
| 1 | Minimal | Edge case, Rare scenario |

## Probability Scale

| Score | Probability | Examples |
|-------|-------------|----------|
| 5 | Very High | Every request, Common user action |
| 4 | High | Frequent operation, Daily use |
| 3 | Medium | Regular feature, Weekly use |
| 2 | Low | Occasional use, Special cases |
| 1 | Rare | Edge case, Error recovery |

## Core Principle: Test YOUR Code

**Test business logic, not frameworks:**

| ✅ DO Test | ❌ DON'T Test |
|-----------|--------------|
| Your validation rules | bcrypt hashing |
| Your business calculations | Prisma findMany returns array |
| Your error handling | Express middleware chain |
| Your API contracts | JWT library signature |

## Minimum Viable Testing

Every Story needs at minimum:
- **2 E2E tests** covering happy path and main error case
- **Integration tests** for component boundaries
- **Unit tests** only for complex calculations

## Usage

Reference this file instead of duplicating:

```markdown
## Reference Files
- **Testing strategy:** `shared/references/risk_based_testing.md`
```

---
**Version:** 1.0.0
**Last Updated:** 2026-02-05
