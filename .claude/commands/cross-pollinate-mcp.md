---
description: "Audit all 3 hex MCP servers for feature parity and cross-pollinate optimizations"
allowed-tools: "Read,Glob,Grep,Bash,Agent,mcp__hex-line__read_file,mcp__hex-line__grep_search,mcp__hex-line__directory_tree,mcp__hex-line__outline"
---

# Cross-Pollinate Hex MCP Servers

Audit hex-line-mcp, hex-ssh-mcp, and hex-graph-mcp for feature parity. Report gaps and fix them.

| Server | Directory | Tools | Role |
|--------|-----------|-------|------|
| hex-line-mcp | `mcp/hex-line-mcp/` | 11 | File ops (reference implementation) |
| hex-ssh-mcp | `mcp/hex-ssh-mcp/` | 6 | SSH remote ops |
| hex-graph-mcp | `mcp/hex-graph-mcp/` | 7 | Code knowledge graph |

---

### 1. Session Investigation

Mine real-world tool errors from agent sessions (last 7 days).

| Agent | Path | Format |
|-------|------|--------|
| Claude | `~/.claude/projects/{project-hash}/{uuid}.jsonl` | JSONL |
| Codex | `~/.codex/archived_sessions/rollout-*.jsonl` | JSONL |
| Gemini | `~/.gemini/antigravity/conversations/` | Protobuf/JSON |

```bash
CLAUDE_DIR="$HOME/.claude/projects/d--Development-LevNikolaevich-claude-code-skills"
for f in $(ls -t "$CLAUDE_DIR"/*.jsonl 2>/dev/null | head -10); do
  grep -c 'tool_use_error\|NOOP_EDIT\|out of range\|mismatch\|TEXT_NOT_FOUND\|FILE_NOT_FOUND\|HASH_HINT\|DANGEROUS\|Obligatory use\|cancelled.*parallel' "$f" && echo "$f"
done
```

Output: table of Agent / Sessions / Errors / Top Pattern / Self-Healing. Feed into step 3.

### 2. Read all servers

Read all three `server.mjs` files and `lib/` directories. Map features per server.

### 3. Feature Checklist

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

Output: gap table per server. Fix any gaps found.

### 4. Description Audit

For each tool in each server, verify description against actual code:

1. **Correctness** — does the tool do what the description says? Undocumented behaviors?
2. **Token efficiency** — description ≤40 words, param descriptions ≤15 words
3. **Factual accuracy** — no outdated extension lists, removed features, wrong defaults
4. **Consistency** — same behavior described the same way across servers

Output:

| Tool | Issue | Severity | Fix |
|------|-------|----------|-----|

### 5. Hook Hints Audit

For each entry in `TOOL_HINTS` in `hook.mjs`:

1. **Accuracy** — does the hint point to the correct hex-line tool?
2. **Cross-tool awareness** — blocking Read mentions write_file? Blocking Edit mentions read_file?
3. **Parameter accuracy** — do "with offset/limit" claims match actual tool params?
4. **Completeness** — do "not X" lists match all commands in BASH_REDIRECTS for this hint?
5. **Consistency** — similar hints worded the same way?

Output:

| Hint Key | Tool Pointed To | Accurate? | Cross-refs? | Fix |
|----------|----------------|-----------|-------------|-----|

### 6. Tool Value Audit (hex-line only)

For each tool, compare with the built-in it replaces. Only tools with REAL VALUE should exist.

**Flow comparison:**

| Flow | Built-in steps | hex-line steps | Metric |
|------|---------------|----------------|--------|
| Read→Edit→Verify | Read + Edit + Read(re-check) | read_file + edit_file(anchor) + verify | Token count |
| Explore→Read | Read(whole file) | outline + read_file(range) | Lines returned |
| Search→Edit | Grep + Read + Edit | grep_search + edit_file(anchor) | Steps eliminated |
| Rename | Grep + N×(Read+Edit) | bulk_replace | Calls count |

**Per-tool checklist:**
1. What built-in does it replace?
2. What value does hex-line add?
3. Can the built-in do the same thing? YES → DELETE
4. Does it duplicate another hex-line tool? YES → merge or DELETE

