# Claude Code Skills

![Version](https://img.shields.io/badge/version-3.1.0-blue)
![Skills](https://img.shields.io/badge/skills-100-green)
![License](https://img.shields.io/badge/license-MIT-green)
[![GitHub stars](https://img.shields.io/github/stars/levnikolaevich/claude-code-skills?style=social)](https://github.com/levnikolaevich/claude-code-skills)

> [!TIP]
> **NEW: Multi-Model AI Review** — Delegate code & story reviews to Codex and Gemini agents running in parallel, with automatic fallback to Claude Opus. Ship faster with 3x review coverage.

> Tired of manual Epic decomposition? Stories without standards research? Tasks that miss quality gates?
>
> **This plugin automates your entire Agile workflow** — from scope to Done.

---

## What's Inside

```
claude-code-skills/                      # MARKETPLACE: 2 plugins, 101 skills
|
|  ┌─ Plugin: full-development-workflow-skills (69 skills) ─┐
|
|-- ln-001-standards-researcher/       # Research standards via MCP Context7/Ref
|-- ln-002-best-practices-researcher/  # Create ADRs, guides, manuals
|-- ln-003-push-all/                   # Commit and push all changes in one command
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
|-- ln-3XX-*/                          # TASK MANAGEMENT (5 skills)
|   |-- ln-300-task-coordinator/       # Decomposes Story into 1-6 tasks
|   |   |-- ln-301-task-creator/       # Universal factory (impl/refactor/test)
|   |   |-- ln-302-task-replanner/     # Updates when plan changes
|   |-- ln-310-story-validator/        # 20 criteria (8 groups), penalty points system
|   |-- ln-311-agent-reviewer/         # External agent review for Stories (Codex + Gemini)
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
|-- ln-6XX-*/                          # AUDIT (28 skills) [WORKS WITHOUT LINEAR]
|   |-- ln-600-docs-auditor/           # Documentation quality audit
|   |   |-- ln-601-semantic-content-auditor/ # Scope alignment, fact accuracy
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
|   |-- ln-630-test-auditor/           # 5 test auditors:
|   |   |-- ln-631-test-business-logic-auditor/ # Framework vs business logic tests
|   |   |-- ln-632-test-e2e-priority-auditor/   # E2E coverage for critical paths
|   |   |-- ln-633-test-value-auditor/          # Risk-based test value scoring
|   |   |-- ln-634-test-coverage-auditor/       # Missing tests for critical paths
|   |   |-- ln-635-test-isolation-auditor/      # Isolation + anti-patterns
|   |-- ln-640-pattern-evolution-auditor/ # Architectural pattern analysis + 4-score model
|   |   |-- ln-641-pattern-analyzer/      # Pattern scoring worker
|   |   |-- ln-642-layer-boundary-auditor/# Layer violations, I/O isolation
|   |   |-- ln-643-api-contract-auditor/  # Layer leakage, missing DTOs
|   |   |-- ln-644-dependency-graph-auditor/ # Cycles, coupling metrics (Ca/Ce/I)
|   |-- ln-650-persistence-performance-auditor/ # DB performance coordinator:
|   |   |-- ln-651-query-efficiency-auditor/    # N+1, over-fetching, missing bulk ops
|   |   |-- ln-652-transaction-correctness-auditor/ # Scope, rollback, long-held txns
|   |   |-- ln-653-runtime-performance-auditor/ # Blocking IO, allocations, sync sleep
|
|-- ln-10XX-*/                           # ORCHESTRATION (1 skill)
|   |-- ln-1000-pipeline-orchestrator/   # L0 Meta: kanban → 4-stage pipeline (300→310→400→500) via TeamCreate
|
|  └──────────────────────────────────────────────┘
|  ┌─ Plugin: claude-code-bootstrap (32 skills) ────┐
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
|  └──────────────────────────────────────────────┘
|
|-- hooks/                             # AUTOMATED VALIDATION HOOKS
|   |-- hooks.json                     # Hook configuration (copy to settings.json)
|   |-- secret-scanner.py              # PreToolUse: blocks commits with secrets
|   |-- story-validator.py             # UserPromptSubmit: validates Story before execution
|   |-- code-quality.py                # PostToolUse: DRY/KISS/YAGNI checks
|
|-- shared/css/diagram.css             # Universal diagram styles
|-- docs/SKILL_ARCHITECTURE_GUIDE.md   # Orchestrator-Worker Pattern (L0-L3)
|-- docs/AGENT_TEAMS_PLATFORM_GUIDE.md # Agent Teams runtime patterns
|-- CLAUDE.md                          # Full documentation
```

---

## Installation

This marketplace contains **2 plugins** — install together or separately:

```bash
# Both plugins (full suite)
/plugin add levnikolaevich/claude-code-skills

# Or individually:
/plugin add levnikolaevich/claude-code-skills --plugin full-development-workflow-skills
/plugin add levnikolaevich/claude-code-skills --plugin claude-code-bootstrap
```

| Plugin | Skills | Description |
|--------|--------|-------------|
| **full-development-workflow-skills** | 67 | Agile workflow: Documentation, Planning, Execution, Quality, Audit |
| **claude-code-bootstrap** | 32 | Project bootstrap: CREATE or TRANSFORM to Clean Architecture |

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

## FAQ

<details>
<summary><b>What is Claude Code Skills?</b></summary>

A plugin for [Claude Code](https://claude.ai/code) that provides 99 production-ready skills automating the full Agile development lifecycle — from project bootstrap and documentation through scope decomposition, task execution, quality gates, and comprehensive code audits.

</details>

<details>
<summary><b>How does it automate the Agile workflow?</b></summary>

Skills form a complete pipeline: `ln-700` bootstraps the project → `ln-100` generates documentation → `ln-200` decomposes scope into Epics and Stories → `ln-400` executes tasks with automated review loops → `ln-500` runs quality gates before marking Done. Each stage is fully automated with human approval checkpoints.

</details>

<details>
<summary><b>Does it require Linear or any external dependencies?</b></summary>

No. All skills work without Linear or any external tools. Linear integration is optional — when unavailable, skills fallback to a standalone flow using local markdown files (`kanban_board.md`) as the task management backend. No API keys, no paid services required.

</details>

<details>
<summary><b>What AI models does it use?</b></summary>

Claude Opus is the primary model. For code and story reviews, skills delegate to external agents (OpenAI Codex, Google Gemini) for parallel multi-model review with automatic fallback to Claude Opus if external agents are unavailable.

</details>

<details>
<summary><b>How do I install it?</b></summary>

Two options:
```bash
# Plugin (Recommended)
/plugin add levnikolaevich/claude-code-skills

# Git Clone
git clone https://github.com/levnikolaevich/claude-code-skills.git ~/.claude/skills
```

</details>

<details>
<summary><b>Can I use it on an existing project?</b></summary>

Yes. `ln-700-project-bootstrap` has a TRANSFORM mode that restructures existing projects to Clean Architecture without starting from scratch. Audit skills (`ln-6XX`) work standalone on any codebase — no setup required.

</details>

<details>
<summary><b>How does it handle "almost right" AI-generated code?</b></summary>

Through automated review loops. `ln-402-task-reviewer` checks every task output, `ln-403-task-rework` fixes issues and resubmits for review, and `ln-500-story-quality-gate` runs a 4-level gate (PASS/CONCERNS/REWORK/FAIL) before any Story is marked Done. Code is never shipped without passing quality checks.

</details>

<details>
<summary><b>Does it replace human code review?</b></summary>

No — it augments human review. Multi-model cross-checking (Claude + Codex + Gemini) catches issues before human reviewers see the code. Human approval points are built into the workflow at Story validation (`ln-310`) and quality gates (`ln-500`). The goal is to reduce reviewer burden, not eliminate oversight.

</details>

<details>
<summary><b>How does it maintain context across large codebases?</b></summary>

Through the Orchestrator-Worker pattern. Instead of feeding the entire codebase into one prompt, L1 orchestrators decompose work into focused tasks, L2 coordinators manage scope, and L3 workers execute with minimal, targeted context. Each skill loads only the files it needs, keeping token usage efficient.

</details>

<details>
<summary><b>What can the audit skills detect?</b></summary>

28 audit skills organized in 7 groups: security vulnerabilities (secrets, XSS, SQL injection), build health (compiler errors, type issues), code principles (DRY/KISS/YAGNI violations), code quality (complexity, magic numbers), dependencies (outdated packages, CVEs), test suite quality (coverage gaps, isolation issues), and architectural patterns (layer violations, coupling metrics).

</details>

<details>
<summary><b>How is it different from custom prompts or slash commands?</b></summary>

Custom prompts are ad-hoc and context-free. Claude Code Skills provides 101 coordinated skills with an [Orchestrator-Worker architecture](docs/SKILL_ARCHITECTURE_GUIDE.md) — L0 meta-orchestrator (Agent Teams) coordinates L1 orchestrators, which delegate to L2 coordinators and L3 workers, each with single responsibility and token-efficient context loading. Skills build on each other's outputs across the full lifecycle.

</details>

<details>
<summary><b>What is the Orchestrator-Worker pattern?</b></summary>

A 4-level hierarchy: L0 meta-orchestrator (`ln-1000-pipeline-orchestrator`) coordinates via Agent Teams (TeamCreate), L1 orchestrators (e.g., `ln-400-story-executor`) manage Story lifecycle, L2 coordinators (e.g., `ln-220-story-coordinator`) handle mid-level scope, and L3 workers (e.g., `ln-221-story-creator`) execute specific tasks. Each level has single responsibility and loads only the context it needs. See [SKILL_ARCHITECTURE_GUIDE.md](docs/SKILL_ARCHITECTURE_GUIDE.md).

</details>

<details>
<summary><b>Can it catch technical debt from AI-generated code?</b></summary>

Yes. Audit skills specifically target AI-induced tech debt: `ln-623` checks DRY/KISS/YAGNI violations, `ln-626` finds dead code and unused imports, `ln-640` audits architectural pattern evolution, and `ln-644` detects dependency cycles and coupling metrics. Run `ln-620-codebase-auditor` to scan all 9 categories in parallel.

</details>

<details>
<summary><b>How does it handle multi-stack or polyglot projects?</b></summary>

Bootstrap skills (`ln-7XX`) support React, .NET, and Python project structures. Audit skills are language-aware — `ln-622-build-auditor` checks compiler/type errors across stacks, `ln-625-dependencies-auditor` scans npm, NuGet, and pip packages, and `ln-651-query-efficiency-auditor` catches N+1 queries regardless of ORM.

</details>

<details>
<summary><b>Can I share these skills with Gemini CLI or OpenAI Codex?</b></summary>

Yes — create a symlink or junction pointing to the plugin directory:

**Windows (PowerShell):**
```powershell
New-Item -ItemType Junction -Path "C:\Users\<USERNAME>\.gemini\skills" -Target "C:\Users\<USERNAME>\<PLUGIN_DIR>"
New-Item -ItemType Junction -Path "C:\Users\<USERNAME>\.codex\skills" -Target "C:\Users\<USERNAME>\<PLUGIN_DIR>"
```

**Windows (CMD):**
```cmd
mklink /J "C:\Users\<USERNAME>\.gemini\skills" "C:\Users\<USERNAME>\<PLUGIN_DIR>"
mklink /J "C:\Users\<USERNAME>\.codex\skills" "C:\Users\<USERNAME>\<PLUGIN_DIR>"
```

**macOS / Linux:**
```bash
ln -s ~/.claude/plugins/<PLUGIN_DIR> ~/.gemini/skills
ln -s ~/.claude/plugins/<PLUGIN_DIR> ~/.codex/skills
```

</details>

---

## Links

| | |
|---|---|
| **Documentation** | [CLAUDE.md](CLAUDE.md) |
| **Architecture** | [SKILL_ARCHITECTURE_GUIDE.md](docs/SKILL_ARCHITECTURE_GUIDE.md) |
| **Agent Teams** | [AGENT_TEAMS_PLATFORM_GUIDE.md](docs/AGENT_TEAMS_PLATFORM_GUIDE.md) |
| **Issues** | [GitHub Issues](https://github.com/levnikolaevich/claude-code-skills/issues) |
| **Contributing** | [CONTRIBUTING.md](CONTRIBUTING.md) |

---

**Author:** [@levnikolaevich](https://github.com/levnikolaevich) · **License:** MIT
