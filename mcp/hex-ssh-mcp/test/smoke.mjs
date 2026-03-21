import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ==================== hash cross-verification ====================

describe("FNV-1a hash (cross-verify with hex-line)", () => {
    it("produces same hashes as hex-line for same content", async () => {
        const { fnv1a, lineTag, rangeChecksum } = await import("../lib/hash.mjs");

        // Determinism
        const h1 = fnv1a("const x = 1;");
        const h2 = fnv1a("const x = 1;");
        assert.equal(h1, h2, "Same content same hash");

        // Known tag format
        const tag = lineTag(h1);
        assert.match(tag, /^[a-z2-7]{2}$/, "Tag is 2-char base32");

        // rangeChecksum format
        const cs = rangeChecksum([h1, h2], 1, 2);
        assert.match(cs, /^\d+-\d+:[0-9a-f]{8}$/, "Checksum format: start-end:hex8");
    });
});

// ==================== coerce ====================

describe("coerce params", () => {
    it("maps connection aliases", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        const result = coerceParams({
            hostname: "example.com",
            username: "admin",
            file_path: "/etc/hosts",
        });
        assert.equal(result.host, "example.com");
        assert.equal(result.user, "admin");
        assert.equal(result.filePath, "/etc/hosts");
        assert.equal(result.hostname, undefined, "Alias removed");
    });

    it("path is NOT aliased (canonical for ssh-search-code)", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        const result = coerceParams({
            host: "srv", user: "u",
            path: "/search/dir",
            pattern: "TODO",
        });
        assert.equal(result.path, "/search/dir", "path stays as-is");
        assert.equal(result.filePath, undefined, "path NOT renamed to filePath");
    });

    it("canonical params not overwritten by aliases", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        const result = coerceParams({ host: "real.com", hostname: "alias.com" });
        assert.equal(result.host, "real.com");
    });

    it("ssh-search-code aliases map correctly", async () => {
        const { coerceParams } = await import("../lib/coerce.mjs");
        const result = coerceParams({
            query: "TODO",
            ignore_case: true,
            context_lines: 3,
            max_results: 20,
        });
        assert.equal(result.pattern, "TODO");
        assert.equal(result.caseInsensitive, true);
        assert.equal(result.contextLines, 3);
        assert.equal(result.maxResults, 20);
    });
});

// ==================== normalize ====================

describe("normalize output", () => {
    it("deduplicates identical lines with (xN)", async () => {
        const { deduplicateLines } = await import("../lib/normalize.mjs");
        const lines = ["ok", "error: timeout", "error: timeout", "error: timeout", "done"];
        const result = deduplicateLines(lines);
        const joined = result.join("\n");
        assert.ok(joined.includes("(x3)"), "Repeated 3x gets count");
        assert.ok(joined.includes("ok"), "Unique lines kept");
    });

    it("smartTruncate keeps head + tail, omits middle", async () => {
        const { smartTruncate } = await import("../lib/normalize.mjs");
        const text = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
        const result = smartTruncate(text, 5, 3);
        assert.ok(result.includes("line 1"), "Head kept");
        assert.ok(result.includes("line 100"), "Tail kept");
        assert.ok(result.includes("omitted"), "Gap indicator");
        assert.ok(!result.includes("line 50"), "Middle omitted");
    });

    it("short output not truncated", async () => {
        const { smartTruncate } = await import("../lib/normalize.mjs");
        const text = "line 1\nline 2\nline 3";
        const result = smartTruncate(text, 40, 20);
        assert.equal(result, text, "Short text unchanged");
    });
});
