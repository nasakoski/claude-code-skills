# Patterns Catalog

<!-- SCOPE: Architectural patterns implemented in this project. Used by ln-640-pattern-evolution-auditor for periodic analysis and by developers for architecture reference. -->

## Summary

| Pattern | Status | Compliance | Completeness | Quality | Implementation | Trend | Last Audit |
|---------|--------|------------|--------------|---------|----------------|-------|------------|
| *Example* | Implemented | —% | —% | —% | —% | — | — |

<!-- Add rows as patterns are documented -->

---

## Pattern Template

<!-- Copy this template for each new pattern -->

### [Pattern Name]

**Status:** Planned | Partial | Implemented
**Version:** X.Y (YYYY-MM)
**Last Audit:** YYYY-MM-DD
**Related ADR:** [ADR-NNN](../adrs/NNN-pattern-name.md)

#### Scores

| Metric | Score | Threshold | Status |
|--------|-------|-----------|--------|
| Compliance | —% | 70% | — |
| Completeness | —% | 70% | — |
| Quality | —% | 70% | — |
| Implementation | —% | 70% | — |

#### Code References

- `path/to/main/file.ts` — description
- `path/to/config.ts` — configuration

#### Current Implementation

- Key component 1
- Key component 2
- Configuration approach

#### Best Practices Gap

<!-- Filled by ln-640 during audit -->
- [ ] Gap 1 (severity)
- [ ] Gap 2 (severity)
- [x] Already implemented

#### Refactor Stories

<!-- Links to Stories created by ln-640 -->
- PROJ-XXX: Story title

#### Trend

| Date | Compliance | Quality | Notes |
|------|------------|---------|-------|
| YYYY-MM-DD | —% | —% | Initial audit |

---

## Common Patterns Reference

| Pattern | Detection Keywords | Key Best Practices |
|---------|-------------------|-------------------|
| Job Processing | Queue, Worker, Job, Bull | DLQ, exponential backoff, idempotency |
| Event-Driven | EventEmitter, publish, subscribe | Event schema versioning, dead letter |
| Caching | Cache, Redis, Memcached, TTL | Invalidation strategy, cache-aside |
| Resilience | CircuitBreaker, Retry, Timeout | Circuit states, bulkhead, fallback |
| CQRS | Command, Query, ReadModel | Eventual consistency, projections |
| Repository | Repository, findBy, save | Unit of Work, specification pattern |
| API Gateway | Gateway, Proxy, RateLimit | Rate limiting, auth, routing |

---

**Created by:** ln-111-root-docs-creator
**Maintained by:** ln-640-pattern-evolution-auditor
**Template Version:** 1.0.0
