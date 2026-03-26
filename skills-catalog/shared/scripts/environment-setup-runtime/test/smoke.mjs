#!/usr/bin/env node

import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    createJsonCliRunner,
    createProjectRoot,
    writeJson,
} from "../../coordinator-runtime/test/cli-test-helpers.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const cliPath = join(__dirname, "..", "cli.mjs");
const projectRoot = createProjectRoot("environment-setup-runtime-");
const run = createJsonCliRunner(cliPath, projectRoot);

try {
    const manifestPath = join(projectRoot, "manifest.json");
    writeJson(manifestPath, {
        targets: ["both"],
        dry_run: false,
    });

    const started = run(["start", "--project-root", projectRoot, "--identifier", "targets-both", "--manifest-file", manifestPath]);
    if (!started.ok) {
        throw new Error("Failed to start environment setup runtime");
    }

    run(["checkpoint", "--project-root", projectRoot, "--identifier", "targets-both", "--phase", "PHASE_0_CONFIG"]);
    run(["advance", "--project-root", projectRoot, "--identifier", "targets-both", "--to", "PHASE_1_ASSESS"]);
    run(["checkpoint", "--project-root", projectRoot, "--identifier", "targets-both", "--phase", "PHASE_1_ASSESS", "--payload", "{\"assess_summary\":{\"node\":true}}"]);
    run(["advance", "--project-root", projectRoot, "--identifier", "targets-both", "--to", "PHASE_2_DISPATCH_PLAN"]);
    run(["checkpoint", "--project-root", projectRoot, "--identifier", "targets-both", "--phase", "PHASE_2_DISPATCH_PLAN", "--payload", "{\"dispatch_plan\":{\"workers_to_run\":[\"ln-011\",\"ln-013\"]}}"]);
    run(["advance", "--project-root", projectRoot, "--identifier", "targets-both", "--to", "PHASE_3_WORKER_EXECUTION"]);
    run(["record-worker", "--project-root", projectRoot, "--identifier", "targets-both", "--payload", "{\"schema_version\":\"1.0\",\"summary_kind\":\"env-agent-install\",\"identifier\":\"targets-both\",\"producer_skill\":\"ln-011\",\"produced_at\":\"2026-03-26T00:00:00Z\",\"payload\":{\"status\":\"ok\",\"targets\":[\"codex\"]}}"]);
    run(["record-worker", "--project-root", projectRoot, "--identifier", "targets-both", "--payload", "{\"schema_version\":\"1.0\",\"summary_kind\":\"env-config-sync\",\"identifier\":\"targets-both\",\"producer_skill\":\"ln-013\",\"produced_at\":\"2026-03-26T00:00:00Z\",\"payload\":{\"status\":\"ok\",\"targets\":[\"gemini\"]}}"]);
    run(["checkpoint", "--project-root", projectRoot, "--identifier", "targets-both", "--phase", "PHASE_3_WORKER_EXECUTION"]);
    run(["advance", "--project-root", projectRoot, "--identifier", "targets-both", "--to", "PHASE_4_VERIFY"]);
    run(["checkpoint", "--project-root", projectRoot, "--identifier", "targets-both", "--phase", "PHASE_4_VERIFY", "--payload", "{\"verification_summary\":{\"hooks\":\"ok\"}}"]);
    run(["advance", "--project-root", projectRoot, "--identifier", "targets-both", "--to", "PHASE_5_WRITE_ENV_STATE"]);
    run(["checkpoint", "--project-root", projectRoot, "--identifier", "targets-both", "--phase", "PHASE_5_WRITE_ENV_STATE", "--payload", "{\"env_state_written\":true,\"final_result\":\"READY\"}"]);
    run(["advance", "--project-root", projectRoot, "--identifier", "targets-both", "--to", "PHASE_6_SELF_CHECK"]);
    run(["checkpoint", "--project-root", projectRoot, "--identifier", "targets-both", "--phase", "PHASE_6_SELF_CHECK", "--payload", "{\"pass\":true,\"final_result\":\"READY\"}"]);
    const completed = run(["complete", "--project-root", projectRoot, "--identifier", "targets-both"]);

    if (!completed.ok || completed.state.phase !== "DONE") {
        throw new Error("Environment setup runtime did not complete");
    }

    process.stdout.write("environment-setup-runtime smoke passed\n");
} finally {
    rmSync(projectRoot, { recursive: true, force: true });
}
