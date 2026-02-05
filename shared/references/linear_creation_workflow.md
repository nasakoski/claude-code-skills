# Linear Issue Creation Workflow

Standard workflow for creating Linear issues (Epic, Story, Task) with kanban updates.

## Issue Type Fields

### Epic (Linear Project)

```javascript
create_project({
  title: "Epic {N}: {Title}",         // N = Next Epic Number
  description: epicDocument,           // Full markdown
  team: teamId,
  state: "planned"
})
```

### Story (Linear Issue, parent = Epic)

```javascript
create_issue({
  title: "US{NNN}: {Title}",          // NNN = Next Story Number (padded)
  description: storyDocument,          // Full markdown (8 sections)
  project: epicId,                     // Parent Epic
  team: teamId,
  labels: ["user-story"],
  state: "Backlog"
})
```

### Task (Linear Issue, parent = Story)

```javascript
create_issue({
  title: "T{NNN}: {Title}",           // NNN = Next Task Number (padded)
  description: taskDocument,           // Full markdown
  parentId: storyId,                   // Parent Story
  team: teamId,
  labels: ["implementation"|"tests"|"refactoring"],
  state: "Backlog"                     // MANDATORY - Linear defaults differ!
})
```

## Critical Rules

| Rule | Why |
|------|-----|
| **Always pass `state: "Backlog"`** | Linear defaults to team's default status (often "Postponed") |
| **Sequential creation** | Create one, verify success, then next (no bulk) |
| **Capture URLs** | Store returned issue URL for summary |
| **Update kanban after each** | Keep docs/tasks/kanban_board.md in sync |

## Kanban Update Trigger

After each successful creation:

```
1. Update Next Number counter in kanban_board.md
2. Add issue to appropriate section
3. Use correct indentation (see kanban_update_algorithm.md)
```

## Title Formats

| Type | Format | Example |
|------|--------|---------|
| Epic | `Epic {N}: {Domain}` | `Epic 7: OAuth Authentication` |
| Story | `US{NNN}: {Capability}` | `US004: Register OAuth client` |
| Task | `T{NNN}: {Goal}` | `T001: Create OAuth schema` |

## Labels Reference

| Label | Used For |
|-------|----------|
| `user-story` | Stories (required for queries) |
| `implementation` | Implementation tasks |
| `tests` | Test tasks |
| `refactoring` | Refactoring tasks |
| `bug` | Bug fix tasks |

## State Values

| State | When Used |
|-------|-----------|
| `Backlog` | New items (default for creation) |
| `Todo` | Validated, ready to start |
| `In Progress` | Currently being worked on |
| `To Review` | Work complete, pending review |
| `To Rework` | Review failed, needs fixes |
| `Done` | Completed and verified |
| `Canceled` | Removed from scope |

## Error Handling

```
IF creation fails:
  1. Log error with item details
  2. DO NOT proceed with dependent items
  3. Report partial completion to user
  4. Allow retry
```

## Usage in SKILL.md

```markdown
## Linear Integration

See `shared/references/linear_creation_workflow.md` for:
- Issue creation fields
- State handling
- Kanban update trigger
```

---
**Version:** 1.0.0
**Last Updated:** 2026-02-05
