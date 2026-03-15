# Changelog

<!-- SCOPE: User-facing changes only. Max 5 bullets per entry. Focus: new capabilities, workflow changes, breaking changes. -->

---

## 2026-03-15

- **Optimization plan validation** — new step before code changes: parallel Codex + Gemini review catches infeasible hypotheses, missing optimizations, and incorrect conflict mappings. Pipeline: profile → research → **validate** → execute
- **Cross-service performance profiling** — optimization pipeline now traces bottlenecks across microservices (monorepo, git submodules, docker-compose). Profiles inside accessible services instead of treating them as black boxes
- **Community Engagement plugin** — new plugin with 4 skills for automated GitHub community management: triage issues/PRs, compose announcements, launch RFC debates, respond to threads
- **Runtime profiling replaces estimation** — profiler now runs real benchmarks with CPU/memory/I/O metrics instead of estimating from static analysis. Instrumentation persists for before/after comparison

## 2026-03-14

- **Agent sandbox fix** — plan files from outside project workspace now materialized for agent access (Gemini CLI CWD restriction)

## 2026-03-13

- **Test log analysis** — new skill classifies errors from Docker/file/Loki logs into 4 categories; only Real Bugs block quality verdict
- **Documentation skill extraction** — scan project docs, extract procedural content into reusable `.claude/commands` with quality review

---

## 2026-03-11

- **Pipeline orchestrator hardening** — Plan Gate now enforced at all 5 stages, worker prompts consolidated

---

## 2026-03-08

- **Plugin marketplace** — split into 5 focused plugins installable individually: agile-workflow, documentation-pipeline, codebase-audit-suite, project-bootstrap, optimization-suite
- **Optimization Suite** — new plugin with 11 skills: full-stack performance optimization (profile → research → execute), dependency upgrades (npm/NuGet/pip), code modernization (OSS replacement, bundle optimization)
- **Destructive operation safety** — all skills now classify destructive actions by severity with human-in-the-loop gates

---

## 2026-03-07

- **Two-layer detection** — audit skills now use grep pre-filter + AI context analysis instead of pure AI scanning (faster, fewer false positives)

---

## 2026-03-06

- **Documentation fact-checker** — new skill extracts verifiable claims from .md files (paths, versions, configs) and cross-checks against codebase

---

## 2026-02-13

- **Pipeline Orchestrator** — one command drives a Story through the full lifecycle: task planning → validation → implementation → quality gate → merge to develop. Uses Agent Teams for parallel worker coordination

---

## 2026-02-12

- **Multi-round agent debate** — Codex/Gemini sessions now persist across challenge rounds, preserving full reasoning context during disagreements

---

## 2026-02-11

- **Multi-model code review** — parallel Codex + Gemini analysis with Critical Verification: Claude independently validates each suggestion and debates controversial findings (max 2 rounds)
- **Risk Analysis in validation** — 6 risk categories with Impact × Probability scoring before Story approval
- **Persistence performance audit** — new skills for query efficiency, transaction correctness, blocking I/O, resource lifecycle analysis

---

## 2026-01-10

- **Project Bootstrap** — 32 new skills for scaffolding production-ready projects or transforming existing ones to Clean Architecture. Supports React, .NET, Python with Docker, CI/CD, security scanning, and quality tooling setup

---

## 2025-12-23

- **RICE prioritization** — new skill scores Stories by Reach, Impact, Confidence, Effort with automated market research

---

## 2025-12-21

- **Validation overhaul** — universal pattern detection (OAuth, REST, ML pipelines) with fast path for trivial CRUD stories

---

## 2025-11-21

- **100x token reduction** — coordinators now load Story/Task metadata only (~50 tokens vs ~5,000), delegating full reads to workers

---

## 2025-11-14

- **Orchestrator-Worker architecture** — 3-level hierarchy (L1 orchestrators → L2 coordinators → L3 workers) with Progressive Disclosure for 24-40% documentation reduction

---

## 2025-11-10

- **v1.0.0** — 17 skills automating Agile workflow end-to-end: scope decomposition, task execution, quality gates, Linear integration, Risk-Based Testing
