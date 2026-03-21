---
description: "Publish MCP server to npm (hex-line-mcp, hex-ssh-mcp, or hex-graph-mcp). Auto-detects unpublished changes, suggests bump type, syncs server.mjs version."
allowed-tools: Read, Edit, Bash, Grep, AskUserQuestion
---

# Publish MCP Server

Publishes one of the bundled MCP servers to npm. Tag push triggers GitHub Actions → `npm publish --provenance`.

## Package Registry

| Package | Directory | Tag Pattern | CI Workflow |
|---------|-----------|-------------|-------------|
| @levnikolaevich/hex-line-mcp | `mcp/hex-line-mcp/` | `hex-line-v*` | publish-hex-line.yml |
| @levnikolaevich/hex-ssh-mcp | `mcp/hex-ssh-mcp/` | `hex-ssh-v*` | publish-hex-ssh.yml |
| @levnikolaevich/hex-graph-mcp | `mcp/hex-graph-mcp/` | `hex-graph-v*` | publish-hex-graph.yml |

## Workflow

### 1. Scan all packages for unpublished changes

For each of the 3 packages above, run in parallel:

```bash
# Last tag for this package
git tag -l "${TAG_PREFIX}*" --sort=-v:refname | head -1

# Commits since last tag touching this package
git log ${LAST_TAG}..HEAD --oneline -- mcp/${PKG}/

# Local version
node -e "console.log(require('./mcp/${PKG}/package.json').version)"

# npm registry version
npm view @levnikolaevich/${PKG} version 2>/dev/null || echo "not published"
```

Display summary table:

```
| Package       | Local  | npm    | Commits since tag | Status         |
|---------------|--------|--------|-------------------|----------------|
| hex-line-mcp  | 1.0.0  | 1.0.0  | 7                 | needs release  |
| hex-ssh-mcp   | 1.0.0  | 1.0.0  | 2                 | needs release  |
| hex-graph-mcp | 0.1.0  | 0.1.0  | 0                 | up to date     |
```

If no packages need release → report "All packages up to date" and stop.

### 2. Choose package

AskUserQuestion: "Which MCP server to publish?" — list only packages with commits > 0. If only one needs release, suggest it as default.

Set variables:
- `PKG` = selected package name (e.g. `hex-line-mcp`)
- `PKG_DIR` = `mcp/${PKG}/`
- `TAG_PREFIX` = `hex-line-v` | `hex-ssh-v` | `hex-graph-v`
- `PKG_NAME` = `@levnikolaevich/${PKG}`
- `LAST_TAG` = most recent tag for this package

### 3. Show changes since last release

```bash
git log ${LAST_TAG}..HEAD --oneline -- mcp/${PKG}/
git diff --stat ${LAST_TAG}..HEAD -- mcp/${PKG}/
```

Display the output to the user.

### 4. Suggest bump type

Analyze the diff and commit messages:
- Only existing file modifications, `fix:` commits → suggest **patch**
- New files, new exports, `feat:` commits → suggest **minor**
- Removed/renamed public API, `BREAKING CHANGE` or `!:` → suggest **major**

AskUserQuestion with the recommendation marked "(Recommended)":
- **patch** (X.Y.Z → X.Y.Z+1): bug fixes, tweaks
- **minor** (X.Y.Z → X.Y+1.0): new features, new tools
- **major** (X.Y.Z → X+1.0.0): breaking changes

### 5. Bump version + auto-sync server.mjs

Step A — bump package.json:
```bash
cd mcp/${PKG} && npm version ${BUMP_TYPE} --no-git-tag-version
```

Step B — read new version:
```bash
node -e "console.log(require('./mcp/${PKG}/package.json').version)"
```

Step C — auto-sync server.mjs:
Use Edit tool to replace the old version string in the McpServer constructor:
```
old: version: "OLD_VERSION"
new: version: "NEW_VERSION"
```
Search for `new McpServer(` in `mcp/${PKG}/server.mjs` to find the exact line.

Step D — verify sync:
```bash
grep -n 'version:' mcp/${PKG}/server.mjs | head -3
```
Confirm package.json and server.mjs show the same version.

### 6. Commit + tag + push

```bash
git add mcp/${PKG}/package.json mcp/${PKG}/server.mjs
git commit -m "release: ${PKG_NAME} v${NEW_VERSION}"
git tag ${TAG_PREFIX}${NEW_VERSION}
git push origin master --tags
```

### 7. Verify publish

Wait ~30s, then:
```bash
gh run list --limit 1
npm view ${PKG_NAME} version
```

### 8. Report

Display: package name, old → new version, npm URL (`https://www.npmjs.com/package/${PKG_NAME}`), GitHub Actions run status.
