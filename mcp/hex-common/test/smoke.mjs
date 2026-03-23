import test from "node:test";
import assert from "node:assert/strict";

import { fnv1a, lineTag, rangeChecksum, parseChecksum, parseRef } from "../src/text-protocol/hash.mjs";
import { deduplicateLines, smartTruncate } from "../src/output/normalize.mjs";
import { coerceParams } from "../src/runtime/coerce.mjs";
import { grammarForExtension, isSupportedExtension } from "../src/parser/languages.mjs";

test("hash protocol stays stable", () => {
    const hash = fnv1a("const x = 1;");
    assert.equal(lineTag(hash).length, 2);
    assert.equal(parseChecksum(rangeChecksum([hash], 1, 1)).start, 1);
    assert.deepEqual(parseRef("ab.12"), { tag: "ab", line: 12 });
});

test("normalize helpers deduplicate and truncate", () => {
    assert.deepEqual(deduplicateLines(["error 123", "error 456"]), ["error 123  (x2)"]);
    assert.match(smartTruncate(Array.from({ length: 80 }, (_, i) => `l${i}`).join("\n")), /omitted/);
});

test("runtime and parser helpers are stable", () => {
    assert.equal(coerceParams({ path: "a" }).path, "a");
    assert.equal(grammarForExtension(".ts"), "typescript");
    assert.equal(isSupportedExtension(".tsx"), true);
});
