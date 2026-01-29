---
name: ln-640-pattern-evolution-auditor
description: Audits architectural patterns against best practices (MCP Ref, Context7, WebSearch). Maintains patterns catalog, calculates 4 scores, creates refactor Stories via ln-220. Use when user asks to: (1) Check architecture health, (2) Audit patterns before refactoring, (3) Find undocumented patterns in codebase.
---

# Pattern Evolution Auditor

Analyzes implemented architectural patterns against current best practices, tracks evolution over time, and creates Stories for improvements via ln-220-story-coordinator.

## Purpose & Scope
- Maintain `docs/architecture/patterns_catalog.md` with implemented patterns
- Research best practices via MCP Ref, Context7, WebSearch
- Calculate 4 scores per pattern: compliance, completeness, quality, implementation
- Auto-detect undocumented patterns in codebase
- Create Stories for patterns with score < 70% via ln-220
- Track quality trends over time (improving/stable/declining)

## 4-Score Model (from ADR Analysis Server best practices)

| Score | What it measures | Threshold |
|-------|------------------|-----------|
| **Compliance** | Follows industry standards, has ADR, naming conventions | 70% |
| **Completeness** | All components present, error handling, tests, docs | 70% |
| **Quality** | Readability, maintainability, no code smells, SOLID | 70% |
| **Implementation** | Code exists, used in production, integrated, monitored | 70% |

## Workflow

### Phase 1: Discovery
1. Load `docs/architecture/patterns_catalog.md`
   - If missing → create from `references/patterns_template.md`
2. Load `docs/adrs/*.md` → link patterns to ADRs
3. **Auto-detect undocumented patterns:**
   ```
   Grep("Queue|Worker|Job|Bull") → Job Processing
   Grep("EventEmitter|publish|subscribe") → Event-Driven
   Grep("Cache|Redis|Memcached|TTL") → Caching
   Grep("CircuitBreaker|Retry|Timeout") → Resilience
   ```
   If found but not in catalog → add as "Undocumented"

### Phase 2: Best Practices Research
```
FOR EACH pattern WHERE last_audit > 30 days OR never:

  # 1. MCP Ref
  ref_search_documentation("{pattern} best practices {tech_stack}")
  ref_read_url(relevant_results)

  # 2. Context7 (if pattern uses specific library)
  IF pattern.library:
    resolve-library-id(pattern.library)
    query-docs(library_id, "{pattern} implementation")

  # 3. WebSearch
  WebSearch("{pattern} implementation best practices 2026")

  → Store: contextStore.bestPractices[pattern]
```

### Phase 3: Pattern Analysis Loop
```
FOR EACH pattern IN catalog:
  Task(
    description: "Analyze {pattern} pattern",
    prompt: "Execute ln-641-pattern-analyzer for pattern '{pattern}'.
             Locations: {locations}
             ADR: {adr_reference}
             Best practices: {bestPractices[pattern]}
             Calculate 4 scores.
             Read skill from ln-641-pattern-analyzer/SKILL.md.",
    subagent_type: "general-purpose"
  )

  Update pattern entry with scores, issues, gaps
```

### Phase 4: Gap Analysis
```
gaps = {
  undocumentedPatterns: found in code but not in catalog,
  implementationGaps: ADR decisions not implemented,
  consistencyIssues: conflicting patterns
}
```

### Phase 5: Story Creation (via ln-220-story-coordinator)

**REFACTORING PRINCIPLE (MANDATORY):**
> When creating refactoring Stories, each Story MUST include criterion:
> **"Zero Legacy / Zero Backward Compatibility"** — no backward compatibility, no legacy code preserved. Clean up immediately, make it architecturally correct. Priority is code and architecture cleanliness, not refactoring time.

```
refactorItems = patterns WHERE any_score < 70%

IF refactorItems.length > 0:

  # Auto-detect Epic
  targetEpic = null
  existingEpics = parse(kanban_board.md)

  # 1. Find Architecture/Refactoring/Technical Debt Epic
  FOR epic IN existingEpics:
    IF epic.title contains "Architecture" OR "Refactoring" OR "Technical Debt":
      targetEpic = epic
      break

  # 2. If only one active Epic
  IF targetEpic == null AND existingEpics.active.length == 1:
    targetEpic = existingEpics.active[0]

  # 3. Ask user only if cannot determine
  IF targetEpic == null:
    AskUserQuestion("Which Epic for refactor Stories?", existingEpics)
    → targetEpic = response

  # Create Stories
  FOR EACH pattern IN refactorItems:
    Task(
      description: "Create Story for {pattern} refactoring",
      prompt: "Execute ln-220-story-coordinator for Epic '{targetEpic}'.
               Create Story: 'Refactor {pattern} to meet best practices'
               Pattern: {pattern.name}
               Scores: {pattern.scores}
               Issues: {pattern.issues}
               AC from issues list.
               MANDATORY AC: 'Zero Legacy / Zero Backward Compatibility —
               no compatibility hacks, no legacy code preserved.
               Clean architecture is priority over refactoring time.'
               Read skill from ln-220-story-coordinator/SKILL.md.",
      subagent_type: "general-purpose"
    )
```

### Phase 6: Report + Trend Analysis
1. Update `patterns_catalog.md` with scores, dates, Story links
2. Calculate trend: compare current vs previous scores
3. Output summary:
   - Patterns analyzed: N
   - Average scores: compliance X%, quality Y%
   - Stories created: M
   - Trend: improving/stable/declining
   - Architecture Health Score: weighted_avg(all_scores)

## Critical Rules
- **MCP Ref first:** Always research best practices before analysis
- **4 scores mandatory:** Never skip any score calculation
- **ln-220 for Stories:** Create Stories, not standalone tasks
- **Zero Legacy:** Refactor Stories must include "no backward compatibility" AC
- **Auto-detect Epic:** Only ask user if cannot determine automatically
- **Trend tracking:** Compare with previous audit when available
- **ADR linking:** Always check for related ADR documents

## Definition of Done
- Pattern catalog loaded or created
- Best practices researched for all patterns needing audit
- All patterns analyzed via ln-641 subagents
- 4 scores calculated for each pattern
- Gaps identified (undocumented, unimplemented, inconsistent)
- Stories created via ln-220 for patterns with score < 70%
- Catalog updated with new scores, dates, Story links
- Trend analysis completed
- Summary report output

## Reference Files
- Pattern catalog template: `references/patterns_template.md`
- Common patterns detection: `references/common_patterns.md`
- Scoring rules: `references/scoring_rules.md`
- Worker: `../ln-641-pattern-analyzer/SKILL.md`
- Story creation: `../ln-220-story-coordinator/SKILL.md`

---
**Version:** 1.0.0
**Last Updated:** 2026-01-29
