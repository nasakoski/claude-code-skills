# Coordinator Summary Contract

Machine-readable worker outputs for standalone workers and coordinator runtimes.

## General Rules

- Every worker summary uses the same envelope.
- Workers remain standalone-capable.
- `summaryArtifactPath` is optional.
- If `summaryArtifactPath` is provided, write the summary JSON to that exact path.
- If `summaryArtifactPath` is not provided, return the same summary in structured output.
- Coordinators consume summaries, not prose chat output.
- Runtime artifacts are always run-scoped:
  - `.hex-skills/runtime-artifacts/runs/{run_id}/{summary_kind}/{identifier}.json`

## Shared Envelope

Required fields for every worker summary:

```json
{
  "schema_version": "1.0.0",
  "summary_kind": "story-plan",
  "run_id": "run-ln-220-20260326-abc123",
  "identifier": "epic-7",
  "producer_skill": "ln-221",
  "produced_at": "2026-03-26T10:00:00Z",
  "payload": {}
}
```

Rules:
- `summary_kind` describes the operation, not the coordinator.
- `identifier` is domain-specific and stable inside the run.
- `payload` shape is domain-specific and validated by schema.
- the envelope itself is validated by the shared coordinator-runtime schema layer

## Environment Worker Summaries

Used by `ln-011`, `ln-012`, `ln-013`, `ln-014`.

Allowed `summary_kind` values:
- `env-agent-install`
- `env-mcp-config`
- `env-config-sync`
- `env-instructions`

Payload fields:
- `status`
- `targets`
- `changes`
- `warnings`
- `detail`

## Story Plan Worker Summary

Used by `ln-221` and `ln-222`.

`summary_kind`:
- `story-plan`

Payload fields:
- `mode`
- `epic_id`
- `stories_planned`
- `stories_created`
- `stories_updated`
- `stories_canceled`
- `story_urls`
- `warnings`
- `kanban_updated`
- `research_path_used`

## Task Plan Worker Summary

Used by `ln-301` and `ln-302`.

`summary_kind`:
- `task-plan`

Payload fields:
- `mode`
- `story_id`
- `task_type`
- `tasks_created`
- `tasks_updated`
- `tasks_canceled`
- `task_urls`
- `kanban_updated`
- `dry_warnings_count`
- `warnings`

## Existing Coordinator Families

Older stateful families use the same run-scoped policy even when their payload differs.

Examples:
- task execution summaries
- story quality summaries
- story test summaries
- optimization summaries

The envelope remains the same. Only `summary_kind` and `payload` change.
