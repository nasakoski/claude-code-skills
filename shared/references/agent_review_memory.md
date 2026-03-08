# Agent Review Memory (Shared)

Standard algorithm for review memory during Critical Verification. Memory is NEVER passed to agents — they operate on clean context for independent perspective.

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

---
**Version:** 1.0.0
**Last Updated:** 2026-03-01
