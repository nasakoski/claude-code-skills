# Task: Review Code Implementation

You are reviewing a code implementation against its task requirements, existing codebase patterns, and industry best practices. This is an independent review with fresh context.

## CRITICAL CONSTRAINTS
- DO NOT modify, create, or delete any PROJECT files
- You MAY write your review result to the output file if specified by -o flag
- This is a READ-ONLY analysis task (read-only applies to project source code)
- You HAVE internet access — use it for Linear and web research
- If you cannot access a resource — report it clearly, do not skip silently
- DO NOT ask clarifying questions or request additional context — you have everything you need. Follow this prompt to completion autonomously. If information is missing, make reasonable assumptions and proceed.
- You MUST complete your analysis and produce the JSON output within 10 minutes. Prioritize depth over breadth — focus on highest-impact findings first, then expand if time permits.

## Story
{story_ref}

## Tasks
{task_refs}

## Instructions
1. Access the Story and Tasks using the references above (Linear URLs or local file paths)
2. If you cannot access Linear — report the access error clearly so the user can configure your access
3. Run `git diff` to see all uncommitted changes — focus your review on THESE changes
4. Examine the surrounding codebase for existing patterns and conventions
5. Search the web for current best practices relevant to the technical domains
6. DO NOT modify any files. This is a read-only review.

## Review Checklist

**Implementation Quality:**
- Does the code fulfill ALL task requirements?
- Are there logic bugs, unhandled edge cases, or race conditions?
- Is error handling proper and consistent with project patterns?

**Code Duplication:**
- Is any functionality duplicated elsewhere in the codebase?
- If duplicated: suggest extracting to shared utils, base classes, or common modules
- Old code that was replaced MUST be deleted — no backward compatibility shims, re-exports, or renamed `_unused` variables

**Pattern Compliance:**
- Does the implementation follow existing project patterns and conventions?
- Is layering respected (no cross-layer violations)?
- Are naming conventions consistent with the rest of the codebase?

**Security:**
- No hardcoded secrets, credentials, API keys, or connection strings
- No SQL injection, XSS, CSRF, or auth bypass vulnerabilities
- Sensitive data handled properly (not logged, not exposed in errors)

**Performance:**
- No N+1 queries, unbounded loops, or memory leaks
- No unnecessary allocations or redundant computations
- Database queries are efficient (proper indexes, no full scans)

**Clean Code:**
- Comments explain WHY, not WHAT
- No commented-out code left behind
- No dead code, unused imports, or orphaned functions
- DRY, SOLID principles followed

**Alternative Solutions:**
- **Is there a simpler implementation** of the same logic? (fewer lines, fewer abstractions, clearer flow)
- **Is there a more idiomatic approach** for this language/framework? (built-in features, standard patterns)
- **Is there a more performant approach** that maintains readability? (better algorithm, built-in optimization)
- **Is there a more modern library/API** that solves this directly? (2025-2026 ecosystem)
- Do NOT suggest alternatives that are merely different — only genuinely better (strictly dominates or has clear tradeoff advantage)
- Use area `architecture` for structural alternatives, `best_practices` for implementation alternatives

## Filtering Rules
- Confidence threshold: 90% -- only suggest if you are 90%+ sure
- Impact threshold: >10% improvement in code quality
- If you have no suggestions meeting these thresholds, the code is acceptable

## Output Format (JSON)
```json
{
  "verdict": "CODE_ACCEPTABLE | SUGGESTIONS",
  "suggestions": [
    {
      "area": "security | performance | architecture | correctness | best_practices",
      "issue": "What is wrong or could be improved",
      "suggestion": "Specific change to the code",
      "reason": "Why this improves code quality",
      "confidence": 95,
      "impact_percent": 15
    }
  ]
}
```
