# Task: Iterative Refinement Review

You are performing an independent quality review of {artifact_type} that has already been through initial validation and agent review. Your job is to find remaining issues that were missed.

## CRITICAL CONSTRAINTS
- DO NOT modify, create, or delete any PROJECT files
- You MAY write your review result to the output file if specified by -o flag
- This is a READ-ONLY analysis task
- DO NOT ask clarifying questions — follow this prompt to completion autonomously
- Target completing your analysis within 10 minutes

## Project Context
{project_context}

## Artifact Under Review
{artifact_content}

## Review Criteria
Evaluate the artifact for:

1. **Correctness** — Are there factual errors? Wrong file paths, API names, library capabilities? Do referenced files/functions actually exist?
2. **Architectural correctness** — Does the design fit the project's architecture? Correct layers, patterns, module boundaries?
3. **Best practices** — Does it follow modern best practices (2025-2026)? Industry standards, RFC compliance?
4. **Optimality** — Is this the optimal approach for the stated goal? Unnecessary complexity? Missing simpler alternatives?
5. **Centralization/Unification** — Are there opportunities to deduplicate, reuse existing code, unify patterns? Are we reinventing the wheel?

## Internal Reuse Check
Before suggesting new code or patterns, search the codebase for:
- Utilities, helpers, or shared modules that already solve what the artifact proposes
- Patterns established elsewhere in the project that should be followed
- Existing abstractions the artifact could extend rather than duplicate
If found, report under area `unification` with file paths.

## Iteration Context
This is iteration {iteration_number} of {max_iterations}.
{previous_findings_summary}

## Output Format

Return ALL suggestions at once. Be maximally thorough — this is your only chance per iteration.

If no issues found, return verdict APPROVED.

## Structured Data

```json
{
  "verdict": "APPROVED | SUGGESTIONS",
  "suggestions": [
    {
      "area": "correctness | architecture | best_practices | optimality | unification",
      "issue": "What is wrong",
      "suggestion": "Specific fix to apply",
      "location": "Section header, line reference, or quote from the artifact",
      "confidence": 95,
      "impact_percent": 15
    }
  ]
}
```
