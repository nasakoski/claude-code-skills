# Auto-Discovery Fallback Chains

Standard pattern for loading context with fallback sources.

## General Algorithm

```
FOR each required data item:
  1. Try PRIMARY source (kanban_board.md, Epic, Linear)
  2. If missing → Try FALLBACK sources in order
  3. If all fail → Ask user OR raise ERROR
```

## Common Discovery Chains

### Team ID
```
1. kanban_board.md → Linear Configuration table → Team ID
2. FALLBACK: Ask user "Which Linear team?"
```

### Next Number (Epic/Story/Task)
```
1. kanban_board.md → Epic Story Counters table
2. VERIFY: list_projects/list_issues to confirm
3. FALLBACK: Ask user
```

### Feature Scope
```
1. Epic description → Scope In section
2. FALLBACK 1: HTML files (forms, buttons, validation)
3. FALLBACK 2: docs/requirements.md
4. FALLBACK 3: Ask user
```

### User/Persona
```
1. Epic Goal → "Enable [persona]..."
2. FALLBACK 1: docs/requirements.md → "User personas" section
3. FALLBACK 2: Default "User"
```

### Technical Stack
```
1. docs/tech_stack.md
2. FALLBACK 1: package.json / *.csproj analysis
3. FALLBACK 2: Ask user
```

## Source Priority Rules

| Priority | Source | Trust Level |
|----------|--------|-------------|
| 1 | kanban_board.md | Highest (user-maintained) |
| 2 | Linear API | High (system of record) |
| 3 | docs/*.md | Medium (may be outdated) |
| 4 | Code analysis | Medium (inference) |
| 5 | HTML/templates | Low (presentation layer) |
| 6 | User input | Fallback (always trusted) |

## Error Handling

| Scenario | Action |
|----------|--------|
| Primary source missing | Try fallback |
| All fallbacks fail | Ask user |
| User input required but unavailable | ERROR with clear message |
| Conflicting sources | Prefer higher priority |

## Best Practices

1. **Show extracted data** — "From Epic: [info]. From HTML: [info]"
2. **Skip redundant questions** — If all data found, don't ask user
3. **Validate after discovery** — Confirm IDs exist in Linear
4. **Cache results** — Store in contextStore for phase reuse

## Usage

```markdown
## Phase 1: Auto-Discovery

Follows `shared/references/auto_discovery_pattern.md`:

1. Read kanban_board.md → [primary data]
2. Fallback: [secondary source]
3. Ask user if needed
```

---
**Version:** 1.0.0
**Last Updated:** 2026-02-05
