#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const cliPath = join(__dirname, "..", "cli.mjs");
const projectRoot = mkdtempSync(join(tmpdir(), "optimization-runtime-"));

function run(args) {
    return JSON.parse(execFileSync("node", [cliPath, ...args], {
        cwd: projectRoot,
        encoding: "utf8",
    }));
}

try {
    const manifestPath = join(projectRoot, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({
        slug: "align-endpoint",
        target: "src/api/alignment.py::align_endpoint",
        observed_metric: { type: "response_time", value: 6300, unit: "ms" },
        cycle_config: { max_cycles: 3, plateau_threshold: 5 },
        execution_mode: "execute",
    }, null, 2));

    const started = run(["start", "--project-root", projectRoot, "--slug", "align-endpoint", "--manifest-file", manifestPath]);
    if (!started.ok) {
        throw new Error("Failed to start optimization runtime");
    }

    run(["checkpoint", "--project-root", projectRoot, "--slug", "align-endpoint", "--phase", "PHASE_0_PREFLIGHT"]);
    run(["advance", "--project-root", projectRoot, "--slug", "align-endpoint", "--to", "PHASE_1_PARSE_INPUT"]);
    run(["checkpoint", "--project-root", projectRoot, "--slug", "align-endpoint", "--phase", "PHASE_1_PARSE_INPUT", "--payload", "{\"target_metric\":{\"value\":500,\"unit\":\"ms\"}}"]);
    run(["advance", "--project-root", projectRoot, "--slug", "align-endpoint", "--to", "PHASE_2_PROFILE"]);
    run(["record-worker-result", "--project-root", projectRoot, "--slug", "align-endpoint", "--worker", "ln-811", "--payload", "{\"baseline\":{\"wall_time_ms\":6300}}"]);
    run(["checkpoint", "--project-root", projectRoot, "--slug", "align-endpoint", "--phase", "PHASE_2_PROFILE"]);
    run(["advance", "--project-root", projectRoot, "--slug", "align-endpoint", "--to", "PHASE_3_WRONG_TOOL_GATE"]);
    run(["checkpoint", "--project-root", projectRoot, "--slug", "align-endpoint", "--phase", "PHASE_3_WRONG_TOOL_GATE", "--payload", "{\"gate_verdict\":\"PROCEED\"}"]);
    run(["advance", "--project-root", projectRoot, "--slug", "align-endpoint", "--to", "PHASE_4_RESEARCH"]);
    run(["record-worker-result", "--project-root", projectRoot, "--slug", "align-endpoint", "--worker", "ln-812", "--payload", "{\"hypotheses\":[\"H1\"]}"]);
    run(["checkpoint", "--project-root", projectRoot, "--slug", "align-endpoint", "--phase", "PHASE_4_RESEARCH", "--payload", "{\"hypotheses_count\":1}"]);
    run(["advance", "--project-root", projectRoot, "--slug", "align-endpoint", "--to", "PHASE_5_SET_TARGET"]);
    run(["checkpoint", "--project-root", projectRoot, "--slug", "align-endpoint", "--phase", "PHASE_5_SET_TARGET", "--payload", "{\"target_metric\":{\"value\":500,\"unit\":\"ms\"}}"]);
    run(["advance", "--project-root", projectRoot, "--slug", "align-endpoint", "--to", "PHASE_6_WRITE_CONTEXT"]);
    run(["checkpoint", "--project-root", projectRoot, "--slug", "align-endpoint", "--phase", "PHASE_6_WRITE_CONTEXT", "--payload", "{\"context_file\":\".hex-skills/optimization/align-endpoint/context.md\"}"]);
    run(["advance", "--project-root", projectRoot, "--slug", "align-endpoint", "--to", "PHASE_7_VALIDATE_PLAN"]);
    run(["record-worker-result", "--project-root", projectRoot, "--slug", "align-endpoint", "--worker", "ln-813", "--payload", "{\"verdict\":\"GO\"}"]);
    run(["checkpoint", "--project-root", projectRoot, "--slug", "align-endpoint", "--phase", "PHASE_7_VALIDATE_PLAN", "--payload", "{\"validation_verdict\":\"GO\"}"]);
    run(["advance", "--project-root", projectRoot, "--slug", "align-endpoint", "--to", "PHASE_8_EXECUTE"]);
    run(["record-worker-result", "--project-root", projectRoot, "--slug", "align-endpoint", "--worker", "ln-814", "--payload", "{\"target_met\":true}"]);
    run(["checkpoint", "--project-root", projectRoot, "--slug", "align-endpoint", "--phase", "PHASE_8_EXECUTE", "--payload", "{\"execution_result\":{\"target_met\":true}}"]);
    run(["advance", "--project-root", projectRoot, "--slug", "align-endpoint", "--to", "PHASE_9_CYCLE_BOUNDARY"]);
    run(["record-cycle", "--project-root", projectRoot, "--slug", "align-endpoint", "--payload", "{\"cycle\":1,\"status\":\"done\",\"stop_reason\":\"TARGET_MET\",\"final_result\":\"TARGET_MET\"}"]);
    run(["checkpoint", "--project-root", projectRoot, "--slug", "align-endpoint", "--phase", "PHASE_9_CYCLE_BOUNDARY", "--payload", "{\"stop_reason\":\"TARGET_MET\",\"final_result\":\"TARGET_MET\"}"]);
    run(["advance", "--project-root", projectRoot, "--slug", "align-endpoint", "--to", "PHASE_10_AGGREGATE"]);
    run(["checkpoint", "--project-root", projectRoot, "--slug", "align-endpoint", "--phase", "PHASE_10_AGGREGATE"]);
    run(["advance", "--project-root", projectRoot, "--slug", "align-endpoint", "--to", "PHASE_11_REPORT"]);
    run(["checkpoint", "--project-root", projectRoot, "--slug", "align-endpoint", "--phase", "PHASE_11_REPORT", "--payload", "{\"report_ready\":true,\"final_result\":\"TARGET_MET\"}"]);
    const completed = run(["complete", "--project-root", projectRoot, "--slug", "align-endpoint"]);

    if (!completed.ok || completed.state.phase !== "DONE") {
        throw new Error("Optimization runtime did not complete");
    }

    process.stdout.write("optimization-runtime smoke passed\n");
} finally {
    rmSync(projectRoot, { recursive: true, force: true });
}
