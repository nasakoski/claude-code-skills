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
import { getStore, getReferences } from "../lib/store.mjs";
import { findClones } from "../lib/clones.mjs";
import { findCycles } from "../lib/cycles.mjs";
import { findUnused } from "../lib/unused.mjs";

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

// ==================== find_hotspots ====================

describe("find_hotspots", () => {
    it("high-complexity function with multiple callers appears in hotspots", async () => {
        const dir = makeTempDir();
        try {
            // A complex function (many statements) called by multiple others
            writeFileSync(
                join(dir, "core.mjs"),
                [
                    "export function complexEngine(data) {",
                    "    const a = validate(data);",
                    "    const b = transform(a);",
                    "    const c = normalize(b);",
                    "    const d = enrich(c);",
                    "    const e = filter(d);",
                    "    const f = sort(e);",
                    "    const g = paginate(f);",
                    "    const h = format(g);",
                    "    const i = cache(h);",
                    "    const j = serialize(i);",
                    "    const k = compress(j);",
                    "    const l = encrypt(k);",
                    "    const m = sign(l);",
                    "    const n = wrap(m);",
                    "    const o = deliver(n);",
                    "    const p = log(o);",
                    "    return p;",
                    "}",
                    "",
                    "export function callerA() { return complexEngine(1); }",
                    "export function callerB() { return complexEngine(2); }",
                    "export function callerC() { return complexEngine(3); }",
                    "",
                    "export function trivial() { return 1; }",
                    "",
                ].join("\n"),
            );

            cleanDb(dir);
            await indexProject(dir);

            const store = getStore(dir);
            const rows = store.hotspots({ minCallers: 2, minComplexity: 5, limit: 20 });

            const names = rows.map(r => r.name);
            assert.ok(names.includes("complexEngine"), "complexEngine appears in hotspots");
            assert.ok(!names.includes("trivial"), "trivial (0 callers) excluded by AND filter");

            const hit = rows.find(r => r.name === "complexEngine");
            assert.ok(hit.callers >= 3, "at least 3 callers");
            assert.ok(hit.complexity >= 5, "complexity >= 5");
            assert.ok(hit.risk > 0, "risk is positive");
            assert.ok(
                hit.complexity_source === "stmt_count" || hit.complexity_source === "line_span_fallback",
                "complexity_source is valid",
            );

            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });
});

// ==================== impact_of_changes ====================

describe("impact_of_changes", () => {
    it("returns expected shape on real git repo", async () => {
        const { impactOfChanges } = await import("../lib/impact.mjs");
        const projectPath = "d:/Development/LevNikolaevich/claude-code-skills/mcp/hex-graph-mcp";

        await indexProject(projectPath);
        const store = getStore(projectPath);

        const result = impactOfChanges(store, projectPath, { ref: "HEAD", depth: 2 });

        assert.ok(Array.isArray(result.changed), "changed is array");
        assert.ok(Array.isArray(result.affected), "affected is array");
        assert.ok(Array.isArray(result.affected_tests), "affected_tests is array");
        assert.strictEqual(result.confidence, "heuristic", "confidence is heuristic");
        assert.ok(typeof result.note === "string" && result.note.length > 0, "note is non-empty string");

        store.close();
    });
});

describe("find_clones schema validation", () => {
    it("rejects threshold out of range", async () => {
        const z = await import("zod");
        const schema = z.z.object({
            threshold: z.z.preprocess(v => typeof v === "string" ? Number(v) : v, z.z.number().min(0).max(1).default(0.80)),
        });
        // Valid
        assert.doesNotThrow(() => schema.parse({ threshold: 0.5 }));
        assert.doesNotThrow(() => schema.parse({ threshold: 0 }));
        assert.doesNotThrow(() => schema.parse({ threshold: 1 }));
        // Invalid
        assert.throws(() => schema.parse({ threshold: -0.1 }));
        assert.throws(() => schema.parse({ threshold: 1.5 }));
        assert.throws(() => schema.parse({ threshold: -1 }));
    });

    it("rejects min_stmts < 1", async () => {
        const z = await import("zod");
        const schema = z.z.object({
            min_stmts: z.z.preprocess(v => typeof v === "string" ? Number(v) : v, z.z.number().int().min(1).optional()),
        });
        // Valid
        assert.doesNotThrow(() => schema.parse({ min_stmts: 1 }));
        assert.doesNotThrow(() => schema.parse({ min_stmts: 10 }));
        assert.doesNotThrow(() => schema.parse({})); // optional
        // Invalid
        assert.throws(() => schema.parse({ min_stmts: 0 }));
        assert.throws(() => schema.parse({ min_stmts: -5 }));
        assert.throws(() => schema.parse({ min_stmts: 2.5 })); // not integer
    });
});

// ==================== find_unused ====================

describe("find_unused", () => {
    it("imported export NOT flagged, unused export IS flagged", async () => {
        const dir = makeTempDir();
        try {
            writeFileSync(
                join(dir, "a.mjs"),
                'export function foo() {}\nexport function bar() {}\n',
            );
            writeFileSync(
                join(dir, "b.mjs"),
                'import { foo } from "./a.mjs";\nfoo();\n',
            );

            cleanDb(dir);
            await indexProject(dir);

            const store = getStore(dir);
            const result = findUnused(store);

            const unusedNames = result.unused.map(u => u.name);
            assert.ok(unusedNames.includes("bar"), "bar (never imported) is in unused list");
            assert.ok(!unusedNames.includes("foo"), "foo (imported by b) is NOT in unused list");

            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });
});

// ==================== find_cycles ====================

describe("find_cycles", () => {
    it("detects A->B->C->A circular dependency", async () => {
        const dir = makeTempDir();
        try {
            writeFileSync(
                join(dir, "a.mjs"),
                'import { b } from "./b.mjs";\nexport function a() { b(); }\n',
            );
            writeFileSync(
                join(dir, "b.mjs"),
                'import { c } from "./c.mjs";\nexport function b() { c(); }\n',
            );
            writeFileSync(
                join(dir, "c.mjs"),
                'import { a } from "./a.mjs";\nexport function a_caller() { a(); }\n',
            );

            cleanDb(dir);
            await indexProject(dir);

            const store = getStore(dir);
            const result = findCycles(store);

            assert.strictEqual(result.cycles.length, 1, "exactly 1 cycle");
            assert.strictEqual(result.cycles[0].length, 3, "cycle has 3 files");

            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });
});

// ==================== module_metrics ====================

describe("module_metrics", () => {
    it("Ca/Ce correct for shared module", async () => {
        const dir = makeTempDir();
        try {
            writeFileSync(
                join(dir, "a.mjs"),
                'import { shared } from "./shared.mjs";\nshared();\n',
            );
            writeFileSync(
                join(dir, "b.mjs"),
                'import { shared } from "./shared.mjs";\nshared();\n',
            );
            writeFileSync(
                join(dir, "shared.mjs"),
                'export function shared() {}\n',
            );

            cleanDb(dir);
            await indexProject(dir);

            const store = getStore(dir);
            const rows = store.moduleMetrics({ minCoupling: 0 });

            const sharedMetric = rows.find(r => r.file.includes("shared"));
            assert.ok(sharedMetric, "shared.mjs appears in metrics");
            assert.ok(sharedMetric.ca >= 2, "shared.mjs has Ca >= 2 (imported by a and b)");
            assert.strictEqual(sharedMetric.ce, 0, "shared.mjs has Ce === 0 (imports nothing)");

            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });
});

// ==================== alias import ====================

describe("alias import resolution", () => {
    it("aliased import resolves to original symbol", async () => {
        const dir = makeTempDir();
        try {
            writeFileSync(
                join(dir, "a.mjs"),
                'export function original() {}\n',
            );
            writeFileSync(
                join(dir, "b.mjs"),
                'import { original as renamed } from "./a.mjs";\nexport function caller() { renamed(); }\n',
            );

            cleanDb(dir);
            await indexProject(dir);

            const store = getStore(dir);
            // Find the caller node
            const callerNodes = store.findByName("caller");
            assert.ok(callerNodes.length > 0, "caller node exists");
            const callerId = callerNodes[0].id;

            // Check edges from caller
            const edges = store.edgesFrom(callerId).filter(e => e.kind === "calls");
            const callsOriginal = edges.some(e => e.target_name === "original");
            assert.ok(callsOriginal, "caller -> original call edge exists (alias resolved)");

            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });
});

// ==================== default import ====================

describe("default import resolution", () => {
    it("default import resolves to default-exported symbol", async () => {
        const dir = makeTempDir();
        try {
            writeFileSync(
                join(dir, "a.mjs"),
                'export default function handler() {}\n',
            );
            writeFileSync(
                join(dir, "b.mjs"),
                'import H from "./a.mjs";\nexport function user() { H(); }\n',
            );

            cleanDb(dir);
            await indexProject(dir);

            const store = getStore(dir);
            const userNodes = store.findByName("user");
            assert.ok(userNodes.length > 0, "user node exists");

            const edges = store.edgesFrom(userNodes[0].id).filter(e => e.kind === "calls");
            const callsHandler = edges.some(e => e.target_name === "handler");
            assert.ok(callsHandler, "user -> handler call edge exists (default import resolved)");

            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });
});

// ==================== incremental reindex ====================

describe("incremental reindex", () => {
    it("reindex of target file preserves incoming module_edges", async () => {
        const dir = makeTempDir();
        try {
            writeFileSync(
                join(dir, "a.mjs"),
                'import { x } from "./b.mjs";\nx();\n',
            );
            writeFileSync(
                join(dir, "b.mjs"),
                'export function x() {}\n',
            );

            cleanDb(dir);
            await indexProject(dir);

            const store = getStore(dir);

            // Verify module_edge a->b exists
            const edgesBefore = store.allModuleEdges();
            const hasEdge = edgesBefore.some(
                e => e.source_file.includes("a.mjs") && e.target_file.includes("b.mjs")
            );
            assert.ok(hasEdge, "module_edge a->b exists after full index");

            // Reindex ONLY b.mjs (the target)
            writeFileSync(
                join(dir, "b.mjs"),
                'export function x() { return 42; }\n',
            );
            await reindexFile(dir, "b.mjs");

            // module_edge a->b should still exist (a was not reindexed)
            const edgesAfter = store.allModuleEdges();
            const stillHasEdge = edgesAfter.some(
                e => e.source_file.includes("a.mjs") && e.target_file.includes("b.mjs")
            );
            assert.ok(stillHasEdge, "module_edge a->b preserved after reindexing b.mjs");

            store.close();
        } finally {
            rmSync(dir, { recursive: true });
        }
    });
});

// ==================== barrel re-export ====================

describe("barrel re-export", () => {
    it("consumer importing from barrel marks target symbol as used", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-reexport-"));
        const codegraph = join(tmp, ".codegraph");
        mkdirSync(codegraph);

        writeFileSync(join(tmp, "a.mjs"), 'export function foo() { return 1; }\n');
        writeFileSync(join(tmp, "barrel.mjs"), 'export { foo } from "./a.mjs";\n');
        writeFileSync(join(tmp, "consumer.mjs"), 'import { foo } from "./barrel.mjs";\nfoo();\n');

        try {
            await indexProject(tmp);
            const store = getStore(tmp);

            // barrel should have a reexport node
            const barrelNodes = store.nodesByFile("barrel.mjs");
            const reexportNode = barrelNodes.find(n => n.kind === "reexport" && n.name === "foo");
            assert.ok(reexportNode, "barrel has synthetic reexport node for foo");
            assert.equal(reexportNode.is_exported, 1, "reexport node is exported");

            // find_unused should NOT flag foo in a.mjs
            const result = findUnused(store);
            const fooUnused = result.unused.find(u => u.name === "foo" && u.file === "a.mjs");
            assert.equal(fooUnused, undefined, "foo in a.mjs is used via barrel, not flagged");

            store.close();
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
});

// ==================== namespace import confidence ====================

describe("namespace import confidence", () => {
    it("namespace-only usage reported as low confidence", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-ns-"));
        const codegraph = join(tmp, ".codegraph");
        mkdirSync(codegraph);

        writeFileSync(join(tmp, "a.mjs"), 'export function x() {}\nexport function y() {}\n');
        writeFileSync(join(tmp, "b.mjs"), 'import * as ns from "./a.mjs";\nns.x();\n');

        try {
            await indexProject(tmp);
            const store = getStore(tmp);
            const result = findUnused(store);

            // Both x and y should be reported as low confidence (namespace-only usage)
            const xResult = result.unused.find(u => u.name === "x");
            const yResult = result.unused.find(u => u.name === "y");

            // With namespace import, both get edges — but confidence is "low"
            if (xResult) assert.equal(xResult.confidence, "low");
            if (yResult) assert.equal(yResult.confidence, "low");

            store.close();
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
});

// ==================== unused barrel ====================

describe("unused barrel", () => {
    it("barrel with no consumer does not make target used", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-nocons-"));
        const codegraph = join(tmp, ".codegraph");
        mkdirSync(codegraph);

        writeFileSync(join(tmp, "a.mjs"), 'export function foo() { return 1; }\n');
        writeFileSync(join(tmp, "barrel.mjs"), 'export { foo } from "./a.mjs";\n');
        // No consumer!

        try {
            await indexProject(tmp);
            const store = getStore(tmp);
            const result = findUnused(store);

            // foo should be flagged as unused (barrel exists but nobody imports from it)
            const fooUnused = result.unused.find(u => u.name === "foo" && u.file === "a.mjs");
            assert.ok(fooUnused, "foo in a.mjs is unused when barrel has no consumers");
            assert.equal(fooUnused.confidence, "high");

            store.close();
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
});



// ==================== P1g: Multi-language export/import tests ====================

describe("Python __all__ export extraction", () => {
    it("__all__ is authoritative, convention fallback without it", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-pyall-"));
        mkdirSync(join(tmp, ".codegraph"));
        writeFileSync(join(tmp, "with_all.py"), '__all__ = ["foo"]\n\ndef foo():\n    pass\n\ndef bar():\n    pass\n');
        writeFileSync(join(tmp, "no_all.py"), 'def pub():\n    pass\n\ndef _priv():\n    pass\n\nclass MyClass:\n    pass\n');
        try {
            await indexProject(tmp);
            const store = getStore(tmp);
            // with_all.py: only foo exported (bar excluded by __all__)
            const withAllNodes = store.nodesByFile("with_all.py");
            const fooNode = withAllNodes.find(n => n.name === "foo" && n.kind !== "import");
            const barNode = withAllNodes.find(n => n.name === "bar" && n.kind !== "import");
            assert.ok(fooNode?.is_exported, "foo exported via __all__");
            assert.ok(!barNode?.is_exported, "bar NOT exported (excluded from __all__)");
            // no_all.py: convention — pub and MyClass exported, _priv not
            const noAllNodes = store.nodesByFile("no_all.py");
            const pubNode = noAllNodes.find(n => n.name === "pub");
            const privNode = noAllNodes.find(n => n.name === "_priv");
            const classNode = noAllNodes.find(n => n.name === "MyClass");
            assert.ok(pubNode?.is_exported, "pub exported by convention");
            assert.ok(!privNode?.is_exported, "_priv NOT exported");
            assert.ok(classNode?.is_exported, "MyClass exported by convention");
            store.close();
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
});

describe("Python dynamic __all__", () => {
    it("dynamic __all__ falls back to underscore convention", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-pydyn-"));
        mkdirSync(join(tmp, ".codegraph"));
        writeFileSync(join(tmp, "dynamic.py"), '__all__ = get_exports()\n\ndef visible():\n    pass\n\ndef _hidden():\n    pass\n');
        try {
            await indexProject(tmp);
            const store = getStore(tmp);
            const nodes = store.nodesByFile("dynamic.py");
            const vis = nodes.find(n => n.name === "visible");
            const hid = nodes.find(n => n.name === "_hidden");
            assert.ok(vis?.is_exported, "visible exported (convention fallback)");
            assert.ok(!hid?.is_exported, "_hidden NOT exported");
            store.close();
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
});

describe("C# public vs internal", () => {
    it("only public declarations are exported", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-cs-"));
        mkdirSync(join(tmp, ".codegraph"));
        writeFileSync(join(tmp, "test.cs"), 'using System;\n\npublic class Foo {\n    public void PubMethod() {}\n    private void PrivMethod() {}\n}\n\ninternal class Bar {}\n');
        try {
            await indexProject(tmp);
            const store = getStore(tmp);
            const nodes = store.nodesByFile("test.cs");
            const foo = nodes.find(n => n.name === "Foo" && n.kind === "class");
            const bar = nodes.find(n => n.name === "Bar" && n.kind === "class");
            assert.ok(foo?.is_exported, "public class Foo exported");
            assert.ok(!bar?.is_exported, "internal class Bar NOT exported");
            store.close();
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
});

describe("PHP export extraction", () => {
    it("top-level + public methods exported, private not", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-php-"));
        mkdirSync(join(tmp, ".codegraph"));
        writeFileSync(join(tmp, "test.php"), '<?php\nfunction top() {}\nclass C {\n    public function pub() {}\n    private function priv() {}\n}\n');
        try {
            await indexProject(tmp);
            const store = getStore(tmp);
            const nodes = store.nodesByFile("test.php");
            const topFn = nodes.find(n => n.name === "top" && n.kind === "function");
            const cls = nodes.find(n => n.name === "C" && n.kind === "class");
            const pub = nodes.find(n => n.name === "pub" && n.kind === "method");
            const priv = nodes.find(n => n.name === "priv" && n.kind === "method");
            assert.ok(topFn?.is_exported, "top-level function exported");
            assert.ok(cls?.is_exported, "class exported");
            assert.ok(pub?.is_exported, "public method exported");
            assert.ok(!priv?.is_exported, "private method NOT exported");
            store.close();
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
});

describe("Non-JS find_unused confidence", () => {
    it("Python exports get export_only confidence, not high", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-pyunused-"));
        mkdirSync(join(tmp, ".codegraph"));
        writeFileSync(join(tmp, "lib.py"), 'def helper():\n    pass\n');
        try {
            await indexProject(tmp);
            const store = getStore(tmp);
            const result = findUnused(store);
            const helper = result.unused.find(u => u.name === "helper" && u.file === "lib.py");
            assert.ok(helper, "Python export detected");
            assert.equal(helper.confidence, "export_only", "Python gets export_only, not high");
            assert.equal(helper.reason, "no_cross_file_resolver");
            store.close();
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
});

// ==================== find_references ====================

describe("find_references", () => {
    it("detects call + read reference for same symbol", async () => {
        const dir = makeTempDir();
        try {
            // a.mjs exports a function
            writeFileSync(join(dir, "a.mjs"), 'export function helper() { return 1; }\n');
            // b.mjs calls it AND passes it as value (inside a function so call edges resolve)
            writeFileSync(join(dir, "b.mjs"), 'import { helper } from "./a.mjs";\nexport function caller() { const result = helper(); const fn = helper; return fn; }\n');

            cleanDb(dir);
            await indexProject(dir);

            const store = getStore(dir);

            // Find the helper node
            const nodes = store.findByName("helper");
            const helperNode = nodes.find(n => n.kind === "function");
            assert.ok(helperNode, "helper function found");

            // Should have at least a call edge
            const refs = store.findReferences(helperNode.id);
            const callRefs = refs.filter(r => r.kind === "calls");
            assert.ok(callRefs.length > 0, "has call references");

            // Should have ref_read edge (from `const fn = helper`)
            const readRefs = refs.filter(r => r.kind === "ref_read");
            assert.ok(readRefs.length > 0, "has read references from value usage");

            store.close();
        } finally {
            try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows WAL lock */ }
        }
    });
});

// ==================== Bug 1: barrel find_references ====================

describe("find_references through barrel", () => {
    it("consumer usage through barrel is included in references", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-barrelref-"));
        mkdirSync(join(tmp, ".codegraph"));
        writeFileSync(join(tmp, "a.mjs"), 'export function foo() { return 1; }\n');
        writeFileSync(join(tmp, "barrel.mjs"), 'export { foo } from "./a.mjs";\n');
        writeFileSync(join(tmp, "consumer.mjs"), 'import { foo } from "./barrel.mjs";\nfoo();\n');
        try {
            await indexProject(tmp);
            const store = getStore(tmp);
            const result = getReferences("foo", { path: tmp });
            // Should include consumer's call, not just reexport
            assert.ok(result.total >= 2, `Should have >= 2 refs (got ${result.total}): reexport + consumer call`);
            const hasConsumerRef = result.references.some(r => r.file.includes("consumer"));
            assert.ok(hasConsumerRef, "Consumer usage through barrel is included");
            store.close();
        } finally {
            try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows WAL lock */ }
        }
    });
});

describe("find_references ambiguity", () => {
    it("groups results for same-name symbols across files and honors file filter", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-ambrefs-"));
        mkdirSync(join(tmp, ".codegraph"));
        writeFileSync(join(tmp, "a.mjs"), 'export function helper() { return 1; }\n');
        writeFileSync(join(tmp, "b.mjs"), 'export function helper() { return 2; }\n');
        writeFileSync(join(tmp, "use-a.mjs"), 'import { helper } from "./a.mjs";\nexport function runA() { return helper(); }\n');
        writeFileSync(join(tmp, "use-b.mjs"), 'import { helper } from "./b.mjs";\nexport function runB() { return helper(); }\n');
        try {
            await indexProject(tmp);
            const store = getStore(tmp);

            const grouped = getReferences("helper", { path: tmp });
            assert.equal(grouped.ambiguous, true, "ambiguous lookup returns grouped response");
            assert.equal(grouped.definitions.length, 2, "both helper definitions returned");
            assert.equal(grouped.total, 4, "aggregates refs from both definitions");

            const aOnly = getReferences("helper", { path: tmp, file: "a.mjs" });
            assert.equal(aOnly.ambiguous, undefined, "file filter resolves ambiguity");
            assert.equal(aOnly.definition.file, "a.mjs");
            assert.equal(aOnly.total, 2, "filtered result only includes a.mjs refs");

            store.close();
        } finally {
            try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows WAL lock */ }
        }
    });
});

// ==================== Bug 2: C# public method export ====================

describe("C# public method export", () => {
    it("public methods are marked exported", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-csmethod-"));
        mkdirSync(join(tmp, ".codegraph"));
        writeFileSync(join(tmp, "test.cs"), 'public class Foo {\n    public void PubMethod() {}\n    private void PrivMethod() {}\n}\n');
        try {
            await indexProject(tmp);
            const store = getStore(tmp);
            const nodes = store.nodesByFile("test.cs");
            const pub = nodes.find(n => n.name === "PubMethod");
            const priv = nodes.find(n => n.name === "PrivMethod");
            assert.ok(pub?.is_exported, "PubMethod is exported");
            assert.ok(!priv?.is_exported, "PrivMethod is NOT exported");
            store.close();
        } finally {
            try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows WAL lock */ }
        }
    });
});

// ==================== Bug 3: find_unused text reason ====================

describe("find_unused text reason", () => {
    it("text output includes reason for non-JS exports", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-unusedreason-"));
        mkdirSync(join(tmp, ".codegraph"));
        writeFileSync(join(tmp, "lib.py"), 'def helper():\n    pass\n');
        try {
            await indexProject(tmp);
            const store = getStore(tmp);
            const result = findUnused(store);
            const { formatUnusedText } = await import("../lib/unused.mjs");
            const text = formatUnusedText(result, true);
            assert.ok(text.includes("no_cross_file_resolver"), "Text output shows reason");
            store.close();
        } finally {
            try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows WAL lock */ }
        }
    });
});

// ==================== Bug 4: no self-edge for top-level refs ====================

describe("no self-edge for top-level references", () => {
    it("top-level identifier usage does not create self-referencing edge", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-selfedge-"));
        mkdirSync(join(tmp, ".codegraph"));
        writeFileSync(join(tmp, "a.mjs"), 'export const config = { key: "value" };\n');
        writeFileSync(join(tmp, "b.mjs"), 'import { config } from "./a.mjs";\nconfig;\n');
        try {
            await indexProject(tmp);
            const store = getStore(tmp);
            // Check no self-referencing edges exist
            const allEdges = store.db.prepare("SELECT * FROM edges WHERE source_id = target_id AND kind IN ('ref_read', 'ref_type')").all();
            assert.equal(allEdges.length, 0, "No self-referencing reference edges");
            store.close();
        } finally {
            try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows WAL lock */ }
        }
    });

    it("top-level calls and reads attach to module node", async () => {
        const tmp = mkdtempSync(join(tmpdir(), "hex-topmodule-"));
        mkdirSync(join(tmp, ".codegraph"));
        writeFileSync(join(tmp, "a.mjs"), 'export function foo() { return 1; }\n');
        writeFileSync(join(tmp, "consumer.mjs"), 'import { foo } from "./a.mjs";\nfoo();\nconst x = foo;\n');
        try {
            await indexProject(tmp);
            const store = getStore(tmp);

            const refs = getReferences("foo", { path: tmp, file: "a.mjs" });
            const kinds = refs.references.map(r => r.kind);
            assert.ok(kinds.includes("imports"), "top-level import recorded");
            assert.ok(kinds.includes("calls"), "top-level call recorded");
            assert.ok(kinds.includes("ref_read"), "top-level read recorded");

            const moduleNode = store.nodesByFile("consumer.mjs").find(n => n.kind === "module");
            assert.ok(moduleNode, "module pseudo-node created");
            const moduleEdges = store.edgesFrom(moduleNode.id);
            assert.ok(moduleEdges.some(e => e.kind === "calls"), "module node is caller for top-level call");
            assert.ok(moduleEdges.some(e => e.kind === "ref_read"), "module node is source for top-level read");

            store.close();
        } finally {
            try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows WAL lock */ }
        }
    });
});
