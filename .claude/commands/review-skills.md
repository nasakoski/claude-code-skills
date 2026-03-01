---
description: "Review changed skills for coherence (flow, refs, duplication, contradictions, context economy, stale artifacts). Fix issues in-place."
allowed-tools: Read, Grep, Glob, Bash, Edit
---

# Skill Coherence Review

You review changed skills for structural and logical integrity across 6 dimensions, then fix issues in-place.

## Phase 1: Scope Detection

**If `$ARGUMENTS` provided:** treat each token as a skill directory prefix (e.g., `ln-400` matches `ln-400-story-executor/`). Glob `{prefix}*/SKILL.md` per token.

**If `$ARGUMENTS` empty:** auto-detect from git:
```bash
git diff --name-only HEAD
git diff --name-only --cached
git ls-files --others --exclude-standard
```
Extract unique skill dirs (pattern `ln-\d+-[^/]+`) and shared paths (`shared/`). If shared files changed, Grep all `ln-*/SKILL.md` for references to changed filenames.

**Build scope:**
1. **Primary** — skills with directly changed files
2. **Affected** — skills referencing changed shared files
3. **Dependencies** — for each primary skill, extract `ln-\d{3,4}` references from its SKILL.md (callers, callees, worker tables)

Deduplicate. Report: `Scope: N primary, M affected, K dependency skills.`

## Phase 2: Six-Dimension Review

Read every SKILL.md in scope. Check ALL dimensions across ALL skills in scope.

### D1: Flow Integrity
- Every `ln-NNN` reference in workflow/worker tables points to an existing `ln-NNN-*/SKILL.md`
- No circular delegation loops (A → B → A)
- Every worker invocation has a matching caller reference in the target skill
- No dead-end flows (delegation to a worker with no output/return path)

### D2: Cross-Reference Consistency
- `MANDATORY READ` paths exist on disk (Glob each path)
- `Reference Files` section paths exist on disk
- Caller/callee references are bidirectional: if A lists B as worker, B mentions A as caller
- Skill invocation names (`skill: "ln-NNN-*"`) match actual directory names

### D3: Duplication
- Same instructions/rules not repeated across multiple skills
- Shared logic lives in `shared/references/`, skill-specific in SKILL.md (SRP)
- No copy-pasted blocks that should be a MANDATORY READ to a shared file

### D4: Contradiction Detection
- Thresholds (confidence, impact, scores) consistent across related skills
- Status transitions consistent (who sets which status)
- Rules about the same concept do not conflict between caller and callee
- Verdict names and categories match across prompt templates, workflows, SKILL.md files

### D5: Context Economy
- No large inline blocks that could be conditional MANDATORY READs
- Metadata in table format where possible
- No verbose explanations where a table/list suffices
- Frontmatter `description` concise (under 200 chars)

### D6: Stale Artifacts
- No references to removed/renamed skills or files
- No outdated caller names (skill renamed but old name in callers)
- No instructions about features that no longer exist
- No placeholder/TODO markers left from previous edits

## Phase 3: Fix

For each finding:
- **Fixable** (wrong path, stale ref, missing bidirectional ref, duplicated content) — fix immediately via Edit
- **Ambiguous** (conflicting thresholds where correct value unclear) — list in report, do NOT guess

## Phase 4: Report

```
## Skill Coherence Review

**Scope:** {list of reviewed skills}

### Fixed ({count})
| # | Skill | Dim | Issue | Fix Applied |
|---|-------|-----|-------|-------------|

### Remaining Concerns ({count})
| # | Skill | Dim | Issue | Why Not Auto-Fixed |
|---|-------|-----|-------|--------------------|

### Clean
Dimensions with no findings: {list}
```

If zero findings: `All 6 dimensions clean. No issues found.`

## Rules
- Read ALL skills in scope before reporting — do not stop at first finding
- Fix errors immediately, do not defer
- Do NOT update versions or dates unless user explicitly requests it
- `shared/` changes affect every skill that references them — always check reverse dependencies
