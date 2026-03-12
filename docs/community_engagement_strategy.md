# Community Engagement Strategy

> **Scope:** Decision criteria, media plan, and engagement metrics for GitHub Discussions.
> **Stage:** Growth (50-500 stars). Calibrated for 182 stars, 114 skills, 14K clones/2 weeks.

## 1. Announcement vs Debate — Decision Matrix

**Quick test:** "Can community input change the outcome?" YES → Debate. NO → Announcement.

| Signal | → Announcement | → Debate/RFC |
|--------|---------------|--------------|
| Decision status | Already made, shipping | Still in design, options open |
| Alternatives | None — this is the path | 2+ viable approaches with tradeoffs |
| Community action needed | Update / migrate / adopt | Feedback / critique / vote |
| Timeline | Shipping now or this week | 2+ weeks away |
| Scope | Affects >25% of users | Uncertain scope, need input |
| Format | Declarative: "We shipped X" | Exploratory: "Should we do X?" |

## 2. Announcement Triggers

| Trigger | Type | Example |
|---------|------|---------|
| New skills batch (3+) | :sparkles: New Skills | "8XX Optimization suite: 6 new skills" |
| Architecture overhaul | :building_construction: Architecture | "Plugin marketplace restructure" |
| Breaking change with migration path | :warning: Breaking Change | "Agent review inlined into ln-310/ln-510" |
| Milestone (stars, skills count) | :people_holding_hands: Community | "100+ skills milestone" |
| Monthly digest | :rocket: Release | "March 2026: what shipped" |

**Command:** `/community-announce` — reads CHANGELOG, classifies type, composes structured post, publishes via GraphQL.

## 3. Debate/RFC Triggers

| Trigger | Type | Example |
|---------|------|---------|
| New skill category proposal | Skill Proposal | "Should we add 9XX Monitoring?" |
| Workflow change affecting all users | RFC | "Move from File Mode to DB-backed tasks" |
| Naming/convention change | RFC | "Rename ln-XXX prefix" |
| Feature prioritization | Poll | "What skills should we build next?" |
| Architecture decision with tradeoffs | RFC | "Monorepo vs multi-repo for plugins" |

**Command:** `/community-debate` — researches codebase context, composes RFC with alternatives table, publishes to Ideas or Polls category.

## 4. Media Plan

### Content Calendar (Release-Driven)

| Cadence | Content Type | Channel | Tool |
|---------|-------------|---------|------|
| Per major feature batch | Announcement | Discussions → Announcements | `/community-announce` |
| Monthly | Digest: what shipped + what's next | Discussions → Announcements | `/community-announce` |
| When decision needed | RFC / Debate | Discussions → Ideas | `/community-debate` |
| Quarterly | Retrospective + metrics review | Discussions → Announcements | Manual |
| As submitted | Community showcases | Discussions → Show and Tell | Community |

### Monthly Rhythm

```
Week 1 ─── Monthly digest announcement (what shipped last month)
Week 2-3 ─ RFC window (if architectural decisions pending)
Week 4 ─── Respond to community input, prep next month
```

### NOT Planned (overkill for current stage)

Weekly digests, newsletter, social media calendar, Discord, community calls.

## 5. Engagement Metrics

Track quarterly. Automate via `gh api graphql` where possible.

| Metric | Target | Red Flag |
|--------|--------|----------|
| Time to First Response | <24h | >72h |
| Replies per thread (avg) | >1.5 | 0 (monologue) |
| Unanswered discussions | 0 older than 7 days | Any >7 days |
| Community-to-maintainer reply ratio | >0.3 | 0 (no peer support) |
| New discussions per month | >2 | 0 |

### Red Flags (fix immediately)

- Unanswered discussion older than 7 days
- 100% replies from maintainer only — no peer support emerging
- Zero new discussions in a month — community disengaged

## 6. Tone Guide

