---
name: code-review
description: Performs systems-level code review focused on detecting multi-session drift — bugs that arise when multiple Claude Code sessions modify a codebase independently. Detects registration pipeline gaps, pattern divergence, stale references, error contract violations, and security regressions. Use when reviewing code, checking for drift, auditing consistency, reviewing a PR, or "did anything break across sessions?" Works on any codebase.
allowed-tools: Read, Grep, Glob, Bash(git *)
---

# Code Review: Multi-Session Drift Detection

Review code for systemic inconsistencies caused by independent modifications.
This is a read-only review — produce findings, not fixes.

## Scope

If `$ARGUMENTS` contains a file path, directory, branch name, or PR number,
focus the review on those changes. If no arguments, review the most recent
changes via `git diff` against the main/master branch.

Always examine the full project for context — reviewing a diff in isolation
defeats the purpose. The goal is to find what the changeset *missed*.

## Phase 1: Map the System

Before checking for drift, discover the project's architecture. Later phases
depend on this context.

### 1.1 Project type

Read package.json, Cargo.toml, pyproject.toml, go.mod, or equivalent. Note
the language, framework, build system, and major dependencies.

### 1.2 Registration points

Registration points are locations where adding a new entity (route, component,
handler, tool, model, config, etc.) requires updating multiple files together.
A change to one file without the others is the most common multi-session bug.

Search for:
- Index/barrel files that re-export from subdirectories
- Config files listing modules, plugins, routes, or handlers
- Central registries (DI containers, plugin loaders, middleware chains)
- Schema files paired with code generators
- Test config that must know about new modules

For ecosystem-specific patterns, see [registration-patterns.md](references/registration-patterns.md).

For each pipeline found, note: what entity type it registers, which files must
be updated together, and how to verify completeness (grep the entity name
across all registration files).

### 1.3 Baseline patterns

Read 3-5 files in the most active directories to establish conventions:
- Error handling (throw vs return error object vs Result type)
- Naming conventions (files, functions, classes, constants)
- Import/export patterns
- Async patterns (promises, async/await, channels)
- HTTP/fetch patterns (wrapper functions, timeout handling)
- Logging patterns
- Shared utility locations (lib/, utils/, common/, tool-specific lib dirs)

These become the drift detection baseline in Phase 2.

### 1.4 Changeset

Determine what changed:
- PR or branch: `git diff <base>...<head> --name-only`
- Recent work: `git log --oneline -20` then diff against the appropriate base
- Specific files: use those directly

List changed files grouped by module/directory.

## Phase 2: Scan for Drift

Check each drift class against the architecture discovered in Phase 1.
Skip classes that don't apply to the changeset or project.

### 2.1 Registration Pipeline Gaps

**The highest-value check.** For each new entity in the changeset (new file,
new export, new route, new handler, new component):

1. Identify which registration pipeline it belongs to (Phase 1.2)
2. Grep for the entity name across ALL registration points in that pipeline
3. Flag any registration point where the entity is missing

Registration gaps are the most common multi-session bug because each session
sees the file it's editing but not the broader registration system.

### 2.2 Pattern Divergence

Search for duplicate implementations of the same concept:
- Multiple HTTP/fetch wrappers or timeout utilities
- Multiple validation approaches for the same data type
- Multiple error formatting functions
- Constants representing the same value with different names

For each changed file, check if its patterns match the baseline from Phase 1.3.
Divergence indicates accidental drift or an incomplete migration.

### 2.3 Stale References

For any entity renamed or removed in the changeset:
- Grep for the OLD name across the entire project
- Check imports, config files, documentation, tests, and comments
- Flag remaining references

Also check for:
- Imports of files/modules that no longer exist
- Config entries pointing to removed functionality
- TODO/FIXME comments referencing completed or abandoned work
- Dead code: imports, variables, or functions nothing references

### 2.4 Error Contract Violations

Check that error handling in changed files matches the project convention:
- Convention is return error objects → flag throws in handlers
- Convention is throw exceptions → flag error-object returns
- Convention is Result types → flag bare throws or error returns
- Inconsistent error shapes (different fields, missing context)

Module boundaries are where error contracts diverge most often.

### 2.5 Constant and Config Inconsistency

