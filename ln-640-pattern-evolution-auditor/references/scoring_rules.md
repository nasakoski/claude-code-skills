# Pattern Scoring Rules

4-score model for evaluating architectural pattern implementations.

## Score Categories

| Score | Focus | Question Answered |
|-------|-------|-------------------|
| Compliance | Standards | "Does it follow industry standards?" |
| Completeness | Coverage | "Are all required parts implemented?" |
| Quality | Code | "Is the implementation well-written?" |
| Implementation | Reality | "Does it actually work in production?" |

## Compliance Score (0-100)

Measures adherence to industry standards and project conventions.

| Criterion | Points | How to Check |
|-----------|--------|--------------|
| Follows industry standard (MADR, Nygard, etc.) | +30 | Compare structure with known patterns |
| Has ADR documentation | +20 | Check docs/adrs/ for related ADR |
| Consistent naming conventions | +15 | Variable/function names match project style |
| Follows tech stack conventions | +15 | Uses standard libraries for stack |
| No anti-patterns detected | +20 | No god objects, no circular deps |

**Anti-patterns to check:**
- God class (>500 lines handling pattern)
- Circular dependencies between pattern components
- Mixed concerns (e.g., job processor also does HTTP calls)
- Hardcoded configuration

## Completeness Score (0-100)

Measures whether all necessary components are present.

| Criterion | Points | How to Check |
|-----------|--------|--------------|
| All required components present | +40 | Compare with pattern checklist |
| Error handling implemented | +20 | Try/catch, error events, DLQ |
| Logging/observability | +15 | Log statements, metrics, tracing |
| Tests exist | +15 | Unit/integration tests for pattern |
| Documentation complete | +10 | README, inline comments, ADR |

**Required components by pattern:**

| Pattern | Required Components |
|---------|---------------------|
| Job Processing | Queue, Worker, DLQ, Retry config |
| Event-Driven | Publisher, Subscriber, Event schema |
| Caching | Cache client, Invalidation, TTL config |
| Resilience | Circuit breaker, Timeout, Fallback |
| Repository | Interface, Implementation, Unit of Work |

## Quality Score (0-100)

Measures code quality and maintainability.

| Criterion | Points | How to Check |
|-----------|--------|--------------|
| Code readable (short methods, clear names) | +25 | Methods <30 lines, descriptive names |
| Maintainable (low complexity) | +25 | Cyclomatic complexity <10 |
| No code smells | +20 | No duplicate code, no magic numbers |
| Follows SOLID | +15 | Single responsibility, DI used |
| Performance optimized | +15 | No N+1, proper indexing |

**Code smells to detect:**
- Duplicate code (>10 lines similar)
- Magic numbers/strings
- Long parameter lists (>4 params)
- Deep nesting (>3 levels)
- Large files (>300 lines)

## Implementation Score (0-100)

Measures whether the pattern actually works in production.

| Criterion | Points | How to Check |
|-----------|--------|--------------|
| Code exists and compiles | +30 | Build passes, no syntax errors |
| Used in production paths | +25 | Called from main app, not dead code |
| No dead/unused implementations | +15 | All exports used somewhere |
| Integrated with other patterns | +15 | Connected to logging, config, etc. |
| Monitored/observable | +15 | Metrics, health checks, logs |

**How to verify production usage:**
- Grep for imports/requires of pattern modules
- Check if pattern classes are instantiated
- Look for configuration in env files
- Check monitoring dashboards

## Thresholds and Actions

| Score Range | Status | Action |
|-------------|--------|--------|
| ≥80% | ✅ Good | No action needed |
| 70-79% | ⚠️ Warning | Create improvement task (LOW priority) |
| 60-69% | ❌ Below threshold | Create refactor Story (MEDIUM priority) |
| <60% | 🚨 Critical | Create refactor Story (HIGH priority) |

## Effort Estimation

| Issue Type | Typical Effort |
|------------|----------------|
| Add missing documentation | 2h |
| Add error handling | 4h |
| Add tests | 4-8h |
| Refactor for SOLID | 1-2d |
| Add DLQ/retry logic | 4-8h |
| Major architectural change | 3-5d |

## Trend Calculation

Compare current audit with previous:

```
trend = "improving" if avg_score > prev_avg_score + 5%
trend = "declining" if avg_score < prev_avg_score - 5%
trend = "stable" otherwise
```

## Architecture Health Score

Weighted average of all patterns:

```
health_score = (
  sum(pattern.compliance * 0.25 +
      pattern.completeness * 0.25 +
      pattern.quality * 0.25 +
      pattern.implementation * 0.25)
) / pattern_count
```

---
**Version:** 1.0.0
