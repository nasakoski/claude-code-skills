---
name: add-mcp
description: >-
  Walks through ALL registration points when adding a new MCP server to the
  Jarvis bot. Prevents incomplete integrations by enforcing the full checklist:
  autonomy tiers, messenger display names, agent-sdk mcpServers + tool docs,
  .mcp.json for dev, workflow file, start.sh secrets. Handles both direct stdio
  MCPs and HTTP gateway MCPs. Use when adding an MCP, integrating a tool server,
  connecting a new MCP, or "install ref MCP" or "add a new MCP server".
argument-hint: [mcp-name-or-package]
allowed-tools: Read, Write, Edit, Grep, Glob, WebSearch, WebFetch
---

# Add MCP to Jarvis Bot

Walk through the complete registration checklist for adding a new MCP server
to the Jarvis bot. Every MCP requires coordinated changes across multiple files.
Missing any registration point causes silent failures at runtime.

See [registration-checklist.md](references/registration-checklist.md) for the
quick-reference table.

## Step 1: Determine MCP Type

If not clear from `$ARGUMENTS`, ask the user:

**Direct stdio MCP** — Agent SDK spawns the process directly via command + args.
Tools appear with MCP prefix: `mcp__<server-name>__<tool-name>`.
Examples: Ref (`ref-tools-mcp`), Context7, any `npx -y @package/mcp` server.

**HTTP gateway MCP** — A gateway tool in `bot/tools/` wraps an HTTP backend.
Tools appear as gateway actions: `gateway({ action, params })`.
Examples: Google Workspace (port 8200), Notion (port 8201).

## Step 2: Research the MCP

Discover the MCP's tool surface before making any changes.

1. If `$ARGUMENTS` contains a package name or URL, use WebSearch or WebFetch
   to find the MCP's documentation
2. Identify:
   - All tool names it exposes (exact names, these become registration keys)
   - Whether each tool is read-only or write/mutating
   - Required environment variables or API keys
   - The launch command (for stdio) or backend URL (for HTTP)
3. Present findings to the user before proceeding to registration

## Step 3: Registration Checklist

Read the current state of each file before editing. Follow existing patterns
exactly — match formatting, comment style, and section placement.

### 3a. autonomy.js — Security Tiers (REQUIRED)

**File:** `bot/lib/autonomy.js`

Add each tool to the appropriate tier map. For direct MCPs, add to
`EXTERNAL_TOOL_TIERS`. For gateway tools, add to `JARVIS_TOOL_TIERS`.

```javascript
// In EXTERNAL_TOOL_TIERS or JARVIS_TOOL_TIERS:
tool_name: "autonomous",        // Read-only tools
tool_name: "approval_required", // Write/mutating tools
```

Use **base tool names** — the MCP prefix stripping in `canUseTool()` (lines
212-215) handles `mcp__server__tool_name` to `tool_name` automatically.

Unknown tools are **blocked by default** (line 333-338). Forgetting this step
means the tools silently fail with "not recognized" errors.

**For gateway MCPs with write actions**, also update:
- `GATEWAY_WRITE_ACTIONS` — add a Set of write action names
- `describeWriteAction()` — add user-friendly approval labels

### 3b. messenger.js — Display Names (REQUIRED)

**File:** `bot/lib/messenger.js`

Add entries to `TOOL_DISPLAY_NAMES` for each tool. Use present participle form:

```javascript
tool_name: "Searching documentation",  // Not "Search documentation"
```

**For gateway MCPs**, also update:
- `GATEWAY_ACTION_NAMES` — add all action display names
- `GATEWAYS` set — add the gateway tool name

Without display names, Matrix progress messages show raw tool names or fall
through to the naive gerund converter (often produces awkward labels).

### 3c. agent-sdk.js — Tool Documentation (REQUIRED)

**File:** `bot/lib/providers/agent-sdk.js`

Add a documentation section to `TOOL_INSTRUCTIONS` (the template literal near
line 52). Follow the existing format:

```
SECTION_NAME (tools prefixed mcp__<server>__):
- tool_name(params): Description of what it does
- tool_name2(params): Description
Usage guidance and when to prefer this over alternatives.
```

