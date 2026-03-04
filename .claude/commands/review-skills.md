---
description: "Review changed skills for coherence (flow, refs, duplication, contradictions, context economy, stale artifacts, structure, architecture, patterns). Fix issues in-place."
allowed-tools: Read, Grep, Glob, Bash, Edit
---

# Skill Coherence Review

You review changed skills for structural and logical integrity across 9 dimensions, then fix issues in-place.

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

## Phase 2: Nine-Dimension Review

Read every SKILL.md in scope. Check ALL dimensions across ALL skills in scope.

### D1: Flow Integrity
- Every `ln-NNN` reference in workflow/worker tables points to an existing `ln-NNN-*/SKILL.md`
- No circular delegation loops (A → B → A)
- Every worker invocation has a matching caller reference in the target skill
- No dead-end flows (delegation to a worker with no output/return path)
- Peer coordinators (L2 siblings under same L1) do not reference each other — cross-group coordination is L1's job
- Peer workers (L3 siblings under same L2) do not reference each other — each worker knows only its coordinator

### D2: Cross-Reference Consistency
- `MANDATORY READ` paths exist on disk (Glob each path)
- `Reference Files` section paths exist on disk
- Caller/callee references are bidirectional: if A lists B as worker, B mentions A as caller
- Skill invocation names (`skill: "ln-NNN-*"`) match actual directory names
- No passive file references (`See`, `Per`, `Follows` pointing to files) — must be `**MANDATORY READ:** Load`
- Multiple `**MANDATORY READ:**` in same section → group into ONE block at section start
- `> **Paths:**` note present after frontmatter if SKILL.md contains any file references

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
- No filler words: "simply", "quickly", "easily", "on top of that", "in many cases"
- Passive voice where active is clearer ("File should be loaded" → "Load file")
- Sentences over 25 words — flag for splitting
- Verbose phrases not applied from `shared/concise_terms.md` ("in order to" → "to", "make sure that" → "ensure")

### D6: Stale Artifacts
- No references to removed/renamed skills or files
- No outdated caller names (skill renamed but old name in callers)
- No instructions about features that no longer exist
- No placeholder/TODO markers left from previous edits

### D7: Structural Compliance
- YAML frontmatter has `name` and `description` fields
- If `description` contains `:`, it is wrapped in double quotes (prevents YAML parse break)
- `**Version:** X.Y.Z` and `**Last Updated:** YYYY-MM-DD` present at end of file
- No `**Changes:**` section exists (git history tracks changes, not inline changelog)
- `diagram.html` file exists in the skill directory
- Files in `references/` are actually referenced from SKILL.md (no orphan reference files)

### D8: Architecture Conformance
- SKILL.md ≤ 800 lines total (SRP threshold per SKILL_ARCHITECTURE_GUIDE)
- Frontmatter `description` ≤ 200 chars
- Phase/step numbering is sequential (1, 2, 3, 4 — no gaps). Exception: 4a/4b for CREATE/REPLAN
- Orchestrators (L1/L2) delegate work, not execute directly — no detailed implementation logic in their SKILL.md
- Workers (L3) execute, not decide workflow — no routing/priority logic in their SKILL.md
- L2→L2 cross-category delegation follows forward-flow (0XX→1XX→…→6XX), except 0XX shared services

### D9: Pattern Compliance (conditional — `ln-6*` audit skills only)
- References `shared/references/two_layer_detection.md` via MANDATORY READ (Layer 1: grep, Layer 2: context)
- Scoring formula consistent: `penalty = (C×2.0) + (H×1.0) + (M×0.5) + (L×0.2)`
- Report structure follows `shared/templates/audit_worker_report_template.md`

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

If zero findings: `All 9 dimensions clean. No issues found.`

## Rules
- Read ALL skills in scope before reporting — do not stop at first finding
- Fix errors immediately, do not defer
- Do NOT update versions or dates unless user explicitly requests it
- `shared/` changes affect every skill that references them — always check reverse dependencies
