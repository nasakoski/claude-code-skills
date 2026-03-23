# Claude Code Hooks Reference

<!-- SCOPE: Complete hooks reference — 22 events, 4 types, matchers, decision control, env vars. Runtime reference for hook developers. -->

Source: [Claude Code Docs](https://code.claude.com/docs/en/hooks) + [shanraisshan/claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice) (verified Mar 2026)

---

## Hook Events (22)

| # | Event | Description | Matcher | Key options |
|:-:|-------|-------------|---------|-------------|
| 1 | `PreToolUse` | Before tool call (can block) | `tool_name` | `tool_use_id` |
| 2 | `PermissionRequest` | When permission needed | `tool_name` | `permission_suggestions` |
| 3 | `PostToolUse` | After tool success | `tool_name` | `tool_response`, `tool_use_id` |
| 4 | `PostToolUseFailure` | After tool failure | `tool_name` | `error`, `is_interrupt`, `tool_use_id` |
| 5 | `UserPromptSubmit` | Before Claude processes prompt | None | `prompt` |
| 6 | `Notification` | When notification sent | `notification_type` | `message`, `title` |
| 7 | `Stop` | Claude finishes responding | None | `last_assistant_message`, `stop_hook_active` |
| 8 | `SubagentStart` | Subagent task starts | `agent_type` | `agent_id` |
| 9 | `SubagentStop` | Subagent task completes | `agent_type` | `agent_id`, `last_assistant_message`, `agent_transcript_path` |
| 10 | `PreCompact` | Before compaction | `trigger` | `once`, `custom_instructions` |
| 11 | `PostCompact` | After compaction | `trigger` | `compact_summary` |
| 12 | `SessionStart` | Session starts/resumes | `source` | `once`, `agent_type`, `model` |
| 13 | `SessionEnd` | Session ends | `reason` | `once` |
| 14 | `Setup` | `/setup` command runs | None | timeout: 30000 |
| 15 | `TeammateIdle` | Teammate becomes idle | None | `teammate_name`, `team_name` |
| 16 | `TaskCompleted` | Background task completes | None | `task_id`, `task_subject`, `teammate_name` |
| 17 | `ConfigChange` | Config file changes | `source` | `file_path` |
| 18 | `WorktreeCreate` | Worktree created | None | `name` |
| 19 | `WorktreeRemove` | Worktree removed | None | `worktree_path` |
| 20 | `InstructionsLoaded` | CLAUDE.md/.rules loaded | None | `file_path`, `memory_type`, `load_reason` |
| 21 | `Elicitation` | MCP requests user input | `mcp_server_name` | `message`, `mode`, `requested_schema` |
| 22 | `ElicitationResult` | User responds to elicitation | `mcp_server_name` | `action`, `content` |

Events 15-16 require `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

---

## Hook Types (4)

| Type | Description | Use case | Supported events |
|------|-------------|----------|-----------------|
| `command` | Shell command, receives JSON via stdin | Sound notifications, logging, scripts | All 22 |
| `prompt` | Single-turn LLM evaluation, returns `{ok, reason}` | Judgment-based decisions | PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, UserPromptSubmit, Stop, SubagentStop, TaskCompleted |
| `agent` | Multi-turn subagent with tool access (Read, Grep, Glob) | Complex verification | Same as prompt |
| `http` | POST JSON to URL, receive JSON response (v2.1.63+) | External service integration | Same as prompt |

### Command hook example

```json
{
  "type": "command",
  "command": "python3 ${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/my-hook.py",
  "timeout": 5000,
  "async": true,
  "statusMessage": "Running validation"
}
```

### Prompt hook example

```json
{
  "type": "prompt",
  "prompt": "Check if acceptance criteria are met. $ARGUMENTS",
  "timeout": 30
}
```

---

## Matcher Reference

| Hook | Matcher field | Possible values |
|------|--------------|-----------------|
| PreToolUse | `tool_name` | `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`, `mcp__*` |
| PermissionRequest | `tool_name` | Same as PreToolUse |
| PostToolUse | `tool_name` | Same as PreToolUse |
| PostToolUseFailure | `tool_name` | Same as PreToolUse |
| Notification | `notification_type` | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` |
| SubagentStart | `agent_type` | `Bash`, `Explore`, `Plan`, or custom agent name |
| SubagentStop | `agent_type` | Same as SubagentStart |
| SessionStart | `source` | `startup`, `resume`, `clear`, `compact` |
| SessionEnd | `reason` | `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |
| PreCompact | `trigger` | `manual`, `auto` |
| PostCompact | `trigger` | `manual`, `auto` |
| Elicitation | `mcp_server_name` | MCP server name |
| ElicitationResult | `mcp_server_name` | MCP server name |
| ConfigChange | `source` | `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills` |
| UserPromptSubmit | None | Always fires |
| Stop | None | Always fires |
| TeammateIdle | None | Always fires |
| TaskCompleted | None | Always fires |
| WorktreeCreate | None | Always fires |
| WorktreeRemove | None | Always fires |
| InstructionsLoaded | None | Always fires |
| Setup | None | Always fires |

MCP tools: `mcp__<server>__<tool>` pattern. Full regex: `mcp__memory__.*` (all tools from server).

---

## Decision Control

| Hook | Control method | Values |
|------|---------------|--------|
| PreToolUse | `hookSpecificOutput.permissionDecision` | `allow`, `deny`, `ask` |
| PreToolUse | `hookSpecificOutput.autoAllow` | `true` (auto-approve future uses) |
| PermissionRequest | `hookSpecificOutput.decision.behavior` | `allow`, `deny` |
| PostToolUse, PostToolUseFailure, Stop, SubagentStop, ConfigChange | Top-level `decision` | `block` |
| TeammateIdle, TaskCompleted | `continue` + exit code 2 | `{"continue": false, "stopReason": "..."}` |
| UserPromptSubmit | Modify `prompt` field | Returns modified prompt via stdout |
| WorktreeCreate | Non-zero exit + stdout path | Non-zero fails; stdout provides worktree path |
| Elicitation, ElicitationResult | `hookSpecificOutput.action` | `accept`, `decline`, `cancel` |

### Universal JSON output fields (all hooks)

| Field | Type | Description |
|-------|------|-------------|
| `continue` | bool | `false` stops Claude entirely |
| `stopReason` | string | Message shown when `continue: false` |
| `suppressOutput` | bool | Hides stdout from verbose mode |
| `systemMessage` | string | Warning shown to user |
| `additionalContext` | string | Context added to conversation |

---

## Environment Variables

| Variable | Availability | Description |
|----------|-------------|-------------|
| `$CLAUDE_PROJECT_DIR` | All hooks | Project root directory |
| `$CLAUDE_ENV_FILE` | SessionStart only | File path for persisting env vars for Bash commands |
| `${CLAUDE_PLUGIN_ROOT}` | Plugin hooks | Plugin root directory |
| `${CLAUDE_SKILL_DIR}` | Skill hooks (v2.1.69+) | Skill directory |
| `$CLAUDE_CODE_REMOTE` | All hooks | `"true"` in remote web environments |

### Common stdin JSON fields (all hooks)

| Field | Type | Description |
|-------|------|-------------|
| `hook_event_name` | string | Event name (e.g., `"PreToolUse"`) |
| `session_id` | string | Current session ID |
| `transcript_path` | string | Path to conversation transcript JSON |
| `cwd` | string | Current working directory |
| `permission_mode` | string | `default`, `plan`, `acceptEdits`, `dontAsk`, `bypassPermissions` |
| `agent_id` | string | Subagent ID (v2.1.69+, when in subagent context) |
| `agent_type` | string | Agent type name (v2.1.69+) |

---

## Agent Frontmatter Hooks

6 events fire in agent sessions (not all 22):

| Event | Fires in agent? |
|-------|----------------|
| PreToolUse | Yes |
| PostToolUse | Yes |
| PermissionRequest | Yes |
| PostToolUseFailure | Yes |
| Stop | Yes (received as `SubagentStop` — known behavior) |
| SubagentStop | Yes |
| All others | No |

### Known issues

| Issue | Details |
|-------|---------|
| Stop -> SubagentStop | Agent `Stop:` hook receives `hook_event_name: "SubagentStop"`. Documented as expected behavior |
| PreToolUse decision deprecated | Old: `decision`/`reason`. New: `hookSpecificOutput.permissionDecision`/`permissionDecisionReason` |
| `once: true` | Works in settings-based hooks and skill frontmatter. NOT supported in agent frontmatter |

---

## Hook Options

| Option | Type | Description |
|--------|------|-------------|
| `async` | boolean | Run in background without blocking (default: `false`) |
| `timeout` | integer | Max execution time in ms (default: 5000, Setup: 30000) |
| `once` | boolean | Run only once per session (skills only, not agents) |
| `statusMessage` | string | Custom spinner message while hook runs |
| `matcher` | string | Regex filter for hook events (see Matcher Reference) |

## Management Commands

| Command | Description |
|---------|-------------|
| `/hooks` | Interactive hook management UI |
| `claude hooks reload` | Reload hooks config without restart |
