# Challenge: Defend Your Suggestion

You previously reviewed {review_type} for {story_ref} and made the following suggestion:

## Your Original Suggestion
- **Area:** {area}
- **Issue:** {issue}
- **Suggestion:** {suggestion}
- **Reason:** {reason}
- **Confidence:** {confidence}%

## Counterargument
{counterargument}

## Instructions
1. Consider the counterargument carefully
2. You may:
   a) **DEFEND** your suggestion — provide additional evidence, code references, standards citations
   b) **WITHDRAW** — if the counterargument is valid, withdraw gracefully
   c) **MODIFY** — propose a revised suggestion that addresses the counterargument
3. Be specific. Cite standards, benchmarks, or code patterns.

## Evidence Strength Guide

| Level | Description | Result |
|-------|-------------|--------|
| Strong | Cites RFC/standard, shows concrete code path not previously considered | Accept |
| Moderate | Valid argument but doesn't fully address the counterargument | Follow-Up Round |
| Weak | Repeats original argument, no new evidence | Reject |

Use this guide to calibrate your DEFEND/WITHDRAW/MODIFY decision.

## CRITICAL CONSTRAINTS
- DO NOT modify, create, or delete any project files
- This is a READ-ONLY debate task
- If you cannot access a resource, report clearly
- DO NOT ask clarifying questions or request additional context — you have everything you need. Follow this prompt to completion autonomously. If information is missing, make reasonable assumptions and proceed.
- Target completing your response within 5 minutes.

## Output Format (JSON)
```json
{
  "decision": "DEFEND | WITHDRAW | MODIFY",
  "defense": "Your detailed argument (if DEFEND or MODIFY)",
  "evidence": "Standards, benchmarks, code references supporting your position",
  "revised_suggestion": "Only if MODIFY — the updated suggestion text",
  "confidence_after_challenge": 0-100
}
```
