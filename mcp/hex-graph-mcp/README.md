# hex-graph-mcp

Code knowledge graph MCP server. Indexes codebases into a SQLite graph via tree-sitter AST parsing.

[![npm](https://img.shields.io/npm/v/@levnikolaevich/hex-graph-mcp)](https://www.npmjs.com/package/@levnikolaevich/hex-graph-mcp)
[![downloads](https://img.shields.io/npm/dm/@levnikolaevich/hex-graph-mcp)](https://www.npmjs.com/package/@levnikolaevich/hex-graph-mcp)
[![license](https://img.shields.io/npm/l/@levnikolaevich/hex-graph-mcp)](./LICENSE)
![node](https://img.shields.io/node/v/@levnikolaevich/hex-graph-mcp)

## Features

| Tool | Description | Key Feature |
|------|-------------|-------------|
| `index_project` | Scan and index a project into a code knowledge graph | Idempotent, skips unchanged files |
| `search_symbols` | Full-text search for symbols by name | FTS5, filter by kind |
| `get_impact` | Blast radius analysis for a symbol | Reverse dependency traversal |
| `trace_calls` | Trace call chains (callers or callees) | BFS with configurable depth |
| `get_context` | 360-degree view of a symbol | Definition, callers, callees, siblings |
| `get_architecture` | Project architecture overview | Module matrix, hotspots |
| `watch_project` | File watcher for incremental graph updates | Singleton, CASCADE cleanup on delete |
| `find_clones` | Detect code clones across codebase. 3-tier: exact (identical), normalized (renamed vars), near_miss (modified) | Impact scores, suppression heuristics |
| `find_hotspots` | Find high-risk symbols by complexity x caller count | Risk = complexity x callers, stmt_count or line span fallback |
| `impact_of_changes` | Estimate affected files/tests from recent code changes | Static call graph heuristic, includes untracked files |
| `find_unused` | Find exported symbols with zero imports. Use when cleaning dead code | Confidence levels, suppression heuristics, multi-language |
| `find_cycles` | Detect circular module dependencies | Tarjan SCC on module_edges |
| `module_metrics` | Calculate coupling metrics (Ca/Ce/Instability) per file | File-level, from module_edges |
| `find_references` | Find all usages of a symbol — calls, reads, type annotations, re-exports. Use instead of grep for semantic references | Grouped by kind, limit support |

## Install

```bash
npm i -g @levnikolaevich/hex-graph-mcp
claude mcp add -s user hex-graph -- hex-graph-mcp
```

Or add to `.claude/settings.json` directly:

```json
{
  "mcpServers": {
    "hex-graph": {
      "command": "node",
      "args": ["path/to/mcp/hex-graph-mcp/server.mjs"]
    }
  }
}
```

## Tools Reference

### index_project

Scan and index a project. Extracts functions, classes, methods, imports, call edges via tree-sitter AST. Re-running skips unchanged files.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Project root directory |
| `languages` | string[] | no | Filter languages (e.g. `["javascript","python"]`). Default: all supported |

### search_symbols

Full-text search for symbols (functions, classes, methods) by name. Returns matching symbols with file:line location.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Symbol name or partial name |
| `kind` | string | no | Filter: `"function"`, `"class"`, `"method"`, `"variable"`, `"import"` |
| `limit` | number | no | Max results (default: 20) |

### get_impact

Blast radius analysis: what symbols and files are affected if you change a given symbol. Walks reverse dependency edges transitively.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | yes | Symbol name to analyze |
| `depth` | number | no | Max traversal depth (default: 3) |
| `limit` | number | no | Max results (default: 50) |

### trace_calls

Trace call chains: who calls this symbol (callers) or what does it call (callees). BFS traversal on call edges.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | yes | Symbol name to trace |
| `direction` | string | no | `"callers"` or `"callees"` (default: `"callers"`) |
| `depth` | number | no | Max traversal depth (default: 3) |
| `limit` | number | no | Max results (default: 50) |

### get_context

360-degree view of a symbol: definition, callers, callees, siblings in same scope, file context. Combines multiple graph queries into one response.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | yes | Symbol name to inspect |

### get_architecture

Project architecture overview: modules (directory-based), dependency matrix between modules, hotspots (most connected symbols).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | no | Scope to subdirectory (default: entire indexed project) |

### watch_project

Start file watcher for incremental graph updates. Singleton per project path -- re-calling returns existing watcher status.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Project root directory to watch |


### find_clones

Detects duplicated code at three confidence levels:

| Tier | Detects | Method | Min Statements |
|------|---------|--------|----------------|
| exact | Identical copies (Type-1) | FNV-1a-64 hash of raw body | 3 |
| normalized | Renamed identifiers (Type-2) | FNV-1a-64 hash of identifier-normalized body | 5 |
| near_miss | Modified structure (Type-3) | MinHash fingerprint + Jaccard similarity | 8 |

**Parameters:**

- `path` (required) — project root, must be indexed first
- `type` — "exact" | "normalized" | "near_miss" | "all" (default: "all")
- `threshold` — Jaccard similarity threshold for near_miss (default: 0.80)
- `min_stmts` — override minimum statements per tier
- `kind` — "function" | "method" | "all" (default: "all")
- `scope` — file glob filter (e.g. "src/**/*.ts")
- `cross_file` — only cross-file clones (default: true)
- `format` — "json" | "text" (default: "json")
- `suppress` — apply suppression heuristics (default: true)

**Suppression heuristics:**

| Heuristic | Strength | Condition |
|-----------|----------|-----------|
| test-fixture | strong | all members in test files |
| interface-impl-hint | weak | same signature, different parents |
| bounded-context-hint | weak | different dirs, no shared callers |

**Languages with full AST fingerprinting:** JavaScript, TypeScript, Python
**Other languages:** hash-only detection (exact + normalized tiers)

### find_hotspots

Find high-risk symbols ranked by risk = complexity x caller count. Complexity uses `stmt_count` from clone analysis when available, falls back to line span.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Project root (must be indexed) |
| `min_callers` | number | no | Minimum caller count to include (default: 2) |
| `min_complexity` | number | no | Minimum complexity to include (default: 15) |
| `limit` | number | no | Max results (default: 20) |
| `scope` | string | no | File path prefix filter (e.g. `"src/api"`) |
| `format` | string | no | `"json"` or `"text"` (default: `"text"`) |

### impact_of_changes

Heuristic estimator: which files and tests are affected by recent code changes. Based on static call graph -- not authoritative. Includes untracked files when `ref=HEAD`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Project root directory |
| `ref` | string | no | Git ref to diff against (default: `"HEAD"`) |
| `depth` | number | no | Transitive caller depth (default: 2) |
| `tests_only` | boolean | no | Only show affected test files |
| `format` | string | no | `"json"` or `"text"` (default: `"text"`) |

## Architecture


## Supported Languages

| Language | Extensions | Definitions & Calls | Exports | Imports (structured) | find_unused |
|----------|-----------|---------------------|---------|---------------------|-------------|
| JavaScript | .js .mjs .cjs .jsx | Full | ESM (named, default, re-export) | Full (alias, default, namespace) | Full liveness |
| TypeScript | .ts .tsx | Full | ESM (named, default, re-export) | Full (alias, default, namespace) | Full liveness |
| Python | .py | Full | `__all__` or `_` convention | Structured (named, alias, wildcard, module) | Export detection only |
| C# | .cs | Full | `public` access modifier | Basic (`type: "module"`) | Export detection only |
| PHP | .php | Full | Top-level + `public` methods | Basic (`type: "module"`) | Export detection only |

**Note:** Python/C#/PHP have no cross-file import resolver — `find_unused` detects exports but can't verify liveness.
Additional languages can be added by creating a `.scm` query file and adding to `LANG_CONFIGS` in `parser.mjs`.

```
hex-graph-mcp/
  server.mjs          MCP server (stdio transport, 13 tools)
  package.json
  lib/
    indexer.mjs        Tree-sitter AST parsing, file scanning
    store.mjs          SQLite graph storage (nodes, edges, FTS5)
    watcher.mjs        Chokidar file watcher, incremental reindex
    update-check.mjs   npm registry version check
```

### Storage

- **SQLite** via `better-sqlite3` -- single `.hex-graph.db` file per project
- **Nodes** -- symbols (functions, classes, methods, variables, imports) with file:line location
- **Edges** -- call, import, and scope relationships between symbols
- **FTS5** -- full-text search index on symbol names for fast lookup

### Parsing

- **tree-sitter WASM** (`web-tree-sitter` + `tree-sitter-wasms`) for language-agnostic AST parsing
- Extracts: function/class/method definitions, call expressions, import statements
- Supports: JavaScript, TypeScript, Python, Go, Rust, Java, C, C++, and more

### File Watching

- **Chokidar** for cross-platform file system events
- On file change: reparse AST and update graph incrementally
- On file delete: CASCADE cleanup of all related nodes and edges

## Use Cases

| Scenario | Tool | Example |
|----------|------|---------|
| Find a function | `search_symbols` | `query: "handleAuth"` |
| Understand unfamiliar code | `get_context` | `symbol: "UserService"` |
| Pre-refactoring check | `get_impact` | `symbol: "calculateTotal", depth: 4` |
| Find entry points | `trace_calls` | `symbol: "validateInput", direction: "callers"` |
| Codebase overview | `get_architecture` | First call after `index_project` |
| Continuous sync | `watch_project` | Start once, graph stays current |
| Detect duplicates | `find_clones` | `path: "/project", type: "near_miss", scope: "src/**"` |
| Find risky code | `find_hotspots` | `path: "/project", min_callers: 3` |
| Pre-PR impact check | `impact_of_changes` | `path: "/project", ref: "HEAD"` |


## Benchmark

Built-in grep/read vs hex-graph (50 files, 422 symbols indexed):

| # | Scenario | Built-in | Hex-graph | Savings | Ops | Steps |
|---|----------|----------|-----------|---------|-----|-------|
| 1 | Search symbols | 5,800 chars | 196 chars | 97% | 1→1 | 1→1 |
| 2 | Get context (360°) | 38,611 chars | 1,274 chars | 97% | 4→1 | 4→1 |
| 3 | Get impact (blast radius) | 969 chars | 2,590 chars | -167% | 6→1 | 3→1 |
| 4 | Trace calls (callers) | 12,716 chars | 477 chars | 96% | 4→1 | 3→1 |
| 5 | Architecture overview | 389,523 chars | 2,941 chars | 99% | 50→1 | 50→1 |

**Average:** 44% tokens | 65→5 ops | 61→5 steps

TEST 3 shows -167%: hex-graph returns MORE data because CTE recursively expands the full blast radius (depth 3), while grep finds only surface matches. This demonstrates completeness, not inefficiency.

Index cost: 8ms for 52 files. Break-even: 1 query.

Reproduce: `node benchmark.mjs --repo /path/to/repo`
## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP protocol implementation |
| `better-sqlite3` | SQLite storage engine |
| `web-tree-sitter` + `tree-sitter-wasms` | AST parsing |
| `chokidar` | File system watcher |
| `zod` | Input schema validation |

Requires Node.js >= 20.0.0.

## FAQ

<details>
<summary><b>How large a codebase can it handle?</b></summary>

Tested up to ~50K lines across hundreds of files. SQLite FTS5 indexing keeps queries fast regardless of size. Re-indexing skips unchanged files, so incremental updates are near-instant.

</details>

<details>
<summary><b>Does it support monorepos?</b></summary>

Yes. Point `index_project` at the monorepo root or at individual packages. Use `get_architecture` with a `path` parameter to scope analysis to a subdirectory.

</details>

<details>
<summary><b>Where is the database stored?</b></summary>

A single `.hex-graph.db` file is created in the project root (next to package.json or the directory passed to `index_project`). Add it to `.gitignore` -- it is regenerated on demand.

</details>

<details>
<summary><b>Does watch_project survive server restarts?</b></summary>

No. The file watcher runs in-process and stops when the MCP server stops. Call `watch_project` again after restart -- it is idempotent (singleton per project path).

</details>

## Hex Family

| Package | Purpose | npm |
|---------|---------|-----|
| [hex-line-mcp](https://www.npmjs.com/package/@levnikolaevich/hex-line-mcp) | Local file editing with hash verification + hooks | [![npm](https://img.shields.io/npm/v/@levnikolaevich/hex-line-mcp)](https://www.npmjs.com/package/@levnikolaevich/hex-line-mcp) |
| [hex-ssh-mcp](https://www.npmjs.com/package/@levnikolaevich/hex-ssh-mcp) | Remote file editing over SSH | [![npm](https://img.shields.io/npm/v/@levnikolaevich/hex-ssh-mcp)](https://www.npmjs.com/package/@levnikolaevich/hex-ssh-mcp) |
| [hex-graph-mcp](https://www.npmjs.com/package/@levnikolaevich/hex-graph-mcp) | Code knowledge graph with AST indexing | [![npm](https://img.shields.io/npm/v/@levnikolaevich/hex-graph-mcp)](https://www.npmjs.com/package/@levnikolaevich/hex-graph-mcp) |

## License

MIT
