# Task: Review Story and Tasks

You are reviewing a validated Story and its implementation Tasks against the actual codebase and industry best practices.

## Story
{story_content}

## Tasks
{tasks_content}

## Instructions
1. Read the Story and Tasks above
2. Examine the actual codebase in your working directory
3. Search the web for current best practices relevant to the technical domains
4. Compare Story/Tasks against:
   - Current code structure and patterns
   - Industry best practices (2025-2026)
   - Technical feasibility of proposed implementation
5. DO NOT modify any files. This is a read-only review.

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
