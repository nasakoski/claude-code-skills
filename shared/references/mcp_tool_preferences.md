# Tool Preferences for Code Editing

Hash-verified editing for code files via bundled `hashline.mjs`.

## hashline.mjs (bundled)

**Detection:** Check if `shared/tools/hashline.mjs` exists relative to skills repo root.

**Usage via Bash tool:**

```bash
# Read with hash anchors
node shared/tools/hashline.mjs read <file> [--offset N] [--limit N]
# Output: LINE:HASH|content (e.g., "42:b1c2|const x = 5;")

# Edit with hash verification (rejects if file changed since read)
node shared/tools/hashline.mjs edit <file> --edits-file <json-path>
# Edits JSON: [{"anchor": "42:b1c2", "text": "const x = 10;"}]

# Search with hash refs + context
node shared/tools/hashline.mjs grep <pattern> [path] [--glob "*.ts"] [-B 2] [-A 2]
```

**Workflow:** read -> note anchors -> edit by anchor -> hash mismatch = retry read.

**Features:** fuzzy matching (+-5 lines), batch edits, range replace, insert-after, grep context.

## Detection Sequence

At start of code-editing task (first match wins):
1. **hashline.mjs** -- check `shared/tools/hashline.mjs` exists. If yes: use via Bash
2. **Standard tools** -- fallback. Use built-in Read/Edit/Write/Grep. Always works.

## When to Use

- **USE for CODE files** (.ts, .js, .py, .go, .rs, .java, etc.) -- precision matters
- **DO NOT use for:** JSON configs, small YAML, markdown, .md files -- standard tools are fine
- **Fallback:** If hashline.mjs not found, use standard tools. No error.

---
**Version:** 3.0.0
**Last Updated:** 2026-03-19
