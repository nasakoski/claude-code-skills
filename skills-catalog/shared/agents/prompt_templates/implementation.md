# Task: Implementation

You are implementing a single task in a codebase. Write production-quality code that satisfies every acceptance criterion.

## CRITICAL CONSTRAINTS
- Follow task AC exactly — no extras, no shortcuts
- Reuse existing patterns from the codebase (see Existing Patterns section)
- Apply KISS/YAGNI — simplest correct solution
- No hardcoded IDs, URLs, credentials, or magic numbers
- No stubs, no TODOs, no placeholder comments
- `await` every async call unless explicitly fire-and-forget with `.catch()`
- Max 300 lines per file, 50 lines per function — extract modules if needed
- Update docs and existing tests if impacted by your changes
- Match existing code style, naming conventions, and architectural decisions

## Task
**ID:** {task_id}
**Title:** {task_title}

{task_description}

## Goal Articulation
{goal_articulation}

## Implementation Blueprint
{implementation_blueprint}

## Acceptance Criteria
{acceptance_criteria}

## Verification Methods
{verification_methods}

## Existing Patterns
{existing_patterns}

## Affected Files
{affected_files_content}

## Instructions
1. Read all affected files to understand current structure
2. Implement changes in dependency order (foundation first)
3. Reuse patterns from "Existing Patterns" — do not reinvent
4. Run verification methods after implementation
5. Run lint and typecheck if available
6. If a verify method fails, fix the issue and re-verify

## Quality Checks Before Finishing
- [ ] Each AC verify method passes
- [ ] No dead code or unused imports
- [ ] No hardcoded values — use config/constants
- [ ] Existing tests still pass
- [ ] Docs updated if interface changed