Output:

| Tool | Replaces | Value Added | Verdict |
|------|----------|-------------|---------|

Verdicts: KEEP / DELETE / RESTRICT / MERGE.

### 7. Benchmark Validation (hex-line only)

Run benchmarks to validate tool value with real numbers:

```bash
cd mcp/hex-line-mcp && node benchmark.mjs
```

Focus on **Workflow Scenarios (W1-W4)**, not atomic operations. Atomic savings (read, grep) vary by file size and are misleading in isolation. Workflow savings reflect real agent usage patterns.

| Workflow savings | Verdict |
|-----------------|----------|
| ≥50% | KEEP — clear value |
| 20-49% | REVIEW — check if pattern is common enough |
| <20% | DELETE candidate — no workflow value over built-in |

Cross-reference with step 6 theoretical analysis. If workflow shows <20% but step 6 identified safety value (e.g. hash mismatch prevention, edit rejection) → KEEP with justification.

Output:

| Workflow | Built-in | hex-line | Savings | Ops | Verdict |
|----------|----------|----------|---------|-----|---------|

**Gate:** Any tool not covered by a workflow with ≥50% savings and no safety justification → remove from server.mjs.

### 8. Hook Redirect Correctness Audit (hex-line only)

For each entry in `BASH_REDIRECTS` in `hook.mjs`, verify the redirect is correct:

1. **Can hex-line FULLY replace the command?** (e.g. `tail -f` → NO, no follow mode)
2. **Does the regex over-match?** (e.g. `/^find\s+/` catches `find -exec rm`)
3. **Compound bypass consistency?** (`cat file` → BLOCKED, `cat file | grep x` → PASSES)

Test script:

```bash
test_commands=(
  "cat file.txt:SHOULD_BLOCK:read_file"
  "head -20 file.txt:SHOULD_BLOCK:read_file"
  "tail -f /var/log/app.log:SHOULD_PASS:no_follow_mode"
  "tail -20 file.txt:SHOULD_BLOCK:read_file"
  "ls -la dir/:SHOULD_BLOCK:directory_tree"
  "find . -name *.md:SHOULD_BLOCK:directory_tree"
  "find . -exec rm {}:SHOULD_PASS:no_exec_support"
  "du -sh .:SHOULD_PASS:no_size_support"
  "stat file:SHOULD_BLOCK:get_file_info"
  "wc -l file:SHOULD_BLOCK:get_file_info"
  "grep -r pattern dir/:SHOULD_BLOCK:grep_search"
  "sed -i s/a/b/ file:SHOULD_BLOCK:edit_file"
  "diff file1 file2:SHOULD_PASS:changes_is_git_only"
)
for entry in "${test_commands[@]}"; do
  IFS=: read -r cmd expected reason <<< "$entry"
  echo "$cmd → $expected ($reason)"
done
```

Compare expected vs actual. Mismatches are bugs.

Output:

| Command Pattern | hex-line Tool | Can Replace? | Hook Status | Verdict |
|----------------|--------------|-------------|-------------|---------|

### 9. README Audit

For each server's README.md:

1. **Tool count** — matches actual count in server.mjs?
2. **Parameter tables** — params match inputSchema?
3. **Examples** — reflect current API?
4. **Installation** — commands correct?
5. **Version** — matches package.json?

Output findings as a table, fix discrepancies.

### 10. Lint + check + test

```bash
for pkg in hex-line-mcp hex-ssh-mcp hex-graph-mcp; do
  echo "=== $pkg ==="
  cd mcp/$pkg && npm run check && npm run lint && npm test && cd ../..
done
```

**Gate:** 0 errors on all 3 servers.

### 11. Cross-Pollination Report

Output:

```markdown
## Cross-Pollination Report

| Feature | hex-line | hex-ssh | hex-graph | Action |
|---------|----------|---------|-----------|--------|
| coerce.mjs | OK | OK/MISSING | OK/MISSING | Created/N/A |
```

After the table, list all files created or modified.
