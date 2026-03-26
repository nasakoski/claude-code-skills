#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const cliPath = join(__dirname, "..", "cli.mjs");
const projectRoot = mkdtempSync(join(tmpdir(), "story-gate-runtime-"));

function run(args) {
    return JSON.parse(execFileSync("node", [cliPath, ...args], {
        cwd: projectRoot,
        encoding: "utf8",
    }));
}

try {
    const manifestPath = join(projectRoot, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({
        task_provider: "file",
        worktree_dir: ".hex-skills/worktrees/story-PROJ-123",
        branch: "feature/proj-123-story",
    }, null, 2));

    const started = run(["start", "--project-root", projectRoot, "--story", "PROJ-123", "--manifest-file", manifestPath]);
    if (!started.ok) {
        throw new Error("Failed to start story gate runtime");
    }

    run(["checkpoint", "--project-root", projectRoot, "--phase", "PHASE_0_CONFIG"]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_1_DISCOVERY"]);
    run(["checkpoint", "--project-root", projectRoot, "--phase", "PHASE_1_DISCOVERY"]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_2_FAST_TRACK"]);
    run(["checkpoint", "--project-root", projectRoot, "--phase", "PHASE_2_FAST_TRACK", "--payload", "{\"fast_track\":false}"]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_3_QUALITY_CHECKS"]);
    run(["record-quality", "--project-root", projectRoot, "--payload", "{\"story_id\":\"PROJ-123\",\"verdict\":\"PASS\",\"quality_score\":92}"]);
    run([
        "checkpoint",
        "--project-root", projectRoot,
        "--phase", "PHASE_3_QUALITY_CHECKS",
        "--payload",
        "{\"quality_summary\":{\"story_id\":\"PROJ-123\",\"verdict\":\"PASS\"},\"quality_score\":92}",
    ]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_4_TEST_PLANNING"]);
    run(["record-test-status", "--project-root", projectRoot, "--payload", "{\"story_id\":\"PROJ-123\",\"planner_invoked\":true,\"status\":\"SKIPPED\"}"]);
    run([
        "checkpoint",
        "--project-root", projectRoot,
        "--phase", "PHASE_4_TEST_PLANNING",
        "--payload",
        "{\"test_planner_invoked\":true,\"test_task_status\":\"SKIPPED\"}",
    ]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_5_TEST_VERIFICATION"]);
    run(["checkpoint", "--project-root", projectRoot, "--phase", "PHASE_5_TEST_VERIFICATION", "--payload", "{\"test_task_status\":\"SKIPPED\"}"]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_6_VERDICT"]);
    run([
        "checkpoint",
        "--project-root", projectRoot,
        "--phase", "PHASE_6_VERDICT",
        "--payload",
        "{\"final_result\":\"PASS\",\"quality_score\":92,\"nfr_validation\":{\"security\":\"PASS\"}}",
    ]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_7_FINALIZATION"]);
    run([
        "checkpoint",
        "--project-root", projectRoot,
        "--phase", "PHASE_7_FINALIZATION",
        "--payload",
        "{\"branch_finalized\":true,\"story_final_status\":\"Done\"}",
    ]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_8_SELF_CHECK"]);
    run(["checkpoint", "--project-root", projectRoot, "--phase", "PHASE_8_SELF_CHECK", "--payload", "{\"pass\":true,\"final_result\":\"PASS\"}"]);
    const completed = run(["complete", "--project-root", projectRoot]);

    if (!completed.ok || completed.state.phase !== "DONE") {
        throw new Error("Story gate runtime did not complete");
    }

    process.stdout.write("story-gate-runtime smoke passed\n");
} finally {
    rmSync(projectRoot, { recursive: true, force: true });
}
