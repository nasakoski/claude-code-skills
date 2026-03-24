import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = resolve(__dirname, "../hook.mjs");
const require = createRequire(import.meta.url);
const HAS_GRAPH_SQLITE = (() => {
    try {
        require("better-sqlite3");
        return true;
    } catch {
        return false;
    }
})();

function runHook(hookEvent, toolName, toolInput, extra = {}) {
    return new Promise((res) => {
        const child = execFile("node", [HOOK_PATH], { stdio: ["pipe", "pipe", "pipe"] }, (error, stdout, stderr) => {
            res({ code: error ? error.code : 0, stdout, stderr });
        });
        child.stdin.write(JSON.stringify({
            hook_event_name: hookEvent,
            tool_name: toolName,
            tool_input: toolInput,
            ...extra
        }));
        child.stdin.end();
    });
}

const CWD = "d:/Development/LevNikolaevich/claude-code-skills/mcp/hex-line-mcp";

function makeTempRepo(prefix, files) {
    const dir = fs.mkdtempSync(join(tmpdir(), prefix));
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = join(dir, relPath);
        fs.mkdirSync(dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    return dir;
}

async function indexGraphRepo(dir) {
    const { indexProject } = await import("../../hex-graph-mcp/lib/indexer.mjs");
    const { _resetGraphDBCache } = await import("../lib/graph-enrich.mjs");
    await indexProject(dir);
    _resetGraphDBCache();
}

async function closeGraphRepo(dir) {
    const { getStore } = await import("../../hex-graph-mcp/lib/store.mjs");
    getStore(dir).close();
}

// ==================== hash ====================

describe("FNV-1a hash", () => {
    it("deterministic: same content → same hash, whitespace normalized", async () => {
        const { fnv1a, lineTag } = await import("../lib/hash.mjs");
        const h1 = fnv1a("const x = 1;");
        const h2 = fnv1a("const x = 1;");
        assert.equal(h1, h2, "Same content same hash");

        // Whitespace normalization: trailing spaces, tabs vs spaces
        const h3 = fnv1a("const x = 1;  ");
        const h4 = fnv1a("const x = 1;\t");
        assert.equal(h3, h4, "Trailing whitespace normalized");

        // Tag is 2-char from known alphabet
        const tag = lineTag(h1);
        assert.match(tag, /^[a-z2-7]{2}$/, "Tag is 2 chars from base32 alphabet");
    });

    it("rangeChecksum detects single-line change", async () => {
        const { fnv1a, rangeChecksum } = await import("../lib/hash.mjs");
        const lines1 = ["line one", "line two", "line three"].map(fnv1a);
        const lines2 = ["line one", "LINE TWO", "line three"].map(fnv1a);
        const cs1 = rangeChecksum(lines1, 1, 3);
        const cs2 = rangeChecksum(lines2, 1, 3);
        assert.notEqual(cs1, cs2, "Changed line changes checksum");

        // Same lines → same checksum
        const cs3 = rangeChecksum(lines1, 1, 3);
        assert.equal(cs1, cs3, "Unchanged lines same checksum");
    });
});

// ==================== coerce ====================

describe("coerce params (identity — no aliases)", () => {
    it("passes canonical params through unchanged", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        const result = coerceParams({ path: "test.js", dry_run: true, pattern: "foo" });
        assert.equal(result.path, "test.js");
        assert.equal(result.dry_run, true);
        assert.equal(result.pattern, "foo");
    });

    it("does not normalize old aliases", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        const result = coerceParams({ file_path: "test.js", dryRun: true, query: "foo" });
        assert.equal(result.file_path, "test.js");  // NOT mapped to path
        assert.equal(result.path, undefined);        // canonical not set
        assert.equal(result.dryRun, true);            // NOT mapped to dry_run
        assert.equal(result.query, "foo");            // NOT mapped to pattern
    });
});

// ==================== normalize ====================

describe("normalize output", () => {
    it("deduplicates identical lines with (xN) counts", async () => {
        const { deduplicateLines } = await import("../lib/normalize.mjs");
        const lines = ["ok", "error: timeout", "error: timeout", "error: timeout", "done"];
        const result = deduplicateLines(lines);
        const joined = result.join("\n");
        assert.ok(joined.includes("(x3)"), "Repeated line gets (x3) count");
        assert.ok(joined.includes("ok"), "Unique lines preserved");
        assert.ok(joined.includes("done"), "Unique lines preserved");
    });

    it("smartTruncate keeps head and tail", async () => {
        const { smartTruncate } = await import("../lib/normalize.mjs");
        const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
        const result = smartTruncate(lines.join("\n"), 5, 3);
        assert.ok(result.includes("line 1"), "First line kept");
        assert.ok(result.includes("line 5"), "5th line kept (head)");
        assert.ok(result.includes("line 100"), "Last line kept (tail)");
        assert.ok(result.includes("omitted"), "Gap indicator present");
        assert.ok(!result.includes("line 50"), "Middle line omitted");
    });
});

// ==================== edit ====================

