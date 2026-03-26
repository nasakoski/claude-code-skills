const ALLOWED_TRANSITIONS = new Map([
    ["PHASE_0_PREFLIGHT", new Set(["PHASE_1_PARSE_INPUT"])],
    ["PHASE_1_PARSE_INPUT", new Set(["PHASE_2_PROFILE"])],
    ["PHASE_2_PROFILE", new Set(["PHASE_3_WRONG_TOOL_GATE"])],
    ["PHASE_3_WRONG_TOOL_GATE", new Set(["PHASE_4_RESEARCH", "PHASE_10_AGGREGATE"])],
    ["PHASE_4_RESEARCH", new Set(["PHASE_5_SET_TARGET", "PHASE_10_AGGREGATE"])],
    ["PHASE_5_SET_TARGET", new Set(["PHASE_6_WRITE_CONTEXT"])],
    ["PHASE_6_WRITE_CONTEXT", new Set(["PHASE_7_VALIDATE_PLAN"])],
    ["PHASE_7_VALIDATE_PLAN", new Set(["PHASE_8_EXECUTE"])],
    ["PHASE_8_EXECUTE", new Set(["PHASE_9_CYCLE_BOUNDARY"])],
    ["PHASE_9_CYCLE_BOUNDARY", new Set(["PHASE_2_PROFILE", "PHASE_10_AGGREGATE"])],
    ["PHASE_10_AGGREGATE", new Set(["PHASE_11_REPORT"])],
    ["PHASE_11_REPORT", new Set(["DONE"])],
    ["PAUSED", new Set([])],
    ["DONE", new Set([])],
]);

function hasCheckpoint(checkpoints, phase) {
    return Boolean(checkpoints?.[phase]);
}

function latestPayload(checkpoints, phase) {
    return checkpoints?.[phase]?.payload || {};
}

export function validateTransition(manifest, state, checkpoints, toPhase) {
    const allowed = ALLOWED_TRANSITIONS.get(state.phase);
    if (!allowed || !allowed.has(toPhase)) {
        return { ok: false, error: `Invalid transition: ${state.phase} -> ${toPhase}` };
    }
    if (!hasCheckpoint(checkpoints, state.phase)) {
        return { ok: false, error: `Checkpoint missing for ${state.phase}` };
    }

    if (toPhase === "PHASE_4_RESEARCH") {
        const gateVerdict = latestPayload(checkpoints, "PHASE_3_WRONG_TOOL_GATE").gate_verdict;
        if (!["PROCEED", "CONCERNS", "WAIVED"].includes(gateVerdict || "")) {
            return { ok: false, error: "Wrong Tool Gate does not allow research" };
        }
    }

    if (toPhase === "PHASE_10_AGGREGATE") {
        if (state.phase === "PHASE_3_WRONG_TOOL_GATE") {
            const gateVerdict = latestPayload(checkpoints, "PHASE_3_WRONG_TOOL_GATE").gate_verdict;
            if (gateVerdict !== "BLOCK") {
                return { ok: false, error: "Phase 3 can jump to aggregate only on BLOCK" };
            }
        }
        if (state.phase === "PHASE_4_RESEARCH") {
            const payload = latestPayload(checkpoints, "PHASE_4_RESEARCH");
            if (Number(payload.hypotheses_count ?? 1) > 0) {
                return { ok: false, error: "Phase 4 can jump to aggregate only when no hypotheses remain" };
            }
        }
        if (state.phase === "PHASE_9_CYCLE_BOUNDARY" && !state.stop_reason) {
            return { ok: false, error: "Cycle boundary missing stop reason" };
        }
    }

    if (toPhase === "PHASE_7_VALIDATE_PLAN" && !state.context_file) {
        return { ok: false, error: "Context file not recorded" };
    }

    if (toPhase === "PHASE_8_EXECUTE") {
        const verdict = latestPayload(checkpoints, "PHASE_7_VALIDATE_PLAN").validation_verdict;
        if (!["GO", "GO_WITH_CONCERNS", "WAIVED"].includes(verdict || "")) {
            return { ok: false, error: "Validation verdict does not allow execution" };
        }
    }

    if (toPhase === "PHASE_9_CYCLE_BOUNDARY") {
        const payload = latestPayload(checkpoints, "PHASE_8_EXECUTE");
        const skippedByMode = payload.status === "skipped_by_mode" && state.execution_mode === "plan_only";
        if (!skippedByMode && !payload.execution_result) {
            return { ok: false, error: "Execution summary missing" };
        }
    }

    if (toPhase === "PHASE_2_PROFILE" && state.phase === "PHASE_9_CYCLE_BOUNDARY" && state.stop_reason) {
        return { ok: false, error: "Stop reason recorded; cannot continue to another cycle" };
    }

    if (toPhase === "DONE") {
        if (!state.report_ready) {
            return { ok: false, error: "Final report checkpoint missing" };
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
    if (state.phase === "PHASE_6_WRITE_CONTEXT" && !state.context_file) {
        return "Write optimization context file and checkpoint PHASE_6_WRITE_CONTEXT";
    }
    if (state.phase === "PHASE_7_VALIDATE_PLAN") {
        const verdict = latestPayload(checkpoints, "PHASE_7_VALIDATE_PLAN").validation_verdict;
        if (verdict === "NO_GO") {
            return "Present NO_GO issues to the user, then resolve or pause";
        }
    }
    if (state.phase === "PHASE_8_EXECUTE" && state.execution_mode === "plan_only") {
        return "Checkpoint PHASE_8_EXECUTE as skipped_by_mode, then advance to PHASE_9_CYCLE_BOUNDARY";
    }
    if (state.phase === "PHASE_9_CYCLE_BOUNDARY") {
        if (state.stop_reason) {
            return "Advance to PHASE_10_AGGREGATE";
        }
        return `Advance to PHASE_2_PROFILE for cycle ${Number(state.current_cycle || 1) + 1}`;
    }
    if (state.phase === "PHASE_11_REPORT" && !state.report_ready) {
        return "Write final report checkpoint for PHASE_11_REPORT";
    }

    const nextPhase = Array.from(ALLOWED_TRANSITIONS.get(state.phase) || [])[0];
    return nextPhase ? `Advance to ${nextPhase}` : "No automatic resume action available";
}
