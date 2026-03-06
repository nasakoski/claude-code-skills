# CLAUDE.md

<!-- SCOPE: Repository rules and AI agent instructions ONLY. ~140 lines index. Detailed guides in docs/. -->
<!-- DO NOT add here: public documentation -> README.md, architecture patterns -> docs/SKILL_ARCHITECTURE_GUIDE.md, skill workflows -> individual SKILL.md files -->

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository

This is a collection of skills for Claude Code with config-driven Agile task management (Linear or File Mode per `docs/tools_config.md`).

> [!WARNING]

> Before starting any work with skills in this repository, **ALWAYS read** [docs/SKILL_ARCHITECTURE_GUIDE.md](docs/SKILL_ARCHITECTURE_GUIDE.md) for industry best practices (2024-2026): Orchestrator-Worker Pattern, Single Responsibility Principle, Token Efficiency, Subagents vs Agent Teams, Task Decomposition guidelines, and Red Flags to avoid. For Agent Teams runtime patterns (hooks, heartbeat, crash recovery, Windows): [docs/AGENT_TEAMS_PLATFORM_GUIDE.md](docs/AGENT_TEAMS_PLATFORM_GUIDE.md).

## Documentation Levels

| Level | Files | Audience |
|-------|-------|----------|
| **1. Project** | CLAUDE.md + docs/ | AI agent developing/maintaining skills |
| **2. Public** | README.md | GitHub visitors (developers, users) |
| **3. Templates** | {skill}/references/*_template.md | Target projects created by skills |

**No duplication** across levels. Same concepts in different files serve different contexts.

## Writing Guidelines

See [Writing Guidelines](docs/SKILL_ARCHITECTURE_GUIDE.md#writing-guidelines-progressive-disclosure-pattern) in SKILL_ARCHITECTURE_GUIDE.md.

## Visual Documentation

Most skills have `diagram.html` (embedded Mermaid) + `shared/css/diagram.css` (87 of 109). See [Visual Documentation](README.md#-visual-documentation) in README.md.

## Available Skills

**109 skills** in 9 categories (0XX Shared/Research, 1XX Documentation, 2XX Planning, 3XX Task Management, 4XX Execution, 5XX Quality, 6XX Audit, 7XX Bootstrap, 10XX Orchestration). See [README.md](README.md#-features) for complete list.

**Key workflow:** ln-700-project-bootstrap -> ln-100-documents-pipeline -> ln-201-opportunity-discoverer (optional) -> ln-200-scope-decomposer -> **ln-1000-pipeline-orchestrator** (or manually: ln-400-story-executor -> ln-500-story-quality-gate)

## Key Concepts

### Tool Configuration (Phase 0)
All skills read `docs/tools_config.md` at startup (auto-bootstrapped if missing). This config determines: task provider (Linear/File Mode), research chain, git strategy. See `shared/references/tools_config_guide.md`. Task numbering and Team ID come from `docs/tasks/kanban_board.md`. Both created by ln-130/ln-111 or auto-bootstrapped by any skill.

### Task Hierarchy, Kanban Board, Development Principles, Task Templates, DAG Support
See [README.md](README.md#-key-concepts) for detailed structure, principles, and template references.

## Decomposition Workflow

Four levels: Scope -> Epics (ln-210) -> Stories (ln-220) -> RICE Prioritization (ln-230) -> Tasks (ln-300). See [README.md](README.md#-key-concepts) for complete flow.

## Skill Workflows

All 109 skills documented in [README.md](README.md#-features) with workflows in each SKILL.md. Follow Orchestrator-Worker Pattern per [SKILL_ARCHITECTURE_GUIDE.md](docs/SKILL_ARCHITECTURE_GUIDE.md).

## Important Details

**Structural Validation:** ln-310-story-validator auto-fixes Stories/Tasks against template compliance.

**Testing:** Risk-Based Testing (Priority ≥15, Usefulness Criteria). See [risk_based_testing_guide.md](shared/references/risk_based_testing_guide.md).

**Code Comments:** 15-20% ratio. Explain WHY, not WHAT. NO Epic/Task IDs, NO historical notes, NO code examples.

**Documentation Language:** All docs in English except Stories/Tasks (can be English/Russian regardless of provider).

**Sequential Numbering:** Phases/Sections/Steps: 1, 2, 3, 4 (NOT 1, 1.5, 2). Exceptions: Phase 4a (CREATE), 4b (REPLAN).

**File References in Skills:** MUST use `**MANDATORY READ:** Load {file}` pattern. Passive references (`See`, `Per`, `Follows`) are NOT followed by agents. Group multiple references into ONE `**MANDATORY READ:**` at section start.

**Path Resolution:** File paths in SKILL.md (`shared/`, `references/`, `../ln-*`) are relative to skills repo root, NOT target project. Every SKILL.md with file references includes a `> **Paths:**` note after frontmatter.

## Working with Skill Files

**SKILL.md Metadata:** YAML frontmatter with `name` and `description`. If `description` contains colons (`:`), wrap in double quotes.

**Reference Files:** Stored in `{skill}/references/` — templates, integration guides, checklists, structure templates.

**Questions Files:** Format for validation questions in skills. See [docs/QUESTIONS_FORMAT.md](docs/QUESTIONS_FORMAT.md).

## Versioning

All skills have versions at end of file: `**Version:** X.Y.Z` + `**Last Updated:** YYYY-MM-DD`. Do NOT add **Changes:** sections — git history tracks changes.

## Maintenance After Changes

> [!WARNING]

> Version updates are performed ONLY when explicitly requested by the user, NOT automatically.

**Default:** Make changes to skill files. Do NOT update versions in SKILL.md, CLAUDE.md, README.md, or CHANGELOG.md.

**When user explicitly requests version update:**
1. Update skill version in `{skill}/SKILL.md`
2. Update version in CLAUDE.md "Available Skills" section
3. Update version in README.md feature tables
4. Update CHANGELOG.md — one summary paragraph per date (`## YYYY-MM-DD`), no duplicate dates
5. Update Last Updated date below

**Last Updated:** 2026-02-15
