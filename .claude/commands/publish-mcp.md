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

# Unstaged changes (not yet committed)
git diff --stat -- mcp/${PKG}/

# Local version
node -e "console.log(require('./mcp/${PKG}/package.json').version)"

# npm registry version
npm view @levnikolaevich/${PKG} version 2>/dev/null || echo "not published"
```

A package **needs release** if it has commits since tag OR unstaged changes.

Display summary table:

```
| Package       | Local  | npm    | Commits | Unstaged | Status         |
|---------------|--------|--------|---------|----------|----------------|
| hex-line-mcp  | 1.1.1  | 1.1.1  | 2       | 6 files  | needs release  |
| hex-graph-mcp | 0.2.1  | 0.2.1  | 0       | 3 files  | needs release  |
| hex-ssh-mcp   | 1.1.1  | 1.1.1  | 0       | 0        | up to date     |
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

### 5. Pre-publish checks

```bash
cd mcp/${PKG} && npm run check && npm run lint && npm test
```

**Gate:** All 3 must pass (syntax check, eslint, smoke tests). If any fails — fix before proceeding.

### 5b. Benchmark (hex-line only)

```bash
cd mcp/hex-line-mcp && node benchmark.mjs
```

Focus on **Workflow Scenarios (W1-W4)**, not atomic operations. Atomic savings (read, grep) vary by file size and are misleading in isolation. Workflow savings reflect real agent usage patterns.

**Review:** If any workflow scenario shows <50% savings or regression — investigate before publishing.

### 6. Bump version

```bash
cd mcp/${PKG} && npm version ${BUMP_TYPE} --no-git-tag-version
node -e "console.log(require('./mcp/${PKG}/package.json').version)"
```

### 7. Sync version in server.mjs (two locations)

1. Replace version in McpServer constructor: search for `new McpServer(` in `mcp/${PKG}/server.mjs`
2. Replace version in checkForUpdates call: search for `checkForUpdates(` in `mcp/${PKG}/server.mjs`

Verify all three match:
```bash
grep -n 'version:\|checkForUpdates' mcp/${PKG}/server.mjs | head -5
```

### 8. Commit + tag + push

```bash
git add mcp/${PKG}/package.json mcp/${PKG}/server.mjs
git commit -m "release: ${PKG_NAME} v${NEW_VERSION}"
git tag ${TAG_PREFIX}${NEW_VERSION}
git push origin master --tags
```

### 9. Verify publish

Wait ~30s, then:
```bash
gh run list --limit 1
npm view ${PKG_NAME} version
```

### 10. Report

Display: package name, old → new version, npm URL (`https://www.npmjs.com/package/${PKG_NAME}`), GitHub Actions run status.
