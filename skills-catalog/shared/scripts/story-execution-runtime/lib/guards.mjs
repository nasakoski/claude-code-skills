const ALLOWED_TRANSITIONS = new Map([
    ["PHASE_0_CONFIG", new Set(["PHASE_1_DISCOVERY"])],
    ["PHASE_1_DISCOVERY", new Set(["PHASE_2_WORKTREE_SETUP"])],
    ["PHASE_2_WORKTREE_SETUP", new Set(["PHASE_3_SELECT_WORK"])],
    ["PHASE_3_SELECT_WORK", new Set(["PHASE_4_TASK_EXECUTION", "PHASE_5_GROUP_EXECUTION", "PHASE_7_STORY_TO_REVIEW"])],
    ["PHASE_4_TASK_EXECUTION", new Set(["PHASE_6_VERIFY_STATUSES"])],
    ["PHASE_5_GROUP_EXECUTION", new Set(["PHASE_6_VERIFY_STATUSES"])],
    ["PHASE_6_VERIFY_STATUSES", new Set(["PHASE_3_SELECT_WORK", "PHASE_7_STORY_TO_REVIEW"])],
    ["PHASE_7_STORY_TO_REVIEW", new Set(["PHASE_8_SELF_CHECK"])],
    ["PHASE_8_SELF_CHECK", new Set(["DONE"])],
    ["PAUSED", new Set([])],
    ["DONE", new Set([])],
]);

function hasCheckpoint(checkpoints, phase) {
    return Boolean(checkpoints?.[phase]);
}

function hasProcessableWork(counts) {
    const next = counts || {};
    return Number(next.todo || 0) > 0
        || Number(next.to_review || 0) > 0
        || Number(next.to_rework || 0) > 0;
}

function hasInflightWorkers(state) {
    return Object.keys(state.inflight_workers || {}).length > 0;
}

export function validateTransition(manifest, state, checkpoints, toPhase) {
    const allowed = ALLOWED_TRANSITIONS.get(state.phase);
    if (!allowed || !allowed.has(toPhase)) {
        return { ok: false, error: `Invalid transition: ${state.phase} -> ${toPhase}` };
    }
    if (!hasCheckpoint(checkpoints, state.phase)) {
        return { ok: false, error: `Checkpoint missing for ${state.phase}` };
    }

    if (toPhase === "PHASE_3_SELECT_WORK" && state.phase === "PHASE_2_WORKTREE_SETUP" && !state.worktree_ready) {
        return { ok: false, error: "Worktree setup not checkpointed as ready" };
    }

    if (toPhase === "PHASE_4_TASK_EXECUTION" && !state.current_task_id) {
        return { ok: false, error: "No selected task recorded for task execution" };
    }

    if (toPhase === "PHASE_5_GROUP_EXECUTION" && !state.current_group_id) {
        return { ok: false, error: "No selected group recorded for group execution" };
    }

    if (toPhase === "PHASE_7_STORY_TO_REVIEW") {
        if (hasProcessableWork(state.processable_counts)) {
            return { ok: false, error: "Processable tasks remain; cannot move Story to To Review" };
        }
        if (hasInflightWorkers(state)) {
            return { ok: false, error: "Parallel workers still in flight" };
        }
    }

    if (toPhase === "DONE") {
        if (!state.self_check_passed) {
            return { ok: false, error: "Self-check must pass before completion" };
        }
        if (!state.story_transition_done) {
            return { ok: false, error: "Story transition to To Review not recorded" };
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
    if (state.phase === "PHASE_2_WORKTREE_SETUP" && !state.worktree_ready) {
        return "Finish worktree setup and checkpoint PHASE_2_WORKTREE_SETUP";
    }
    if (state.phase === "PHASE_3_SELECT_WORK") {
        if (hasProcessableWork(state.processable_counts)) {
            return "Select the next task or parallel group and checkpoint PHASE_3_SELECT_WORK";
        }
        return "Advance to PHASE_7_STORY_TO_REVIEW";
    }
    if (state.phase === "PHASE_4_TASK_EXECUTION" && state.current_task_id) {
        return `Complete execute-review cycle for task ${state.current_task_id}`;
    }
    if (state.phase === "PHASE_5_GROUP_EXECUTION" && state.current_group_id) {
        return `Wait for group ${state.current_group_id}, then review tasks and checkpoint PHASE_5_GROUP_EXECUTION`;
    }
    if (state.phase === "PHASE_6_VERIFY_STATUSES") {
        if (hasProcessableWork(state.processable_counts)) {
            return "Re-read task statuses, checkpoint PHASE_6_VERIFY_STATUSES, then advance to PHASE_3_SELECT_WORK";
        }
        return "Advance to PHASE_7_STORY_TO_REVIEW";
    }
    if (state.phase === "PHASE_7_STORY_TO_REVIEW" && !state.story_transition_done) {
        return "Move Story to To Review and checkpoint PHASE_7_STORY_TO_REVIEW";
    }
    if (state.phase === "PHASE_8_SELF_CHECK" && !state.self_check_passed) {
        return "Fix self-check failures, then checkpoint PHASE_8_SELF_CHECK with pass=true";
    }

    const nextPhase = Array.from(ALLOWED_TRANSITIONS.get(state.phase) || [])[0];
    return nextPhase ? `Advance to ${nextPhase}` : "No automatic resume action available";
}