| Context | Tone | Example |
|---------|------|---------|
| Announcements | Declarative, grateful | "We shipped X because Y. Here's how to use it." |
| RFCs | Exploratory, neutral | "We're considering X. Here are the tradeoffs. What's your take?" |
| Closing discussions | Respectful, explanatory | "Thanks for raising this. Here's why we went with Y." |
| All contexts | Thank contributors, explain decisions, link to code | — |

## 7. Discussion Categories

| Category | Purpose | Who posts |
|----------|---------|-----------|
| **Announcements** | Releases, breaking changes, milestones | Maintainer only |
| **Ideas** | Skill proposals, RFCs, workflow improvements | Anyone |
| **Q&A** | Installation, MCP config, skill usage | Anyone |
| **Show and Tell** | Projects, workflows, and tool promotions (see §10) | Anyone |
| **Polls** | Feature prioritization, community votes | Maintainer |
| **General** | Everything else | Anyone |

## 8. Growth Stage Transitions

| Stage | Stars | Key Strategy | Next Milestone |
|-------|-------|-------------|----------------|
| **Current: Growth** | 50-500 | Release-driven announcements, seed discussions, respond to everything | Community self-help threshold (~300 stars) |
| **Next: Scale** | 500+ | Structured RFC periods, delegate moderation, quarterly retrospectives | Organic growth loop |

**Current priority:** Break the "silent users" pattern. 14K clones but 3 discussions = feedback loop is missing. Seed content + consistent announcements will open the channel.

## 9. Formatting Best Practices (GitHub Discussions)

### Structural Elements

| Element | Syntax | When to Use |
|---------|--------|-------------|
| **Alerts** | `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]` | Key info, migration steps, breaking changes |
| **Collapsible** | `<details><summary>Title</summary>content</details>` | Secondary details, full file lists, technical specs |
| **Footnotes** | `text[^1]` + `[^1]: detail` | Technical details that shouldn't interrupt flow |
| **Tables** | Standard markdown tables | Structured comparisons, feature matrices |
| **Emoji shortcodes** | `:sparkles:`, `:rocket:`, etc. | Section headers only. GitHub shortcodes, NOT Unicode |

### Announcement Structure Pattern

```
{emoji} {Title} — imperative, <80 chars

{1-2 sentence hook: what changed + why it matters to users}

> [!IMPORTANT]
> {Migration note or key action — only if applicable}

### What Changed
- **{Feature}** — {user-facing impact}. [Link to source](path).
- ...3-5 bullets max

<details>
<summary>Detailed changes ({N} files)</summary>

{table or list of specific changes}

</details>

### How to Update
{install/update commands — skip for informational announcements}

### What's Next
{1-2 sentences — skip if nothing planned}

---
*Full changelog: [CHANGELOG.md](...)*

**What do you think?** Let us know in the comments.
```

### Engagement Patterns

| Pattern | Example | Why |
|---------|---------|-----|
| **End with question** | "What do you think? Let us know" | Breaks "silent users" pattern |
| **Bold: description** | `**Meta-Analysis** — skills now...` | Scannable bullet points |
| **Link to source** | `[protocol.md](link)` | Users can dive deeper |
| **Keep brief, link deep** | 3-5 bullets + collapsible details | Respects scanning readers |

## 10. Self-Promotion Policy

**Allowed in:** Show and Tell category only. Tool promotions as comments in other categories are not permitted.

| Rule | Detail |
|------|--------|
| **Relevance** | Tool must relate to Claude Code, AI coding, or agentic workflows |
| **Show, don't tell** | Post must include a real usage example or integration demo — not just "check out my tool" |
| **One post per tool** | No repeat promotion. Updates to the same tool → edit existing post |
| **Open-source preferred** | Not required, but OSS tools get more community trust |

### Moderation

| Situation | Action |
|-----------|--------|
| Promo comment in non-Show-and-Tell thread | Reply with redirect: "Thanks! Tool posts belong in Show and Tell — please create a dedicated post there" |
| Account with zero prior engagement posting only self-promo | Remove post, no reply |
| Post meets all rules above | Welcome it — community ecosystem grows |