Search for:
- Same timeout/retry/limit defined in multiple places with different values
- Same concept with different names (MAX_RETRIES vs RETRY_LIMIT vs maxRetries)
- Same name with different units (timeout in ms in one file, seconds in another)
- Magic numbers that should reference a shared constant
- Env var names referenced in code but missing from .env.example or config docs

### 2.6 Security Regressions

Check changed files against the project's existing security patterns:
- Path traversal: file path inputs validated/sanitized before use
- Input validation: user-provided data validated at system boundaries
- Secret handling: no secrets in logs, error messages, or URLs
- Auth/authz: new endpoints respect existing auth middleware
- Injection: dynamic queries/commands properly parameterized
- Permissions: new capabilities respect existing permission systems

A security regression is when new code bypasses a safety pattern that exists
elsewhere in the codebase.

### 2.7 Async and Resource Safety

Check for:
- Fire-and-forget async calls without error handling
- Resources opened but not closed (files, connections, streams, timers)
- Missing cleanup in error paths
- Concurrent access to shared mutable state without synchronization
- Missing timeouts on external calls (HTTP, database, RPC)

### 2.8 State and Schema Drift

Check for inconsistencies between:
- Database schema/migrations and code that reads/writes it
- API contracts (types, interfaces) and their implementations
- In-memory state and persistent state (state lost on restart)
- Config schema and code that consumes it
- Generated code and the source it was generated from

### 2.9 Code Duplication and Missed Abstractions

Check for code that should be shared but is copy-pasted or reinvented.
Focus on the changeset: for each changed file, search for its patterns elsewhere.

**Step 1: Function signature scan**

For each non-trivial function or method defined in a changed file, grep for
the same name across the project. If the same name appears in multiple files,
read both implementations. Flag if:
- The bodies are structurally identical (same logic, different variable names)
- One is a strict subset of the other
- A shared version already exists that could be imported instead

**Step 2: Lazy-initialization and singleton patterns**

Search for repeated boilerplate patterns in changed files:
- Lazy imports: `if (!X) { X = await import("..."); }` repeated across files
- Client singletons: `if (!this.#client) { this.#client = new Client(); }`
- Config objects: identical option literals defined in multiple classes

Grep for the import target or class name. If 3+ files perform the same
initialization, it should be a shared factory or module-level singleton.

**Step 3: Inline reimplementation of existing utilities**

For each changed file, check whether it reimplements logic that already exists
in the project's shared utility locations (identified in Phase 1.3):

1. Read the shared utility directories
2. For each substantial function in the changed file (>5 lines), grep for
   key operations (API calls, transformations, parsing) in the shared modules
3. Flag functions that duplicate existing shared helpers

**Step 4: The "third copy" threshold**

Search for structural patterns from changed files across the full project.
When the same pattern (function body, class boilerplate, inline pipeline)
appears in 3+ files, flag it as a missed abstraction opportunity. Identify:
- What should be extracted (the repeated code)
- Where it should live (existing shared module or new one)
- Which files would import it

## Phase 3: Report

Present findings in this structure:

---

**Drift Review: [scope description]**

**Summary**: [2-3 sentences: what was reviewed, most significant findings,
overall assessment]

**Scope**: [files/PR/branch reviewed]
**Architecture**: [language/framework, key patterns identified]
**Registration pipelines found**: [count and brief list]

### Findings

Group by severity. Within each severity, group by drift class.

**Critical — Likely Bugs**

Findings that will probably cause runtime errors or security issues.

> **[Drift class] — [one-line title]**
> Files: `path/to/file.ext:line`, `path/to/other.ext:line`
> Issue: [What is wrong and why it matters]
> Evidence: [Grep results, code snippets, or diff references]

**Warning — Inconsistencies**

Drift that may not cause immediate failures but indicates systemic issues.

**Suggestion — Improvements**

Opportunities to reduce future drift risk.

### Registration Pipeline Audit

For each pipeline discovered in Phase 1.2, show a completeness matrix:
entity vs registration point, with check/X marks.

### Drift Risk Assessment

1-2 paragraphs: which areas are most vulnerable to future drift and what
practices would reduce the risk.

---

End with total finding count by severity. Do not offer to fix anything.
