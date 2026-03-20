# hex-graph-mcp

Code knowledge graph MCP server. Indexes codebases into a SQLite graph via tree-sitter AST parsing.

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

## Install

```bash
claude mcp add -s user hex-graph -- node path/to/mcp/hex-graph-mcp/server.mjs
```

Then install dependencies:

```bash
cd mcp/hex-graph-mcp && npm install
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

## Architecture

```
hex-graph-mcp/
  server.mjs          MCP server (stdio transport, 7 tools)
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

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP protocol implementation |
| `better-sqlite3` | SQLite storage engine |
| `web-tree-sitter` + `tree-sitter-wasms` | AST parsing |
| `chokidar` | File system watcher |
| `zod` | Input schema validation |

Requires Node.js >= 20.0.0.

## License

MIT