Place the new section before `BUILT-IN (scoped to /opt/jarvis):` at the end.

Without tool documentation, the model doesn't know when or how to use the tools.

### 3d. agent-sdk.js — mcpServers Object (STDIO ONLY)

**File:** `bot/lib/providers/agent-sdk.js` (~line 289)

Add the MCP server to the `mcpServers` object in the Agent SDK options:

```javascript
"server-name": {
  command: "npx",
  args: ["-y", "package-name@latest"],
  env: { ...process.env },  // If API key needed
},
```

Use `env: { ...process.env }` to pass through decrypted secrets from `start.sh`.

### 3e. .mcp.json — Claude Code Dev Config (STDIO ONLY)

**File:** `.mcp.json` (project root)

Add the same server for Claude Code development consistency:

```json
"server-name": {
  "command": "npx",
  "args": ["-y", "package-name@latest"],
  "env": {
    "API_KEY": "${API_KEY}"
  }
}
```

The `${VAR}` syntax references environment variables at Claude Code runtime.

### 3f. Workflow File (RECOMMENDED)

**File:** `bot/workflows/<name>.md`

Create a workflow file with YAML frontmatter. Auto-discovered by
`WorkflowRegistry` at startup — no code changes needed for registration.

```yaml
---
name: short-name
description: One-line description of what this MCP enables
---
```

Include: when to use, step-by-step instructions, fallback behavior, rules.
See `bot/workflows/ref.md` or `bot/workflows/email.md` for examples.

The workflow index is injected into the system prompt at ~25 tokens per entry.
Full instructions are loaded on demand via `jarvis_ops read_file`.

### 3g. start.sh — Secret Decryption (IF AUTH REQUIRED)

**File:** `start.sh`

Add a conditional decryption block:

```bash
# Optional: Description of what this key is for
if [ -f "$SECRETS_DIR/key_name.age" ]; then
  export ENV_VAR_NAME=$(age -d -i "$AGE_KEY" "$SECRETS_DIR/key_name.age")
fi
```

Remind the user to create the encrypted secret on the VPS:
```bash
echo "KEY_VALUE" | age -e -i /root/.age/key.txt -o /opt/jarvis/secrets/key_name.age
```

### 3h. Gateway Tool File (GATEWAY ONLY)

**File:** `bot/tools/<name>.js`

Create a gateway tool following the pattern in `bot/tools/notion.js` or
`bot/tools/google-workspace.js`. Key elements:

- `VALID_ACTIONS` array (used as schema enum)
- `WRITE_ACTIONS` set (for gateways with write operations)
- Gateway class with lazy MCP client connection and auto-reconnect
- Tool definition with action dispatch
- `isAvailable()` check based on required env vars
- Optional `systemPromptNote`

### 3i. tools/index.js — Tool Registry (GATEWAY ONLY)

**File:** `bot/tools/index.js`

Import the gateway tool and add to `ALL_TOOLS`. If the gateway has write
actions or requires Agent SDK enforcement, also add to `RESTRICTED_TOOLS`.

### 3j. router.js — Keyword Patterns (OPTIONAL)

**File:** `bot/lib/router.js`

Only needed if the MCP adds capabilities that users would explicitly request
by keyword (e.g., "check my email" routes to Claude because Gmail needs MCP).

NOT needed if tools are used autonomously during existing task types (e.g.,
Ref doc lookup during coding tasks — coding patterns already route to Claude).

## Step 4: Verification

After all changes, verify completeness. For each tool name, grep across all
registration files:

```
grep -r "tool_name" bot/lib/autonomy.js bot/lib/messenger.js bot/lib/providers/agent-sdk.js
```

Every tool must appear in all three files. Also verify:
- Workflow file has valid frontmatter (`name:` and `description:`)
- `start.sh` has decryption block if auth is needed
- `.mcp.json` matches `agent-sdk.js` mcpServers (for stdio MCPs)

## Step 5: Summary

Present a summary of all changes:
- Files modified (with line numbers)
- Tools registered and their security tier
- Any optional steps skipped and why
- VPS setup steps needed (secret creation, service restart)
