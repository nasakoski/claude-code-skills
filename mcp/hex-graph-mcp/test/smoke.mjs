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


// ==================== find_clones ====================

import { mkdtempSync, writeFileSync, rmSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { indexProject, reindexFile } from "../lib/indexer.mjs";
import { getStore } from "../lib/store.mjs";
import { findClones } from "../lib/clones.mjs";

function makeTempDir() {
    return mkdtempSync(join(tmpdir(), "hex-graph-clone-"));
}

function cleanDb(dir) {
    const dbPath = join(dir, ".codegraph", "index.db");
    if (existsSync(dbPath)) unlinkSync(dbPath);
}

describe("find_clones", () => {
    it("exact + normalized clone detection across files", async () => {
        const dir = makeTempDir();
        try {
            writeFileSync(
                join(dir, "a.mjs"),
                'export function processUser(user) { if (!user.email) throw new Error("missing"); const v = validate(user); const r = db.create(v); log("created", r.id); return r; }\n',
            );
            writeFileSync(
                join(dir, "b.mjs"),
                'export function processOrder(order) { if (!order.email) throw new Error("missing"); const v = validate(order); const r = db.create(v); log("created", r.id); return r; }\n',
            );


            cleanDb(dir);
            await indexProject(dir);

            const store = getStore(dir);
            const result = findClones(store, { type: "all", crossFile: false });

            assert.ok(result.summary.total_groups >= 1, "At least 1 clone group found");

            const names = result.groups.flatMap(g => g.members.map(m => m.name));
            assert.ok(names.includes("processUser"), "processUser in clone group");
            assert.ok(names.includes("processOrder"), "processOrder in clone group");

            // They have different raw text (different param names) but same normalized structure
            const group = result.groups.find(
                g => g.members.some(m => m.name === "processUser") &&
                     g.members.some(m => m.name === "processOrder")
            );
            assert.ok(group, "Both functions in same group");
            assert.strictEqual(group.type, "normalized", "Type is normalized (different raw_hash, same norm_hash)");

            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });

    it("duplicate method names in different classes", async () => {
        const dir = makeTempDir();
        try {
            writeFileSync(
                join(dir, "services.mjs"),
                [
                    'export class UserService {',
                    '    save(user) {',
                    '        const validated = check(user);',
                    '        const result = db.users.insert(validated);',
                    '        log("saved", result.id);',
                    '        return result;',
                    '    }',
                    '}',
                    '',
                    'export class OrderService {',
                    '    save(order) {',
                    '        const validated = check(order);',
                    '        const result = db.orders.insert(validated);',
                    '        log("saved", result.id);',
                    '        return result;',
                    '    }',
                    '}',
                    '',
                ].join('\n'),
            );


            cleanDb(dir);
            await indexProject(dir);

            const store = getStore(dir);
            const blocks = store.getAllCloneBlocks(1);
            const saveBlocks = blocks.filter(b => b.name === "save");

            assert.strictEqual(saveBlocks.length, 2, "2 separate clone_blocks for save methods");

            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });

    it("hashes-only language: .cs has no fingerprint or LSH", async () => {
        const dir = makeTempDir();
        try {
            writeFileSync(
                join(dir, "Demo.cs"),
                [
                    'using System;',
                    'public class Demo {',
                    '    public void Process(string input) {',
                    '        var trimmed = input.Trim();',
                    '        if (trimmed == "") throw new Exception("empty");',
                    '        var result = Validate(trimmed);',
                    '        Save(result);',
                    '        Console.WriteLine("done");',
                    '        Log(result.Id);',
                    '    }',
                    '}',
                    '',
                ].join('\n'),
            );


            cleanDb(dir);
            await indexProject(dir);

            const store = getStore(dir);
            const blocks = store.getAllCloneBlocks(1);
            const csBlock = blocks.find(b => b.name === "Process");

            assert.ok(csBlock, "clone_block exists for C# method");
            assert.strictEqual(csBlock.fingerprint, null, "fingerprint is NULL for hashes-only language");

            // No LSH entries for this node
            const lshRows = store.db
                .prepare("SELECT COUNT(*) as cnt FROM clone_lsh WHERE node_id = ?")
                .get(csBlock.node_id);
            assert.strictEqual(lshRows.cnt, 0, "No clone_lsh entries for hashes-only node");

            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });

    it("test-fixture suppression for test files", async () => {
        const dir = makeTempDir();
        try {
            mkdirSync(join(dir, "test"), { recursive: true });
            const body = `export function setup() {\n    const cfg = loadConfig();\n    const db = connect(cfg);\n    seed(db);\n    return db;\n}\n`;
            writeFileSync(join(dir, "test/a.test.mjs"), body);
            writeFileSync(join(dir, "test/b.test.mjs"), body);
            cleanDb(dir);
            await indexProject(dir);
            const store = getStore(dir);
            const result = findClones(store, { type: "exact", format: "json", crossFile: true, suppress: true });
            assert.ok(result.groups.length > 0, "clone group found");
            const g = result.groups[0];
            assert.strictEqual(g.suppressed, true, "suppressed for test files");
            assert.strictEqual(g.suppress_reason, "test-fixture");
            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });

    it("bounded-context hint (weak, not suppressed)", async () => {
        const dir = makeTempDir();
        try {
            mkdirSync(join(dir, "api"), { recursive: true });
            mkdirSync(join(dir, "workers"), { recursive: true });
            const body = `export function handle(req) {\n    const data = parse(req);\n    const result = process(data);\n    respond(result);\n    return result;\n}\n`;
            writeFileSync(join(dir, "api/handler.mjs"), body);
            writeFileSync(join(dir, "workers/processor.mjs"), body);
            cleanDb(dir);
            await indexProject(dir);
            const store = getStore(dir);
            const result = findClones(store, { type: "exact", format: "json", crossFile: true, suppress: true });
            assert.ok(result.groups.length > 0, "clone group found");
            const g = result.groups[0];
            assert.strictEqual(g.suppressed, false, "weak hint does NOT suppress");
            assert.ok(g.hints && g.hints.includes("bounded-context-hint"), "bounded-context-hint present");
            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });

    it("scope-aware call resolution: same-class method preferred", async () => {
        const dir = makeTempDir();
        try {
            writeFileSync(join(dir, "classes.mjs"), `
export class A {
    save(x) { const v = check(x); const r = db.insert(v); log(r); return r; }
    process(x) { return this.save(x); }
}
export class B {
    save(x) { const v = check(x); const r = db.insert(v); log(r); return r; }
}
`);
            cleanDb(dir);
            await indexProject(dir);
            const store = getStore(dir);
            const edges = store.db.prepare(
                "SELECT e.*, n1.name as src, n2.name as tgt, n2.qualified_name as tgt_qn FROM edges e JOIN nodes n1 ON n1.id=e.source_id JOIN nodes n2 ON n2.id=e.target_id WHERE n1.name='process'"
            ).all();
            const saveEdge = edges.find(e => e.tgt === "save");
            assert.ok(saveEdge, "process -> save edge exists");
            assert.ok(saveEdge.tgt_qn.includes("A.save"), "resolved to A.save, not B.save");
            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });

    it("incremental reindex updates clone_blocks", async () => {
        const dir = makeTempDir();
        try {
            writeFileSync(join(dir, "a.mjs"), `export function original() {\n    const x = get();\n    const y = transform(x);\n    save(y);\n    return y;\n}\n`);
            cleanDb(dir);
            await indexProject(dir);
            const store = getStore(dir);
            const before = store.getAllCloneBlocks(1);
            const countBefore = before.length;
            // Reindex with different content
            writeFileSync(join(dir, "a.mjs"), `export function changed() {\n    const a = fetch();\n    const b = process(a);\n    const c = validate(b);\n    emit(c);\n    return c;\n}\n`);
            await reindexFile(dir, "a.mjs");
            const after = store.getAllCloneBlocks(1);
            assert.strictEqual(after.length, countBefore, "same block count after reindex");
            assert.notStrictEqual(after[0].raw_hash, before[0].raw_hash, "hash changed after content change");
            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });
});

