# Setup Environment

> One-command setup for multi-agent development workflows

## Install

```bash
# This plugin only
/plugin add levnikolaevich/claude-code-skills --plugin setup-environment

# Full suite
/plugin add levnikolaevich/claude-code-skills
```

## What it does

Sets up and maintains the multi-agent development environment. Installs CLI agents (Codex, Gemini), configures MCP servers with budget analysis, syncs settings across all agents, and audits instruction files for quality and consistency.

## Skills

| Skill | Description |
|-------|-------------|
| ln-001-push-all | Commit and push all changes to remote |
| ln-010-dev-environment-setup | Full environment setup coordinator |
| ln-011-agent-installer | Install or update Codex CLI, Gemini CLI, and Claude Code |
| ln-012-mcp-configurator | Register MCP servers and analyze token budget |
| ln-013-config-syncer | Sync settings from Claude to Gemini/Codex |
| ln-014-agent-instructions-auditor | Audit CLAUDE.md/AGENTS.md/GEMINI.md for quality |
| ln-020-codegraph | Code knowledge graph for dependency analysis and impact checking |

## How it works

```
ln-010 (coordinator)
    → ln-011 (install agents)
    → ln-012 (configure MCP)
    → ln-013 (sync configs)
    → ln-014 (audit instructions)
```

ln-010 scans the environment first (OS, agents, MCP servers, hooks, instruction files), then delegates to 4 specialized workers. Each worker operates independently — one failure doesn't block others. Results are aggregated into a best practices audit and written to `docs/environment_state.json`.

## Quick start

```bash
ln-010-dev-environment-setup  # Full setup (scan + install + configure + audit)
ln-001-push-all               # Quick push of all changes
```

## Related

- [All plugins](../../README.md)
- [Architecture guide](../architecture/SKILL_ARCHITECTURE_GUIDE.md)
