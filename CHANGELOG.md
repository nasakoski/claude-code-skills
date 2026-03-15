# Changelog

<!-- SCOPE: Release history and version changes ONLY. Contains dated release notes, one paragraph per release. -->
<!-- DO NOT add here: detailed feature specs → individual SKILL.md files, version numbers in skills → SKILL.md footer -->

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**CRITICAL RULE: Each release = ONE concise paragraph (3-5 sentences max). NO detailed subsections. One entry per date, newest first.**

---

## 2026-03-15

Full skill coherence review (ln-162) across 17 primary skills. 8XX optimization pipeline renamed (algorithm-optimizer→performance-profiler, query-optimizer→optimization-researcher, runtime-optimizer→optimization-executor) with sequential diagnostic architecture (profile→research→execute). New skills: ln-637-test-structure-auditor (test directory layout audit), ln-647-env-config-auditor (.env sync/naming/validation), ln-914-community-responder (GitHub discussion/issue responses). Worker independence enforced: removed Caller/Parent fields, coordinator names from headers and DoD, peer skill IDs genericized to roles. 9XX shared references decoupled from coordinator directory to shared/references/community_*. D4 gap fixed: Cache bottleneck research strategy added to ln-812. D5: ln-511 output schema extracted to reference file. DoD checkbox format enforced across 7 skills. Second coherence review: 8XX optimization pipeline rewrite — ln-811 transformed from estimation to runtime profiling with explicit escalation chain (profiler→line-level→targeted instrumentation), ln-813 from per-hypothesis keep/discard to strike-first execution. Test discovery deduplicated: ln-811 sole owner of test_command + e2e_test_command, ln-813 reads from context. benchmark_generation.md moved to shared/references/. Phase 5.5 renumbered. meta_analysis_protocol.md terminology aligned (Discarded→Removed, prediction accuracy tables). ln-810 delegation phases hardened with explicit "Do NOT ... yourself. INVOKE the skill" directives and updated Receive fields to match new worker output formats.

## 2026-03-14

Agent sandbox fix: external files (e.g. plan files from `~/.claude/plans/`) are now materialized to `.agent-review/context/` before being referenced in agent prompts. Gemini CLI cannot read files outside project workspace — this ensures all agent-referenced files are within CWD. Added general "External file rule" to `agent_review_workflow.md`, updated `plan_review.md` template instructions, and added plan file example to persistence pattern in `agent_delegation_pattern.md`.

## 2026-03-13

Coherence review of 9XX Community Engagement group (ln-910..913): 13 structural fixes (D1/D2/D3/D8) + worker renumbering. Triager moved from ln-913 to ln-911 (workflow order: triage→decide→act), announcer→ln-912, debater→ln-913. R1 resolved: replaced ~50 lines of inline triage logic in ln-910 Phase 1a with delegation to ln-911 in `summary` mode (skip interactive preview). Triager Arguments section now supports `summary` token for coordinator use. R2 resolved: removed gate checks from worker skills (announcer/debater) — routing is coordinator's job, workers execute without re-validating intent. D3: deduplicated Announcement/RFC templates (68 lines removed). D8: removed consumer coupling from reference files, sequential phase numbering in debater.

Created ln-514-test-log-analyzer: new L3 worker under ln-510 for post-test log analysis. Two-layer architecture (Python script + AI): script collects logs from 3 sources (Docker/file/Loki), AI classifies errors into 4 categories (Real Bug, Test Artifact, Expected Behavior, Operational Warning) and assesses log quality (6 dimensions + 10-criterion format checklist). Only Real Bugs block quality verdict. Fixed ln-513-regression-checker: 6 structural violations (D2 passive refs, D5 qualifier, D7 missing Inputs/Phase 0, path fix). Updated ln-510-quality-coordinator: added Phase 8 (ln-514), renumbered Phases 8-10 → 9-11, added log_analysis to normalization matrix and fast-track mode.

Created 1XX Documentation Pipeline skills: ln-160-docs-skill-extractor (L2 coordinator), ln-161-skill-creator (L3 worker), ln-162-skill-reviewer (L3 worker). ln-160 scans project docs, classifies procedural sections, delegates to ln-161 for command creation and ln-162 for quality review. ln-162 has 2 modes (SKILL/COMMAND) with 8-phase cycle: automated bash checks + D1-D9 structural dimensions + M1-M5 intent evaluation. Deleted ln-750/751 (commands-generator/command-templates) — replaced by ln-160..162. Added Definition of Done (checkbox format) and Meta-Analysis sections to all 7 new skills (ln-160..162, ln-910..913). Improved ln-162: passive markdown link detection in automated checks, marketplace checks made optional (repo-specific), CHANGELOG responsibility moved to ln-003-push-all. Fixed ln-700 passive references (D2) and ln-910 consumer coupling (D8).

---

## 2026-03-12

