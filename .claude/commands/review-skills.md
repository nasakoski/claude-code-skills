---
description: Run skill quality review with repo-specific checks for claude-code-skills
allowed-tools: Skill, Bash, Grep, Glob, Read, AskUserQuestion
---

# Review Skills

Universal review (ln-162) + repo-specific checks for claude-code-skills repository.

## Step 1: Universal Review

Invoke `Skill("ln-162-skill-reviewer")` with `$ARGUMENTS` (pass through scope — skill dirs or empty for auto-detect).

Wait for ln-162 to complete. Record its verdict.

## Step 2: Repo-Specific Checks

Run these bash checks against the repo. Report each as PASS/FAIL.

### Check R1: Marketplace paths

```bash
if [ -f .claude-plugin/marketplace.json ]; then
  FAILS=0
  while read -r path; do
    if [ ! -d "$path" ]; then echo "FAIL: marketplace.json references missing dir: $path"; FAILS=$((FAILS + 1)); fi
  done < <(grep -oE '"\.\/ln-[^"]+' .claude-plugin/marketplace.json | tr -d '"')
  [ "$FAILS" -eq 0 ] && echo "PASS"
else
  echo "SKIP: no marketplace.json"
fi
```

### Check R2: Root docs stale skill names

```bash
FAILS=0
for doc in README.md AGENTS.md .claude-plugin/marketplace.json; do
  if [ -f "$doc" ]; then
    while read -r skill; do
      ls -d ${skill}*/ >/dev/null 2>&1 || { echo "FAIL: $doc references missing skill: $skill"; FAILS=$((FAILS + 1)); }
    done < <(grep -oE 'ln-[0-9]+-[a-z-]+' "$doc" | sort -u)
  fi
done
[ "$FAILS" -eq 0 ] && echo "PASS"
```

### Check R3: Skill count accuracy (badge + marketplace)

```bash
actual=$(ls -d ln-*/SKILL.md 2>/dev/null | wc -l)
FAILS=0
if [ -f README.md ]; then
  badge=$(grep -oE 'skills-[0-9]+' README.md | grep -oE '[0-9]+' || true)
  if [ -n "$badge" ] && [ "$badge" != "$actual" ]; then
    echo "FAIL: README badge says $badge, actual $actual"
    FAILS=$((FAILS + 1))
  fi
fi
if [ -f .claude-plugin/marketplace.json ]; then
  market=$(grep -oE '"\.\/ln-[^"]+' .claude-plugin/marketplace.json | wc -l)
  if [ "$market" != "$actual" ]; then
    echo "FAIL: marketplace.json has $market entries, actual $actual"
    FAILS=$((FAILS + 1))
  fi
fi
[ "$FAILS" -eq 0 ] && echo "PASS: $actual skills"
```

### Check R4: Plugin completeness

Every `ln-*/SKILL.md` must appear in exactly one plugin's marketplace.json skills array.

```bash
FAILS=0
for skill_dir in ln-*/; do
  skill_name="./${skill_dir%/}"
  if ! grep -q "\"$skill_name\"" .claude-plugin/marketplace.json 2>/dev/null; then
    echo "FAIL: $skill_name not in marketplace.json"
    FAILS=$((FAILS + 1))
  fi
done
[ "$FAILS" -eq 0 ] && echo "PASS"
```

### Check R5: Pipeline data-flow (manual review)

For each skill in documentation-pipeline (1XX) that CREATES output files for the target project (e.g., `design_guidelines.md`, `kanban_board.md`, `testing_strategy.md`):
- Verify at least one downstream skill (2XX-5XX) references or loads the created document
- If orphan output found → WARN (some outputs are for humans, not agents)

This check requires reading SKILL.md content — run it as a review step, not a bash script.

### Check R6: Site fact-check (conditional — skip if `site/` unchanged)

R6a: Plugin page skill counts match marketplace.

```bash
FAILS=0
for page in site/plugins/*.html; do
  plugin=$(basename "$page" .html)
  site_skills=$(grep -oP 'skill-id">ln-[0-9]+' "$page" | wc -l)
  market_skills=$(grep -A999 "\"$plugin\"" .claude-plugin/marketplace.json | grep -oE '"\./ln-' | wc -l)
  if [ "$site_skills" -gt 0 ] && [ "$site_skills" != "$market_skills" ]; then
    echo "FAIL: $plugin site=$site_skills marketplace=$market_skills"
    FAILS=$((FAILS + 1))
  fi
done
[ "$FAILS" -eq 0 ] && echo "PASS"
```

R6b (manual): Verify `site/index.html` claims match code:
- Quality gate levels match ln-500 SKILL.md description (PASS/CONCERNS/FAIL/WAIVED)
- Auditor count matches `ls -d ln-6*/SKILL.md | wc -l`
- Plugin names/count match marketplace.json

### Check R7: MCP README fact-check (conditional — skip if no `mcp/*.mjs` changed)

```bash
FAILS=0
for mcp_dir in mcp/*/; do
  if git diff --name-only HEAD -- "$mcp_dir" | grep -q '\.mjs$'; then
    readme="${mcp_dir}README.md"
    [ ! -f "$readme" ] && { echo "FAIL: $mcp_dir has no README"; FAILS=$((FAILS + 1)); continue; }
    actual=$(grep -c 'registerTool' "${mcp_dir}server.mjs")
    claimed=$(grep -oP '\d+(?= MCP Tools)' "$readme" || echo "0")
    if [ -n "$claimed" ] && [ "$actual" != "$claimed" ]; then
      echo "FAIL: $readme claims $claimed tools, actual $actual"
      FAILS=$((FAILS + 1))
    fi
  fi
done
[ "$FAILS" -eq 0 ] && echo "PASS"
```

### Check R8: Volatile numbers in site/

```bash
FAILS=0
while IFS= read -r match; do
  echo "WARN: $match"
  FAILS=$((FAILS + 1))
done < <(grep -rnE '[0-9]+ (skills|auditors|parallel auditors)' site/ | grep -vE '(WCAG|2\.1|AA|0 API)')
[ "$FAILS" -eq 0 ] && echo "PASS" || echo "WARN: $FAILS volatile numbers found"
```

## Step 3: Report

Combine results:

```
## Repo-Specific Review -- claude-code-skills

| # | Check | Result |
|---|-------|--------|
| R1 | Marketplace paths | {PASS/FAIL/SKIP} |
| R2 | Root docs stale names | {PASS/FAIL} |
| R3 | Skill count accuracy | {PASS/FAIL} |
| R4 | Plugin completeness | {PASS/FAIL} |
| R5 | Pipeline data-flow | {PASS/WARN} |
| R6 | Site fact-check | {PASS/FAIL/SKIP} |
| R7 | MCP README fact-check | {PASS/FAIL/SKIP} |
| R8 | Volatile numbers in site | {PASS/WARN} |

Combined verdict: {ln-162 verdict} + {repo checks}
```
