---
name: engineer
description: >
  Full engineering workflow with multi-agent pipeline. Use for any non-trivial
  code change — new features, refactors, bug fixes touching multiple files, or
  architectural changes. Runs: planner → plan critic → [reconciliation loop] →
  [human checkpoint] → test writer → implementer → code critic →
  [reconciliation loop] → [human checkpoint]. Each feature gets its own GitHub
  issue, git worktree, and work directory — supporting multiple concurrent
  features across sessions.
  Invoke with /engineer [description of what to build or fix].
---

# Engineer Skill

Orchestrates a full multi-agent engineering pipeline for building Jarvis.
Agents iterate on technical quality between themselves. You review intent
and behavior at two checkpoints — with full visibility into what the agents
decided and why.

Each feature is isolated: its own GitHub issue for tracking, git worktree
for code isolation, and work directory for pipeline artifacts. Multiple
features can be in flight across different conversations.

## Usage

```
/engineer [description]           # New feature — creates issue + worktree + starts pipeline
/engineer --quick [description]   # New feature, quick mode (skip plan critic)
/engineer --resume [id-or-slug]   # Resume an in-progress feature
/engineer                         # List all active features
```

## Pipeline overview

```
0. Setup             → issue + worktree + work dir (or resume/list)
1. Planner           → PLAN.md
2. Plan Critic       → CRITIQUE.md
2b. Reconciliation   → agents iterate until converged
3. ─── CHECKPOINT A: You review intent ───
4. Test Writer       → failing tests
5. Implementer       → code + CHANGES.md
6. Code Critic       → REVIEW.md
6b. Reconciliation   → agents iterate until converged
7. ─── CHECKPOINT B: You review behavior ───
8. Ship              → PR + merge/keep
```

---

## Step 0: Setup

### Variables

These variables are set during setup and used throughout the pipeline:

| Variable | Example | Description |
|----------|---------|-------------|
| `{issue}` | `42` | GitHub issue number |
| `{slug}` | `user-auth` | Derived from description (lowercase, hyphens, max 4 words) |
| `{type}` | `feature` or `fix` | Auto-detected from description |
| `{branch}` | `feature/42-user-auth` | `{type}/{issue}-{slug}` |
| `{worktree}` | `.worktrees/42-user-auth` | Isolated code checkout (project root) |
| `{work_dir}` | `.claude/work/42-user-auth` | Pipeline artifacts directory |

### Path A — List active features (no args)

If `/engineer` is invoked with no arguments:

1. Scan `.claude/work/` for directories containing `state.json` (exclude `archive/`)
2. Read each `state.json` and print a status table:

```
Active features:
| #  | Issue | Feature         | Step           | Updated    |
|----|-------|-----------------|----------------|------------|
| 1  | #42   | user-auth       | checkpoint-a   | 2026-03-14 |
| 2  | #43   | rate-limiting   | implementing   | 2026-03-13 |
```

3. Print: `Resume with /engineer --resume [issue-number-or-slug]`
4. Stop — do not start any pipeline.

### Path B — Resume an in-progress feature (`--resume`)

If `/engineer --resume [id-or-slug]` is invoked:

1. Search `.claude/work/` for a matching directory:
   - By issue number: `42` matches `.claude/work/42-user-auth/`
   - By slug substring: `auth` matches `.claude/work/42-user-auth/`
   - If multiple matches, list them and ask the user to be more specific.

2. Read `state.json` to restore all variables (`{issue}`, `{slug}`, `{branch}`,
   `{worktree}`, `{work_dir}`, `{type}`).

3. Verify the worktree exists. If the directory is missing but the branch exists:
   ```
   git worktree add {worktree} {branch}
   ```
   If neither exists, report the error and stop.

4. **Smart resume — validate artifacts against state:**
   - Check which pipeline documents exist in `{work_dir}`:
     - PLAN.md exists → at least past `planning`
     - CRITIQUE.md exists → at least past `plan-critique`
     - CHANGES.md exists → at least past `implementing`
     - REVIEW.md exists → at least past `code-critique`
     - RECONCILIATION.md exists → at least past `code-reconciliation`
   - If artifacts exist beyond what `step` in state.json suggests,
     advance `step` to match the furthest completed artifact.
   - **Re-run the step recorded in state.json** (the step may have been
     interrupted by a connection drop — re-running is safer than skipping).

5. Print: current feature status, which step will be re-run, and why.

6. Update `state.json` timestamp and continue the pipeline from the
   validated step.

