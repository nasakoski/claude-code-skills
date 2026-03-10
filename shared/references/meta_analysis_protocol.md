# Meta-Analysis Protocol

Shared protocol for orchestrators and coordinators to analyze delegation effectiveness and suggest improvements after completing their workflow.

## When to Run

After all delegated work completes (agents, workers, subskills) and results are aggregated. This is the LAST step before returning results to caller.

## Analysis Dimensions

### 1. Coverage

- Did delegated agents/workers find issues the orchestrator missed?
- Were there blind spots (areas with zero findings)?
- If focus differentiation was used: did it produce distinct findings, or overlap?

### 2. Efficiency

- Duration vs output quality (cost per actionable finding)
- Acceptance rate per agent/worker (% of suggestions surviving verification)
- Were debate/challenge rounds productive?

### 3. Prompt/Delegation Quality

- Did provided goals lead to on-target findings, or did agents drift?
- Did project context prevent known-bad suggestions?
- Were instructions too broad or too narrow?

## Output Format (to chat)

```
### {Skill Name} Meta-Analysis
| Agent/Worker | Accepted | Total | Rate | Actual Focus |
|-------------|----------|-------|------|-------------|
| {name}       | {N}      | {M}   | {%}  | {areas found} |

- **Overlap:** {N} duplicate findings across agents
- **Blind spots:** {areas with 0 findings from any agent}
- **Goal alignment:** {did findings match review_goal?}
- **Improvement suggestions:** {1-2 actionable items}
```

If improvement is actionable and reproducible (pattern, not one-off):
> Consider creating issue: https://github.com/levnikolaevich/claude-code-skills/issues

## Issue Suggestion Triggers

| Pattern (across 3+ runs) | Likely Cause | Action |
|--------------------------|-------------|--------|
| Acceptance rate < 30% | Prompt quality or model mismatch | Refine prompt template |
| Agents always overlap | `focus_hint` not differentiating | Adjust focus slots |
| Agent consistently times out | Prompt too broad or misconfigured | Narrow scope or fix config |
| Same suggestion rejected 5+ times | Missing rejection pattern in context | Add to `{project_context}` |
| Agent finds nothing (0 suggestions) | Goal too narrow or wrong mode | Broaden goal or check mode file |

---
**Version:** 1.0.0
**Last Updated:** 2026-03-10
