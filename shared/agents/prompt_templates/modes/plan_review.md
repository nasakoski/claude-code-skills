## header
# Task: Review Implementation Plan

You are reviewing an implementation plan against the actual codebase, feasibility constraints, and best practices. This is an independent review — challenge assumptions.

## constraints
- You HAVE internet access — use it for web research
- Do NOT use task management tools (Linear, Jira, etc.)

## body
## Plan
{plan_ref}

## Codebase Context
{codebase_context}

## Review Goal
{review_goal}

{focus_hint}

Given these goals, articulate in your report's Goal section what specific feasibility risk YOU will prioritize and why — this is your refinement of the caller's goals, not a replacement. Focus your analysis on the areas most relevant to your primary focus while still covering the review goal.

## Instructions
1. Read the plan file — it contains the full implementation proposal
2. Examine the actual codebase to verify plan assumptions (file paths, APIs, patterns)
3. Search the web for best practices relevant to the technical decisions
4. DO NOT modify any files. This is a read-only review.

## Focus Areas
{focus_areas}

Default areas (when no focus filter applied):
- **feasibility** — Are proposed changes realistic given the codebase? Do referenced files/APIs exist?
- **completeness** — Missing steps? Unhandled edge cases? Dependencies not accounted for?
- **implementation_order** — Is the sequence correct? Foundation before consumers?
- **scope_creep** — Does the plan stay within the original request? Unnecessary additions?
- **risk** — What could break? Side effects on existing code? Rollback difficulty?

## alt_title
Approaches

## alt_extra
Use area `implementation_order` for sequencing alternatives, `feasibility` for approach alternatives. Only suggest if genuinely confident alternative is better.

## schema
verdict: PLAN_ACCEPTABLE | SUGGESTIONS
areas: feasibility | completeness | implementation_order | scope_creep | risk
suggestion_desc: Specific change to the plan
reason_desc: Why this improves plan quality
verdict_question: is the plan acceptable or are there suggestions?
