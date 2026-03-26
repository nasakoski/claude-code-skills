const ALLOWED_TRANSITIONS = new Map([
    ["PHASE_0_CONFIG", new Set(["PHASE_1_DISCOVERY"])],
    ["PHASE_1_DISCOVERY", new Set(["PHASE_2_FAST_TRACK"])],
    ["PHASE_2_FAST_TRACK", new Set(["PHASE_3_QUALITY_CHECKS"])],
    ["PHASE_3_QUALITY_CHECKS", new Set(["PHASE_4_TEST_PLANNING", "PHASE_6_VERDICT"])],
    ["PHASE_4_TEST_PLANNING", new Set(["PHASE_5_TEST_VERIFICATION"])],
    ["PHASE_5_TEST_VERIFICATION", new Set(["PHASE_6_VERDICT"])],
    ["PHASE_6_VERDICT", new Set(["PHASE_7_FINALIZATION"])],
    ["PHASE_7_FINALIZATION", new Set(["PHASE_8_SELF_CHECK"])],
    ["PHASE_8_SELF_CHECK", new Set(["DONE"])],
    ["PAUSED", new Set([])],
    ["DONE", new Set([])],
]);

function hasCheckpoint(checkpoints, phase) {
    return Boolean(checkpoints?.[phase]);
}

function verdictAllowsFinalization(verdict) {
    return ["PASS", "CONCERNS", "WAIVED", "FAIL"].includes(verdict);
}

export function validateTransition(manifest, state, checkpoints, toPhase) {
    const allowed = ALLOWED_TRANSITIONS.get(state.phase);
    if (!allowed || !allowed.has(toPhase)) {
        return { ok: false, error: `Invalid transition: ${state.phase} -> ${toPhase}` };
    }
    if (!hasCheckpoint(checkpoints, state.phase)) {
        return { ok: false, error: `Checkpoint missing for ${state.phase}` };
    }

    if (toPhase === "PHASE_4_TEST_PLANNING" || toPhase === "PHASE_6_VERDICT") {
        if (!state.quality_summary) {
            return { ok: false, error: "Quality summary missing" };
        }
    }

    if (toPhase === "PHASE_5_TEST_VERIFICATION" && !state.test_planner_invoked && state.test_task_status !== "Done" && state.test_task_status !== "SKIPPED") {
        return { ok: false, error: "Test planner not recorded before test verification" };
    }

    if (toPhase === "PHASE_6_VERDICT" && state.phase === "PHASE_5_TEST_VERIFICATION" && !["Done", "SKIPPED", "VERIFIED"].includes(state.test_task_status || "")) {
        return { ok: false, error: "Test verification not complete" };
    }

    if (toPhase === "PHASE_7_FINALIZATION" && !verdictAllowsFinalization(state.final_result)) {
        return { ok: false, error: "Final verdict not recorded" };
    }

    if (toPhase === "DONE") {
        if (!state.self_check_passed) {
            return { ok: false, error: "Self-check must pass before completion" };
        }
        if (!state.story_final_status) {
            return { ok: false, error: "Final Story status not recorded" };
        }
    }

    return { ok: true };
}

export function computeResumeAction(manifest, state, checkpoints) {
    if (state.complete || state.phase === "DONE") {
        return "Run complete";
    }
    if (state.phase === "PAUSED") {
        return `Paused: ${state.paused_reason || "manual intervention required"}`;
    }
    if (!hasCheckpoint(checkpoints, state.phase)) {
        return `Complete ${state.phase} and write its checkpoint`;
    }
    if (state.phase === "PHASE_3_QUALITY_CHECKS" && !state.quality_summary) {
        return "Persist ln-510 summary, then checkpoint PHASE_3_QUALITY_CHECKS";
    }
    if (state.phase === "PHASE_5_TEST_VERIFICATION" && !["Done", "SKIPPED", "VERIFIED"].includes(state.test_task_status || "")) {
        return "Wait for the test task to finish, then resume PHASE_5_TEST_VERIFICATION";
    }
    if (state.phase === "PHASE_6_VERDICT" && !state.final_result) {
        return "Calculate final verdict and checkpoint PHASE_6_VERDICT";
    }
    if (state.phase === "PHASE_7_FINALIZATION" && !state.story_final_status) {
        return "Record Story status/finalization result and checkpoint PHASE_7_FINALIZATION";
    }
    if (state.phase === "PHASE_8_SELF_CHECK" && !state.self_check_passed) {
        return "Fix self-check failures, then checkpoint PHASE_8_SELF_CHECK with pass=true";
    }

    const nextPhase = Array.from(ALLOWED_TRANSITIONS.get(state.phase) || [])[0];
    return nextPhase ? `Advance to ${nextPhase}` : "No automatic resume action available";
}
