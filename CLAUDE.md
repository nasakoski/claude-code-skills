# CLAUDE.md

<!-- SCOPE: Repository rules and AI agent instructions ONLY. Contains skill overview, key concepts, versioning workflow, code comments rules. -->
<!-- DO NOT add here: public documentation → README.md, architecture patterns → docs/SKILL_ARCHITECTURE_GUIDE.md, skill workflows → individual SKILL.md files -->

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository

This is a collection of skills for Claude Code, integrated with Linear for Agile-style task management.

> [!WARNING]

> Before starting any work with skills in this repository, **ALWAYS read** [docs/SKILL_ARCHITECTURE_GUIDE.md](docs/SKILL_ARCHITECTURE_GUIDE.md) for industry best practices (2024-2025): Orchestrator-Worker Pattern, Single Responsibility Principle, Token Efficiency, Task Decomposition guidelines, and Red Flags to avoid.

## Documentation Levels

This repository contains 3 distinct levels of documentation, each serving different audiences:

| Level | Files | Audience | Purpose |
|-------|-------|----------|---------|
| **1. Project Documentation** | CLAUDE.md + docs/ | Claude Code working in THIS repository | Instructions for AI agent when developing/maintaining skills repository |
| **2. Public Documentation** | README.md | GitHub visitors (developers, users) | Repository overview, installation, usage examples for external users |
| **3. Template Documentation** | {skill}/references/*_template.md | Target projects (created by skills) | Templates copied to NEW projects, become their context (not for this repo) |

**Key Points:**
- **No duplication** - Same concepts in different files serve different contexts
- **CLAUDE.md** - Context for working WITH skills (editing, maintaining)
- **README.md** - Context for working USING skills (installing, learning)
- **Templates** - Context for projects CREATED BY skills (ln-111-115, ln-321, etc.)

**Example:**
- Development Principles in CLAUDE.md → for Claude Code maintaining skills
- Development Principles in README.md → for users understanding skill philosophy
- Development Principles in principles_template.md → copied to target projects by ln-111-root-docs-creator (via ln-110 coordinator)

## Writing Guidelines

See [Writing Guidelines](docs/SKILL_ARCHITECTURE_GUIDE.md#writing-guidelines-progressive-disclosure-pattern) in SKILL_ARCHITECTURE_GUIDE.md for detailed format examples, content type formatting rules, and compression targets.

## Visual Documentation

All skills have state diagrams in `diagram.html` files for visualizing workflows and decision points.

**Structure:** `diagram.html` (embedded Mermaid) + `shared/css/diagram.css` (universal styles). No separate .mmd files.

> [!NOTE]

> For diagram types, viewing instructions, editing guide, and color coding, see [Visual Documentation](README.md#-visual-documentation) in README.md.

### Available Skills

**100 skills** in 8 categories (0XX Shared/Research, 1XX Documentation, 2XX Planning, 3XX Task Management, 4XX Execution, 5XX Quality, 6XX Audit, 7XX Bootstrap). See [README.md](README.md#-features) for complete skill list with descriptions and versions.

**Key workflow:** ln-700-project-bootstrap → ln-100-documents-pipeline → ln-201-opportunity-discoverer (optional) → ln-200-scope-decomposer → ln-400-story-executor → ln-500-story-quality-gate

## Key Concepts

### Configuration Auto-Discovery
All skills automatically find settings from `docs/tasks/kanban_board.md`: Team ID, Next Epic Number, Next Story Number. Create via ln-130-tasks-docs-creator or ln-100-documents-pipeline orchestrator. If file is missing, skills request data directly from user.

### Task Hierarchy, Kanban Board, Development Principles, Task Templates, DAG Support
See [README.md](README.md#-key-concepts) for detailed structure, principles, and template references.

## Decomposition Workflow

Four levels: Scope → Epics (ln-210) → Stories (ln-220) → RICE Prioritization (ln-230) → Tasks (ln-300). See [README.md](README.md#-key-concepts) for complete flow, optimal counts by complexity, and Decompose-First Pattern details.

## Skill Workflows

All 99 skills documented in [README.md](README.md#-features) feature tables with workflows in each skill's SKILL.md file. Follow Orchestrator-Worker Pattern per [SKILL_ARCHITECTURE_GUIDE.md](docs/SKILL_ARCHITECTURE_GUIDE.md).

## Important Details

**Structural Validation:** ln-310-story-validator auto-fixes Stories/Tasks against template compliance. See [ln-310-story-validator/SKILL.md](ln-310-story-validator/SKILL.md) Phase 1.

**Testing:** Risk-Based Testing (2-5 E2E, 3-8 Integration, 5-15 Unit, Priority ≥15). See [risk_based_testing_guide.md](shared/references/risk_based_testing_guide.md).

**Code Comments:** 15-20% ratio. Explain WHY, not WHAT. NO Epic/Task IDs, NO historical notes, NO code examples. Only critical technical details (DB optimizations, API quirks, constraints).

**Documentation Language:** All docs in English except Stories/Tasks in Linear (can be English/Russian). ln-310-story-validator preserves original language.

**Sequential Numbering:** Phases/Sections/Steps: 1, 2, 3, 4 (NOT 1, 1.5, 2). Exceptions: Phase 4a (CREATE), 4b (REPLAN) for conditional branching.

**File References in Skills:** All file references in SKILL.md workflow sections MUST use `**MANDATORY READ:** Load {file}` pattern. Passive references (`See`, `Per`, `Follows`) are NOT followed by agents. If a skill references the same file multiple times, group into ONE `**MANDATORY READ:**` at the start of the relevant section, then reference specific parts inline (e.g., `per checklist #9`).

**Path Resolution:** File paths in SKILL.md (`shared/`, `references/`, `../ln-*`) are relative to the skills repository root, NOT the target project. When a file is not found at CWD, the agent MUST resolve it from the SKILL.md file's directory (go up one level = repo root). Every SKILL.md with file references includes a `> **Paths:**` note after frontmatter. **Rule for skill authors:** never assume `shared/` or `references/` exist in the target project — always direct agents to the skill's own repository.

## Working with Skill Files

### SKILL.md Metadata
Each SKILL.md starts with YAML frontmatter:
```yaml
---
name: skill-name
description: "Short description for Claude Code skill selector"
---
```

> [!IMPORTANT]
> **YAML Quoting Rule:** If `description` contains colons (`:`), it MUST be wrapped in double quotes. Without quotes, YAML parser interprets colons as key-value separators, causing "mapping values are not allowed" errors.

### Reference Files
Stored in `{skill}/references/` and used by skill for:
- Document templates (epic_template_universal.md, story_template_universal.md, task_template_implementation.md, test_task_template.md)
- Integration guides (linear_integration.md)
- Checklists (verification_checklist.md)
- Structure templates (guide_template.md)

### Questions Files (questions.md)

**Purpose:** Define validation questions for documents created by skills. Used in CREATE mode (user answers questions) and VALIDATE mode (check document compliance).

**Structure:**
```markdown
## Table of Contents
| Document | Questions | Auto-Discovery | Priority | Line |
...

<!-- DOCUMENT_START: {document_name} -->
## {document_name}
...
<!-- QUESTION_START: N -->
### Question N: ...
...
<!-- QUESTION_END: N -->
...
<!-- DOCUMENT_END: {document_name} -->
```

**Key Features:**
1. **Table of Contents:** Quick navigation with metadata (Questions count, Auto-Discovery level, Priority, Line number)
2. **Document markers:** `<!-- DOCUMENT_START/END -->` wrap each document section for programmatic extraction
3. **Question markers:** `<!-- QUESTION_START/END -->` wrap individual questions for precise context loading
4. **Token Efficiency:** Load only needed sections (e.g., 30 lines for required questions vs 475 lines full file)

**Programmatic Parsing:**
```javascript
// Extract document section
const regex = /<!-- DOCUMENT_START: CLAUDE\.md -->([\s\S]*?)<!-- DOCUMENT_END: CLAUDE\.md -->/;
const section = content.match(regex)[1];

// Extract specific question
const qRegex = /<!-- QUESTION_START: 2 -->([\s\S]*?)<!-- QUESTION_END: 2 -->/;
const question = section.match(qRegex)[1];
```

**Example:** [ln-111-root-docs-creator/references/questions_root.md](ln-111-root-docs-creator/references/questions_root.md) uses this format for 4 root documents with 22 questions (split from original 48 across 5 L3 workers).

## Versioning

All skills and templates have versions and last update dates at end of file:
```
**Version:** X.Y.Z
**Last Updated:** YYYY-MM-DD
```

> [!WARNING]

> Do NOT add **Changes:** section in SKILL.md files and here. Git history tracks all changes.

## Maintenance After Changes

> [!WARNING]

> Version updates (skill version, CLAUDE.md, README.md, CHANGELOG.md) are performed ONLY when explicitly requested by the user, NOT automatically with every change.

**When making documentation fixes or code changes:**
- Make the changes to skill files as needed
- Do NOT update versions in SKILL.md, CLAUDE.md, README.md, or CHANGELOG.md
- Wait for explicit user request: "Update versions" or "Create new release"

**When user explicitly requests version update:**

1. **Update skill version** in `{skill}/SKILL.md` (at end of file)
2. **Update version in CLAUDE.md** in "Available Skills" section (lines 95-122)
3. **Update version in README.md** in feature tables (lines 30-70)
4. **Update CHANGELOG.md** - One summary paragraph per date:
   - Format: `## YYYY-MM-DD` (date only, no version numbers)
   - Single paragraph summarizing ALL changes for that day
   - **Rule:** Cannot have multiple entries for the same date
5. **Update Last Updated date** in CLAUDE.md (below)

**Example CHANGELOG entry:**
```markdown
## 2025-11-12

Refactored CLAUDE.md to eliminate duplication with docs/ (327→141 lines, -57%).
Removed Writing Guidelines, Skill Workflows, Decomposition details - replaced with
links. Kept only repository-specific content: Configuration Auto-Discovery, Code
Comments rules, Documentation Language policy, Versioning workflow.
```

**Last Updated:** 2026-02-05