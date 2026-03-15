# AGENTS.md

> **SCOPE:** Entry point with rules and navigation ONLY. Detailed guides in `docs/`. Skill workflows in individual `SKILL.md` files. Public documentation in `README.md`.

Skills collection for Codex with config-driven Agile task management (Linear or File Mode).

## Critical Rules

**Read this table BEFORE starting any work.**

| Rule | When to Apply | Details |
|------|---------------|---------|
| **Read Architecture Guide first** | Before working with skills | `cat docs/SKILL_ARCHITECTURE_GUIDE.md` — L0-L3 hierarchy, SRP, Token Efficiency, Red Flags |
| **MANDATORY READ pattern** | File references in SKILL.md | Use `**MANDATORY READ:** Load {file}`. Passive refs (`See`, `Per`, `Follows`) are NOT followed by agents. Group multiple into ONE block at section start |
| **Path Resolution** | File paths in SKILL.md | Relative to skills repo root, NOT target project. Every SKILL.md with file refs includes `> **Paths:**` note after frontmatter |
| **Sequential Numbering** | Phases/Sections/Steps | 1, 2, 3, 4 (NOT 1, 1.5, 2). Exception: 4a (CREATE), 4b (REPLAN) |
| **Docs in English** | All documentation | Stories/Tasks can be EN/RU regardless of provider |
| **Code Comments 15-20%** | Writing code in skills | WHY not WHAT. No historical notes, no code examples. Task/ADR IDs as spec refs only |
| **No version auto-updates** | After any changes | Update versions ONLY when user explicitly requests. Default: change files, do NOT touch versions |
| **YAML description quoting** | SKILL.md frontmatter | If `description:` contains `:`, wrap in double quotes |
| **Research-to-Action Gate** | Before turning research into changes | "What specific defect in current skill output does this fix?" No defect = informational, not actionable |
| **No hardcoded counts** | Documentation files | Counts ONLY in README.md badge (`skills-NNN`). Everywhere else: no aggregate counts |
| **No Changes sections** | SKILL.md versioning | `**Version:** X.Y.Z` + `**Last Updated:** YYYY-MM-DD` at end. Git history tracks changes |
| **DoD with checkboxes** | All SKILL.md files | `## Definition of Done` section with `- [ ]` items |
| **Worker independence** | L3 Worker SKILL.md | No `**Parent:**`, no coordinator names, no peer cross-references (`→ ln-NNN`). Workers are standalone-invocable. Coordinator knows workers (top-down), not reverse |

## Quick Understanding

| What | How |
|------|-----|
| Project overview + full tree | `cat README.md` |
| Skill count | `ls -d ln-*/SKILL.md \| wc -l` |
| Architecture patterns (L0-L3) | `cat docs/SKILL_ARCHITECTURE_GUIDE.md` |
| Agent Teams runtime (hooks, Windows) | `cat docs/AGENT_TEAMS_PLATFORM_GUIDE.md` |
| Tool configuration (Linear/File Mode) | `cat shared/references/tools_config_guide.md` |
| Key workflow | `ln-700 → ln-100 → ln-200 → ln-1000` (or manually: `ln-400 → ln-500`) |
| Skill metadata | `head -20 {ln-NNN}/SKILL.md` (frontmatter + type/category) |
| Reference files for a skill | `ls {ln-NNN}/references/` |
| Shared templates | `ls shared/templates/` |
| Questions format | `cat docs/QUESTIONS_FORMAT.md` |

## Navigation

**DAG:** AGENTS.md → `docs/README.md` → topic docs. Read SCOPE tag first in each doc.

| Topic | File |
|-------|------|
| Writing Guidelines | `docs/SKILL_ARCHITECTURE_GUIDE.md` §Writing Guidelines |
| Tool Configuration (Phase 0) | `shared/references/tools_config_guide.md` |
| Task kanban + Team ID | `docs/tasks/kanban_board.md` |
| Risk-Based Testing | `shared/references/risk_based_testing_guide.md` |
| Questions format | `docs/QUESTIONS_FORMAT.md` |

## Maintenance

**Version update protocol** (ONLY when user explicitly requests):

1. Update `**Version:**` in `{skill}/SKILL.md`
2. Update version in README.md feature tables
3. Update CHANGELOG.md — one summary paragraph per date (`## YYYY-MM-DD`), no duplicate dates

**Last Updated:** 2026-03-15
