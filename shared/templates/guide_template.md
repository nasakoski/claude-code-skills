# [Pattern Name]

<!-- SCOPE: Pattern documentation using TABLES and brief descriptions ONLY.
     Contains: principle (industry standard), implementation (project-specific), Do/Don't/When patterns, sources. -->
<!-- DO NOT add here: Architectural decisions -> ADR, Multiple patterns -> Separate guides, Requirements -> Requirements.md, API specs -> api_spec.md -->

<!-- NO_CODE_EXAMPLES: Guides document PATTERNS, not implementations.
     FORBIDDEN: Full function implementations, class definitions, code blocks > 5 lines
     ALLOWED: Do/Don't/When tables, method signatures (1 line), pseudocode (1-3 lines max)
     INSTEAD OF CODE: Reference real code location, e.g., "See src/hooks/usePlan.ts:15-30"

     CORRECT table content example:
     | Call `invalidateQueries()` | Manually update cache | After POST/PUT/DELETE |

     WRONG (too much code):
     | useQuery({ queryKey: [...], queryFn: () => fetch(...) }) | fetch() in useEffect | ... | -->

## Principle

{{PRINCIPLE}}

(1-2 sentences describing the core industry best practice with version/date citation)

## Our Implementation

{{OUR_IMPLEMENTATION}}

(1 paragraph: how we apply this pattern in our project context, which layers/components affected, key integration points)

## Patterns

| Do This | Don't Do This | When to Use |
|-----------|------------------|-------------|
| {{PATTERN_1_DO}} | {{PATTERN_1_DONT}} | {{PATTERN_1_WHEN}} |
| {{PATTERN_2_DO}} | {{PATTERN_2_DONT}} | {{PATTERN_2_WHEN}} |
| {{PATTERN_3_DO}} | {{PATTERN_3_DONT}} | {{PATTERN_3_WHEN}} |

## Sources

- {{SOURCE_1}}
- {{SOURCE_2}}
- Internal: [Architecture.md](../project/architecture.md)

## Related

**ADRs:** {{RELATED_ADRS}}
**Guides:** {{RELATED_GUIDES}}

---
**Last Updated:** {{DATE}}

---

**Guide Template Version:** 5.0.0 (Added NO_CODE_EXAMPLES rule with correct/wrong examples)
**Template Last Updated:** 2025-01-09