### Path C — New feature (default)

If `/engineer [description]` is invoked with a description:

1. **Derive slug**: lowercase the description, replace spaces/special chars
   with hyphens, truncate to max 4 words.
   Example: `"Add rate limiting to API endpoints"` → `add-rate-limiting`

2. **Auto-detect issue type** from description keywords:
   - If description contains any of: `fix`, `bug`, `broken`, `crash`,
     `error`, `fail` → type is `fix`, label is `bug`
   - Otherwise → type is `feature`, label is `enhancement`

3. **Create GitHub issue:**
   ```bash
   gh issue create --title "{description}" --label "{label}" \
     --body "Engineer pipeline tracking issue"
   ```
   Parse the issue number from output.

4. **Check for uncommitted changes** (per `git_worktree_fallback.md`):
   ```bash
   changes=$(git diff HEAD)
   if [ -n "$changes" ]; then
     mkdir -p .pipeline
     git diff HEAD > .pipeline/carry-changes.patch
   fi
   ```

5. **Create worktree:**
   ```bash
   git fetch origin
   git worktree add {worktree} -b {branch}
   ```

6. **Apply carried changes** (if patch exists):
   ```bash
   git -C {worktree} apply .pipeline/carry-changes.patch
   rm .pipeline/carry-changes.patch
   ```
   If apply fails (conflicts), warn: "Patch conflicts — continuing
   without uncommitted changes" (non-blocking).

7. **Create work directory:**
   ```bash
   mkdir -p {work_dir}
   ```

8. **Write initial state.json:**
   ```json
   {
     "issue": {issue},
     "slug": "{slug}",
     "type": "{type}",
     "title": "{description}",
     "branch": "{branch}",
     "worktree": "{worktree}",
     "workDir": "{work_dir}",
     "step": "planning",
     "quick": false,
     "created": "{ISO timestamp}",
     "updated": "{ISO timestamp}"
   }
   ```

9. Print the pipeline overview with the feature identifier:
   ```
   Feature: #{issue} — {description}
   Branch:  {branch}
   Worktree: {worktree}
   Work dir: {work_dir}
   ```

---

## State tracking

After each pipeline step completes successfully, update `state.json`:
- Set `step` to the **next** step in the pipeline
- Set `updated` to the current ISO timestamp

This ensures that if a step is interrupted mid-execution, resume will
re-run that step (since `step` still points to it).

Write state updates via:
```bash
# Example: after planner completes, advance to plan-critique
cat > {work_dir}/state.json << 'EOF'
{ ...updated fields... }
EOF
```

Step progression:
`planning` → `plan-critique` → `plan-reconciliation` → `checkpoint-a`
→ `testing` → `implementing` → `code-critique` → `code-reconciliation`
→ `checkpoint-b` → `pr-created` → `done`

---

## Step 1: Planner

Spawn the **planner** subagent with the full request as its prompt:

> "The request is: [ARGUMENTS]. Source code is at {worktree} — explore
> the codebase there. Produce a PLAN.md at {work_dir}/PLAN.md."

Wait for the planner to complete. Read PLAN.md and print:
- A 3-sentence summary of the plan
- The files-to-change table
- Any open questions for the human

Update state.json: step → `plan-critique`

---

## Step 2: Plan Critic

Spawn the **plan-critic** subagent:

> "Read {work_dir}/PLAN.md and the codebase at {worktree}. Produce a
> CRITIQUE.md at {work_dir}/CRITIQUE.md."

Wait for the critic to complete. Read CRITIQUE.md.

Update state.json: step → `plan-reconciliation`

---

## Step 2b: Plan Reconciliation Loop

**The orchestrator (you) must now reconcile the critique with the plan.**
Do not simply pass the critique to the human and move on. You are
responsible for driving convergence between the planner and critic.

### Process

1. **Read CRITIQUE.md thoroughly.** Categorize every finding:
   - Critical issues
   - Significant issues
   - Minor issues / suggestions
   - Alternative approaches proposed

2. **If verdict is REVISE or there are Critical issues:**
   - Spawn the **planner** again with explicit instructions:
     > "Read {work_dir}/CRITIQUE.md. The plan critic found the
     > following issues: [list each critical and significant issue].
     > Revise {work_dir}/PLAN.md to address each one. Source code is
     > at {worktree}. For any issue you disagree with, add a rebuttal
     > under a `## Rebuttals` section explaining why."
   - After planner revises, spawn the **plan-critic** again.
   - Repeat until the critic's verdict is APPROVE or APPROVE WITH NOTES
     (max 3 iterations — if not converged, escalate to human).

