---
description: Publish MCP server to npm (hex-line-mcp, hex-ssh-mcp, or hex-graph-mcp). Bumps version, tags, pushes → GitHub Actions publishes.
allowed-tools: Read, Edit, Bash, Grep, AskUserQuestion
---

# Publish MCP Server

Publishes one of the bundled MCP servers to npm.

## Available MCP Servers

| Package | Directory | Tag Pattern | CI Workflow |
|---------|-----------|-------------|-------------|
| @levnikolaevich/hex-line-mcp | `mcp/hex-line-mcp/` | `hex-line-v*` | publish-hex-line.yml |
| @levnikolaevich/hex-ssh-mcp | `mcp/hex-ssh-mcp/` | `hex-ssh-v*` | publish-hex-ssh.yml |
| @levnikolaevich/hex-graph-mcp | `mcp/hex-graph-mcp/` | `hex-graph-v*` | publish-hex-graph.yml |

## Workflow

### 1. Ask which MCP to publish

Ask user: "Which MCP server to publish?" → hex-line-mcp / hex-ssh-mcp / hex-graph-mcp

Set variables:
- `PKG_DIR` = `mcp/{selection}/`
- `TAG_PREFIX` = `hex-line-v` or `hex-ssh-v` or `hex-graph-v`
- `PKG_NAME` = package name from package.json

### 2. Check current state

```bash
cd $PKG_DIR && node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)"
npm view $PKG_NAME version 2>/dev/null || echo "not published yet"
```

### 3. Determine new version

Ask user what kind of bump:
- **patch** (1.0.0 → 1.0.1): bug fixes, minor tweaks
- **minor** (1.0.0 → 1.1.0): new features, new tools
- **major** (1.0.0 → 2.0.0): breaking changes (format, API)

### 4. Bump version

```bash
cd $PKG_DIR && npm version {patch|minor|major} --no-git-tag-version
```

Also update `version` in `server.mjs` McpServer constructor to match.

### 5. Commit + tag + push

```bash
git add $PKG_DIR/package.json $PKG_DIR/server.mjs
git commit -m "release: $PKG_NAME vX.Y.Z"
git tag ${TAG_PREFIX}X.Y.Z
git push origin master --tags
```

### 6. Verify publish

Wait ~30s, then:
```bash
gh run list --limit 1
npm view $PKG_NAME version
```

### 7. Post-publish: update MCP config

If publishing for the first time or after path change:
```bash
claude mcp remove hex-ssh
claude mcp add -s user hex-ssh -- npx -y @levnikolaevich/hex-ssh-mcp
```

Set `MCP_SSH_ALLOWED_HOSTS` env var if needed.

### 8. Report

Display: package name, version, npm URL, GitHub Actions status.
