# DECIDE Framework — Systems Thinking Checklist

Use this checklist when designing a skill. Copy it into your working notes and
check items as you complete them. Each item represents a design decision that
should be made explicitly, not assumed.

---

## D — Domain Analysis

- [ ] **Problem statement**: What pain does this skill remove?
      (Frame as pain removed, not feature added)
- [ ] **User persona**: Who uses this skill and in what context?
      (Developer? Power user? Non-technical? Bot/system?)
- [ ] **Usage trigger**: Is this triggered manually, by Claude automatically, or both?
- [ ] **Concrete examples**: 2-3 specific invocations with expected output
- [ ] **Existing landscape**: Checked `~/.claude/skills/` and `.claude/skills/` for overlap
- [ ] **Claude baseline**: Does Claude already handle this well without a skill?
      (If yes, the skill should add something Claude lacks: specific workflow,
      domain knowledge, or output format)

---

## E — Environment Mapping

- [ ] **Tool inventory**: Every operation mapped to a Claude Code tool
      (Read/Write/Edit/Bash/Grep/Glob/WebFetch/WebSearch/Skill/Task)
- [ ] **Bash patterns**: Specific command patterns listed if Bash is needed
      (e.g., `Bash(git *)`, `Bash(npm *)`, `Bash(docker *)`)
- [ ] **External dependencies**: CLI tools, APIs, runtimes listed
- [ ] **Dependency availability**: Optional vs required dependencies identified
- [ ] **Graceful degradation**: Fallback behavior defined for missing optional deps
- [ ] **Permission profile**: Read-only? Write? Execute? Network?
- [ ] **Composition analysis**: Upstream skills (feeds into this) and downstream
      skills (this feeds into) identified
- [ ] **Conflict check**: No collision with existing skill names or capabilities

---

## C — Constraints Analysis

- [ ] **Failure modes**: Each tool/dependency has identified failure scenarios
- [ ] **Error handling**: Strategy defined per failure (retry/fallback/abort/validate-first)
- [ ] **Fragility assessment**: Overall fragility level determined
      - Low (creative/exploratory) → high-freedom instructions
      - Medium (structured/pattern-based) → template instructions
      - High (deployment/migration/destructive) → exact-command instructions
- [ ] **Pre-validation**: Validation steps added before expensive/destructive operations
- [ ] **Scope boundaries**: Explicit list of what the skill does NOT do
- [ ] **Security review**: No hardcoded secrets, input validated at boundaries,
      destructive operations gated behind confirmation

---

## I — Interface Design

- [ ] **Name**: Lowercase, hyphens, max 64 chars, no reserved words
      (chosen between action-noun and gerund forms)
- [ ] **Arguments**: `$ARGUMENTS` structure designed
      (none / single `$0` / multi `$0 $1 $2`)
- [ ] **Argument hint**: `argument-hint` set in frontmatter if args are expected
- [ ] **Description**: Third person, <1024 chars, answers WHAT + WHEN
- [ ] **Trigger keywords**: Both formal and informal phrasings included
- [ ] **Description tone**: "Pushy" enough to reliably trigger
- [ ] **Invocation control**: Decision made on who can invoke
      (default both / `disable-model-invocation` / `user-invocable: false`)
- [ ] **Execution context**: Inline (default) or fork (isolated subagent)
- [ ] **Agent type**: If forked, agent type chosen (Explore/Plan/general-purpose)
- [ ] **Output shape**: Defined what user sees on completion
      (files / terminal output / conversation / specific format)
- [ ] **Progressive disclosure**: Content allocated across three tiers
      (description / SKILL.md body / references)

---

## D — Design Architecture

- [ ] **Freedom mapping**: Each instruction section matched to its freedom level
      (bullets for high / templates for medium / exact commands for low)
- [ ] **Workflow pattern**: Selected from sequential / conditional / validation loop / checklist
- [ ] **File plan**: Directory layout with justification for each file
      (only create supporting files when SKILL.md exceeds 200 lines or
      reference material serves some-but-not-all invocations)
- [ ] **Cross-references**: Each supporting file linked from SKILL.md with
      clear intent ("See X for Y")
- [ ] **Line budget**: Estimated SKILL.md length (must be <500 lines)
- [ ] **Reference depth**: All references one level deep from SKILL.md

---

## E — Execute & Validate

- [ ] **Directory created**: At correct scope (personal ~/.claude or project .claude)
- [ ] **SKILL.md written**: Frontmatter + body following the design
- [ ] **Supporting files written**: References, scripts, examples as planned
- [ ] **Validation passed**: All items below checked

### Validation Checklist

- [ ] Name: lowercase, hyphens, max 64 chars, no "anthropic"/"claude"
- [ ] Description: third-person, <1024 chars, trigger keywords present
- [ ] Description: answers both WHAT and WHEN
- [ ] SKILL.md body: under 500 lines
- [ ] Paths: all forward slashes, no Windows-style
- [ ] Security: no hardcoded secrets or credentials
- [ ] References: one level deep from SKILL.md
- [ ] References: each linked with intent from SKILL.md
- [ ] Freedom: instruction specificity matches fragility level
- [ ] Temporal: no time-sensitive information
- [ ] Terminology: consistent throughout all files
- [ ] Scripts: handle their own errors
- [ ] Workflow: clear steps, validation loops where needed
- [ ] Triggering: description is "pushy" enough
- [ ] Safety: no content that would surprise the user if described
- [ ] Test prompts: 2-3 examples prepared to verify the skill works
