#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const cliPath = join(__dirname, "..", "cli.mjs");
const projectRoot = mkdtempSync(join(tmpdir(), "story-execution-runtime-"));

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
        throw new Error("Failed to start story execution runtime");
    }

    run(["checkpoint", "--project-root", projectRoot, "--phase", "PHASE_0_CONFIG"]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_1_DISCOVERY"]);
    run(["checkpoint", "--project-root", projectRoot, "--phase", "PHASE_1_DISCOVERY"]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_2_WORKTREE_SETUP"]);
    run([
        "checkpoint",
        "--project-root", projectRoot,
        "--phase", "PHASE_2_WORKTREE_SETUP",
        "--payload",
        JSON.stringify({
            worktree_ready: true,
            worktree_dir: ".hex-skills/worktrees/story-PROJ-123",
            branch: "feature/proj-123-story",
        }),
    ]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_3_SELECT_WORK"]);
    run([
        "checkpoint",
        "--project-root", projectRoot,
        "--phase", "PHASE_3_SELECT_WORK",
        "--payload",
        JSON.stringify({
            current_task_id: "T-100",
            processable_counts: { todo: 1, to_review: 0, to_rework: 0 },
        }),
    ]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_4_TASK_EXECUTION"]);
    run([
        "record-task",
        "--project-root", projectRoot,
        "--task-id", "T-100",
        "--payload",
        JSON.stringify({
            worker: "ln-401",
            result: "review_handoff",
            from_status: "Todo",
            to_status: "Done",
        }),
    ]);
    run(["checkpoint", "--project-root", projectRoot, "--phase", "PHASE_4_TASK_EXECUTION"]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_6_VERIFY_STATUSES"]);
    run([
        "checkpoint",
        "--project-root", projectRoot,
        "--phase", "PHASE_6_VERIFY_STATUSES",
        "--payload",
        JSON.stringify({
            processable_counts: { todo: 0, to_review: 0, to_rework: 0 },
            inflight_workers: {},
        }),
    ]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_7_STORY_TO_REVIEW"]);
    run([
        "checkpoint",
        "--project-root", projectRoot,
        "--phase", "PHASE_7_STORY_TO_REVIEW",
        "--payload",
        JSON.stringify({
            story_transition_done: true,
            story_final_status: "To Review",
            final_result: "READY_FOR_GATE",
        }),
    ]);
    run(["advance", "--project-root", projectRoot, "--to", "PHASE_8_SELF_CHECK"]);
    run([
        "checkpoint",
        "--project-root", projectRoot,
        "--phase", "PHASE_8_SELF_CHECK",
        "--payload",
        JSON.stringify({ pass: true, final_result: "READY_FOR_GATE" }),
    ]);
    const completed = run(["complete", "--project-root", projectRoot]);

    if (!completed.ok || completed.state.phase !== "DONE") {
        throw new Error("Story execution runtime did not complete");
    }

    process.stdout.write("story-execution-runtime smoke passed\n");
} finally {
    rmSync(projectRoot, { recursive: true, force: true });
}
