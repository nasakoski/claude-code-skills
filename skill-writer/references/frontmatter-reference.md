# SKILL.md Frontmatter Reference

Complete reference for all YAML frontmatter fields in skill files.

---

## Fields

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `name` | No | string | directory name | Skill identifier. Lowercase, numbers, hyphens. Max 64 chars. Cannot contain "anthropic" or "claude". |
| `description` | Recommended | string | first paragraph of body | What the skill does and when to use it. Third person. Max 1024 chars. |
| `argument-hint` | No | string | none | Autocomplete hint shown to user. E.g., `[issue-number]`, `[file] [format]`. |
| `disable-model-invocation` | No | boolean | `false` | If `true`, only the user can invoke via `/name`. Claude cannot auto-trigger. |
| `user-invocable` | No | boolean | `true` | If `false`, hidden from `/` menu. Only Claude can invoke it. |
| `allowed-tools` | No | string list | session default | Tools Claude can use without asking permission. E.g., `Read, Grep, Glob`. |
| `model` | No | string | session model | Override model. Values: `sonnet`, `opus`, `haiku`. |
| `context` | No | string | inline | Set to `fork` to run in an isolated subagent (no conversation history). |
| `agent` | No | string | `general-purpose` | Subagent type when `context: fork`. Options: `Explore`, `Plan`, `general-purpose`, or custom agent name. |
| `hooks` | No | object | none | Lifecycle hooks scoped to this skill. See hooks documentation. |

---

## String Substitutions

Available in the SKILL.md body (replaced before Claude sees the content):

| Variable | Description | Example |
|----------|-------------|---------|
| `$ARGUMENTS` | All arguments passed to the skill | `/deploy staging` → `$ARGUMENTS` = `staging` |
| `$ARGUMENTS[N]` | Specific argument (0-indexed) | `/migrate Foo React Vue` → `$ARGUMENTS[1]` = `React` |
| `$N` | Shorthand for `$ARGUMENTS[N]` | `$0` = first arg, `$1` = second, etc. |
| `${CLAUDE_SESSION_ID}` | Current session identifier | Useful for session-specific files or logging |

---

## Dynamic Context Injection

The `` !`command` `` syntax runs shell commands **before** Claude sees the skill.
The command output replaces the placeholder inline.

```markdown
## Current state
- Branch: !`git branch --show-current`
- Status: !`git status --short`
- Recent commits: !`git log --oneline -5`
```

Use this for context that changes between invocations (git state, environment
info, file listings). Do not use for long-running or interactive commands.

---

## Invocation Control Matrix

| `disable-model-invocation` | `user-invocable` | User invokes | Claude invokes | Description in context |
|---------------------------|-------------------|-------------|----------------|----------------------|
| `false` (default) | `true` (default) | Yes | Yes | Always |
| `true` | `true` (default) | Yes | No | Not loaded |
| `false` (default) | `false` | No | Yes | Always |
| `true` | `false` | No | No | Never (skill is inert) |

**When to use `disable-model-invocation: true`:**
- Skills with side effects (deployments, commits, API mutations)
- Timing-sensitive operations the user should control
- Skills that are expensive to run

**When to use `user-invocable: false`:**
- Background knowledge Claude should have but isn't a command
- Context injection (e.g., "legacy system constraints")
- Skills designed to be called by other skills via the `Skill` tool

---

## Common `allowed-tools` Patterns

### Read-only exploration
```yaml
allowed-tools: Read, Grep, Glob
```

### File creation and exploration
```yaml
allowed-tools: Read, Write, Grep, Glob, Bash(mkdir *), Bash(ls *)
```

### Full development
```yaml
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
```

### Git operations
```yaml
allowed-tools: Read, Grep, Glob, Bash(git *)
```

### Package management
```yaml
allowed-tools: Read, Write, Grep, Glob, Bash(npm *), Bash(npx *)
```

### Deployment
```yaml
allowed-tools: Bash(git *), Bash(npm *), Bash(docker *), Read
```

### Web research
```yaml
allowed-tools: WebFetch, WebSearch, Read, Write
```

### Wildcard syntax
`Bash(pattern *)` allows Bash commands matching the pattern. The `*` is a glob.
Examples:
- `Bash(git *)` — any git command
- `Bash(npm run *)` — npm run scripts only
- `Bash(python scripts/*)` — Python scripts in scripts/ directory
