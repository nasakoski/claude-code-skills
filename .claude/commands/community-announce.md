---
description: "Compose and publish a GitHub Discussion announcement for releases, breaking changes, or major updates."
allowed-tools: Read, Grep, Glob, Bash, WebFetch
---

# Community Announcement

Compose and publish a structured announcement to GitHub Discussions (Announcements category).

> **Strategy:** See `docs/community_engagement_strategy.md` for decision criteria and media plan.

## Phase 1: Gather Context

1. Read `docs/community_engagement_strategy.md` Section 2 — verify this qualifies as an announcement
2. Read `CHANGELOG.md` — extract the latest entry (or the entry matching `$ARGUMENTS` date if provided)
3. Read `README.md` — check current version badge, any WARNING/IMPORTANT callouts
4. Run: `git log --oneline -20` — recent commits for context
5. If `$ARGUMENTS` contains a topic keyword (not a date), use it as the announcement subject
6. Run: `git diff --name-only` (uncommitted) or `git diff --name-only HEAD~1..HEAD` (last commit) — build the list of changed files to understand scope and scale
7. Read key source files from the diff (max 5 files, prioritize by relevance to `$ARGUMENTS` topic):
   - `shared/references/*.md` files in diff → read full (protocols/guides — the substance)
   - `SKILL.md` files in diff → read only changed sections via `git diff -- {file}`
   - `references/*.md` in skill directories → read if substantially changed
   - Goal: understand the "why" behind changes that CHANGELOG doesn't spell out

**Gate check:** "Can community input change the outcome?" If YES → suggest `/community-debate` instead.

## Phase 2: Classify Announcement Type

Determine the type based on gathered context:

| Type | Trigger | Emoji |
|------|---------|-------|
| **Release** | New version in CHANGELOG | :rocket: |
| **Breaking Change** | WARNING callout in README or "breaking" in CHANGELOG | :warning: |
| **New Skills** | New ln-XXX entries in CHANGELOG | :sparkles: |
| **Architecture** | Structural changes (new categories, plugin splits) | :building_construction: |
| **Community** | Non-technical updates (events, milestones) | :people_holding_hands: |

## Phase 3: Compose Announcement

Structure the body in this format (use GitHub emoji shortcodes, not Unicode):

```
## {Emoji} {Title}

{1-2 sentence summary of what changed and why it matters to users}

### What Changed
{3-5 bullet points, each with a concrete change. Link to relevant files/skills where helpful.}

### How to Update
{Installation/update commands if applicable. Skip section for informational announcements.}

### What's Next
{1-2 sentences about upcoming work. Optional — skip if nothing planned.}

### Contributors
{Thank contributors by @mention if applicable. Skip for solo work.}

---
*Full changelog: [CHANGELOG.md](https://github.com/levnikolaevich/claude-code-skills/blob/master/CHANGELOG.md)*

**What do you think?** Let us know in the comments.
```

**Formatting:** See `docs/community_engagement_strategy.md` Section 9 for GitHub-native elements (alerts, collapsible sections, footnotes) and structural patterns.

**Tone (from strategy):**
- Declarative: "We shipped X because Y. Here's how to use it."
- Focus on user impact, not implementation details
- Thank contributors explicitly — builds community goodwill
- Title: imperative mood, under 80 chars, no version numbers (put in body)
- No Unicode emojis — use GitHub shortcodes (`:rocket:`, `:warning:`, etc.)
- Link to specific files/skills when mentioning them
- If breaking change: include migration steps with clear before/after

## Phase 4: Fact-Check

Before presenting to user, verify every verifiable claim in the draft:

1. **Commands & code blocks** — grep `README.md` for each command/snippet in the draft. If command not found in README → replace with the actual command from README. Never invent install/update commands.
2. **File paths & links** — verify each linked file exists: `ls {path}`. Remove or fix broken links.
3. **Numbers** — verify counts mentioned (e.g., "32 skills updated") against actual data: `git diff --name-only | grep -c SKILL.md` or `ls -d ln-*/SKILL.md | wc -l`.
4. **Feature descriptions** — re-read the key source file (from Phase 1 step 7) and confirm the draft accurately describes what changed. No hallucinated capabilities.
5. **Skill/tool names** — verify names match actual directory/file names in the repo. No `ln-XXX` codes in user-facing text (replace with descriptive names).

**Gate:** If any check fails, fix the draft before proceeding.

## Phase 5: Review and Publish

Present the composed announcement title + body to the user. **Wait for explicit approval before publishing.**

After approval, publish via GraphQL:

```bash
gh api graphql -f query='
  mutation($title: String!, $body: String!, $repoId: ID!, $catId: ID!) {
    createDiscussion(input: {
      repositoryId: $repoId,
      categoryId: $catId,
      title: $title,
      body: $body
    }) {
      discussion { url }
    }
  }
' -f title="TITLE_HERE" -f body="BODY_HERE" -f repoId="R_kgDOQIhLHw" -f catId="DIC_kwDOQIhLH84CxpWz"
```

Report the discussion URL to the user.

**Note:** Pinning is not available via API — remind the user to pin manually in GitHub UI if the announcement is important.

## Phase 6: Cross-Post (Optional)

If the announcement is a release or breaking change, suggest:
1. Create a matching GitHub Release if a version tag exists: `gh release create vX.Y.Z --notes "See discussion: URL"`
2. Update the repo description if the announcement changes the project scope
