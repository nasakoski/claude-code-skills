# Task: Review Code Implementation

You are reviewing a code implementation against its task requirements, existing codebase patterns, and industry best practices. This is an independent review with fresh context.

## Task
{task_content}

## Parent Story
{story_content}

## Instructions
1. Read the Task and parent Story above to understand WHAT was supposed to be implemented
2. Run `git diff` to see all uncommitted changes — focus your review on THESE changes
3. Examine the surrounding codebase for existing patterns and conventions
4. Search the web for current best practices relevant to the technical domains
5. DO NOT modify any files. This is a read-only review.

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
