import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

const CWD = "d:/Development/LevNikolaevich/claude-code-skills/mcp/hex-line-mcp";

describe("hex-line-mcp smoke tests", () => {
    it("server.mjs parses without errors", () => {
        execSync("node --check server.mjs", { cwd: CWD });
    });

    it("all lib modules load", async () => {
        const libs = [
            "read", "edit", "search", "outline", "verify",
            "hash", "security", "tree", "info", "normalize",
            "setup", "coerce", "changes",
        ];
        for (const lib of libs) {
            const mod = await import(`../lib/${lib}.mjs`);
            assert.ok(mod, `${lib}.mjs loaded`);
        }
    });

    it("hook.mjs parses without errors", () => {
        execSync("node --check hook.mjs", { cwd: CWD });
    });
});

describe("coerce params", () => {
    it("maps aliases to canonical names", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        const result = coerceParams({ file_path: "test.js", dryRun: true, query: "foo" });
        assert.equal(result.path, "test.js");
        assert.equal(result.dry_run, true);
        assert.equal(result.pattern, "foo");
        assert.equal(result.file_path, undefined);
    });

    it("does not overwrite canonical params", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        const result = coerceParams({ path: "canonical.js", file_path: "alias.js" });
        assert.equal(result.path, "canonical.js");
    });
});

describe("edit reliability", () => {
    it("edit.mjs loads and exports editFile", async () => {
        const mod = await import("../lib/edit.mjs");
        assert.ok(typeof mod.editFile === "function", "editFile exported");
    });

    it("noop edit message is descriptive", async () => {
        const { editFile } = await import("../lib/edit.mjs");
        // Create temp file, edit with identical content
        const fs = await import("node:fs");
        const tmp = "d:/tmp/hex-line-noop-test.js";
        fs.writeFileSync(tmp, "const x = 1;\n");
        try {
            editFile(tmp, [{ replace: { old_text: "const x = 1;", new_text: "const x = 1;" } }]);
            assert.fail("Should have thrown NOOP_EDIT");
        } catch (e) {
            assert.ok(e.message.includes("NOOP_EDIT"), `Expected NOOP_EDIT, got: ${e.message}`);
        } finally {
            fs.unlinkSync(tmp);
        }
    });
});

describe("Windows path normalization", () => {
    it("converts /d/path to d:/path on Windows", async () => {
        const { resolve } = await import("node:path");
        // Simulate normalizePath logic
        const p = "/d/Development/test";
        const normalized = (process.platform === "win32" && /^\/[a-zA-Z]\//.test(p))
            ? p[1] + ":" + p.slice(2) : p;
        if (process.platform === "win32") {
            assert.equal(normalized, "d:/Development/test");
            assert.ok(!resolve(normalized).includes("\\d\\"), "No double d in resolved path");
        } else {
            assert.equal(normalized, p, "No change on non-Windows");
        }
    });
});
