---
description: Run skill quality review with repo-specific checks for claude-code-skills
allowed-tools: Skill, Bash, Grep, Glob, Read, AskUserQuestion
---

# Review Skills

Universal review (ln-162) + repo-specific checks for claude-code-skills repository.

## Execution Strategy

**Step 1 FIRST** — invoke ln-162 via Skill tool (MANDATORY, visible to user). **Step 2** — run repo-specific bash script (can overlap with ln-162 phases). Combine in Step 3.

## Step 1: Universal Review (MANDATORY Skill invocation)

> **NON-NEGOTIABLE:** You MUST call `Skill(skill: "ln-162-skill-reviewer", args: "$ARGUMENTS")` via the Skill tool. Do NOT skip this or execute ln-162 phases manually without the Skill call. The Skill tool loads the full skill content which you then follow.

Invoke `Skill("ln-162-skill-reviewer")` with `$ARGUMENTS` (pass through scope — skill dirs or empty for auto-detect).

## Step 2: Repo-Specific Checks

Run this single combined script. It outputs a ready-to-use report table.

```bash
#!/usr/bin/env bash

RESULTS=()
add_result() { RESULTS+=("$1|$2|$3"); }

# === R1: Marketplace paths ===
if [ -f .claude-plugin/marketplace.json ]; then
  R1_FAILS=0
  while read -r path; do
    [ -d "$path" ] || R1_FAILS=$((R1_FAILS + 1))
  done < <(grep -oE '"\./skills/ln-[^"]+' .claude-plugin/marketplace.json | tr -d '"')
  [ "$R1_FAILS" -eq 0 ] && add_result R1 "Marketplace paths" PASS || add_result R1 "Marketplace paths" "FAIL ($R1_FAILS missing dirs)"
else
  add_result R1 "Marketplace paths" SKIP
fi

# === R2: Root docs stale skill names ===
R2_FAILS=0
for doc in README.md AGENTS.md .claude-plugin/marketplace.json; do
  [ -f "$doc" ] || continue
  while read -r skill; do
    ls -d skills/${skill}*/ >/dev/null 2>&1 || R2_FAILS=$((R2_FAILS + 1))
  done < <(grep -oE 'ln-[0-9]+-[a-z-]+' "$doc" | sort -u)
done
[ "$R2_FAILS" -eq 0 ] && add_result R2 "Root docs stale names" PASS || add_result R2 "Root docs stale names" "FAIL ($R2_FAILS stale refs)"

# === R3: Skill count accuracy ===
actual=$(ls -d skills/ln-*/SKILL.md 2>/dev/null | wc -l)
R3_FAILS=0
if [ -f README.md ]; then
  badge=$(grep -oE 'skills-[0-9]+' README.md | grep -oE '[0-9]+' || true)
  [ -n "$badge" ] && [ "$badge" != "$actual" ] && R3_FAILS=$((R3_FAILS + 1))
fi
if [ -f .claude-plugin/marketplace.json ]; then
  market=$(grep -oE '"\./skills/ln-[^"]+' .claude-plugin/marketplace.json | wc -l)
  [ "$market" != "$actual" ] && R3_FAILS=$((R3_FAILS + 1))
fi
[ "$R3_FAILS" -eq 0 ] && add_result R3 "Skill count accuracy" "PASS ($actual skills)" || add_result R3 "Skill count accuracy" "FAIL (badge/marketplace mismatch, actual=$actual)"

# === R4: Plugin completeness ===
R4_FAILS=0
for skill_dir in skills/ln-*/; do
  skill_name="./${skill_dir%/}"
  grep -q "\"$skill_name\"" .claude-plugin/marketplace.json 2>/dev/null || R4_FAILS=$((R4_FAILS + 1))
done
[ "$R4_FAILS" -eq 0 ] && add_result R4 "Plugin completeness" PASS || add_result R4 "Plugin completeness" "FAIL ($R4_FAILS orphan skills)"

# === R5: Pipeline data-flow (semi-automated) ===
R5_WARNS=0
for creator in skills/ln-11[1-5]-*/SKILL.md; do
  [ -f "$creator" ] || continue
  # Extract output filenames from creator skills
  while read -r output_file; do
    # Check if any downstream skill (2XX-5XX) references this file
    if ! grep -rlq "$output_file" skills/ln-{2,3,4,5}*/SKILL.md 2>/dev/null; then
      R5_WARNS=$((R5_WARNS + 1))
    fi
  done < <(grep -oE '`[a-zA-Z_]+\.md`' "$creator" | tr -d '`' | grep -vE '(SKILL|README|CLAUDE|AGENTS)' | sort -u | head -5)
done
[ "$R5_WARNS" -eq 0 ] && add_result R5 "Pipeline data-flow" PASS || add_result R5 "Pipeline data-flow" "WARN ($R5_WARNS possibly orphan outputs)"