3. **If verdict is APPROVE WITH NOTES:**
   - Review all Significant and Minor issues yourself.
   - **Default: incorporate everything.** Only defer if the issue is
     unrelated to the current task — e.g., a pre-existing bug in a
     different subsystem that was noticed in passing. If the current
     feature naturally touches multiple systems, that's not a reason
     to defer — follow the work wherever it leads. Complexity alone
     is not a reason to defer.
   - Edit PLAN.md directly to incorporate accepted changes.
   - If incorporating changes would substantially alter the plan, re-run
     the plan critic once to validate.

4. **If verdict is APPROVE:**
   - Still review Minor issues/suggestions. Incorporate them — minor
     does not mean unimportant.

5. **Write the reconciliation summary** — append to PLAN.md under
   `## Reconciliation`:

```markdown
## Reconciliation

Iterations: [N] (planner ↔ critic)

### Addressed
| # | Issue | Resolution |
|---|-------|------------|
| 1 | [issue summary] | [how it was addressed in the plan] |

### Deferred (unrelated to current task only)
| # | Issue | Why unrelated |
|---|-------|---------------|
| 1 | [issue summary] | [pre-existing bug in X / unrelated subsystem Y] |
```

**Every finding from CRITIQUE.md must appear in Addressed or Deferred.**
**Deferred should be near-empty.** The only valid deferral is an issue in
a completely unrelated subsystem requiring a separate architectural decision.
"Pre-existing gap," "not touched by current batch," and "out of scope" are
NOT valid reasons if the agent is already in the file or the same bug pattern
applies. Fix every instance in the same pass.

Update state.json: step → `checkpoint-a`

---

## -- CHECKPOINT A --

Print this block verbatim (substituting paths):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHECKPOINT A — Your review before any code is written
Feature: #{issue} — {slug}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Plan:    {work_dir}/PLAN.md
Critique: {work_dir}/CRITIQUE.md
```

Then print:

**Reconciliation summary** — the full table from the Reconciliation
section of PLAN.md, so the human can see exactly what was addressed,
what was deferred and why, without needing to open files.

Then print:

```
Please review:
  1. Does the plan match what you intended to build?
  2. Do you agree with the deferred items above?
  3. Are there behavioral requirements the plan missed?

Reply with one of:
  PROCEED         — looks good, move to implementation
  PROCEED [notes] — good enough, but note adjustments to make
  REVISE [notes]  — plan needs changes before proceeding
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Wait for explicit human response. Do not proceed until you receive it.**

If REVISE: incorporate the feedback into PLAN.md, re-run the plan critic,
re-run reconciliation (Step 2b), and return to Checkpoint A.

If PROCEED or PROCEED [notes]: append any notes to PLAN.md under
`## Human notes` and continue.

Update state.json: step → `testing`

---

## Step 3: Test Writer

Spawn the **test-writer** subagent:

> "Read {work_dir}/PLAN.md and {work_dir}/CRITIQUE.md. Source code is at
> {worktree} — write failing tests there that define the contract for this
> implementation. Follow existing test patterns in the codebase."

Wait for completion. Print:
- Which test files were created
- How many test cases
- Confirmation that tests are failing (expected)

Update state.json: step → `implementing`

---

## Step 4: Implementer

Spawn the **implementer** subagent:

> "Read {work_dir}/PLAN.md, {work_dir}/CRITIQUE.md, and the test files
> just written. Source code is at {worktree} — implement the solution
> there until all tests pass. Write {work_dir}/CHANGES.md."

Wait for completion. Print:
- Summary from CHANGES.md
- Final test results
- Any blockers or deviations from the plan

Update state.json: step → `code-critique`

---

## Step 5: Code Critic

Spawn the **code-critic** subagent:

> "Read {work_dir}/PLAN.md, {work_dir}/CRITIQUE.md, and
> {work_dir}/CHANGES.md. Source code is at {worktree} — review all
> changed files there. Write {work_dir}/REVIEW.md."

Wait for completion. Read REVIEW.md.

Update state.json: step → `code-reconciliation`

---

## Step 5b: Code Reconciliation Loop

**The orchestrator (you) must now act on all review findings — not just
blockers.** The human should not have to read REVIEW.md and manually
decide which suggestions to implement. That is your job.

### Process

1. **Read REVIEW.md thoroughly.** Categorize every finding:
   - Blockers
   - Required changes
   - Suggestions

