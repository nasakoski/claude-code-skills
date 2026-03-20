import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

describe("hex-ssh-mcp smoke tests", () => {
    it("server.mjs parses without errors", () => {
        execSync("node --check server.mjs", {
            cwd: "d:/Development/LevNikolaevich/claude-code-skills/mcp/hex-ssh-mcp",
        });
    });

    it("all lib modules load", async () => {
        const libs = ["hash", "ssh-client", "normalize"];
        for (const lib of libs) {
            const mod = await import(`../lib/${lib}.mjs`);
            assert.ok(mod, `${lib}.mjs loaded`);
        }
    });
});