# === R6: Site fact-check (conditional) ===
if git diff --name-only HEAD -- site/ 2>/dev/null | grep -q .; then
  # R6a: Plugin page skill counts
  R6_FAILS=0
  for page in site/plugins/*.html; do
    [ -f "$page" ] || continue
    plugin=$(basename "$page" .html)
    site_skills=$(grep -oE 'skill-id">ln-[0-9]+' "$page" | wc -l)
    market_skills=$(node skills/ln-162-skill-reviewer/references/check_marketplace.mjs "$plugin")
    [ "$site_skills" -gt 0 ] && [ "$site_skills" != "$market_skills" ] && { echo "  R6a: $plugin site=$site_skills marketplace=$market_skills" >&2; R6_FAILS=$((R6_FAILS + 1)); }
  done
  # R6b: Auditor count
  auditor_count=$(ls -d skills/ln-6*/SKILL.md 2>/dev/null | wc -l)
  site_auditor=$(grep -oE '[0-9]+ parallel auditors' site/index.html 2>/dev/null | grep -oE '[0-9]+' || echo "0")
  [ -n "$site_auditor" ] && [ "$site_auditor" != "$auditor_count" ] && { echo "  R6b: site says $site_auditor auditors, actual $auditor_count" >&2; R6_FAILS=$((R6_FAILS + 1)); }
  [ "$R6_FAILS" -eq 0 ] && add_result R6 "Site fact-check" PASS || add_result R6 "Site fact-check" "FAIL ($R6_FAILS mismatches)"
else
  add_result R6 "Site fact-check" "SKIP (no site/ changes)"
fi

# === R7: Volatile numbers in site/ ===
R7_WARNS=$(grep -rnE '[0-9]+ (skills|auditors|parallel auditors)' site/ 2>/dev/null | grep -vcE '(WCAG|2\.1|AA|0 API)' || true)
[ "$R7_WARNS" -eq 0 ] && add_result R7 "Volatile numbers in site" PASS || add_result R7 "Volatile numbers in site" "WARN ($R7_WARNS found)"

# === R8: Check sync (automated_checks.md <-> run_checks.sh) ===
CHECKS_DOC=$(grep -oE 'Check [0-9]+' skills/ln-162-skill-reviewer/references/automated_checks.md | grep -oE '[0-9]+' | sort -n | uniq)
CHECKS_SCRIPT=$(grep -oE 'CHECK [0-9]+' skills/ln-162-skill-reviewer/references/run_checks.sh | grep -oE '[0-9]+' | sort -n | uniq)
MISSING=$(comm -23 <(echo "$CHECKS_DOC") <(echo "$CHECKS_SCRIPT"))
[ -z "$MISSING" ] && add_result R8 "Check sync (docs<->script)" PASS || add_result R8 "Check sync (docs<->script)" "FAIL (missing in script: $(echo $MISSING | tr '\n' ','))"

# === R9: Worker invocation (full-repo D8b) ===
R9_FAILS=0
for f in skills/ln-*/SKILL.md; do
  level=$(grep '\*\*Type:\*\*' "$f" | grep -oE 'L[12]' | head -1)
  [ -z "$level" ] && continue
  self=$(basename $(dirname "$f") | grep -oE 'ln-[0-9]+-[a-z-]+')
  worker_count=$(grep -oE 'ln-[0-9]+-[a-z-]+' "$f" | sort -u | grep -v "$self" | wc -l)
  [ "$worker_count" -eq 0 ] && continue
  skill_calls=$(grep -c 'Skill(skill:' "$f" || true)
  [ "$skill_calls" -eq 0 ] && R9_FAILS=$((R9_FAILS + 1))
  grep -q 'Worker Invocation (MANDATORY)' "$f" || R9_FAILS=$((R9_FAILS + 1))
done
[ "$R9_FAILS" -eq 0 ] && add_result R10 "Worker invocation (full-repo D8b)" PASS || add_result R10 "Worker invocation (full-repo D8b)" "FAIL ($R9_FAILS issues)"

# === Output report table ===
echo ""
echo "## Repo-Specific Review -- claude-code-skills"
echo ""
echo "| # | Check | Result |"
echo "|---|-------|--------|"
for r in "${RESULTS[@]}"; do
  IFS='|' read -r num check result <<< "$r"
  echo "| $num | $check | $result |"
done

# Count failures
total_fails=$(printf '%s\n' "${RESULTS[@]}" | grep -c 'FAIL' || true)
total_warns=$(printf '%s\n' "${RESULTS[@]}" | grep -c 'WARN' || true)
echo ""
if [ "$total_fails" -gt 0 ]; then
  echo "Repo verdict: FAIL ($total_fails failures, $total_warns warnings)"
elif [ "$total_warns" -gt 0 ]; then
  echo "Repo verdict: PASS with WARNINGS ($total_warns)"
else
  echo "Repo verdict: PASS"
fi
```

## Step 3: Combined Report

Merge results into:

```
| Source | Verdict | Details |
|--------|---------|---------||
| ln-162 (universal) | {PASS/FAIL} | {N findings, M fixed} |
| Repo-specific | {PASS/FAIL} | {N failures, M warnings} |
| **Combined** | **{worst of both}** | |
```

Then list all FAIL/WARN items grouped by severity, with file paths and fix descriptions.

---

## Step 4: Meta-Analysis

**MANDATORY READ:** Load `skills/shared/references/meta_analysis_protocol.md`

Analyze this session per protocol §7. Output per protocol format.