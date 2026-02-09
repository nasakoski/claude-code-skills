---
description: Restore project context after memory loss or compression
allowed-tools: Read, Edit
---

# Context Refresh (claude-code-skills)

<!-- SCOPE: Context refresh procedure ONLY. Contains minimal anchor files, deep dive sections, output format. -->
<!-- DO NOT add here: skill details → individual SKILL.md files, architecture → docs/SKILL_ARCHITECTURE_GUIDE.md -->

## Project Profile Constants
| Variable | Description | Value |
|-----------|--------------|--------|
| `<DOCS_ROOT>` | Documentation folder | `docs` |
| `<ENTRY_FILE>` | Repository entry point | `CLAUDE.md` |
| `<SKILLS_ROOT>` | Skills collection root | `.` |

---

## 1. Preparation
> Use this procedure when context was cleared, compressed, or lost (e.g., after `/clear` or session reset).
> Goal: fully reload repository structure, skill architecture patterns, and development workflows.

> [!WARNING]
> Before any work with skills, **ALWAYS read** `docs/SKILL_ARCHITECTURE_GUIDE.md` for best practices 2024-2025: Orchestrator-Worker Pattern, Single Responsibility Principle, Token Efficiency, Task Decomposition guidelines, Red Flags.

---

## 2. Refresh Core Knowledge

### Minimal Anchor (ALWAYS loaded)

**Essential context for orientation (~500 lines, ~15% context):**

- [ ] Read `<ENTRY_FILE>` - repository rules, key concepts, versioning workflow
- [ ] Read `README.md` (sections: Features tables, Key Concepts) - overview of 84 skills in 7 categories
- [ ] Read `docs/SKILL_ARCHITECTURE_GUIDE.md` (sections: TOC, Core Principles, Orchestrator-Worker Pattern)
- [ ] Read `docs/DOCUMENTATION_STANDARDS.md` - industry best practices 2024-2025

**After loading the base set:** Proceed to section 3. Based on current work type, load additional documents from "Deep Dive" below.

---

### Deep Dive (ON DEMAND)

**When working with skill architecture:**
- [ ] Read `docs/SKILL_ARCHITECTURE_GUIDE.md` (full, 835 lines)
- [ ] Read `docs/DOCUMENTATION_STANDARDS.md` (159 lines)
- [ ] Read `shared/concise_terms.md` (116 lines)

**When creating/editing a skill:**
- [ ] Read specific `{skill}/SKILL.md` (150-400 lines)
- [ ] Read `{skill}/references/` - templates, guides, checklists
- [ ] Read `docs/SKILL_ARCHITECTURE_GUIDE.md` (full)

**When working with repository documentation:**
- [ ] Read `CONTRIBUTING.md` (207 lines)
- [ ] Read `docs/github_readme_best_practices.md` (432 lines)
- [ ] Read `docs/DOCUMENTATION_STANDARDS.md` (159 lines)

**When working with plugin/marketplace:**
- [ ] Read `.claude-plugin/marketplace.json` - skills list
- [ ] Read `README.md` (section: Installation)

**When working with 0XX Shared/Research:**
- [ ] Read `ln-001-standards-researcher/SKILL.md` - standards via MCP Ref
- [ ] Read `ln-002-best-practices-researcher/SKILL.md` - guides/manuals/ADRs/research

**When working with 1XX Documentation Pipeline:**
- [ ] Read `ln-100-documents-pipeline/SKILL.md` - L1 orchestrator
- [ ] Read `ln-110-project-docs-coordinator/SKILL.md` - L2 coordinator
- [ ] Read `ln-111-root-docs-creator/SKILL.md` through `ln-115-devops-docs-creator/SKILL.md` - L3 workers
- [ ] Read `ln-120-reference-docs-creator/SKILL.md` through `ln-150-presentation-creator/SKILL.md` - L2 workers

**When working with 2XX Planning:**
- [ ] Read `ln-200-scope-decomposer/SKILL.md` - L1 orchestrator (Scope -> Epics -> Stories)
- [ ] Read `ln-210-epic-coordinator/SKILL.md` - CREATE/REPLAN Epics
- [ ] Read `ln-220-story-coordinator/SKILL.md` - CREATE/REPLAN Stories
- [ ] Read `ln-221-story-creator/SKILL.md` - L3 CREATE worker
- [ ] Read `ln-222-story-replanner/SKILL.md` - L3 REPLAN worker
- [ ] Read `ln-230-story-prioritizer/SKILL.md` - RICE prioritization

**When working with 3XX Task Management:**
- [ ] Read `ln-300-task-coordinator/SKILL.md` - L2 coordinator (Story -> Tasks)
- [ ] Read `ln-301-task-creator/SKILL.md` - L3 CREATE worker
- [ ] Read `ln-302-task-replanner/SKILL.md` - L3 REPLAN worker
- [ ] Read `ln-310-story-validator/SKILL.md` - auto-fix Stories/Tasks
- [ ] Read `ln-311-agent-reviewer/SKILL.md` - external agent review for Stories

