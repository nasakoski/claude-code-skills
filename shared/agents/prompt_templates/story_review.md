# Task: Review Story and Tasks

You are reviewing a validated Story and its implementation Tasks against the actual codebase and industry best practices. This is an independent review with fresh context.

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
- Are alternative approaches considered? (see Alternative Solutions section below)
- Missing considerations (security, performance, edge cases)?

## Risk Analysis
Evaluate implementation risks that could cause production incidents:
- **Breaking changes:** API contracts, DB schema, client compatibility
- **Data loss:** Destructive operations without safeguards (soft-delete, backups)
- **Failure modes:** What happens when dependencies fail (timeout, unavailable, corrupt response)
- **Rollback difficulty:** Can deployment be reverted safely? Irreversible migrations?
- **Dependency risks:** Single points of failure, version pinning, deprecated libraries
- **Production edge cases:** Concurrency, race conditions, resource exhaustion, unexpected input

## Alternative Solutions
Before finalizing, actively research whether the proposed approach is optimal:
- **Search the web** for modern solutions (2025-2026) to the same problem domain
- **Check if a simpler approach** exists: fewer moving parts, less code, fewer dependencies
- **Check if a more standard approach** exists: industry patterns, well-known libraries, framework-native solutions
- **Compare trade-offs**: if current approach has disadvantages vs alternatives, describe them concisely

**Discard criteria** — do NOT suggest alternative if ANY condition met:
- **Strictly dominated**: worse than chosen in ALL dimensions (no tradeoff exists)
- **No unique advantage**: cannot identify single dimension where alternative outperforms chosen
- **Fails hard requirement**: missing mandatory feature or team capability
- **No ROI justification**: switching cost exceeds benefit

Use area `architecture` for design alternatives, `best_practices` for implementation alternatives. Only suggest if 90%+ confident alternative is genuinely better.

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
      "area": "security | performance | architecture | feasibility | best_practices | risk_analysis",
      "issue": "What is wrong or could be improved",
      "suggestion": "Specific change to Story or Tasks",
      "reason": "Why this improves execution quality",
      "confidence": 95,
      "impact_percent": 15
    }
  ]
}
```
