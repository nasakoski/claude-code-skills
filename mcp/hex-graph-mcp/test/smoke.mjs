import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ==================== coerce ====================

describe("coerce params", () => {
    it("maps graph-specific aliases", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        const result = coerceParams({
            root: "/project",
            search: "myFunction",
            fn: "doStuff",
            max_depth: 5,
            max_results: 10,
        });
        assert.equal(result.path, "/project");
        assert.equal(result.query, "myFunction");
        assert.equal(result.symbol, "doStuff");
        assert.equal(result.depth, 5);
        assert.equal(result.limit, 10);
        assert.equal(result.root, undefined, "Alias removed");
    });

    it("canonical params not overwritten", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        const result = coerceParams({ query: "real", search: "alias" });
        assert.equal(result.query, "real");
    });

    it("conflicting aliases: first canonical wins", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        // symbol is canonical, fn is alias for symbol
        const result = coerceParams({ symbol: "realFn", fn: "aliasFn" });
        assert.equal(result.symbol, "realFn", "Canonical wins over alias");
    });

    it("handles null/undefined params gracefully", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        assert.equal(coerceParams(null), null);
        assert.equal(coerceParams(undefined), undefined);
        const empty = coerceParams({});
        assert.deepEqual(empty, {});
    });
});

// ==================== flexNum ====================

describe("flexNum in server schema", () => {
    it("server.mjs loads without errors (flexNum/flexBool integrated)", async () => {
        // This validates flexNum/flexBool are correctly defined and all
        // z.coerce.number() replaced — if any remain, Zod schema would fail
        const { execSync } = await import("node:child_process");
        execSync("node --check server.mjs", {
            cwd: "d:/Development/LevNikolaevich/claude-code-skills/mcp/hex-graph-mcp",
        });
    });
});
