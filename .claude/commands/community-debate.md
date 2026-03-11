---
description: "Launch a structured RFC/debate discussion on GitHub for architectural decisions, skill proposals, or workflow changes."
allowed-tools: Read, Grep, Glob, Bash, WebFetch
---

# Community Debate / RFC

Launch a structured debate discussion in GitHub Discussions for decisions that benefit from community input.

> **Strategy:** See `docs/community_engagement_strategy.md` for decision criteria and RFC triggers.

## Phase 1: Define the Topic

If `$ARGUMENTS` provided, use as the topic seed. Otherwise, ask the user what they want to debate.

Gather context:
1. Read `docs/community_engagement_strategy.md` Section 3 — verify this qualifies as a debate
2. Grep the codebase for files related to the topic
3. Read relevant SKILL.md files, docs, or shared references
4. Identify existing patterns that the proposal might change

**Gate check:** "Can community input change the outcome?" If NO → suggest `/community-announce` instead.
**Scope check:** If fewer than 2 unresolved design questions → likely an announcement, not an RFC.

## Phase 2: Classify Debate Type

| Type | Prefix | Category ID | When to use |
|------|--------|-------------|-------------|
| **Maintainer RFC** — design mostly done, seeking validation | `[RFC]` | Ideas: `DIC_kwDOQIhLH84CxpW2` | End of design process, soft announcement |
| **Community RFC** — early stage, genuinely open to alternatives | `[RFC]` | Ideas: `DIC_kwDOQIhLH84CxpW2` | Beginning of design, kickstart discussion |
| **Skill Proposal** — new skill or skill restructuring | `[Proposal]` | Ideas: `DIC_kwDOQIhLH84CxpW2` | Concrete skill idea with use case |
| **Workflow Change** — pipeline, task flow, or conventions | `[RFC]` | Ideas: `DIC_kwDOQIhLH84CxpW2` | Affects multiple skills or user workflows |
| **Prioritization** — what to build next, feature ranking | `[Poll]` | Polls: `DIC_kwDOQIhLH84CxpW4` | Multiple options, need community vote |

If type is **Prioritization**, switch to Polls flow (Phase 3b).

## Phase 3a: Compose RFC Discussion

Structure the body:

```
## Summary

{2-3 sentences describing the proposal and its motivation}

## Motivation

{Why is this change needed NOW? What pain point or opportunity triggered it?
Include concrete examples from the codebase — link to specific files.}

## Proposed Solution

{Detailed description of the approach:}
- Key design decisions
- Files/skills affected
- Migration path (if breaking)

## Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| Proposed | ... | ... |
| Alternative 1 | ... | ... |
| Alternative 2 | ... | ... |

## Open Questions

1. {Specific question for the community}
2. {Another question}

## Unresolved Details

{Implementation details not yet decided — will be resolved during development, not in this RFC:}
- {Detail 1}
- {Detail 2}

## Decision Criteria

{How will we decide? What metrics or feedback would tip the scale?}

---
*This is an RFC — feedback welcome. Decision target: {date or "when consensus reached"}.*
```

## Phase 3b: Compose Poll (for Prioritization type)

GitHub Discussions Polls are created via UI only. Instead, compose a reaction-based voting discussion:

```
## {Topic}

{1-2 sentence context}

**Vote by reacting to the options below** (each option is posted as a separate comment — use :+1: to vote).

### Context
{Why this decision matters now}
```

After creating the discussion, post each option as a separate comment for reaction-based voting.

## Phase 4: Review and Publish

Present the composed title + body to the user. **Wait for explicit approval before publishing.**

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
      discussion { url id }
    }
  }
' -f title="TITLE_HERE" -f body="BODY_HERE" -f repoId="R_kgDOQIhLHw" -f catId="CATEGORY_ID_HERE"
```

For **Polls**, after creating the discussion, post each option as a comment:

```bash
gh api graphql -f query='
  mutation($discussionId: ID!, $body: String!) {
    addDiscussionComment(input: {
      discussionId: $discussionId,
      body: $body
    }) {
      comment { url }
    }
  }
' -f discussionId="DISCUSSION_NODE_ID" -f body="**Option N:** {description}"
```

Report the discussion URL to the user.

## Rules

- Always present the full composed text for user approval before publishing
- Never publish without explicit user confirmation
- Title: descriptive, under 80 chars, prefixed with [RFC], [Proposal], or [Poll]
- Body: factual, not persuasive — present options neutrally
- Include links to relevant code/docs in the repository
- Set a decision timeline when applicable
- Minimum 2 alternatives in the Alternatives table
- Tone: "We're considering X. Here are the tradeoffs. What's your take?"
