# CLAUDE.md

> **SCOPE:** Entry point with rules and navigation ONLY. Guides in `docs/`. Workflows in `SKILL.md`. Public docs in `README.md`.

Skills collection for Claude Code with config-driven Agile task management (Linear or File Mode).

## Critical Rules

| Rule | Details |
|------|---------|
| **Architecture Guide** | Read `docs/architecture/SKILL_ARCHITECTURE_GUIDE.md` before any skill work |
| **MANDATORY READ** | Use `**MANDATORY READ:** Load {file}`. Passive refs are NOT followed |
| **Path Resolution** | Relative to skills repo root, NOT target project |
| **Sequential Numbering** | 1, 2, 3 (NOT 1.5). Sub-steps: Na/Nb (3a, 4a) |
| **Docs in English** | Stories/Tasks can be EN/RU |
| **No version auto-updates** | Update ONLY when user explicitly requests |
| **YAML quoting** | Wrap `description:` in quotes if it contains `:` |
| **Research-to-Action Gate** | No defect = informational, not actionable |
| **No hardcoded counts** | Counts ONLY in README.md badge |
| **No Changes sections** | `**Version:** X.Y.Z` + `**Last Updated:**` at end |
| **DoD with checkboxes** | `## Definition of Done` with `- [ ]` items |
| **Worker independence** | No parent/peer refs in L3 Workers |

## MCP Tool Preferences

When `hex-line` MCP is available, **always prefer it** over built-in file tools:

| Instead of | Use | Why |
|-----------|-----|-----|
| Built-in Read | `hex-line read_file` | Hash-annotated, edit-ready |
| Built-in Edit | `hex-line edit_file` | Hash-verified anchors |
| Built-in Write | `hex-line write_file` | Consistent workflow |
| Built-in Grep | `hex-line grep_search` | Hash-annotated matches |
| Large code file | `hex-line outline` then `read_file` with range | 95% token reduction |

**Exceptions** (use built-in Read): images, PDFs, Jupyter notebooks.

## Quick Understanding

| What | How |
|------|-----|
| Project overview + tree | `cat README.md` |
| Architecture (L0-L3) | `cat docs/architecture/SKILL_ARCHITECTURE_GUIDE.md` |
| Key workflow | `ln-700 → ln-100 → ln-200 → ln-1000` |
| Tool config (Linear/File) | `cat shared/references/tools_config_guide.md` |
| Skill metadata | `head -20 {ln-NNN}/SKILL.md` |

## Navigation

**DAG:** CLAUDE.md → `docs/README.md` → topic docs. Read SCOPE tag first.

| Topic | File |
|-------|------|
| Writing Guidelines | `docs/architecture/SKILL_ARCHITECTURE_GUIDE.md` §Writing Guidelines |
| Tool Configuration | `shared/references/tools_config_guide.md` |
| Task kanban + Team ID | `docs/tasks/kanban_board.md` |
| Risk-Based Testing | `shared/references/risk_based_testing_guide.md` |
| Frontmatter fields | `shared/references/frontmatter_reference.md` |
| Hooks reference | `shared/references/hooks_reference.md` |
| Questions format | `shared/references/questions_format.md` |
| Hook Design | `docs/best-practice/HOOK_DESIGN_GUIDE.md` |
| MCP Tool Design | `docs/best-practice/MCP_TOOL_DESIGN_GUIDE.md` |
| Token Efficiency | `docs/standards/TOKEN_EFFICIENCY_PATTERNS.md` |
| Prompt Caching | `docs/best-practice/PROMPT_CACHING_GUIDE.md` |

## Maintenance

Version update (ONLY on explicit request): update `**Version:**` in SKILL.md, version in README.md tables, CHANGELOG.md paragraph.

## Compact Instructions

Preserve in priority order during /compact:
- Architecture decisions and rationale (NEVER summarize)
- Modified files and their key changes
- Current verification status (pass/fail)
- Open TODOs and rollback notes
- Tool outputs (can delete, keep summary only)

**Last Updated:** 2026-03-20
