# Concern Tracking Contract

Structured persistence for reviewer concerns across the task review → rework → quality gate lifecycle.

## Problem

ln-402 raises CONCERN and BLOCKER findings that get posted as Linear comments but have no tracking mechanism. They evaporate after the review, so ln-500 cannot verify that concerns were actually resolved.

## Concern File

Each concern is a separate file:

```
.hex-skills/runtime-artifacts/runs/{run_id}/concerns/{task_id}/{concern_code}.json
```

### Schema

```json
{
  "schema_version": "1.0.0",
  "task_id": "FPS-222",
  "concern_code": "SEC-DESTR-001",
  "severity": "CONCERN",
  "status": "open",
  "summary": "Magic number 30000 used for timeout — should be configurable.",
  "raised_by": "ln-402",
  "raised_at": "2026-04-05T12:00:00Z",
  "resolved_at": null,
  "resolved_by": null,
  "waived_by": null,
  "waive_reason": null,
  "escalated_to": null
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | string | Linear issue ID or file-mode task ID |
| `concern_code` | string | Prefixed code from ln-402 (e.g., `MNT-DRY-CROSS`, `ARCH-AI-SEB`) |
| `severity` | enum | `BLOCKER` or `CONCERN` (NITs are not tracked as concerns) |
| `status` | enum | `open`, `resolved`, `waived`, `escalated` |
| `summary` | string | One-line description of the finding |
| `raised_by` | string | Always `ln-402` |
| `raised_at` | ISO 8601 | When the concern was first raised |
| `resolved_at` | ISO 8601 or null | When ln-402 confirmed the fix on re-review |
| `resolved_by` | string or null | Always `ln-402` when resolved |
| `waived_by` | string or null | Always `ln-400` when waived (orchestrator only) |
| `waive_reason` | string or null | Why the orchestrator waived (e.g., missing delegation context) |
| `escalated_to` | string or null | Linear issue ID if concern was out of story scope |

### Status Transitions

```
open → resolved    (ln-402 confirms fix on re-review)
open → waived      (ln-400 determines concern is not legit in context)
open → escalated   (ln-400 creates a new Linear issue for out-of-scope concern)
```

Only these transitions are valid. Concerns cannot go back to `open` once resolved/waived/escalated.

## Who Writes What

| Actor | Can Set Status | When |
|-------|---------------|------|
| `ln-402` (reviewer) | `open`, `resolved` | On initial review: writes `open`. On re-review after rework: updates to `resolved` if fix is confirmed. |
| `ln-400` (orchestrator) | `waived`, `escalated` | After reading reviewer output: `waived` if concern lacks context from delegation. `escalated` if concern is out of story scope → creates Linear issue. |
| `ln-500` (quality gate) | read-only | Scans all concern files for the story. Any remaining `open` → blocks PASS. |

**Rule: ln-402 never waives.** The reviewer raises and resolves. Only the orchestrator can waive or escalate.

## Linear Documentation

Every status change is documented as a Linear comment on the task:

| Event | Comment Format |
|-------|---------------|
| Concern raised | Included in existing review comment (no change to current behavior) |
| Concern resolved | `✓ {concern_code} resolved — {brief description of fix}` |
| Concern waived | `⊘ {concern_code} waived — {reason}` |
| Concern escalated | `↗ {concern_code} escalated to {issue_id} — {reason}` |

ln-500 posts a story-level summary comment:

```
## Concern Tracking Summary

| Task | Code | Severity | Status | Detail |
|------|------|----------|--------|--------|
| FPS-222 | SEC-DESTR-001 | CONCERN | resolved | Timeout extracted to config |
| FPS-223 | ARCH-AI-SEB | CONCERN | waived | Delegation boundary — orchestrator context |

**Result:** 2 concerns raised, 1 resolved, 1 waived, 0 open
```

## Scope

Concerns are scoped to a single story. Cross-story concerns are handled via escalation: the orchestrator creates a new Linear issue and marks the original concern as `escalated`.

## Integration with Quality Score

Concern files do NOT change the ln-402 quality score formula. The score remains:

```
Quality Score = 100 - (20 × BLOCKER_count) - (10 × CONCERN_count) - (3 × NIT_count)
```

Concern files are a persistence and tracking mechanism, not a scoring mechanism. The score drives the Done/To Rework verdict; concern files drive the ln-500 gate verdict.
