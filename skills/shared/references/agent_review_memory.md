# Agent Review Memory (Shared)

Write-only format for `.agent-review/review_history.md` — human audit trail of agent review decisions. Not read by agents or the review workflow (stateless review model).

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

## Fallback

| Condition | Action |
|-----------|--------|
| No `review_history.md` | Create with header `# Agent Review History` |
| Write fails | Log warning, continue (audit trail is best-effort) |

---
**Version:** 1.0.0
**Last Updated:** 2026-03-01
