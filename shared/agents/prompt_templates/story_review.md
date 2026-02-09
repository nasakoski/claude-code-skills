# Task: Review Story and Tasks

You are reviewing a validated Story and its implementation Tasks against the actual codebase and industry best practices. This is an independent review with fresh context.

## CRITICAL CONSTRAINTS
- DO NOT modify, create, or delete any files
- DO NOT run commands that change system state
- This is a READ-ONLY analysis task
- You HAVE internet access — use it for Linear and web research
- If you cannot access a resource — report it clearly, do not skip silently

## Story
{story_ref}

## Tasks
{task_refs}

## Instructions
1. Access the Story and Tasks using the references above (Linear URLs or local file paths)
2. If you cannot access Linear — report the access error clearly so the user can configure your access
3. Examine the actual codebase in your working directory
4. Search the web for current best practices relevant to the technical domains
5. Compare Story/Tasks against:
   - Current code structure and patterns
   - Industry best practices (2025-2026)
   - Technical feasibility of proposed implementation
6. DO NOT modify any files. This is a read-only review.

## Focus Areas
- Are Tasks achievable given the current codebase?
- Do Tasks reference correct files/modules/patterns from the code?
- Are there better approaches per current best practices?
- Missing considerations (security, performance, edge cases)?

## Filtering Rules
- Confidence threshold: 90% -- only suggest if you are 90%+ sure
- Impact threshold: >10% improvement in execution quality
- If you have no suggestions meeting these thresholds, the story is acceptable

## Output Format (JSON)
```json
{
  "verdict": "STORY_ACCEPTABLE | SUGGESTIONS",
  "suggestions": [
    {
      "area": "security | performance | architecture | feasibility | best_practices",
      "issue": "What is wrong or could be improved",
      "suggestion": "Specific change to Story or Tasks",
      "reason": "Why this improves execution quality",
      "confidence": 95,
      "impact_percent": 15
    }
  ]
}
```
