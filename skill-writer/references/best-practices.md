# Skill Authoring Best Practices

Distilled from Anthropic's official documentation and community patterns.

## Description Writing

The `description` field is the primary triggering mechanism. Claude reads all
skill descriptions to decide which skills to invoke.

**Rules:**
- Write in third person ("Generates API docs..." not "I can generate...")
- Max 1024 characters
- Answer WHAT the skill does AND WHEN to use it
- Include specific trigger keywords — both formal and informal
- Be deliberately "pushy": overtriggering is better than undertriggering
- Claude tends to undertrigger, so explicitly list contexts where the skill applies

**Good example:**
```
Generates REST API documentation from source code. Use when the user mentions
API docs, endpoint documentation, OpenAPI specs, Swagger, or wants to document
their routes. Also use when reviewing or updating existing API documentation.
```

**Bad example:**
```
API documentation tool.
```

**Keyword strategy:** Include the words users would naturally say. If the skill
handles "deployment," also mention "deploy," "ship," "release," "push to prod."
Include informal phrasings alongside technical ones.

---

## Degrees of Freedom

Match instruction specificity to operation fragility:

### High Freedom (Low Fragility)
For creative, exploratory, or review tasks. Use bullet-point heuristics.

```markdown
## Review approach
- Check for common security vulnerabilities (injection, XSS, auth bypass)
- Assess code clarity and naming consistency
- Note any performance concerns with data structures or algorithms
- Flag missing error handling at system boundaries
```

### Medium Freedom (Medium Fragility)
For structured tasks with variation. Use templates with parameters.

```markdown
## Component structure
Create a new component following this pattern:

\`\`\`tsx
export function $COMPONENT_NAME({ ...props }: $COMPONENT_NAME_Props) {
  // Implementation based on requirements
  return <div className={styles.container}>...</div>;
}
\`\`\`
```

### Low Freedom (High Fragility)
For deployments, migrations, destructive operations. Use exact commands.

```markdown
## Migration steps
Run these commands in exact order:

\`\`\`bash
pg_dump -Fc production_db > backup_$(date +%Y%m%d).dump
psql -c "BEGIN; ALTER TABLE users ADD COLUMN email_verified boolean DEFAULT false;"
# Verify before committing:
psql -c "SELECT count(*) FROM users WHERE email_verified IS NULL;"
psql -c "COMMIT;"
\`\`\`
```

---

## Progressive Disclosure

Skills load in three tiers. Use this to manage context window efficiently.

**Tier 1 — Description** (always loaded, ~100 words):
Only the name + description. This is all Claude sees until the skill triggers.
Make it count.

**Tier 2 — SKILL.md body** (loaded on trigger, <500 lines):
The full instructions. Keep this focused on what Claude needs during execution.
Move reference material to Tier 3.

**Tier 3 — References/scripts** (loaded on demand, unlimited):
Detailed documentation, API references, configuration schemas, helper scripts.
Claude reads these only when it decides it needs them.

**When to use references:**
- API documentation > 50 lines
- Configuration schemas or field references
- Domain-specific knowledge that's needed for some invocations but not all
- Scripts that handle deterministic/repetitive operations

**How to link from SKILL.md:**
```markdown
For the complete API reference, see [api-reference.md](references/api-reference.md).
Run `scripts/validate.sh <config-file>` to check configuration syntax.
```

---

## Workflow Patterns

### Sequential
Most common. Steps execute in order.
```markdown
## Workflow
1. Read the target file
2. Analyze the structure
3. Generate the output
4. Write to disk
```

### Conditional
For skills that handle multiple domains or variants.
```markdown
## Determine target
- If the project uses React: see [react.md](references/react.md)
- If the project uses Vue: see [vue.md](references/vue.md)
- If the project uses Svelte: see [svelte.md](references/svelte.md)
```

### Validation Loop
For quality-critical operations. Do → Check → Fix → Repeat.
```markdown
## Quality loop
1. Generate the initial output
2. Run the validator: `scripts/validate.sh output/`
3. If errors found: fix them and return to step 2
4. Present results to user
```

### Checklist
For multi-step operations where tracking progress matters.
```markdown
## Setup checklist
- [ ] Verify prerequisites installed
- [ ] Create project directory
- [ ] Initialize configuration
- [ ] Install dependencies
- [ ] Run initial build
- [ ] Verify everything works
```

---

## Output Patterns

### Template Pattern (Strict)
When output must match a specific format:
```markdown
## Report format
ALWAYS use this exact structure:

# [Title]
## Summary
[2-3 sentences]
## Findings
[Bulleted list]
## Recommendations
[Numbered list with priority]
```

### Template Pattern (Flexible)
When output should follow a general shape:
```markdown
## Output structure
Organize your response as:
- A brief summary of what was found
- Detailed findings grouped by category
- Actionable recommendations with rationale
```

### Examples Pattern
When output quality improves with concrete references:
```markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens and refresh flow
Output: feat(auth): implement JWT authentication with token refresh

**Example 2:**
Input: Fixed the bug where users couldn't log out on mobile
Output: fix(auth): resolve mobile logout failure
```

---

## Anti-Patterns

**Overexplaining**: Don't explain what a PDF is, what Git does, or how HTTP works.
Claude knows. Focus on what's unique to your skill.

**Windows paths**: Always use forward slashes (`/`). Never `\`.

**Too many options**: Provide a recommended default with an escape hatch, not
a menu of 6 choices for every decision.

**Time-sensitive information**: Don't reference "the current API version" or
"the latest release." Use "old patterns" sections if historical context matters.

**Deep reference nesting**: Keep references one level deep from SKILL.md.
No chains of references-to-references.

**Rigid ALWAYS/NEVER**: Explain the reasoning so the model can generalize.
"Always validate input because malformed data causes silent failures downstream"
is better than "ALWAYS validate input."

**Offering to explain**: Don't include "Would you like me to explain?" The user
can ask. Focus on doing the work.

**Catching too broadly**: Don't make the description match everything. Be specific
about the skill's domain even while being "pushy" about trigger keywords.

---

## Quick Reference

| Aspect | Guideline |
|--------|-----------|
| SKILL.md length | < 500 lines |
| Description length | < 1024 chars |
| Instruction form | Imperative ("Read the file") |
| Reference depth | One level from SKILL.md |
| TOC threshold | Reference files > 300 lines |
| Name format | lowercase-with-hyphens, max 64 chars |
| Paths | Always forward slashes |
| Freedom level | Match to fragility |
| Description tone | Third person, "pushy" |
| Examples | Include when output quality depends on them |
