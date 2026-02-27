# Task: Review Context

You are reviewing the provided context against feasibility, internal consistency, best practices, and risk factors. This is an independent review with fresh perspective.

## CRITICAL CONSTRAINTS
- DO NOT modify, create, or delete any PROJECT files
- You MAY write your review result to the output file if specified by -o flag
- This is a READ-ONLY analysis task (read-only applies to project source code)
- You HAVE internet access — use it for web research and accessing URLs
- Do NOT use task management tools (Linear, Jira, etc.) — this review analyzes only local files and web research
- If you cannot access a resource — report it clearly, do not skip silently
- DO NOT ask clarifying questions or request additional context — you have everything you need. Follow this prompt to completion autonomously. If information is missing, make reasonable assumptions and proceed.
- You MUST complete your analysis and produce the JSON output within 10 minutes. Prioritize depth over breadth — focus on highest-impact findings first, then expand if time permits.

## Review Title
{review_title}

## Context Files
{context_refs}

## Instructions
1. Read ALL referenced files from the working directory — they contain the full context for review
2. Examine the surrounding codebase in your working directory for additional context
3. Search the web for current best practices relevant to the domain
4. DO NOT modify any files. This is a read-only review.

## Focus Areas
{focus_areas}

Default areas (when no focus filter applied):
- **logic** — Is the reasoning sound? Are there logical gaps or contradictions?
- **feasibility** — Is this achievable given constraints (time, tech, team)?
- **completeness** — Are there missing considerations, edge cases, steps?
- **consistency** — Does this align with existing decisions, architecture, patterns?
- **best_practices** — Does this follow industry best practices (2025-2026)?
- **risk** — What could go wrong? Failure modes, dependencies, unknowns?

## Alternative Approaches
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

Use area `consistency` for design alternatives, `best_practices` for implementation alternatives. Only suggest if 90%+ confident alternative is genuinely better.

## Filtering Rules
- Confidence threshold: 90% — only suggest if you are 90%+ sure
- Impact threshold: >10% improvement in quality
- If you have no suggestions meeting these thresholds, the context is acceptable

## Output Format (JSON)
```json
{
  "verdict": "CONTEXT_ACCEPTABLE | SUGGESTIONS",
  "suggestions": [
    {
      "area": "logic | feasibility | completeness | consistency | best_practices | risk",
      "issue": "What is wrong or could be improved",
      "suggestion": "Specific actionable change",
      "reason": "Why this improves quality",
      "confidence": 95,
      "impact_percent": 15
    }
  ]
}
```
