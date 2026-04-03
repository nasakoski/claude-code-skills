# Example: Simple Skill — Code Review

A minimal, self-contained skill with no supporting files. Demonstrates proper
frontmatter, concise instructions, imperative form, and appropriate freedom level
for a low-fragility (creative/analytical) task.

---

## Directory Structure

```
code-review/
└── SKILL.md
```

## SKILL.md

```yaml
---
name: code-review
description: Reviews code for quality, security, and maintainability. Use when the user asks for a code review, wants feedback on their code, mentions reviewing a PR, or asks "what do you think of this code?" Handles any language or framework.
allowed-tools: Read, Grep, Glob
---
```

```markdown
# Code Review

Review the specified code for quality, security, and maintainability.

If no specific files are mentioned, ask what to review. If `$ARGUMENTS` contains
a file path or pattern, start there.

## Review dimensions

Assess each area. Skip dimensions that don't apply to the code under review.

- **Correctness**: Logic errors, off-by-one, null/undefined handling, race conditions
- **Security**: Injection vulnerabilities, auth/authz gaps, secret exposure, input validation
- **Performance**: Unnecessary allocations, N+1 queries, missing indexes, algorithmic complexity
- **Readability**: Naming clarity, function length, nesting depth, comment quality
- **Error handling**: Uncaught exceptions, silent failures, missing error context
- **Testing**: Coverage gaps, brittle assertions, missing edge cases

## Output format

For each finding:

**[Dimension] — [Severity: critical/warning/suggestion]**
File: `path/to/file.ext:line`
Issue: [One sentence describing what's wrong]
Fix: [Concrete suggestion or code snippet]

End with a summary: overall assessment (1-2 sentences) and a prioritized list
of the top 3 things to address first.
```

---

## Design Notes

- **No supporting files needed**: The instructions are under 40 lines and
  self-contained. No reference material varies by invocation.
- **High freedom**: Code review is analytical/creative. Bullet-point heuristics
  let Claude adapt to any codebase.
- **Read-only tools**: Review doesn't modify anything. Only Read, Grep, Glob.
- **Pushy description**: Includes informal triggers ("what do you think of this
  code?") alongside formal ones ("code review," "reviewing a PR").
- **Output format**: Structured enough to be scannable, flexible enough to
  adapt to different codebases.
