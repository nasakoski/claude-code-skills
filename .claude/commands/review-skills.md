---
description: "Review changed skills: 9 structural dimensions (D1-D9) + 5 intent checks (M1-M5: goal clarity, approach optimality, ecosystem consistency, rewrite delta, necessity). Fix in-place."
allowed-tools: Read, Grep, Glob, Bash, Edit
---

# Skill Coherence Review

You review changed skills across 9 structural dimensions (D1-D9) and 5 intent checks (M1-M5), then fix issues in-place.

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
- No filler words: "simply", "quickly", "easily", "on top of that", "in many cases"
- Passive voice where active is clearer ("File should be loaded" → "Load file")
- Sentences over 25 words — flag for splitting
- Verbose phrases not applied from `shared/concise_terms.md` ("in order to" → "to", "make sure that" → "ensure")
- Every content block must enable a specific agent action or decision — remove if agent behavior unchanged without it
- Tables must add information beyond adjacent text, templates, or formulas — no restating
- 1:1 mapping tables (each row = one input → one output, no conditions) → convert to inline list
- Tables echoing template section names/structure → reference the template, don't duplicate

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
- Coupling reduction in `shared/` files — shared references describe patterns, NOT consumers. Forbidden in any form: `Used by`, `Skills using this:`, `For ln-NNN`, `via ln-NNN` suffixes, skill names in role descriptions, skill IDs in code examples. Use generic role names (`task executor`, `review worker`). Consumers reference shared via MANDATORY READ; reverse direction is never needed

### D9: Pattern Compliance (conditional — `ln-6*` audit skills only)
- References `shared/references/two_layer_detection.md` via MANDATORY READ (Layer 1: grep, Layer 2: context)
- Scoring formula consistent: `penalty = (C×2.0) + (H×1.0) + (M×0.5) + (L×0.2)`
- Report structure follows `shared/templates/audit_worker_report_template.md`

## Phase 3: Intent Review

Evaluate DESIGN INTENT of changes. Applies to primary skills only (affected/dependency skills have no changed intent to review).

**MANDATORY READ:** Load `docs/SKILL_ARCHITECTURE_GUIDE.md` (Red Flags, SRP Decision Tree, Best Practices Checklists).

For each primary skill, read the git diff (`git diff HEAD -- {skill_dir}/`).

### M1: Goal Clarity
- REAL GOAL evident from diff + commit message alone (apply `shared/references/goal_articulation_gate.md`)
- NOT THE GOAL identified — surface-level reading would NOT produce the same answer as REAL GOAL
- Goal unclear from diff alone → `UNCLEAR_GOAL` (RETHINK); warn that Phase 4 fixes may address wrong intent

### M2: Approach Optimality (scope: NEW changes only)
- New abstractions count ≤3 (phases, reference files, shared patterns)
- No Red Flags triggered from SKILL_ARCHITECTURE_GUIDE table
- KISS/YAGNI criteria pass per `shared/references/creation_quality_checklist.md` (#11, #12)
- No simpler approach achieves the same goal with fewer lines/phases/files
- Simpler alternative exists → finding with specific description (SIMPLIFY or RETHINK)

### M3: Ecosystem Consistency
- 2-3 peer skills in same category (same NXX prefix) use consistent delegation pattern, hierarchy level, workflow pattern
- No existing `shared/references/` file that changed skill should reuse but doesn't
- Divergence from peers has documented rationale
- Missed shared/ reuse → finding with specific file path (SIMPLIFY)

### M4: Rewrite Delta (scope: WHOLE skill-as-changed)
- SRP Decision Tree applied to skill-as-changed (not just the diff)
- Tree does NOT suggest different structure (split/combine/re-level)
- If delta HIGH (>30% different from clean-slate design) → 1-3 sentence structural recommendation (RETHINK)

### M5: Necessity
- Every changed hunk maps to M1's REAL GOAL
- No speculative features, "future use" code, premature abstraction (YAGNI)
- No new backward-compat shims or unused artifacts per `shared/references/clean_code_checklist.md`
- Research-to-Action Gate: if change is inspired by external research/article/benchmark — what specific defect in current output does it fix? No concrete defect → REVERT (research is informational, not actionable; changes that don't fix a real problem must be rolled back)
- Unnecessary hunks → specific what-to-remove (SIMPLIFY)

**Finding categories:**
- **SIMPLIFY** — concrete reduction possible, may be auto-fixed
- **RETHINK** — design decision needed, NOT auto-fixable, advisory only
- **REVERT** — change does not fix a concrete defect, must be rolled back

## Phase 4: Fix

For each finding:
- **Fixable** (wrong path, stale ref, missing bidirectional ref, duplicated content) — fix immediately via Edit
- **Ambiguous** (conflicting thresholds where correct value unclear) — list in report, do NOT guess
- **SIMPLIFY** (from Phase 3) with unambiguous action — fix immediately
- **REVERT** (from Phase 3) — roll back the change via Edit (restore original content from git)
- **RETHINK** (from Phase 3) — do NOT fix, pass to Phase 5 report

## Phase 5: Report

```
## Skill Coherence Review

**Scope:** {list of reviewed skills}

### Fixed ({count})
| # | Skill | Dim | Issue | Fix Applied |
|---|-------|-----|-------|-------------|

### Intent Findings ({count})
| # | Skill | Dim | Finding | Category |
|---|-------|-----|---------|----------|

Categories: RETHINK (design decision needed), SIMPLIFY (concrete reduction — auto-fixed above or listed here)

### Remaining Concerns ({count})
| # | Skill | Dim | Issue | Why Not Auto-Fixed |
|---|-------|-----|-------|--------------------|

### Clean
Dimensions with no findings: {list}
```

If zero findings: `All 9 structural dimensions + 5 intent checks clean. No issues found.`

## Rules
- Read ALL skills in scope before reporting — do not stop at first finding
- Fix errors immediately, do not defer
- Do NOT update versions or dates unless user explicitly requests it
- `shared/` changes affect every skill that references them — always check reverse dependencies
- Intent review (M1-M5) evaluates DESIGN, not correctness — findings are judgment-based, not binary
- RETHINK findings are advisory — explain WHY, author decides WHETHER to act
- REVERT findings are executed immediately — changes without concrete defect are rolled back, listed in Fixed table
