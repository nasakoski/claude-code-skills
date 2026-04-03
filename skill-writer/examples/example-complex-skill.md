# Example: Complex Skill — API Generator

A multi-file skill with references, scripts, and progressive disclosure.
Demonstrates medium-fragility instructions, conditional workflow, cross-references,
and proper separation of concerns.

---

## Directory Structure

```
api-generator/
├── SKILL.md                          # Main instructions (~120 lines)
├── references/
│   ├── express-patterns.md           # Express.js route patterns
│   └── fastify-patterns.md           # Fastify route patterns
└── scripts/
    └── generate-openapi.sh           # Generates OpenAPI spec from routes
```

## SKILL.md

```yaml
---
name: api-generator
description: Generates REST API endpoints with routes, validation, error handling, and OpenAPI documentation. Use when the user wants to create API routes, add endpoints, scaffold a REST API, build CRUD operations, or generate API documentation. Supports Express and Fastify.
argument-hint: [resource-name]
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(node *), Bash(npx *)
disable-model-invocation: true
---
```

```markdown
# API Generator

Generate REST API endpoints for a given resource.

If `$ARGUMENTS` is provided, use it as the resource name (e.g., "users",
"products"). Otherwise, ask what resource to generate.

## Step 1: Detect framework

Check the project for framework signals:
- `package.json` dependencies for `express` or `fastify`
- Existing route files for import patterns

If Express: see [express-patterns.md](references/express-patterns.md)
If Fastify: see [fastify-patterns.md](references/fastify-patterns.md)
If unclear: ask the user.

## Step 2: Analyze existing patterns

Before generating, read 2-3 existing route files to match:
- File naming convention (e.g., `users.routes.ts` vs `usersRouter.ts`)
- Validation library (zod, joi, yup, etc.)
- Error handling pattern (middleware, try-catch, result types)
- Response format (envelope `{ data, error }` vs raw)
- Auth middleware usage

Match these patterns exactly. Do not introduce new conventions.

## Step 3: Generate the endpoint files

For resource `$0`, create:

1. **Route file**: CRUD endpoints (GET list, GET by ID, POST, PUT, DELETE)
   following the detected patterns from Step 2
2. **Validation schema**: Input validation for POST and PUT bodies
3. **Types/interfaces**: Request and response types

Use the framework-specific patterns from the reference file.

## Step 4: Generate OpenAPI documentation

Run the documentation generator:

\`\`\`bash
scripts/generate-openapi.sh <route-file-path>
\`\`\`

If the script is not available or fails, generate the OpenAPI YAML manually
for the new endpoints.

## Step 5: Verify

- [ ] Route file follows existing naming conventions
- [ ] All CRUD operations present (or subset if user specified)
- [ ] Validation schemas match existing library choice
- [ ] Error handling matches existing pattern
- [ ] Types are consistent with project conventions
- [ ] OpenAPI spec generated and matches the routes
```

---

## Design Notes

- **`disable-model-invocation: true`**: API generation creates files. The user
  should control when it runs, not Claude auto-triggering it.
- **Medium freedom**: Templates with parameters. Step 2 (analyze existing patterns)
  ensures the generated code matches the project — this is the key quality driver.
- **Conditional workflow**: Framework detection in Step 1 routes to different
  reference files. Only the relevant reference loads into context.
- **Progressive disclosure**: Framework-specific patterns are in references/
  (~100 lines each), not in SKILL.md. A project using Express never loads
  Fastify patterns.
- **Script for deterministic work**: OpenAPI generation is mechanical — better
  as a script than LLM-generated. Falls back to manual generation if unavailable.
- **Validation checklist**: Step 5 ensures consistency with project conventions
  before presenting results.
