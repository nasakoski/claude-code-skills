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
```

**Tone (from strategy):**
- Declarative: "We shipped X because Y. Here's how to use it."
- Focus on user impact, not implementation details
- Thank contributors explicitly — builds community goodwill
- Title: imperative mood, under 80 chars, no version numbers (put in body)
- No Unicode emojis — use GitHub shortcodes (`:rocket:`, `:warning:`, etc.)
- Link to specific files/skills when mentioning them
- If breaking change: include migration steps with clear before/after

## Phase 4: Review and Publish

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

## Phase 5: Cross-Post (Optional)

If the announcement is a release or breaking change, suggest:
1. Create a matching GitHub Release if a version tag exists: `gh release create vX.Y.Z --notes "See discussion: URL"`
2. Update the repo description if the announcement changes the project scope