Bulk D3 dedup pass across 19 skills: replaced 4-line inline Story/Task/Epic Resolution Chain summaries with 1-line `Run {Story/Task/Epic} Resolution Chain per guide (status filter: [...])` in 18 skills (Category A: ln-302, 400, 500, 510, 511, 520, 521, 522, 523; Category B: ln-220, 221, 222, 230; Category C: ln-401, 402, 403, 404; plus ln-300). Fixed ln-511 step 3 Enrich duplication: moved MANDATORY READ to top of step 3 (applies to both coordinator and standalone paths), removed redundant inline Enrich and "Analyze ALL files" lines already covered by git_scope_detection.md. D8 coupling fixes: removed skill IDs from `meta_analysis_protocol.md` Skill Types table and `agent_delegation_pattern.md` Agent Selection Matrix (generic role names instead). Fixed orphan reference: added `risk_based_testing_examples.md` to ln-523 Reference Files section.

---

## 2026-03-11

Renamed ln-514-regression-checker to ln-513-regression-checker; all cross-references updated (ln-510, ln-500, marketplace.json, README.md). Overhauled ln-1000 pipeline orchestrator reference files: updated checkpoint_format, message_protocol, pipeline_states, worker_health_contract, worker_prompts, phase4_handlers/heartbeat; deleted plan_gate_criteria.md. Updated ln-401, ln-500, ln-510, ln-520 SKILL.md and ln-510 criteria_validation.md. Coherence review fix: corrected H1/H2 structural inversion in ln-520-test-planner (## Inputs was before # Test Planning Orchestrator). Coherence review fix (D3): extracted git scope detection algorithm from ln-510 Phase 1 and ln-511 step 3 (duplicate 14-line block) into `shared/references/git_scope_detection.md`; both skills now use MANDATORY READ.

---

## 2026-03-09

ln-1000 pipeline orchestrator: Plan Gate coherence review. Fixed stage completion handlers bypassing Plan Gate (all 5 handlers now spawn plan workers before execute workers). Persisted plan_approved in state.json (was ephemeral with false reconstruction claim via planPhase). Removed planPhase from checkpoint schema. Fixed Stage 0 plan template revision limit mismatch (worker said 1, lead allowed 2). Added MANDATORY READ for plan_gate_criteria.md. Removed duplicate plan lifecycle narrative from message_protocol.md and duplicate JSON schema from plan_gate_criteria.md. Parameterized 4 plan-only worker templates into single template with per-stage variable table (saved ~120 lines).

---

## 2026-03-08

Plugin marketplace restructured: split into 5 plugins (agile-workflow, documentation-pipeline, codebase-audit-suite, project-bootstrap, optimization-suite). New 8XX Optimization category with 11 skills (810 Performance, 820 Dependencies, 830 Modernization). Worktree isolation moved from ln-1000 orchestrator to individual worker skills. Shared audit patterns extracted to `shared/references/`. Removed diagram.html from all skills. Assumptions system (#24) and cross-reference validation (#25-#26) added to ln-310. Skill coherence review: fixed stale ln-513 refs in ln-510, trimmed ln-310/ln-510 descriptions to ≤200 chars, removed consumer skill IDs from orchestrator_pattern.md, fixed MANDATORY READ paths in ln-100/ln-300/ln-310/orchestrator_pattern.md, resolved ln-220 orphan reference, fixed ln-500 phase numbering, quoted ln-210 description, removed volatile category counts from CLAUDE.md/AGENTS.md. Additional review fixes: removed ~54 lines of triple duplication in ln-200 (orchestrator pattern, sequential constraint, Epic 0), removed non-actionable benefits list in ln-100, fixed H1/H2 structural inversion in ln-510, merged Phase 2.5 into Phase 3 in ln-630, fixed Phase 5 label mismatch in ln-200. Review pass 2: added ln-005-environment-scanner to marketplace, fixed README badge count (113→114), renumbered ln-100 phases to remove Phase 3 gap (4→3, 5→4, 6→5).

---

## 2026-03-07

Two-Layer Detection pattern (Layer 1: grep, Layer 2: context-aware analysis) added to all 33 audit skills via `shared/references/two_layer_detection.md`. Destructive Operation Safety checks added across 26 skills with severity classification and HITL gates. Context economy cleanup across 39 skills: removed verbose explanations, applied concise_terms.md substitutions.

---

## 2026-03-06

New skill: ln-614-docs-fact-checker (extract verifiable claims from docs, verify paths/versions/counts/configs). ln-005 renamed to ln-005-multi-agent-context-review with applicability check + MCP Ref research pipeline. ln-510 quality coordinator expanded with normalization matrix and fast-fail override. ln-1000 pipeline orchestrator: sync develop with main before branching, Plan Mode fix with MANDATORY READ context for post-clearing execution.

---

## 2026-02-13

New skill: ln-1000-pipeline-orchestrator (L0 Meta-Orchestrator). Reads kanban board, user selects ONE Story, drives it through 4-stage pipeline (ln-300 task planning -> ln-310 validation -> ln-400 execution -> ln-500 quality gate) via Claude Code Agent Teams. Single Story per run, user-confirmed merge to develop on quality gate PASS. Includes 6 reference files: message_protocol.md (formal lead<->worker message contract with regex parsing), worker_health_contract.md (3-step crash detection + respawn), pipeline_states.md (state machine with guards), worker_prompts.md (4 stage templates), kanban_parser.md (task presence detection), and 4 Mermaid diagrams. New 10XX Orchestration category.

---

## 2026-02-12

Session Resume for Agent Debate: ln-311 and ln-513 now resume Codex/Gemini sessions during challenge/follow-up rounds via `--resume-session` flag, preserving full agent context (file analysis, reasoning). New: agent_runner.py session capture + fallback to stateless, agent_registry.json v3.0 with resume_args/session_id_capture config. `.agent-review/` existence check before creation, removed auto-add to .gitignore. New skill: ln-003-push-all (commit+push all changes).

---

## 2026-02-11

Agent Review v2.0: ln-311 and ln-513 with Critical Verification + Debate Protocol (background tasks, process-as-arrive, challenge rounds via challenge_review.md). Risk Analysis: ln-310 criterion #20 with 6 risk categories and Impact x Probability scoring (20 criteria, 8 groups, max 75 penalty points). New shared infra: agent_registry.json v2.0 (no timeouts), agent_runner.py --output-file/placeholder support. New audit skills: ln-601, ln-631-635, ln-643-644, ln-650-653.

---

## 2026-01-10

**NEW: Project Bootstrap System (7XX)** - Added 32 new skills for technology-agnostic project migration. L1 Top Orchestrator (ln-700-project-bootstrap) coordinates 8 L2 coordinators: dependency-upgrader (710), structure-migrator (720), devops-setup (730), quality-setup (740), commands-generator (750), security-setup (760), crosscutting-setup (770), bootstrap-verifier (780). Each coordinator delegates to specialized L3 workers. Supports React/Vue/Angular frontends, .NET/Node/Python backends.

---

## 2025-12-23

**BREAKING: Major skill renumbering** - Reorganized 51 skills into 6 balanced categories: 0XX Shared (ln-001, ln-002), 1XX Docs, 2XX Planning, 3XX Tasks, 4XX Execution, 5XX Quality, 6XX Audit. All renamed skills → v3.0.0. New: ln-230-story-prioritizer (RICE prioritization with market research). Key workflow: ln-400 → ln-300 → ln-310 → ln-410 → ln-500.

---

## 2025-12-21

ln-310-story-validator v3.0.0 - Critical Path Validation First. 5-phase architecture with universal pattern detection (OAuth, REST, ML, etc.) via ln321_auto_trigger_matrix.md. TRIVIAL CRUD fast path (2min vs 10min). Research delegated to ln-002 (10x token reduction). 20→17 validation criteria.

---

## 2025-11-21

ln-220-story-coordinator v4.0.0 - Orchestrator-Worker decomposition (831→409 lines, -51%). New workers: ln-221-story-creator, ln-222-story-replanner. Token efficiency: 100x reduction (metadata-only loading ~50 tokens/Story vs ~5,000 full). ln-001-standards-researcher renamed from ln-021-library-researcher.

---

## 2025-11-17

Centralized validation + file naming standardization. ln-110-documents-pipeline v5.0.0 added Phase 3: Validate All Documentation. 5 workers refactored to pure CREATE (-93 lines duplication). File naming standardized to lowercase (documentation_standards.md, principles.md).

---

## 2025-11-16

**BREAKING: Idempotent mode** - 7 documentation skills with file existence checks (24 total). Skills create ONLY missing files, preserve existing documentation, prevent accidental data loss on repeated invocations.

---

## 2025-11-15

**BREAKING: Epic Grouping Pattern** in kanban board. Hierarchical format: Epic → Story → Task (indentation). Four-level README hierarchy. ADRs/Guides/Manuals moved to docs/reference/.

---

## 2025-11-14

**BREAKING: 3-Level Hierarchy Architecture** (L1 → L2 → L3). L2→L2 Delegation Rules, Story Status Responsibility Matrix. Progressive Disclosure Pattern (24-40% docs reduction). autoApprove mechanism for full automation.

---

## 2025-11-13

Added SKILL_ARCHITECTURE_GUIDE.md (industry best practices 2024-2025). New workers: ln-301-task-creator, ln-302-task-replanner (Universal Factory for 3 task types). Orchestrator-Worker Pattern unified across all skills (90.2% token efficiency improvement).

---

## 2025-11-12

Added Phase 0: Library & Standards Research in Planning workflow. Automated research via MCP Context7 + Ref BEFORE Story generation (15-20 min time-boxed). Expanded task_template_universal.md with library versions, key APIs, pseudocode.

---

## 2025-11-10

**v1.0.0 Initial release** - 17 production-ready skills in 5 categories. Complete Agile workflow automation for Linear (MCP integration). Risk-Based Testing (E2E-first, Priority ≥15). Decompose-First Pattern (Epic → Stories → Tasks). Plugin manifest + marketplace support.

---

## Future Releases

- Additional workflow optimizations
- Extended integration capabilities
- Community-contributed templates

---

**Links:**
- [Repository](https://github.com/levnikolaevich/claude-code-skills)
- [Issues](https://github.com/levnikolaevich/claude-code-skills/issues)
- [Contributing Guidelines](https://github.com/levnikolaevich/claude-code-skills#contributing)
