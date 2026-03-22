import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CWD = "d:/Development/LevNikolaevich/claude-code-skills/mcp/hex-line-mcp";

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

describe("coerce params", () => {
    it("maps aliases and removes originals", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        const result = coerceParams({ file_path: "test.js", dryRun: true, query: "foo" });
        assert.equal(result.path, "test.js");
        assert.equal(result.dry_run, true);
        assert.equal(result.pattern, "foo");
        assert.equal(result.file_path, undefined);
    });

    it("canonical params not overwritten by aliases", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        const result = coerceParams({ path: "canonical.js", file_path: "alias.js" });
        assert.equal(result.path, "canonical.js");
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
    it("NOOP_EDIT when replacing with identical content", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const tmp = "d:/tmp/hex-test-noop.js";
        fs.writeFileSync(tmp, "const x = 1;\n");
        try {
            editFile(tmp, [{ replace: { old_text: "const x = 1;", new_text: "const x = 1;", all: true } }]);
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
                }]);
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

    it("TEXT_NOT_FOUND error includes hash-annotated snippet", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const tmp = "d:/tmp/hex-test-notfound.js";
        fs.writeFileSync(tmp, "const a = 1;\nconst b = 2;\n");
        try {
            editFile(tmp, [{ replace: { old_text: "nonexistent text", new_text: "x", all: true } }]);
            assert.fail("Should have thrown");
        } catch (e) {
            assert.ok(e.message.includes("TEXT_NOT_FOUND"));
            assert.ok(/[a-z2-7]{2}\.\d+\t/.test(e.message), "Has hash annotations");
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("text replace with regex special chars in old_text", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const tmp = "d:/tmp/hex-test-regex.js";
        fs.writeFileSync(tmp, "arr.filter((x) => x > 0);\n");
        try {
            editFile(tmp, [{ replace: { old_text: "arr.filter((x) => x > 0)", new_text: "arr.filter((x) => x >= 0)", all: true } }]);
            const written = fs.readFileSync(tmp, "utf-8");
            assert.ok(written.includes("x >= 0"), "Regex chars handled safely");
        } finally {
            fs.unlinkSync(tmp);
        }
    });
});

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

    it("NOOP_EDIT says 'already contains' not 'Re-read'", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const tmp = "d:/tmp/hex-test-noop2.js";
        fs.writeFileSync(tmp, "const x = 1;\n");
        try {
            editFile(tmp, [{ replace: { old_text: "const x = 1;", new_text: "const x = 1;", all: true } }]);
            assert.fail("Should have thrown");
        } catch (e) {
            assert.ok(e.message.includes("already contains"), "New message");
            assert.ok(!e.message.includes("Re-read"), "Old message removed");
        } finally {
            fs.unlinkSync(tmp);
        }
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

describe("edit_file uniqueness replace", () => {
    it("unique text replaced without all:true", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const tmp = CWD + "/test/tmp_unique_replace.txt";
        fs.writeFileSync(tmp, "line one\nline two unique marker\nline three\n");
        try {
            const result = editFile(tmp, [{ replace: { old_text: "unique marker", new_text: "replaced marker" } }]);
            assert.ok(result.includes("replaced marker"), "unique text should be replaced");
            assert.ok(result.includes("Post-edit"), "response should include post-edit context");
            assert.ok(result.includes("checksum:"), "response should include checksum");
            assert.ok(result.includes("file:"), "response should include file checksum");
            const content = fs.readFileSync(tmp, "utf-8");
            assert.ok(content.includes("replaced marker"), "file should contain replaced text");
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    it("ambiguous text throws AMBIGUOUS_MATCH", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        const tmp = CWD + "/test/tmp_ambiguous.txt";
        fs.writeFileSync(tmp, "hello world\nhello world\nhello world\n");
        try {
            assert.throws(() => {
                editFile(tmp, [{ replace: { old_text: "hello world", new_text: "bye" } }]);
            }, /AMBIGUOUS_MATCH.*3 times/);
        } finally {
            fs.unlinkSync(tmp);
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
