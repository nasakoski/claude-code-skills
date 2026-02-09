# Claude Code Skills

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![Skills](https://img.shields.io/badge/skills-85-green)
![License](https://img.shields.io/badge/license-MIT-green)
[![GitHub stars](https://img.shields.io/github/stars/levnikolaevich/claude-code-skills?style=social)](https://github.com/levnikolaevich/claude-code-skills)

> **NEW** Multi-model AI review: skills delegate to Codex and Gemini agents for parallel code/story review with automatic fallback to Claude Opus.

> Tired of manual Epic decomposition? Stories without standards research? Tasks that miss quality gates?
>
> **This plugin automates your entire Agile workflow** — from scope to Done.

---

## What's Inside

```
claude-code-skills/
|
|-- ln-001-standards-researcher/       # Research standards via MCP Context7/Ref
|-- ln-002-best-practices-researcher/  # Create ADRs, guides, manuals
|
|-- ln-1XX-*/                          # DOCUMENTATION (13 skills)
|   |-- ln-100-documents-pipeline/     # L1 Orchestrator: complete docs in one command
|   |-- ln-110-project-docs-coordinator/  # Detects project type, delegates to workers
|   |   |-- ln-111-root-docs-creator/     # CLAUDE.md, principles.md
|   |   |-- ln-112-project-core-creator/  # requirements.md, architecture.md
|   |   |-- ln-113-backend-docs-creator/  # api_spec.md, database_schema.md
|   |   |-- ln-114-frontend-docs-creator/ # design_guidelines.md
|   |   |-- ln-115-devops-docs-creator/   # runbook.md
|   |-- ln-120-reference-docs-creator/    # ADRs, guides, manuals structure
|   |-- ln-130-tasks-docs-creator/        # kanban_board.md (Linear config)
|   |-- ln-140-test-docs-creator/         # testing-strategy.md
|   |-- ln-150-presentation-creator/      # Interactive HTML presentation
|
|-- ln-2XX-*/                          # PLANNING (7 skills)
|   |-- ln-200-scope-decomposer/       # TOP: scope -> Epics -> Stories (one command)
|   |-- ln-201-opportunity-discoverer/ # Traffic-First KILL funnel for growth direction
|   |-- ln-210-epic-coordinator/       # CREATE/REPLAN 3-7 Epics
|   |-- ln-220-story-coordinator/      # CREATE/REPLAN Stories + standards research
|   |   |-- ln-221-story-creator/      # Creates from IDEAL plan
|   |   |-- ln-222-story-replanner/    # Replans when requirements change
|   |-- ln-230-story-prioritizer/      # RICE prioritization + market research
|
|-- ln-3XX-*/                          # TASK MANAGEMENT (4 skills)
|   |-- ln-300-task-coordinator/       # Decomposes Story into 1-6 tasks
|   |   |-- ln-301-task-creator/       # Universal factory (impl/refactor/test)
|   |   |-- ln-302-task-replanner/     # Updates when plan changes
|   |-- ln-310-story-validator/        # Validates against 2025 standards
|   |-- ln-311-agent-reviewer/        # External agent review for Stories
|
|-- ln-4XX-*/                          # EXECUTION (5 skills)
|   |-- ln-400-story-executor/         # Full automation: tasks -> Done
|   |-- ln-401-task-executor/          # Execute implementation tasks
|   |-- ln-402-task-reviewer/          # Review completed tasks
|   |-- ln-403-task-rework/            # Fix tasks marked To Rework
|   |-- ln-404-test-executor/          # Execute test tasks (E2E-first)
|
|-- ln-5XX-*/                          # QUALITY (9 skills)
|   |-- ln-500-story-quality-gate/     # Thin orchestrator: verdict + Quality Score
|   |-- ln-510-quality-coordinator/    # Code quality checks coordinator
|   |   |-- ln-511-code-quality-checker/  # DRY/KISS/YAGNI violations
|   |   |-- ln-512-agent-reviewer/        # External agent review (Codex + Gemini)
|   |   |-- ln-513-regression-checker/    # Run existing test suite
|   |-- ln-520-test-planner/           # Test planning coordinator
|   |   |-- ln-521-test-researcher/    # Research real-world problems
|   |   |-- ln-522-manual-tester/      # Manual functional testing
|   |   |-- ln-523-auto-test-planner/  # Plan E2E/Integration/Unit tests
|
|-- ln-6XX-*/                          # AUDIT (20 skills) [WORKS WITHOUT LINEAR]
|   |-- ln-600-docs-auditor/           # Documentation quality audit
|   |-- ln-610-code-comments-auditor/  # Code comments audit
|   |-- ln-620-codebase-auditor/       # 9 parallel auditors:
|   |   |-- ln-621-security-auditor/      # Secrets, SQL injection, XSS
|   |   |-- ln-622-build-auditor/         # Compiler/type errors
|   |   |-- ln-623-code-principles-auditor/# DRY/KISS/YAGNI, TODOs, DI
|   |   |-- ln-624-code-quality-auditor/  # Complexity, magic numbers
|   |   |-- ln-625-dependencies-auditor/  # Outdated packages + CVE vulnerabilities
|   |   |-- ln-626-dead-code-auditor/     # Unused code
|   |   |-- ln-627-observability-auditor/ # Logging, metrics
|   |   |-- ln-628-concurrency-auditor/   # Race conditions
|   |   |-- ln-629-lifecycle-auditor/     # Bootstrap, shutdown
|   |-- ln-630-test-auditor/           # 5 test auditors (business logic, E2E, coverage)
|   |-- ln-640-pattern-evolution-auditor/ # Architectural pattern analysis + 4-score model
|   |   |-- ln-641-pattern-analyzer/      # Pattern scoring worker
|   |   |-- ln-642-layer-boundary-auditor/# Layer violations, I/O isolation, coverage
|
|-- ln-7XX-*/                          # BOOTSTRAP (32 skills) [WORKS WITHOUT LINEAR]
|   |-- ln-700-project-bootstrap/      # L1: CREATE or TRANSFORM project
|   |-- ln-710-dependency-upgrader/    # Upgrade npm/nuget/pip
|   |-- ln-720-structure-migrator/     # SCAFFOLD or RESTRUCTURE to Clean Architecture
|   |-- ln-730-devops-setup/           # Docker, CI/CD, env
|   |   |-- ln-731-docker-generator/      # Dockerfiles, docker-compose
|   |   |-- ln-732-cicd-generator/        # GitHub Actions
|   |   |-- ln-733-env-configurator/      # .env.example
|   |-- ln-740-quality-setup/          # Linters, pre-commit, tests
|   |-- ln-750-commands-generator/     # .claude/commands
|   |-- ln-760-security-setup/         # Security scanning
|   |-- ln-770-crosscutting-setup/     # Logging, CORS, health checks
|   |-- ln-780-bootstrap-verifier/     # Build, test, Docker verification
|
|-- hooks/                             # AUTOMATED VALIDATION HOOKS
|   |-- hooks.json                     # Hook configuration (copy to settings.json)
|   |-- secret-scanner.py              # PreToolUse: blocks commits with secrets
|   |-- story-validator.py             # UserPromptSubmit: validates Story before execution
|   |-- code-quality.py                # PostToolUse: DRY/KISS/YAGNI checks
|
|-- shared/css/diagram.css             # Universal diagram styles
|-- docs/SKILL_ARCHITECTURE_GUIDE.md   # Orchestrator-Worker Pattern
|-- CLAUDE.md                          # Full documentation
```

---

## Installation

```bash
# Option 1: Plugin (Recommended)
/plugin add levnikolaevich/claude-code-skills

# Option 2: Git Clone
git clone https://github.com/levnikolaevich/claude-code-skills.git ~/.claude/skills
```

---

## Quick Start

**Without Linear** (works immediately):
```bash
ln-620-codebase-auditor    # Audit your code for issues
ln-700-project-bootstrap   # CREATE or TRANSFORM project
ln-100-documents-pipeline  # Generate documentation
```

**With Linear** (full Agile workflow):
```bash
ln-200-scope-decomposer    # Scope -> Epics -> Stories
ln-400-story-executor      # Execute Story to Done (fully automated)
```

---

## Hooks (Optional)

Automated validation hooks that run during development:

| Hook | Trigger | Action |
|------|---------|--------|
| **secret-scanner** | `git commit` | Blocks commits containing secrets |
| **story-validator** | `ln-400` prompt | Validates Story before execution |
| **code-quality** | After Edit/Write | Reports DRY/KISS/YAGNI violations |

**Installation:** Copy hooks config to `~/.claude/settings.json`. See [hooks/README.md](hooks/README.md)

---

## Workflow

```
ln-700-project-bootstrap   # 0. CREATE or TRANSFORM to production
         ↓
ln-100-documents-pipeline  # 1. Documentation
         ↓
ln-200-scope-decomposer    # 2. Scope -> Epics -> Stories
         ↓
ln-400-story-executor      # 3. Tasks -> Review -> Quality -> Done
```

---

## Links

| | |
|---|---|
| **Documentation** | [CLAUDE.md](CLAUDE.md) |
| **Architecture** | [SKILL_ARCHITECTURE_GUIDE.md](docs/SKILL_ARCHITECTURE_GUIDE.md) |
| **Issues** | [GitHub Issues](https://github.com/levnikolaevich/claude-code-skills/issues) |
| **Contributing** | [CONTRIBUTING.md](CONTRIBUTING.md) |

---

**Author:** [@levnikolaevich](https://github.com/levnikolaevich) · **License:** MIT
