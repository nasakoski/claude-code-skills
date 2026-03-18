---
description: Create a GitHub release with auto-generated notes from CHANGELOG
allowed-tools: Read, Bash, Grep, AskUserQuestion
---

# Create Release

Create a tagged GitHub release with structured release notes. Reads version from README badge and changelog from CHANGELOG.md, builds release notes, asks for confirmation, then publishes.

## Prerequisites

| Requirement | Check Command | Install |
|-------------|---------------|---------|
| GitHub CLI | `gh --version` | [cli.github.com](https://cli.github.com) |
| Authenticated | `gh auth status` | `gh auth login` |

## Workflow

### 1. Determine Version (CalVer)

Default version is today's date in CalVer format: `YYYY.MM.DD`.

```bash
date +%Y.%m.%d
```

Store as `VERSION`. If `$ARGUMENTS` is provided, use it as version override instead.

Also update the version in README.md badge and marketplace.json to match the new release version.

### 2. Check for Existing Release

```bash
gh release view "v${VERSION}" 2>&1
```

If release already exists, stop and inform the user. Do NOT overwrite.

### 3. Extract Changelog Entries

Read CHANGELOG.md. Extract all bullet points under the **most recent** `## YYYY-MM-DD` heading (stop at the next `## ` or `---`).

Transform each bullet into a highlights list for the release notes.

### 4. Build Release Notes

Assemble release notes in this structure:

```markdown
## Claude Code Skills v{VERSION}

Production-ready plugin suite for Claude Code:

| Plugin | What it does |
|--------|-------------|
| **agile-workflow** | Scope decomposition, Story/Task management, Execution, Quality gates, Pipeline orchestration |
| **documentation-pipeline** | Full project docs with auto-detection (backend/frontend/devops) |
| **codebase-audit-suite** | Security, Code quality, Tests, Architecture, Persistence performance |
| **project-bootstrap** | CREATE or TRANSFORM projects to production-ready Clean Architecture |
| **optimization-suite** | Performance profiling, Dependency upgrades, Code modernization |
| **community-engagement** | GitHub triage, Announcements, RFC debates, Response automation |

### Install

/plugin add levnikolaevich/claude-code-skills

### What's New

{bullets extracted from CHANGELOG, reformatted as list}

**Full changelog:** [CHANGELOG.md](CHANGELOG.md)
```

### 5. Confirm with User

Present the assembled release notes and version tag to the user via AskUserQuestion:

- Show: `Release: v{VERSION}`
- Show: full release notes markdown
- Ask: "Publish this release? (yes/no)"

Do NOT proceed without explicit confirmation.

### 6. Create Release

```bash
gh release create "v${VERSION}" --title "v${VERSION}" --notes "${RELEASE_NOTES}"
```

**Verify:**

```bash
gh release view "v${VERSION}" --json tagName,url --jq '"\(.tagName) -> \(.url)"'
```

Report the release URL to the user.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Version not found in README | Check badge format: `version-X.Y.Z-blue` |
| Release already exists | Use a new version or delete the existing release first |
| CHANGELOG empty or no recent entry | Add a `## YYYY-MM-DD` section with bullets before creating release |
| `gh` not authenticated | Run `gh auth login` |

## Related Documentation

- [README.md](README.md) -- version badge source
- [CHANGELOG.md](CHANGELOG.md) -- release notes source

---
**Last Updated:** 2026-03-17