**When working with 4XX Execution:**
- [ ] Read `ln-400-story-executor/SKILL.md` - L1 orchestrator
- [ ] Read `ln-401-task-executor/SKILL.md` - implementation tasks
- [ ] Read `ln-402-task-reviewer/SKILL.md` - To Review -> Done/Rework
- [ ] Read `ln-403-task-rework/SKILL.md` - fix tasks
- [ ] Read `ln-404-test-executor/SKILL.md` - test tasks

**When working with 5XX Quality:**
- [ ] Read `ln-500-story-quality-gate/SKILL.md` - thin orchestrator (verdict + Quality Score)
- [ ] Read `ln-510-quality-coordinator/SKILL.md` - quality checks coordinator
- [ ] Read `ln-511-code-quality-checker/SKILL.md` - code quality
- [ ] Read `ln-512-agent-reviewer/SKILL.md` - external agent review
- [ ] Read `ln-513-regression-checker/SKILL.md` - regression tests
- [ ] Read `ln-520-test-planner/SKILL.md` - test planning orchestrator
- [ ] Read `ln-521-test-researcher/SKILL.md` - test research (common problems, competitors)
- [ ] Read `ln-522-manual-tester/SKILL.md` - manual AC testing
- [ ] Read `ln-523-auto-test-planner/SKILL.md` - auto test planning

**When working with 6XX Audit:**
- [ ] Read `ln-600-docs-auditor/SKILL.md` - documentation quality
- [ ] Read `ln-610-code-comments-auditor/SKILL.md` - code comments
- [ ] Read `ln-620-codebase-auditor/SKILL.md` - L2 coordinator (9 workers)
- [ ] Read `ln-621-629-*.auditor/SKILL.md` - L3 audit workers
- [ ] Read `ln-630-test-auditor/SKILL.md` - L2 coordinator (5 workers)
- [ ] Read `ln-631-635-*.auditor/SKILL.md` - L3 test audit workers

**When working with 7XX Bootstrap:**
- [ ] Read `ln-700-project-bootstrap/SKILL.md` - L1 top orchestrator
- [ ] Read `ln-710-dependency-upgrader/SKILL.md` - L2 coordinator (npm, nuget, pip)
- [ ] Read `ln-711-713-*-upgrader/SKILL.md` - L3 upgrader workers
- [ ] Read `ln-720-structure-migrator/SKILL.md` - L2 coordinator (structure migration)
- [ ] Read `ln-721-724-*/SKILL.md` - L3 structure workers (frontend, backend, seed-data, artifact-cleaner)

**When working with versioning/release:**
- [ ] Read `CHANGELOG.md` - release history
- [ ] Read `CLAUDE.md` (section: Versioning + Maintenance After Changes)

---

## 3. Output After Refresh
After completing the refresh, respond with:

1. **Status:** "Context refreshed (Light mode - ~500 lines)."
2. **Project Summary:** "claude-code-skills - Collection of 84 skills for Claude Code in 7 categories (0XX Shared, 1XX Documentation, 2XX Planning, 3XX Task Management, 4XX Execution, 5XX Quality, 6XX Audit, 7XX Bootstrap)."
3. **Current Work Type:** Identify current work type
4. **Next Steps:** what to work on next
5. **Load Recommendation:** which additional documents to load from "Deep Dive"

**Example Output:**
```
Context refreshed (Light mode - ~500 lines).

**Project:** claude-code-skills - 84 skills for Claude Code, integrated with Linear.

**Current Work:** Editing ln-400-story-executor skill (L1 orchestrator).

**Next Steps:** Review ln-400-story-executor/SKILL.md, check orchestration logic.

**Load Recommendation:**
- Load `ln-400-story-executor/SKILL.md` + `references/`
- Load `docs/SKILL_ARCHITECTURE_GUIDE.md` (full) for Orchestrator-Worker Pattern
- Load `ln-401-task-executor/SKILL.md` + `ln-404-test-executor/SKILL.md` (L3 workers)
```

---

## Maintenance

**File Updates:**
- Update this file if folder structure or document paths change
- When adding new skills, add them to corresponding "Deep Dive" section by category (0XX-6XX)

**Content Rules:**
- Keep "Minimal Anchor" under 500 lines total
- Organize skills by category (0XX-6XX), not alphabetically

**Optimization Targets:**
- Light mode refresh: <15% context (~500 lines)
- Medium mode refresh: 15-50% context (500-1500 lines)
- Full mode refresh: 50-75% context (1500-3000 lines)

**Architecture Reminders:**
- **Orchestrator-Worker Pattern:** L1 (Top Orchestrators) -> L2 (Domain Coordinators) -> L3 (Workers)
- **Token Efficiency:** Metadata-Only Loading for orchestrators, Full descriptions only for workers
- **7 Categories:** 0XX Shared, 1XX Docs, 2XX Planning, 3XX Tasks, 4XX Execution, 5XX Quality, 6XX Audit, 7XX Bootstrap

**Last Updated:** 2026-01-10
