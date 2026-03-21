---
description: "Audit all 3 hex MCP servers for feature parity and cross-pollinate optimizations"
allowed-tools: "Read,Glob,Grep,Bash,Agent,mcp__hex-line__read_file,mcp__hex-line__grep_search,mcp__hex-line__directory_tree,mcp__hex-line__outline"
---

# Cross-Pollinate Hex MCP Servers

Audit hex-line-mcp, hex-ssh-mcp, and hex-graph-mcp for feature parity. Report gaps and suggest cross-pollination.


## Step 0: Session Investigation

Before auditing code, mine real-world tool errors from agent sessions (last 7 days).

### Search locations

| Agent | Path | Format |
|-------|------|--------|
| Claude | `~/.claude/projects/{project-hash}/{uuid}.jsonl` | JSONL |
| Codex | `~/.codex/archived_sessions/rollout-*.jsonl` | JSONL |
| Gemini | `~/.gemini/antigravity/conversations/` | Protobuf/JSON |

### Error patterns to search

```bash
# Search Claude sessions (most recent 10 transcripts)
CLAUDE_DIR="$HOME/.claude/projects/d--Development-LevNikolaevich-claude-code-skills"
for f in $(ls -t "$CLAUDE_DIR"/*.jsonl 2>/dev/null | head -10); do
  grep -c 'tool_use_error\|NOOP_EDIT\|out of range\|mismatch\|TEXT_NOT_FOUND\|FILE_NOT_FOUND\|HASH_HINT\|DANGEROUS\|Obligatory use\|cancelled.*parallel' "$f" && echo "$f"
done

# Search Codex sessions (all archived)
CODEX_DIR="$HOME/.codex/archived_sessions"
for f in $(ls -t "$CODEX_DIR"/rollout-*.jsonl 2>/dev/null | head -10); do
  grep -c 'error\|tool_use_error\|blocked' "$f" && echo "$f"
done

# Search Gemini (check if conversations directory has parseable files)
GEMINI_DIR="$HOME/.gemini/antigravity/conversations"
ls "$GEMINI_DIR" 2>/dev/null
```

### Output format

```markdown
## Session Investigation Report

| Agent | Sessions Checked | Errors Found | Top Error Pattern | Self-Healing? |
|-------|-----------------|-------------|-------------------|---------------|
| Claude | N | M | pattern | yes/no |
| Codex | N | M | pattern | yes/no |
| Gemini | N | M | pattern | yes/no |

Prioritized issues for audit:
1. [most frequent error] — affects [tool], [frequency]x
2. ...
```

Feed these findings into the Feature Checklist audit as prioritized issues.
## Instructions

1. Read all three `server.mjs` files and `lib/` directories
2. Compare features using the checklist below
3. Output a markdown table with findings
4. Fix any gaps found (create missing files, add missing patterns)
5. Run `npm run lint` on all three servers (0 errors required, warnings OK)
6. Run `npm run check` (syntax check) on all three servers
7. Run `npm test` on servers that have tests

## Feature Checklist

| Feature | Check |
|---------|-------|
| **coerce.mjs** | Parameter alias mapping exists and is imported in server.mjs |
| **flexBool/flexNum** | Safe LLM type coercion (NOT z.coerce.boolean) |
| **Tool annotations** | All tools have readOnlyHint, destructiveHint, idempotentHint |
| **Error handling** | Consistent pattern (try/catch, error response format) |
| **update-check.mjs** | npm version checker present and called at startup |
| **eslint.config.mjs** | Linting config present |
| **test/smoke.mjs** | Business logic tests (hash, coerce, normalize), NOT framework-level |
| **package.json scripts** | start, test, lint, lint:fix, check scripts defined |
| **Lint clean** | `npm run lint` returns 0 errors (warnings OK) |
| **Syntax clean** | `npm run check` passes for all entry points |

## Description Audit

For each tool in each server:

1. **Correctness**: Read the tool description, then read the actual handler + lib code. Verify every claim:
   - Does the tool actually do what the description says?
   - Are there features described that were removed or changed?
   - Are there undocumented behaviors the description should mention?
2. **Token efficiency**: Description ≤40 words, param descriptions ≤15 words. Pattern: WHEN to use, not WHAT it does
3. **Factual accuracy**: No outdated extension lists, no removed features, no wrong defaults
4. **Consistency**: Same behavior described the same way across servers (e.g. hash format, checksum format)

Output a separate table:

| Tool | Issue | Severity | Fix |
|------|-------|----------|-----|
| edit_file | Description says X but code does Y | CRITICAL | Updated |


## Hook Hints Audit

For each entry in `TOOL_HINTS` in `hook.mjs`:

1. **Accuracy**: Does the hint point to the correct hex-line tool?
2. **Cross-tool awareness**: If blocking Read, does hint mention write_file? If blocking Edit, does hint mention read_file dependency?
3. **Parameter accuracy**: Do "with offset/limit" claims match actual tool params?
4. **Completeness**: Do "not X" lists match all commands redirected to this hint in BASH_REDIRECTS?
5. **Consistency**: Are similar hints worded the same way across entries?

Output table:

| Hint Key | Tool Pointed To | Accurate? | Cross-refs? | Fix |
|----------|----------------|-----------|-------------|-----|
## README Audit

For each server's README.md:

1. **Tool count**: Does README match actual tool count in server.mjs?
2. **Parameter tables**: Do params in README match inputSchema in server.mjs?
3. **Examples**: Do usage examples reflect current API (param names, behavior)?
4. **Installation**: Are install commands correct and tested?
5. **Version**: Does README version match package.json version?

Output findings as a table, fix any discrepancies found.

## Servers

- `mcp/hex-line-mcp/` — 11 tools, file ops (reference implementation)
- `mcp/hex-ssh-mcp/` — 6 tools, SSH remote ops
- `mcp/hex-graph-mcp/` — 7 tools, code knowledge graph

## Output Format

```markdown
## Cross-Pollination Report

| Feature | hex-line | hex-ssh | hex-graph | Action |
|---------|----------|---------|-----------|--------|
| coerce.mjs | OK | OK/MISSING | OK/MISSING | Created/N/A |
```

After the table, list any files created or modified.
