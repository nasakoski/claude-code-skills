# Audit Worker Core Contract

Shared contract for audit workers that analyze one category, write one report file, and return a compact summary to a coordinator.

## Required Inputs

Workers receive the minimum context needed to stay decision-complete:

```json
{
  "codebase_root": ".",
  "output_dir": "docs/project/.audit/{audit-id}/{YYYY-MM-DD}",
  "tech_stack": {},
  "best_practices": {},
  "principles": {},
  "domain_mode": "global|domain-aware",
  "current_domain": {
    "name": "users",
    "path": "src/users"
  },
  "scan_path": "src/users"
}
```

Rules:
- Pass only the fields the worker actually uses.
- If `domain_mode="domain-aware"`, scope scanning to `scan_path` and tag findings with the domain.
- If `domain_mode="global"`, use `codebase_root` unless the skill defines a narrower scan target.

## Scoring

**MANDATORY READ:** Load `shared/references/audit_scoring.md`.

Use the shared penalty formula unless the worker adds a diagnostic score that is explicitly informational only.

## Report Contract

**MANDATORY READ:** Load `shared/templates/audit_worker_report_template.md`.

Rules:
- Build the full markdown report in memory, then write it in one call.
- Use the template's `AUDIT-META`, `Checks`, and `Findings` structure.
- Add optional blocks such as `FINDINGS-EXTENDED` or `DATA-EXTENDED` only when the worker's local workflow requires them.

## Summary Return Format

Standard workers return:

```text
Report written: docs/project/.audit/{audit-id}/{YYYY-MM-DD}/{worker-file}.md
Score: 7.5/10 | Issues: 5 (C:0 H:2 M:2 L:1)
```

Workers with diagnostic sub-scores return:

```text
Report written: docs/project/.audit/{audit-id}/{YYYY-MM-DD}/{worker-file}.md
Score: 6.0/10 (C:72 K:85 Q:68 I:90) | Issues: 3 (H:1 M:2 L:0)
```

Diagnostic sub-scores never replace the primary penalty-based score.

## Generic Critical Rules

- Report only. Do not auto-fix unless the skill explicitly says otherwise.
- Use precise locations (`file:line`) for findings.
- Apply worker-specific false-positive filters before reporting.
- Keep effort estimates realistic: `S` = `<1h`, `M` = `1-4h`, `L` = `>4h`.
- If the worker uses two-layer detection, no Layer 1 match is a valid finding without Layer 2 verification.

## Generic Definition of Done

- Input parsed successfully, including `output_dir`.
- Scan scope resolved correctly (`scan_path` or equivalent).
- All worker-specific checks completed.
- Findings collected with severity, location, recommendation, and effort.
- Score calculated via the shared scoring reference.
- Report written to `{output_dir}/...` using the shared report template.
- Summary returned to the coordinator in the required compact format.
