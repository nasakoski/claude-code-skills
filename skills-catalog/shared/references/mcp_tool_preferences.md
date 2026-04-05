# Tool Preferences for Code Work

Repo-level MCP policy for code files and semantic codebase analysis.

## Primary Policy

- Use `hex-line` first when a skill materially reads or edits source code, config, scripts, or test files.
- Use `hex-graph` first when a skill must reason about existing code semantics: symbol identity, references, edit blast radius, architecture, clone groups, or semantic diff risk.
- Use built-in `Read/Edit/Write/Grep` only as named fallback when the relevant MCP is unavailable, unsupported for the file/task, or outside MCP scope.
- Do not cargo-cult `hex-graph` into planning, docs, community, research, or runtime-only skills that do not make semantic code decisions.

## Applicability Matrix

| Skill behavior | Primary tool | Policy |
|------|------|------|
| Edits code, config, scripts, tests | `hex-line` | REQUIRED |
| Reads existing code to make semantic decisions | `hex-graph` + `hex-line` | REQUIRED |
| Reads code for local structure only | `hex-line` | RECOMMENDED |
| Markdown/doc-only structure or content work | none by default | OPTIONAL |
| Planning/business prioritization/external research | none by default | AVOID graph |
| Community/GitHub engagement | none by default | AVOID both unless editing local templates |
| Runtime verification, benchmark, profiling, container launch | none by default | AVOID graph as evidence source |

## Operational Rules

- Preferred `hex-line` flow: `outline -> read_file -> edit_file -> verify`
- Preferred `hex-graph` flow: `index_project -> find_symbols/inspect_symbol -> analyze_edit_region or analyze_changes`
- Use `hex-line` for config, scripts, and tests when those files are part of the deliverable
- Use `hex-line outline` first for large markdown files, then targeted reads by section
- Use `hex-graph` for planning when Story or Task affects existing code and real affected modules or task boundaries are unclear
- Use `hex-graph` for implementation or review before editing existing functions, classes, routes, or public APIs
- Do not use `hex-graph` as a runtime profiler; benchmark and profiler data remain the source of truth

## Fallback Contract

Use standard tools only when one of these is true:
- MCP server is unavailable or failing
- target language is unsupported by `hex-graph`
- task is outside MCP scope, such as images, PDFs, notebooks, external websites, or pure GitHub mutations
- target file is small markdown or metadata where MCP setup adds no value

Fallbacks must be explicit in the skill:
- `hex-line` fallback -> built-in `Read/Edit/Write/Grep`
- `hex-graph` fallback -> built-in `Grep/Glob/Read` with manual reasoning

## Canonical Detail Sources

- Package and tool behavior: `mcp/hex-line-mcp/README.md`, `mcp/hex-graph-mcp/README.md`, and the MCP server tool descriptions
- Repo usage policy: this file plus `mcp_integration_patterns.md` and `mcp_applicability_matrix.md`

---
**Version:** 5.0.0
**Last Updated:** 2026-03-20