2. **If verdict is REJECT:**
   - Surface blockers to the human and ask whether to send back to
     implementer or abort. Do not attempt to fix a REJECT yourself —
     the human needs to weigh in on fundamentally broken implementations.

3. **If verdict is APPROVE WITH CHANGES or APPROVE (with findings):**

   **For Blockers and Required Changes:**
   - Spawn the **implementer** with specific instructions:
     > "The code reviewer found the following issues that must be fixed:
     > [list each blocker and required change with file, line, and
     > suggested fix]. Source code is at {worktree} — fix each one there.
     > Update {work_dir}/CHANGES.md with what changed."

   **For Suggestions:**
   - **Default: implement them all.** Include them in the implementer
     instructions alongside blockers and required changes.
   - Only defer a suggestion if it's unrelated to the current task —
     e.g., a pre-existing issue noticed in passing. If the current
     feature naturally requires changes across multiple systems,
     that's the scope — follow it.
   - Never create stubs, TODOs, or partial implementations. Every code
     path must be complete. Deferring within the same system creates
     drift and bugs.

   After implementer fixes, re-run the **code-critic**.
   Repeat until the critic's verdict is APPROVE with no Blockers or
   Required Changes (max 3 iterations — if not converged, escalate
   to human with the remaining issues).

4. **Write the reconciliation summary** — save to
   `{work_dir}/RECONCILIATION.md`:

```markdown
# Code Review Reconciliation
Date: [ISO date]
Iterations: [N] (implementer ↔ critic)

## Addressed
| # | Finding | Category | Resolution |
|---|---------|----------|------------|
| 1 | [finding summary] | Blocker/Required/Suggestion | [how it was fixed] |

## Deferred (unrelated to current task only)
| # | Finding | Category | Why unrelated |
|---|---------|----------|---------------|
| 1 | [finding summary] | Suggestion | [pre-existing bug in X / unrelated subsystem Y] |

## Final verdict
[Critic's final verdict after all iterations]
```

**Every finding from every iteration of REVIEW.md must appear in either
Addressed or Deferred. Deferred should be near-empty — only for issues
in completely unrelated subsystems requiring separate architectural
decisions. "Pre-existing," "not in current batch," or "out of scope"
are NOT valid if the same bug pattern or fix applies.**

Update state.json: step → `checkpoint-b`

---

## -- CHECKPOINT B --

Print this block verbatim (substituting paths):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHECKPOINT B — Your final behavioral review
Feature: #{issue} — {slug}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Review:         {work_dir}/REVIEW.md
Changes:        {work_dir}/CHANGES.md
Reconciliation: {work_dir}/RECONCILIATION.md
```

Then print:

**Reconciliation summary** — the full tables from RECONCILIATION.md,
so the human can see what the critic found, what was fixed, and what
was deferred with reasoning — without needing to open files.

Then print:

```
The agents have reviewed and iterated on technical correctness.
Now it's your turn:

  1. Does the implementation behave as you expected?
  2. Do you agree with the deferred items above?
  3. Anything the agents couldn't know — context, intent, feel?

Reply with one of:
  DONE            — ship it
  DONE [notes]    — ship it, note anything for future sessions
  FIX [notes]     — something needs addressing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Wait for explicit human response. Do not proceed until you receive it.**

If FIX: Assess the feedback. If it targets a deferred item, reconsider
and send to implementer. If it's a new behavioral issue, send to
implementer with the notes. Re-run code critic and reconciliation
(Step 5b) after fixes. Return to Checkpoint B.

If DONE or DONE [notes]: proceed to Step 6: Ship.

---

## Step 6: Ship

### 6a. Update docs

Review CHANGES.md for what was built. Update any documentation that
references the changed system — feature specs (`docs/features/`),
PRD.md (file tables, module descriptions), MEMORY.md (completed features),
and CLAUDE.md (if action counts or architecture sections changed).
Use a subagent to find relevant doc sections if unsure. Create Notion
schema properties if needed.

### 6b. Commit and push

```bash
git -C {worktree} add -A
git -C {worktree} commit -m "#{issue}: {title}"
git -C {worktree} push -u origin {branch}
```

### 6c. Create PR

```bash
gh pr create --head {branch} \
  --title "#{issue}: {title}" \
  --body "$(cat {work_dir}/CHANGES.md)"
```

Print the PR URL.

Update state.json: step → `pr-created`

### 6d. Merge decision

Print:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PR created: {pr_url}