describe("edit business logic", () => {
    it("NOOP_EDIT when set_line produces identical content", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const { fnv1a, lineTag } = await import("../lib/hash.mjs");
        const tmp = "d:/tmp/hex-test-noop.js";
        fs.writeFileSync(tmp, "const x = 1;\n");
        try {
            const tag = lineTag(fnv1a("const x = 1;"));
            editFile(tmp, [{ set_line: { anchor: `${tag}.1`, new_text: "const x = 1;" } }]);
            assert.fail("Should have thrown NOOP_EDIT");
        } catch (e) {
            assert.ok(e.message.includes("NOOP_EDIT"));
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("replace_lines preserves boundary content (no strip)", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const { fnv1a, lineTag, rangeChecksum } = await import("../lib/hash.mjs");
        const tmp = "d:/tmp/hex-test-boundary.js";
        const content = "function foo() {\n    const x = 1;\n    return x;\n}\n";
        fs.writeFileSync(tmp, content);
        try {
            const lines = content.split("\n");
            const startTag = lineTag(fnv1a(lines[1]));
            const endTag = lineTag(fnv1a(lines[2]));
            const rc = rangeChecksum([fnv1a(lines[1]), fnv1a(lines[2])], 2, 3);
            editFile(tmp, [{
                replace_lines: {
                    start_anchor: `${startTag}.2`,
                    end_anchor: `${endTag}.3`,
                    new_text: "    const x = 1;\n    const y = 2;\n    return x;",
                    range_checksum: rc
                }
            }]);
            const written = fs.readFileSync(tmp, "utf-8");
            assert.ok(written.includes("const x = 1;"), "Start boundary preserved");
            assert.ok(written.includes("return x;"), "End boundary preserved");
            assert.ok(written.includes("const y = 2;"), "New content present");
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("replace_lines accepts wider checksum range than anchor range", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const { fnv1a, lineTag, rangeChecksum } = await import("../lib/hash.mjs");
        const tmp = "d:/tmp/hex-test-wider-cs.js";
        const content = "line1\nline2\nline3\nline4\nline5\n";
        fs.writeFileSync(tmp, content);
        try {
            const lines = content.split("\n");
            const hashes = lines.slice(0, 5).map(l => fnv1a(l));
            const rc = rangeChecksum(hashes, 1, 5);
            const startTag = lineTag(fnv1a(lines[1]));
            const endTag = lineTag(fnv1a(lines[2]));
            editFile(tmp, [{
                replace_lines: {
                    start_anchor: `${startTag}.2`,
                    end_anchor: `${endTag}.3`,
                    new_text: "replaced2\nreplaced3",
                    range_checksum: rc
                }
            }]);
            const written = fs.readFileSync(tmp, "utf-8");
            assert.ok(written.includes("replaced2"), "Edit applied with wider checksum");
            assert.ok(written.includes("line1"), "Untouched line preserved");
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("replace_lines detects stale content outside anchor range but inside checksum", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const { fnv1a, lineTag, rangeChecksum } = await import("../lib/hash.mjs");
        const tmp = "d:/tmp/hex-test-stale-outside.js";
        const content = "line1\nline2\nline3\nline4\nline5\n";
        fs.writeFileSync(tmp, content);
        try {
            const lines = content.split("\n");
            const hashes = lines.slice(0, 5).map(l => fnv1a(l));
            const rc = rangeChecksum(hashes, 1, 5);
            const startTag = lineTag(fnv1a(lines[1]));
            const endTag = lineTag(fnv1a(lines[2]));
            fs.writeFileSync(tmp, "line1\nline2\nline3\nMODIFIED\nline5\n");
            assert.throws(() => {
                editFile(tmp, [{
                    replace_lines: {
                        start_anchor: `${startTag}.2`,
                        end_anchor: `${endTag}.3`,
                        new_text: "replaced",
                        range_checksum: rc
                    }
                }], { conflictPolicy: "strict" });
            }, /mismatch/i, "Stale content outside anchors detected");
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("set_line preserves verbatim indent (no auto-fix)", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const { fnv1a, lineTag } = await import("../lib/hash.mjs");
        const tmp = "d:/tmp/hex-test-indent.js";
        fs.writeFileSync(tmp, "function foo() {\n    const x = 1;\n}\n");
        try {
            const lines = "function foo() {\n    const x = 1;\n}\n".split("\n");
            const tag = lineTag(fnv1a(lines[1]));
            editFile(tmp, [{ set_line: { anchor: `${tag}.2`, new_text: "  const x = 2;" } }]);
            const written = fs.readFileSync(tmp, "utf-8");
            assert.ok(written.includes("  const x = 2;"), "2-space preserved");
            assert.ok(!written.includes("    const x = 2;"), "NOT auto-fixed to 4");
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("replace throws REPLACE_REMOVED with helpful message", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const tmp = "d:/tmp/hex-test-notfound.js";
        fs.writeFileSync(tmp, "const a = 1;\nconst b = 2;\n");
        try {
            editFile(tmp, [{ replace: { old_text: "nonexistent text", new_text: "x", all: true } }]);
            assert.fail("Should have thrown");
        } catch (e) {
            assert.ok(e.message.includes("REPLACE_REMOVED"), "Error is REPLACE_REMOVED");
            assert.ok(e.message.includes("set_line"), "Mentions set_line alternative");
            assert.ok(e.message.includes("bulk_replace"), "Mentions bulk_replace alternative");
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("conservative mode auto-rebases non-overlapping stale replace_lines edits", async () => {
        const { readFile } = await import("../lib/read.mjs");
        const { editFile } = await import("../lib/edit.mjs");
        const { fnv1a, lineTag, rangeChecksum } = await import("../lib/hash.mjs");
        const tmp = "d:/tmp/hex-test-autorebase.js";
        const content = "head1\nhead2\ntargetA\ntargetB\ntail\n";
        fs.writeFileSync(tmp, content);
        try {
            const lines = content.split("\n");
            const baseRead = readFile(tmp, { offset: 1, limit: 5 });
            const baseRevision = baseRead.match(/revision: (\S+)/)?.[1];
            assert.ok(baseRevision, "read_file returns revision");

            const headTag = lineTag(fnv1a(lines[0]));
            editFile(tmp, [{ insert_after: { anchor: `${headTag}.1`, text: "inserted" } }]);

            const startTag = lineTag(fnv1a(lines[2]));
            const endTag = lineTag(fnv1a(lines[3]));
            const rc = rangeChecksum([fnv1a(lines[2]), fnv1a(lines[3])], 3, 4);
            const result = editFile(tmp, [{
                replace_lines: {
                    start_anchor: `${startTag}.3`,
                    end_anchor: `${endTag}.4`,
                    new_text: "targetA\nupdatedB",
                    range_checksum: rc,
                }
            }], { baseRevision, conflictPolicy: "conservative" });

            assert.ok(result.includes("status: AUTO_REBASED"), "Auto-rebase status returned");
            assert.ok(result.includes("changed_ranges:"), "Changed ranges included");
            const written = fs.readFileSync(tmp, "utf-8");
            assert.ok(written.includes("inserted"), "Prior insert preserved");
            assert.ok(written.includes("updatedB"), "Target block updated without reread");
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("conservative mode returns CONFLICT for overlapping stale edits", async () => {
        const { readFile } = await import("../lib/read.mjs");
        const { editFile } = await import("../lib/edit.mjs");
        const { fnv1a, lineTag, rangeChecksum } = await import("../lib/hash.mjs");
        const tmp = "d:/tmp/hex-test-conflict.js";
        const content = "head1\nhead2\ntargetA\ntargetB\ntail\n";
        fs.writeFileSync(tmp, content);
        try {
            const lines = content.split("\n");
            const baseRead = readFile(tmp, { offset: 1, limit: 5 });
            const baseRevision = baseRead.match(/revision: (\S+)/)?.[1];
            assert.ok(baseRevision, "read_file returns revision");

            const targetTag = lineTag(fnv1a(lines[2]));
            editFile(tmp, [{ set_line: { anchor: `${targetTag}.3`, new_text: "otherChange" } }]);

            const startTag = lineTag(fnv1a(lines[2]));
            const endTag = lineTag(fnv1a(lines[3]));
            const rc = rangeChecksum([fnv1a(lines[2]), fnv1a(lines[3])], 3, 4);
            const result = editFile(tmp, [{
                replace_lines: {
                    start_anchor: `${startTag}.3`,
                    end_anchor: `${endTag}.4`,
                    new_text: "targetA\nupdatedB",
                    range_checksum: rc,
                }
            }], { baseRevision, conflictPolicy: "conservative" });

            assert.ok(result.includes("status: CONFLICT"), "Conflict status returned");
            assert.ok(/reason: (overlap|stale_anchor)/.test(result), "Structured conflict reason returned");
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("replace_between rewrites a block without reciting old content", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const { fnv1a, lineTag } = await import("../lib/hash.mjs");
        const tmp = "d:/tmp/hex-test-replace-between.js";
        const content = [
            "function demo() {",
            "    const a = 1;",
            "    const b = 2;",
            "    return a + b;",
            "}",
            "",
        ].join("\n");
        fs.writeFileSync(tmp, content);
        try {
            const lines = content.split("\n");
            const startTag = lineTag(fnv1a(lines[0]));
            const endTag = lineTag(fnv1a(lines[4]));
            const result = editFile(tmp, [{
                replace_between: {
                    start_anchor: `${startTag}.1`,
                    end_anchor: `${endTag}.5`,
                    new_text: "function demo() {\n    return 42;\n}",
                    boundary_mode: "inclusive",
                }
            }]);

            assert.ok(result.includes("status: OK"), "Successful block rewrite");
            const written = fs.readFileSync(tmp, "utf-8");
            assert.ok(written.includes("return 42;"), "New block content written");
            assert.ok(!written.includes("const b = 2;"), "Old interior removed");
        } finally {
            fs.unlinkSync(tmp);
        }
    });
});

describe("edit error messages", () => {
    it("out-of-range error includes boundary snippet with hashes", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const tmp = "d:/tmp/hex-test-oor.js";
        fs.writeFileSync(tmp, "line1\nline2\nline3\n");
        try {
            editFile(tmp, [{ set_line: { anchor: "xx.10", new_text: "new" } }]);
            assert.fail("Should have thrown");
        } catch (e) {
            assert.ok(e.message.includes("out of range"), "Has out of range");
            assert.ok(/[a-z2-7]{2}\.\d+\t/.test(e.message), "Has hash-annotated snippet");
            assert.ok(e.message.includes("Tip:"), "Has retry tip");
        } finally {
            fs.unlinkSync(tmp);
        }
    });
});

// ==================== directory_tree ====================

describe("directory_tree pattern", () => {
    it("globToRegex escapes dots and brackets", async () => {
        const { directoryTree } = await import("../lib/tree.mjs");
        // *.mjs should NOT match "xmjs" (dot must be literal)
        const result = directoryTree(CWD + "/lib", { pattern: "*.mjs", type: "file" });
        assert.ok(result.includes("tree.mjs"));
        assert.ok(!result.includes("xmjs"), "Dot is literal, not regex wildcard");
    });

    it("pattern mode returns flat list, tree mode returns hierarchy", async () => {
        const { directoryTree } = await import("../lib/tree.mjs");
        const flat = directoryTree(CWD, { pattern: "lib", type: "dir" });
        assert.ok(flat.includes("Found"), "Pattern: flat header");
        assert.ok(flat.includes("lib/"), "Pattern: trailing slash for dirs");

        const tree = directoryTree(CWD + "/lib", { max_depth: 1 });
        assert.ok(tree.startsWith("Directory:"), "Tree: hierarchy header");
    });

    it("no matches returns descriptive message", async () => {
        const { directoryTree } = await import("../lib/tree.mjs");
        const none = directoryTree(CWD, { pattern: "nonexistent-xyz-42" });
        assert.ok(none.includes("No matches"));
    });
});

describe("directory_tree gitignore", () => {
    it("respects path-based .gitignore rules", async () => {
        const { directoryTree } = await import("../lib/tree.mjs");
        const tmp = join(tmpdir(), "hex-test-gitignore");
        fs.mkdirSync(join(tmp, "nested"), { recursive: true });
        fs.writeFileSync(join(tmp, ".gitignore"), "nested/secret.txt\n");
        fs.writeFileSync(join(tmp, "keep.txt"), "visible\n");
        fs.writeFileSync(join(tmp, "nested", "secret.txt"), "hidden\n");
        fs.writeFileSync(join(tmp, "nested", "other.txt"), "visible\n");
        try {
            const result = directoryTree(tmp);
            assert.ok(result.includes("keep.txt"), "non-ignored file visible");
            assert.ok(result.includes("other.txt"), "non-ignored nested file visible");
            assert.ok(!result.includes("secret.txt"), "path-ignored file hidden");
        } finally {
            fs.rmSync(tmp, { recursive: true });
        }
    });
});

// ==================== read_file ====================

describe("read_file output", () => {
    it("includes revision and file checksum metadata", async () => {
        const { readFile } = await import("../lib/read.mjs");
        const tmp = "d:/tmp/hex-test-read-revision.js";
        fs.writeFileSync(tmp, "const x = 1;\n");
        try {
            const result = readFile(tmp);
            assert.match(result, /revision: \S+/, "Read includes revision");
            assert.match(result, /file: 1-\d+:[0-9a-f]{8}/, "Read includes file checksum");
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("character cap triggers for files with very long lines", async () => {
        const { readFile } = await import("../lib/read.mjs");
        const tmp = "d:/tmp/hex-test-longlines.js";
        // 100 lines × 1000 chars each = 100K chars, well over 40K limit
        const longLine = "x".repeat(1000);
        fs.writeFileSync(tmp, Array.from({ length: 100 }, () => longLine).join("\n"));
        try {
            const result = readFile(tmp);
            assert.ok(result.includes("OUTPUT_CAPPED"), "Cap notice present");
            assert.ok(result.includes("offset="), "Has offset hint for continuation");
            assert.ok(result.length < 90000, `Output capped: ${result.length} chars`);
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("normal file is not capped", async () => {
        const { readFile } = await import("../lib/read.mjs");
        const result = readFile(CWD + "/lib/hash.mjs");
        assert.ok(!result.includes("OUTPUT_CAPPED"), "No cap for normal file");
    });

    it("auto-hint for large files read from start", async () => {
        const { readFile } = await import("../lib/read.mjs");
        const tmp = "d:/tmp/hex-test-large.js";
        // 300 short lines — over 200 threshold
        fs.writeFileSync(tmp, Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n"));
        try {
            const result = readFile(tmp);
            assert.ok(result.includes("Tip:"), "Auto-hint present for 300-line file");
            assert.ok(result.includes("outline"), "Hint mentions outline");
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("no auto-hint when using offset", async () => {
        const { readFile } = await import("../lib/read.mjs");
        const tmp = "d:/tmp/hex-test-offset.js";
        fs.writeFileSync(tmp, Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n"));
        try {
            const result = readFile(tmp, { offset: 50, limit: 20 });
            assert.ok(!result.includes("Tip:"), "No hint when using offset");
        } finally {
            fs.unlinkSync(tmp);
        }
    });
});

describe("graph enrichment", () => {
    it("falls back cleanly when no .hex-skills/codegraph exists", { skip: !HAS_GRAPH_SQLITE }, async () => {
        const { readFile } = await import("../lib/read.mjs");
        const tmp = join(tmpdir(), `hex-no-graph-${Date.now()}.js`);
        fs.writeFileSync(tmp, "export function solo() {}\n");
        try {
            const result = readFile(tmp);
            assert.ok(!result.includes("\nGraph:"), "No graph header without .hex-skills/codegraph");
            assert.ok(result.includes("solo"), "Standard read still works");
        } finally {
            fs.rmSync(tmp, { force: true });
        }
    });

    it("adds graph header, grep annotations, and call impact from hex-graph contract", { skip: !HAS_GRAPH_SQLITE }, async () => {
        const { readFile } = await import("../lib/read.mjs");
        const { grepSearch } = await import("../lib/search.mjs");
        const { editFile } = await import("../lib/edit.mjs");
        const { fnv1a, lineTag } = await import("../lib/hash.mjs");
        const { _resetGraphDBCache } = await import("../lib/graph-enrich.mjs");
        const repo = makeTempRepo("hex-line-graph-", {
            "a.mjs": "export function foo() {\n  return 1;\n}\n",
            "b.mjs": "import { foo } from \"./a.mjs\";\nexport function run() {\n  return foo();\n}\n",
        });
        try {
            await indexGraphRepo(repo);

            const readResult = readFile(join(repo, "a.mjs"));
            assert.ok(readResult.includes("\nGraph:"), "Graph header present");
            assert.ok(readResult.includes("foo [function 0↓ 1↑]"), "Graph header uses annotation contract");

            const grepResult = await grepSearch("export function foo", { path: join(repo, "a.mjs") });
            assert.ok(grepResult.includes("[fn 0↓ 1↑]"), "grep match annotated via graph contract");

            const anchor = `${lineTag(fnv1a("export function foo() {"))}.1`;
            const editResult = editFile(join(repo, "a.mjs"), [
                { set_line: { anchor, new_text: "export function foo() {" } },
                { set_line: { anchor: `${lineTag(fnv1a("  return 1;"))}.2`, new_text: "  return 2;" } },
            ]);
            assert.ok(editResult.includes("Call impact: 1 callers in other files"), "Edit reports call impact");
            assert.ok(editResult.includes("run (b.mjs:2)"), "Call impact names dependent caller");
        } finally {
            _resetGraphDBCache();
            await closeGraphRepo(repo);
            fs.rmSync(repo, { recursive: true, force: true });
        }
    });

    it("keeps graph DBs isolated across projects in one process", { skip: !HAS_GRAPH_SQLITE }, async () => {
        const { readFile } = await import("../lib/read.mjs");
        const { _resetGraphDBCache } = await import("../lib/graph-enrich.mjs");
        const repoA = makeTempRepo("hex-line-graph-a-", {
            "a.mjs": "export function alpha() {\n  return 1;\n}\n",
            "use-a.mjs": "import { alpha } from \"./a.mjs\";\nexport function callAlpha() {\n  return alpha();\n}\n",
        });
        const repoB = makeTempRepo("hex-line-graph-b-", {
            "b.mjs": "export function beta() {\n  return 1;\n}\n",
            "use-b.mjs": "import { beta } from \"./b.mjs\";\nexport function callBeta() {\n  return beta();\n}\n",
        });
        try {
            await indexGraphRepo(repoA);
            await indexGraphRepo(repoB);
            _resetGraphDBCache();

            const readA = readFile(join(repoA, "a.mjs"));
            const readB = readFile(join(repoB, "b.mjs"));

            assert.ok(readA.includes("alpha [function 0↓ 1↑]"), "Repo A uses its own graph");
            assert.ok(!readA.includes("beta [function"), "Repo A does not leak repo B graph");
            assert.ok(readB.includes("beta [function 0↓ 1↑]"), "Repo B uses its own graph");
            assert.ok(!readB.includes("alpha [function"), "Repo B does not leak repo A graph");
        } finally {
            _resetGraphDBCache();
            await closeGraphRepo(repoA);
            await closeGraphRepo(repoB);
            fs.rmSync(repoA, { recursive: true, force: true });
            fs.rmSync(repoB, { recursive: true, force: true });
        }
    });
});

// ==================== grep_search ====================

describe("grep_search case modes", () => {
    it("default is case-sensitive", async () => {
        const { grepSearch } = await import("../lib/search.mjs");
        // server.mjs has 'Search' (uppercase) — lowercase 'search' should miss it in CS mode
        const cs = await grepSearch("search", { path: CWD + "/server.mjs", plain: true });
        const ci = await grepSearch("search", { path: CWD + "/server.mjs", plain: true, caseInsensitive: true });
        const csCount = cs.split("\n").filter(l => l.trim()).length;
        const ciCount = ci.split("\n").filter(l => l.trim()).length;
        assert.ok(ciCount > csCount, `CI (${ciCount}) should find more than CS (${csCount})`);
    });

    it("smart_case: lowercase pattern is CI, uppercase pattern is CS", async () => {
        const { grepSearch } = await import("../lib/search.mjs");
        const lower = await grepSearch("search", { path: CWD + "/server.mjs", plain: true, smartCase: true });
        const upper = await grepSearch("Search", { path: CWD + "/server.mjs", plain: true, smartCase: true });
        const lowerCount = lower.split("\n").filter(l => l.trim()).length;
        const upperCount = upper.split("\n").filter(l => l.trim()).length;
        assert.ok(lowerCount > upperCount, `lowercase (${lowerCount}) should find more than uppercase (${upperCount})`);
    });
});

describe("grep_search output modes", () => {
    it("files mode returns only paths, count mode returns counts", async () => {
        const { grepSearch } = await import("../lib/search.mjs");
        const files = await grepSearch("export", { path: CWD + "/lib", output: "files" });
        assert.ok(files.includes("```"), "should be in code fence");
        assert.ok(!files.includes(">>"), "files mode has no hash annotations");
        assert.ok(files.includes("search.mjs") || files.includes("hash.mjs"), "should list files");

        const count = await grepSearch("export", { path: CWD + "/lib", output: "count" });
        assert.ok(count.includes(":"), "count mode has file:N format");
        assert.ok(!count.includes(">>"), "count mode has no hash annotations");
    });

    it("content mode returns checksums per group", async () => {
        const { grepSearch } = await import("../lib/search.mjs");
        const result = await grepSearch("grepSearch", { path: CWD + "/lib/search.mjs", context: 1 });
        assert.ok(result.includes(">>"), "content mode has >> match markers");
        assert.ok(result.includes("checksum:"), "content mode has per-group checksums");
        // Verify checksum format: N-N:hexhexhex
        const csMatch = result.match(/checksum: (\d+)-(\d+):([0-9a-f]{8})/);
        assert.ok(csMatch, `checksum format should be N-N:hex8, got: ${result.slice(0, 200)}`);
    });

    it("disjoint matches get separate checksums (fixture)", async () => {
        const { grepSearch } = await import("../lib/search.mjs");
        const tmp = join(tmpdir(), "hex-test-disjoint.txt");
        const content = ["MARKER_A", ...Array(10).fill("filler"), "MARKER_B"].join("\n") + "\n";
        fs.writeFileSync(tmp, content);
        try {
            const result = await grepSearch("MARKER", { path: tmp });
            const checksums = result.match(/checksum: \d+-\d+:[0-9a-f]{8}/g) || [];
            assert.ok(checksums.length >= 2, `disjoint markers should produce >=2 checksums, got ${checksums.length}`);
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("grep checksum round-trips through verify", async () => {
        const { grepSearch } = await import("../lib/search.mjs");
        const { verifyChecksums } = await import("../lib/verify.mjs");
        const tmp = join(tmpdir(), "hex-test-roundtrip.txt");
        fs.writeFileSync(tmp, "line one\nline two\nline three\n");
        try {
            const result = await grepSearch("two", { path: tmp });
            const csMatch = result.match(/checksum: (\d+-\d+:[0-9a-f]{8})/);
            assert.ok(csMatch, "grep should produce a checksum");
            const verifyResult = verifyChecksums(tmp, [csMatch[1]]);
            assert.ok(verifyResult.includes("valid"), `checksum should verify: ${verifyResult}`);
        } finally {
            fs.unlinkSync(tmp);
        }
    });
});

describe("grep_search new params", () => {
    it("literal mode disables regex", async () => {
        const { grepSearch } = await import("../lib/search.mjs");
        // '.' in regex matches any char; in literal mode matches only '.'
        const regex = await grepSearch(".", { path: CWD + "/lib/hash.mjs", plain: true });
        const literal = await grepSearch(".", { path: CWD + "/lib/hash.mjs", plain: true, literal: true });
        const regexCount = regex.split("\n").filter(l => l.trim() && !l.startsWith("```")).length;
        const litCount = literal.split("\n").filter(l => l.trim() && !l.startsWith("```")).length;
        assert.ok(regexCount > litCount, `regex (${regexCount}) should match more than literal (${litCount})`);
    });
});

describe("edit_file replace removed", () => {
    it("replace throws REPLACE_REMOVED", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const tmp = CWD + "/test/tmp_unique_replace.txt";
        fs.writeFileSync(tmp, "line one\nline two unique marker\nline three\n");
        try {
            assert.throws(() => {
                editFile(tmp, [{ replace: { old_text: "unique marker", new_text: "replaced marker" } }]);
            }, /REPLACE_REMOVED/);
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("replace with all:true also throws REPLACE_REMOVED", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const tmp = CWD + "/test/tmp_ambiguous.txt";
        fs.writeFileSync(tmp, "hello world\nhello world\nhello world\n");
        try {
            assert.throws(() => {
                editFile(tmp, [{ replace: { old_text: "hello world", new_text: "bye", all: true } }]);
            }, /REPLACE_REMOVED/);
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("bulk_replace handles text rename (replace moved here)", async () => {
        const { bulkReplace } = await import("../lib/bulk-replace.mjs");
        const tmp = "d:/tmp/hex-test-bulk-rename";
        fs.mkdirSync(tmp, { recursive: true });
        fs.writeFileSync(tmp + "/rename.txt", "hello world\nhello world\nhello world\n");
        try {
            const result = bulkReplace(tmp, "*.txt",
                [{ old: "hello world", new: "bye world" }]);
            const content = fs.readFileSync(tmp + "/rename.txt", "utf-8");
            assert.ok(!content.includes("hello world"), "no old text should remain");
            assert.equal(content.split("bye world").length - 1, 3, "all 3 replaced");
            assert.ok(result.includes("1 file"), "output reports changed file count");
        } finally {
            fs.unlinkSync(tmp + "/rename.txt");
            fs.rmdirSync(tmp);
        }
    });
});


// ==================== bulk_replace ====================

describe("bulk_replace", () => {
    it("replaces text in matched files", async () => {
        const { bulkReplace } = await import("../lib/bulk-replace.mjs");
        const tmp = "d:/tmp/hex-test-bulk";
        fs.mkdirSync(tmp, { recursive: true });
        fs.writeFileSync(tmp + "/a.txt", "hello world\n");
        fs.writeFileSync(tmp + "/b.txt", "hello planet\n");
        try {
            const result = bulkReplace(tmp, "*.txt", [{ old: "hello", new: "hi" }]);
            assert.ok(result.includes("2 changed") || result.includes("changed"), "files should be changed");
            assert.equal(fs.readFileSync(tmp + "/a.txt", "utf-8").trim(), "hi world");
            assert.equal(fs.readFileSync(tmp + "/b.txt", "utf-8").trim(), "hi planet");
        } finally {
            fs.unlinkSync(tmp + "/a.txt");
            fs.unlinkSync(tmp + "/b.txt");
            fs.rmdirSync(tmp);
        }
    });

    it("defaults to compact format with replacement counts", async () => {
        const { bulkReplace } = await import("../lib/bulk-replace.mjs");
        const tmp = "d:/tmp/hex-test-bulk-compact";
        fs.mkdirSync(tmp, { recursive: true });
        fs.writeFileSync(tmp + "/a.txt", "foo bar foo\n");
        fs.writeFileSync(tmp + "/b.txt", "foo baz\n");
        fs.writeFileSync(tmp + "/c.txt", "no match here\n");
        try {
            const result = bulkReplace(tmp, "*.txt", [{ old: "foo", new: "qux" }], { dryRun: true });
            assert.ok(result.includes("2 files changed"), "header shows changed count");
            assert.ok(result.includes("(3 replacements)"), "header shows total replacements");
            assert.ok(result.includes("1 skipped"), "header shows skipped");
            assert.ok(result.includes("a.txt: 2 replacements"), "per-file count for a.txt");
            assert.ok(result.includes("b.txt: 1 replacements"), "per-file count for b.txt");
            assert.ok(!result.includes("-") || !result.match(/^[-+]\d+\|/m), "no diff lines in compact mode");
        } finally {
            fs.unlinkSync(tmp + "/a.txt");
            fs.unlinkSync(tmp + "/b.txt");
            fs.unlinkSync(tmp + "/c.txt");
            fs.rmdirSync(tmp);
        }
    });

    it("caps per-file diff lines and total output in full mode", async () => {
        const { bulkReplace } = await import("../lib/bulk-replace.mjs");
        const { MAX_BULK_OUTPUT_CHARS, MAX_PER_FILE_DIFF_LINES } = await import("../lib/format.mjs");
        const tmp = "d:/tmp/hex-test-bulk-cap";
        fs.mkdirSync(tmp, { recursive: true });
        // Create a large file with 600 lines, each containing the target text
        const lines = Array.from({ length: 600 }, (_, i) => `line ${i} target_text here`);
        fs.writeFileSync(tmp + "/big.txt", lines.join("\n") + "\n");
        try {
            const result = bulkReplace(tmp, "*.txt", [{ old: "target_text", new: "replaced" }], { dryRun: true, format: "full" });
            assert.ok(result.includes("lines omitted"), "per-file diff should be truncated");
            assert.ok(result.length <= MAX_BULK_OUTPUT_CHARS + 100, "total output within cap (with OUTPUT_CAPPED notice)");
            assert.ok(result.includes("600 replacements") || result.includes("replacements"), "shows replacement count");
        } finally {
            fs.unlinkSync(tmp + "/big.txt");
            fs.rmdirSync(tmp);
        }
    });

    it("handles chained rules, glob {a,b}, and old===new skip", async () => {
        const { bulkReplace } = await import("../lib/bulk-replace.mjs");
        const tmp = "d:/tmp/hex-test-bulk-edge";
        fs.mkdirSync(tmp, { recursive: true });
        fs.writeFileSync(tmp + "/x.mjs", "foo calls foo\n");
        fs.writeFileSync(tmp + "/y.json", "foo here too\n");
        fs.writeFileSync(tmp + "/z.txt", "no match\n");
        try {
            // Chained: foo→bar then bar→baz (cascading — bar from rule 1 is input to rule 2)
            // old===new skip: noop rule should be ignored
            const result = bulkReplace(tmp, "*.{mjs,json}", [
                { old: "foo", new: "bar" },
                { old: "bar", new: "baz" },
                { old: "noop", new: "noop" },
            ], { dryRun: true });
            // Glob {mjs,json} matches x.mjs and y.json but not z.txt
            assert.ok(result.includes("2 files changed"), "glob {a,b} matches both extensions");
            // Chained: foo→bar→baz, so final content has "baz" not "bar"
            assert.ok(!result.includes("0 replacements"), "chained rules produce non-zero counts");
            // z.txt not in glob, x.mjs and y.json matched
            assert.ok(!result.includes("z.txt"), "z.txt excluded by glob");
        } finally {
            fs.unlinkSync(tmp + "/x.mjs");
            fs.unlinkSync(tmp + "/y.json");
            fs.unlinkSync(tmp + "/z.txt");
            fs.rmdirSync(tmp);
        }
    });
});

// ==================== changes ====================

describe("changes", () => {
    it("returns diff against HEAD for tracked file", async () => {
        const { fileChanges } = await import("../lib/changes.mjs");
        // Use a known tracked file — should return no changes or a diff
        const result = await fileChanges(CWD + "/lib/hash.mjs", "HEAD");
        assert.ok(typeof result === "string", "should return string");
        // If file is unchanged vs HEAD, result says "No changes" or shows symbols
        assert.ok(result.length > 0, "should have content");
    });
});
// ==================== isHexLineDisabled ====================

describe("isHexLineDisabled", () => {
    it("returns true when hex-line is in disabledMcpServers for cwd project", async () => {
        const { isHexLineDisabled, _resetHexLineDisabledCache } = await import("../hook.mjs");
        _resetHexLineDisabledCache();

        const tmp = "d:/tmp/hex-test-claude.json";
        const cwd = process.cwd().replace(/\\/g, "/");
        const config = {
            projects: {
                [cwd]: {
                    disabledMcpServers: ["hex-line", "hex-graph"],
                },
            },
        };
        fs.writeFileSync(tmp, JSON.stringify(config));
        try {
            const result = isHexLineDisabled(tmp);
            assert.equal(result, true, "hex-line is disabled for current project");
        } finally {
            _resetHexLineDisabledCache();
            fs.unlinkSync(tmp);
        }
    });

    it("returns false when hex-line is NOT in disabledMcpServers", async () => {
        const { isHexLineDisabled, _resetHexLineDisabledCache } = await import("../hook.mjs");
        _resetHexLineDisabledCache();

        const tmp = "d:/tmp/hex-test-claude2.json";
        const cwd = process.cwd().replace(/\\/g, "/");
        const config = {
            projects: {
                [cwd]: {
                    disabledMcpServers: ["hex-graph"],
                },
            },
        };
        fs.writeFileSync(tmp, JSON.stringify(config));
        try {
            const result = isHexLineDisabled(tmp);
            assert.equal(result, false, "hex-line is not disabled");
        } finally {
            _resetHexLineDisabledCache();
            fs.unlinkSync(tmp);
        }
    });
});

// ==================== hook subprocess ====================

describe("hook — ls redirect", () => {
    it("allows simple ls", async () => {
        const r = await runHook("PreToolUse", "Bash", { command: "ls src/" });
        assert.equal(r.code, 0);
    });
    it("allows ls -la", async () => {
        const r = await runHook("PreToolUse", "Bash", { command: "ls -la src/" });
        assert.equal(r.code, 0);
    });
    it("redirects ls -R", async () => {
        const r = await runHook("PreToolUse", "Bash", { command: "ls -R" });
        assert.notEqual(r.code, 0);
    });
    it("redirects ls -R .", async () => {
        const r = await runHook("PreToolUse", "Bash", { command: "ls -R ." });
        assert.notEqual(r.code, 0);
    });
    it("redirects ls -laR src/", async () => {
        const r = await runHook("PreToolUse", "Bash", { command: "ls -laR src/" });
        assert.notEqual(r.code, 0);
    });
    it("redirects dir /s", async () => {
        const r = await runHook("PreToolUse", "Bash", { command: "dir /s" });
        assert.notEqual(r.code, 0);
    });
    it("allows ls -al -R (documented limitation)", async () => {
        const r = await runHook("PreToolUse", "Bash", { command: "ls -al -R src/" });
        assert.equal(r.code, 0, "accepted trade-off — unusual flag ordering not caught");
    });
});

describe("hook — Read config exception", () => {
    it("allows .claude/settings.json (relative)", async () => {
        const r = await runHook("PreToolUse", "Read", { file_path: ".claude/settings.json" });
        assert.equal(r.code, 0);
    });
    it("allows ./.claude/settings.json (dot-relative)", async () => {
        const r = await runHook("PreToolUse", "Read", { file_path: "./.claude/settings.json" });
        assert.equal(r.code, 0);
    });
    it("blocks src/.claude/settings.json (not under cwd/.claude/)", async () => {
        const r = await runHook("PreToolUse", "Read", { file_path: "src/.claude/settings.json" });
        assert.notEqual(r.code, 0);
    });
    it("blocks .claude/foo.ts", async () => {
        const r = await runHook("PreToolUse", "Read", { file_path: ".claude/foo.ts" });
        assert.notEqual(r.code, 0);
    });
    it("redirects src/index.ts", async () => {
        const r = await runHook("PreToolUse", "Read", { file_path: "src/index.ts" });
        assert.notEqual(r.code, 0);
    });
    it("allows image.png (binary)", async () => {
        const r = await runHook("PreToolUse", "Read", { file_path: "image.png" });
        assert.equal(r.code, 0);
    });
    it("allows ~/.claude/settings.json (home-relative)", async () => {
        const r = await runHook("PreToolUse", "Read", { file_path: "~/.claude/settings.json" });
        assert.equal(r.code, 0);
    });
    it("allows absolute .claude/settings.json (uppercase drive)", async () => {
        const cwd = process.cwd().replace(/\\/g, "/");
        const r = await runHook("PreToolUse", "Read", { file_path: cwd + "/.claude/settings.json" });
        assert.equal(r.code, 0);
    });
    it("allows absolute .claude/settings.json (lowercase drive)", async () => {
        const cwd = process.cwd().replace(/\\/g, "/");
        const lower = cwd[0].toLowerCase() + cwd.slice(1);
        const r = await runHook("PreToolUse", "Read", { file_path: lower + "/.claude/settings.json" });
        assert.equal(r.code, 0);
    });
});

describe("hook — regressions", () => {
    it("redirects cat file.ts", async () => {
        const r = await runHook("PreToolUse", "Bash", { command: "cat file.ts" });
        assert.notEqual(r.code, 0);
    });
    it("blocks rm -rf /", async () => {
        const r = await runHook("PreToolUse", "Bash", { command: "rm -rf /" });
        assert.notEqual(r.code, 0);
    });
    it("allows # hex-confirmed bypass", async () => {
        const r = await runHook("PreToolUse", "Bash", { command: "rm -rf / # hex-confirmed" });
        assert.equal(r.code, 0);
    });
});

// ==================== PostToolUse RTK ====================

describe("PostToolUse RTK", () => {
    function makeLines(n, prefix = "line") {
        return Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join("\n");
    }

    it("short output passthrough (< threshold)", async () => {
        const r = await runHook("PostToolUse", "Bash", { command: "echo ok" }, {
            tool_response: makeLines(10)
        });
        assert.equal(r.code, 0);
        assert.equal(r.stderr, "");
    });

    it("long output filtering (>= threshold)", async () => {
        const r = await runHook("PostToolUse", "Bash", { command: "npm install" }, {
            tool_response: makeLines(100)
        });
        assert.equal(r.code, 2);
        assert.ok(r.stderr.includes("RTK FILTERED"), "should contain RTK FILTERED header");
        assert.ok(r.stderr.includes("(100 lines ->"), "should contain original count");
        assert.ok(r.stderr.includes("lines omitted"), "should contain truncation marker");
        // Head preserved (lines 1-15)
        assert.ok(r.stderr.includes("line 1"), "should contain first line");
        assert.ok(r.stderr.includes("line 15"), "should contain 15th line");
        // Tail preserved (lines 86-100)
        assert.ok(r.stderr.includes("line 100"), "should contain last line");
        // Middle omitted
        assert.ok(!r.stderr.includes("line 50"), "should NOT contain middle line");
    });

    it("object with stdout", async () => {
        const r = await runHook("PostToolUse", "Bash", { command: "npm install" }, {
            tool_response: { stdout: makeLines(100) }
        });
        assert.equal(r.code, 2);
        assert.ok(r.stderr.includes("RTK FILTERED"));
    });

    it("object with stderr only", async () => {
        const r = await runHook("PostToolUse", "Bash", { command: "npm install" }, {
            tool_response: { stderr: makeLines(100, "err") }
        });
        assert.equal(r.code, 2);
        assert.ok(r.stderr.includes("RTK FILTERED"));
        assert.ok(r.stderr.includes("err 1"), "should contain stderr content");
    });

    it("object with both streams — combined, stdout before stderr", async () => {
        const r = await runHook("PostToolUse", "Bash", { command: "npm install" }, {
            tool_response: {
                stdout: makeLines(50, "STDOUT_MARKER"),
                stderr: makeLines(60, "STDERR_MARKER")
            }
        });
        assert.equal(r.code, 2);
        assert.ok(r.stderr.includes("STDOUT_MARKER"), "should contain stdout content");
        assert.ok(r.stderr.includes("STDERR_MARKER"), "should contain stderr content");
        // Verify order: stdout before stderr
        const stdoutPos = r.stderr.indexOf("STDOUT_MARKER");
        const stderrPos = r.stderr.indexOf("STDERR_MARKER");
        assert.ok(stdoutPos < stderrPos, "stdout should appear before stderr");
    });

    it("missing tool_response", async () => {
        const r = await runHook("PostToolUse", "Bash", { command: "echo ok" });
        assert.equal(r.code, 0);
        assert.equal(r.stderr, "");
    });

    it("non-Bash tool", async () => {
        const r = await runHook("PostToolUse", "Read", { file_path: "/tmp/x" }, {
            tool_response: makeLines(100)
        });
        assert.equal(r.code, 0);
        assert.equal(r.stderr, "");
    });
});

// ==================== WASM dependency contract ====================

describe("WASM dependency contract", () => {
    it("package.json declares tree-sitter runtime deps", () => {
        const pkg = JSON.parse(fs.readFileSync(
            resolve(__dirname, "../package.json"), "utf8"
        ));
        const deps = pkg.dependencies || {};
        assert.ok(deps["web-tree-sitter"],
            "web-tree-sitter missing from dependencies — outline will fail after npm install");
        assert.ok(deps["tree-sitter-wasms"],
            "tree-sitter-wasms missing from dependencies — WASM grammars unavailable after npm install");
    });

    it("WASM files exist for all supported grammars", () => {
        const pkgPath = require.resolve("tree-sitter-wasms/package.json");
        const grammars = [
            "javascript", "typescript", "tsx", "python", "go", "rust",
            "java", "c", "cpp", "c_sharp", "ruby", "php", "kotlin", "swift", "bash"
        ];
        const missing = grammars.filter(g => {
            const wasm = resolve(pkgPath, "..", "out", `tree-sitter-${g}.wasm`);
            return !fs.existsSync(wasm);
        });
        assert.deepEqual(missing, [], `WASM files missing for: ${missing.join(", ")}`);
    });
});
