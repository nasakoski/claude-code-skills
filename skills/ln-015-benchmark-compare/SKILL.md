---
name: ln-015-benchmark-compare
description: "Runs A/B benchmark: launches two Claude Code sessions (built-in vs hex-line) on identical tasks, compares tool calls, tokens, time. Use after hex-line changes to measure real impact."
license: MIT
---

> **Paths:** File paths (`shared/`, `references/`) are relative to skills repo root. Locate this SKILL.md directory and go up one level for repo root.

# Benchmark Compare

**Type:** L3 Worker
**Category:** 0XX Shared

Runs real A/B comparison: launches Claude Code with built-in tools only vs with hex-line MCP on identical composite tasks. Measures tool calls, tokens, wall time, accuracy. No simulations.

---

## Input / Output

| Direction | Content |
|-----------|----------|
| **Input** | Target repo path (default: CWD), optional `goals.md` path |
| **Output** | Comparison report in `benchmark/results/{date}-comparison.md` |

---

## Prerequisites

- `claude --version` succeeds (Claude Code CLI installed)
- `node` available (for agent_runner.mjs)
- `git` available (for worktree isolation)
- `shared/agents/agent_runner.mjs` accessible
- `claude-builtin` and `claude-hexline` entries in `shared/agents/agent_registry.json`

---

## Workflow

### Phase 1: Generate Goals

Analyze the target repo and create composite scenario goals. Save to `benchmark/goals.md`.

**Step 1:** Scan repo structure

```bash
# Discover files and sizes
ls -laR . | head -200
# Or if hex-line available:
# directory_tree path=. max_depth=3
```

**Step 2:** For each template (A-D), find matching targets:

| Template | Discovery Rule | Selection Criteria |
|----------|---------------|-------------------|
| **A: Bug Fix** | Find file >200L with exported function containing numeric literal | Function has callers (grep) + test exists |
| **B: Feature Add** | Find module <120L with 1-3 exports | Has imports from shared utils + has consumer |
| **C: Refactor** | Find constant used in >=3 files | Name is unique (not substring of another) |
| **D: Explore** | Find directory with >=8 files | Has entry point (index/main/server/app) |

**Step 3:** Write goals in tool-agnostic language:

```markdown
## Scenario A: Bug Fix
In function `{fn}` in file `{file}`, the default value `{v}` on line ~{line}
should be `{new_v}`. Understand what the function does, find all places that
call it, fix the value, verify the file is correct, find the test for this
function, and update the test expectation if needed.

## Scenario B: Feature Addition
...
```

**Rules:**
- Use REAL file paths, function names, constants from the repo
- Never mention tool names (Read, Grep, outline, bulk_replace)
- Use verbs: "find", "fix", "verify", "show", "create", "rename"
- Each scenario = one self-contained prompt

### Phase 2: Create Isolated Workspaces

```bash
git worktree add /tmp/bench-builtin HEAD
git worktree add /tmp/bench-hexline HEAD
```

### Phase 3: Run Session A (Built-in Only)

Launch Claude with built-in tools only — no MCP servers, no hooks:

```bash
node shared/agents/agent_runner.mjs \
  --agent claude-builtin \
  --prompt-file benchmark/goals.md \
  --output-file benchmark/results/{date}-builtin.md \
  --cwd /tmp/bench-builtin
```

**Claude flags (from agent_registry.json):**
- `--strict-mcp-config` (no --mcp-config) = zero MCP servers
- `--settings '{"disableAllHooks":true}'` = no hook redirects
- `--output-format stream-json` = tool events + token metrics
- `--dangerously-skip-permissions` = no prompts

### Phase 4: Run Session B (Hex-line)

Launch Claude with hex-line MCP:

```bash
node shared/agents/agent_runner.mjs \
  --agent claude-hexline \
  --prompt-file benchmark/goals.md \
  --output-file benchmark/results/{date}-hexline.md \
  --cwd /tmp/bench-hexline
```

**Claude flags:**
- `--mcp-config mcp/hex-line-mcp/benchmark/mcp-bench.json` = hex-line MCP loaded
- `--output-format stream-json` = tool events + token metrics
- `--dangerously-skip-permissions` = no prompts

### Phase 5: Compare Results

Parse both session outputs. Extract metrics:

| Metric | Source | How |
|--------|--------|-----|
| Tool calls | stream-json events | Count `tool_use` events |
| Tokens | `usage` metadata | `input_tokens + output_tokens` |
| Wall time | agent_runner `duration_seconds` | From result file header |
| Turns | stream-json | Count assistant/tool cycles |
| Cost | `total_cost_usd` | From JSON output |
| Accuracy | File state verification | Diff against expected |

Write comparison report:

```markdown
# Benchmark: Built-in vs Hex-line — {date}

## Summary
| Metric | Built-in | Hex-line | Delta |
|--------|----------|----------|-------|
| Tool calls | {N} | {N} | {diff}% |
| Tokens | {N} | {N} | {diff}% |
| Wall time | {N}s | {N}s | {diff}% |
| Cost | ${N} | ${N} | {diff}% |

## Per-Scenario Breakdown
...

## Tool Usage
| Tool | Built-in calls | Hex-line calls |
...
```

Save to `benchmark/results/{date}-comparison.md`.

### Phase 6: Cleanup

```bash
git worktree remove /tmp/bench-builtin
git worktree remove /tmp/bench-hexline
```

---

## Tool Coverage Matrix

All 10 hex-line tools covered across 4 scenarios:

| Tool | A: Bug Fix | B: Feature Add | C: Refactor | D: Explore |
|------|-----------|----------------|-------------|------------|
| read_file | x | x | x | x |
| outline | x | x | | x |
| grep_search | x | x | x | x |
| edit_file | x | x | x | |
| write_file | | | | x |
| verify | x | x | | |
| directory_tree | | x | | x |
| get_file_info | | x | | |
| bulk_replace | | | x | |
| changes | | | x | x |

---

## Definition of Done

- [ ] Goals generated from real repo targets (Phase 1)
- [ ] Both worktrees created from same commit (Phase 2)
- [ ] Session A completed with zero `mcp__hex-line__*` calls (Phase 3)
- [ ] Session B completed with hex-line tool calls (Phase 4)
- [ ] Comparison report saved to `benchmark/results/` (Phase 5)
- [ ] Worktrees cleaned up (Phase 6)

---

**Version:** 1.0.0
**Last Updated:** 2026-03-24
