# Agent Review Memory (Shared)

Standard algorithm for review memory during Critical Verification and compact project context injection into agent prompts.

## Review History Format

Append-only file `.agent-review/review_history.md` in target project.

### Entry Format

```markdown
## {identifier} | {review_type} | {YYYY-MM-DD}
- Verdict: {verdict}
- Accepted ({count}): {1-line per accepted finding, max 5}
- Rejected ({count}): {1-line per rejected finding, max 3}
- Reports: codex .agent-review/codex/{id}_{type}_result.md, gemini .agent-review/gemini/{id}_{type}_result.md
- Stats: codex ({accepted}/{total}), gemini ({accepted}/{total})
```

## Loading Rules

- Read `.agent-review/review_history.md` if exists
- Parse all entries (## blocks)
- Build known-suggestions set from accepted entries (area + issue summary)
- Build rejected-suggestions set from rejected entries (area + issue + rejection reason)
- If file doesn't exist — proceed without memory (first review for this project)

## Memory-Informed Verification

Enhances existing Claude Evaluation in Critical Verification step. Applied BEFORE the standard AGREE/DISAGREE decision.

### a) Dedup Check

Compare each suggestion's `(area, issue)` against known-suggestions from history.

| Match | Action |
|-------|--------|
| Found in accepted set | Skip: "already addressed in {identifier}" (not counted as rejection) |
| Found in rejected set with same reasoning | Note prior rejection context, evaluate on merits |
| No match | Proceed to standard evaluation |

## Budget

| Component | Max Lines |
|-----------|-----------|
| History entries | scales with reviews |
| **Total overhead** | Claude-internal, not in agent prompt |

## Fallback

| Condition | Action |
|-----------|--------|
| No `review_history.md` | Proceed as today (no memory) |
| Corrupted/unparseable file | Log warning, proceed without memory |
| 0 entries parsed | Same as no file |

Never error, never ask user. Memory is best-effort enrichment of Claude's verification.

## Rejection Pattern Extraction (for `{project_context}`)

When loading review history, also extract rejection patterns for prompt injection:

1. Count rejected suggestions by `(area, issue_keyword)`
2. Group into categories (e.g., `"backward compat" = 5 rejections`)
3. Take top-5 by count
4. Format as: `"Past rejections: backward compat (5x), scope creep (4x), below 95% threshold (3x), missing error handling (2x), unused abstraction (2x)"`
5. Include in `{project_context}` assembly (see `agent_review_workflow.md` "Step: Build Prompt" step 7)

This helps agents avoid suggesting patterns known to be rejected in this project.

---
**Version:** 1.0.0
**Last Updated:** 2026-03-01
