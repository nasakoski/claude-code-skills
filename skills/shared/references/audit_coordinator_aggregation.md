# Audit Coordinator Aggregation

Shared aggregation pattern for coordinators that collect worker summaries, read worker report files, and assemble one consolidated audit report.

## Output Directory

Use one dated directory per run:

```text
docs/project/.audit/{audit-id}/{YYYY-MM-DD}/
```

Rules:
- Create the directory before delegating.
- Delete the dated output directory after the consolidated report and results-log row are written (see Worker File Cleanup below).

## Parse Worker Summaries First

Prefer worker return values for numbers:

```text
Report written: docs/project/.audit/{audit-id}/{YYYY-MM-DD}/{worker-file}.md
Score: 7.5/10 | Issues: 5 (C:0 H:2 M:2 L:1)
```

Extract:
- worker identifier
- report file path
- score
- total issues
- severity counts
- optional diagnostic sub-scores

Use file reads later for detailed findings, not for numbers you already have.

## Standard Aggregation Steps

1. Parse return values from all completed workers.
2. Build score tables by category.
3. Roll up severity totals across workers.
4. Read worker report files for findings tables and optional machine-readable blocks.
5. Apply worker-specific or coordinator-specific post-filters.
6. Assemble the final consolidated report.
7. Append a results-log row (mandatory for all coordinators).
8. Delete the dated output directory (`rm -rf {output_dir}`).

## Score Handling

- Use the worker's primary penalty-based score for category and overall scoring.
- Exclude `N/A` workers from averages.
- Keep diagnostic sub-scores informational only unless the coordinator explicitly reports them as diagnostics.
- If post-filtering downgrades findings to advisory, recalculate affected category scores without advisory-only findings.

## File Reads

Read worker report files only for:
- Findings tables
- `FINDINGS-EXTENDED`
- `DATA-EXTENDED`
- worker-specific evidence that must appear in the final report

Avoid rescanning the codebase in the coordinator when worker outputs already contain the needed evidence.

## Error Handling

If a worker fails:
- record the failure explicitly
- continue aggregating other workers
- mark the failed category as `error`, `skipped`, or equivalent per workflow
- never silently drop missing worker output

## Results Log

Append one row after the final score is known.

**MANDATORY READ:** Load `shared/references/results_log_pattern.md` when the coordinator writes results history.

## Worker File Cleanup

After the results-log row is appended, delete the current run's dated output directory:

```bash
rm -rf {output_dir}
```

This removes `docs/project/.audit/{audit-id}/{YYYY-MM-DD}/` and all worker report files within it. Worker files are intermediate artifacts; the consolidated report and results log preserve all needed history.

Do NOT delete `docs/project/.audit/results_log.md` — it lives outside the dated directory.