Reply with one of:
  MERGE  — squash-merge now and clean up
  KEEP   — leave PR open for manual review
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Wait for explicit human response.**

### If MERGE:

1. **Rebase onto main:**
   ```bash
   git -C {worktree} fetch origin
   git -C {worktree} rebase origin/main
   ```

2. **If rebase conflicts:**
   - List the conflicting files
   - Show the conflict markers for each file
   - Print:
     ```
     Merge conflicts found in: {files}

     Reply with one of:
       RESOLVE  — I'll attempt to resolve and show you the diff
       HANDLE   — you'll resolve manually, I'll pause
     ```
   - If RESOLVE: attempt auto-resolution, show the diff for each
     resolved file, ask the user to confirm before continuing.
     If any conflict can't be resolved confidently, show it and ask.
   - If HANDLE: update state.json step to `merge-conflicts` and print:
     ```
     Worktree: {worktree}
     Branch: {branch}
     Resolve conflicts there, then resume with:
       /engineer --resume {issue}
     ```
     Stop the pipeline.

3. **If rebase clean (or conflicts resolved):**
   ```bash
   git -C {worktree} push --force-with-lease origin {branch}
   gh pr merge {pr_number} --squash --delete-branch
   ```

4. **Clean up:**
   ```bash
   git worktree remove {worktree}
   mkdir -p .claude/work/archive
   mv {work_dir} .claude/work/archive/{issue}-{slug}
   ```

5. **Close issue:**
   ```bash
   gh issue close {issue}
   ```

6. Print a one-paragraph summary of what was built.
7. Note any follow-up items the human mentioned.

Update state.json: step → `done`

### If KEEP:

Update state.json: step → `pr-created`

Print:
```
PR open at {pr_url}. Worktree preserved at {worktree}.
Resume later with: /engineer --resume {issue}
```

---

## --quick mode

If invoked with `--quick`:
- Skip Step 2 and 2b (Plan Critic + reconciliation)
- Checkpoint A only shows the plan summary (no critique)
- Code reconciliation (Step 5b) still runs — never skip review fixes
- Set `quick: true` in state.json
- Appropriate for: bug fixes, small isolated changes, changes in a single file

---

## Failure handling

If any agent produces output that seems incomplete or broken:
- Read the handoff document yourself
- Assess whether it's usable
- If not, re-spawn the agent with clarifying instructions
- Do not silently pass bad handoffs down the pipeline

Never proceed past a checkpoint without explicit human confirmation.
Never spawn the next agent while the current one is still running.

---

## Core principles

### Nothing is silently ignored
Every piece of feedback from every agent must be explicitly dispositioned.
The human should never need to cross-reference CRITIQUE.md or REVIEW.md
against the implementation to figure out what was addressed — the
reconciliation summaries make that visible.

### Do the work, don't defer it
Deferring creates drift, knowledge gaps, and bugs. If a suggestion
improves the system and is related to the current task, implement it —
regardless of complexity. If the feature naturally touches multiple
systems, that's the scope — follow the work wherever it leads. The only
valid reason to defer is when the issue is unrelated to the current
task (e.g., a pre-existing bug noticed in passing). "It's hard" or
"it's optional" are never reasons to defer.

### Elegance over shortcuts
Prefer solutions that improve the overall system architecture. Use
object-oriented design — no duplicate code across files. Extract shared
utilities on first reuse. Never create stubs, TODOs, or placeholder
implementations. Every code path must be complete.

### Pattern audit — find and fix all instances
When fixing a bug or applying a defensive pattern, the fix is not done
until every instance of the same pattern in the codebase has been audited.
Grep for the pattern. Confirm each instance. Fix them all in the same pass.
This applies to the planner (scope the audit), the implementer (execute it),
and the code-critic (verify completeness). A partial fix is worse than no fix
— it creates false confidence that the problem is solved.

### Self-learning from bugs
After fixing a bug pattern, document it in `tasks/lessons.md` with:
(a) what the bug looked like, (b) what the fix was, (c) a rule that
prevents it from recurring. Check `tasks/lessons.md` at the start of
each pipeline run for patterns that apply to the current work.

### "Pre-existing" is never a valid deferral reason
If the agent is already in the file, already writing the pattern, and
finds the same bug elsewhere — fix it. Deferring known bugs because they
pre-date the current task means discovering them in production later and
doing a full debugging cycle. The cost of fixing N+3 instances is trivial
compared to a production incident. The ONLY valid deferrals are issues in
completely unrelated subsystems requiring separate architectural decisions
that the human should weigh in on.
