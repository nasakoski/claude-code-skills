# Documentation

<!-- SCOPE: Index for docs/ directory. Each subdirectory owns one aspect of documentation. -->

## Structure

```
docs/
├── architecture/                    # How skills are built
│   ├── SKILL_ARCHITECTURE_GUIDE.md  # L0-L3 hierarchy, SRP, token efficiency
│   └── AGENT_TEAMS_PLATFORM_GUIDE.md # Heartbeat, crash recovery, Windows
├── best-practice/                   # How to use Claude Code effectively
│   ├── COMPONENT_SELECTION.md       # Command vs Agent vs Skill decisions
│   └── WORKFLOW_TIPS.md             # Curated tips from Claude Code creators
├── plugins/                         # Per-plugin landing pages
│   ├── agile-workflow.md
│   ├── codebase-audit-suite.md
│   ├── documentation-pipeline.md
│   ├── project-bootstrap.md
│   ├── optimization-suite.md
│   ├── community-engagement.md
│   └── dev-environment.md
├── standards/                       # How to write documentation
│   ├── DOCUMENTATION_STANDARDS.md   # 90 requirements for project docs
│   └── GITHUB_README_BEST_PRACTICES.md # README writing guidelines
└── TROUBLESHOOTING.md               # Known issues and solutions
```

## Plugins

| Plugin | Description |
|--------|-------------|
| [agile-workflow](plugins/agile-workflow.md) | Scope decomposition, Story/Task management, Execution, Quality gates, Pipeline orchestration |
| [codebase-audit-suite](plugins/codebase-audit-suite.md) | Security, code quality, architecture, tests, persistence performance audits |
| [documentation-pipeline](plugins/documentation-pipeline.md) | Auto-detect project type, generate complete documentation suite |
| [project-bootstrap](plugins/project-bootstrap.md) | CREATE or TRANSFORM projects to Clean Architecture with Docker, CI/CD |
| [optimization-suite](plugins/optimization-suite.md) | Performance profiling, dependency upgrades, code modernization |
| [community-engagement](plugins/community-engagement.md) | GitHub triage, announcements, RFC debates, response automation |
| [dev-environment](plugins/dev-environment.md) | Install CLI agents, configure MCP servers, sync settings, audit instruction files |

## Responsibility Boundaries

| Directory | Owns | Does NOT own |
|-----------|------|-------------|
| `architecture/` | Skill design patterns, Agent Teams runtime | Individual skill workflows |
| `best-practice/` | Claude Code usage guidance, component selection | Platform API reference |
| `plugins/` | Per-plugin landing pages, skill tables, workflows | Skill internals (see SKILL.md) |
| `standards/` | Documentation quality requirements, README format | Skill-specific writing rules |
| `TROUBLESHOOTING.md` | Known issues, solutions | Runtime protocols |
