/**
 * Tree-sitter WASM parser for code knowledge graph.
 *
 * Uses Query API (.scm files) for precise extraction of:
 * - definitions: functions, classes, methods, variables
 * - imports: import statements with source resolution
 * - calls: function/method call expressions
 *
 * Parser + Language instances cached (singleton pattern from hex-line).
 * tree.delete() called after extraction (WASM: no GC, explicit free).
 */

import { readFileSync } from "node:fs";
import {
    BODY_EXTRACTORS, walkLeaves, countStatements,
    normalizeTokens, computeRawHash, computeNormHash,
    ngrams, minhashSignature, lshBands,
} from "./clone-hash.mjs";
import { resolve, extname, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// --- Language configs ---

const LANG_CONFIGS = {
    ".js":    { grammar: "javascript", queryFile: "javascript.scm" },
    ".mjs":   { grammar: "javascript", queryFile: "javascript.scm" },
    ".cjs":   { grammar: "javascript", queryFile: "javascript.scm" },
    ".jsx":   { grammar: "javascript", queryFile: "javascript.scm" },
    ".ts":    { grammar: "typescript", queryFile: "typescript.scm" },
    ".tsx":   { grammar: "tsx",        queryFile: "typescript.scm" },
    ".py":    { grammar: "python",     queryFile: "python.scm" },
    ".cs":    { grammar: "c_sharp",    queryFile: "c_sharp.scm" },
    ".php":   { grammar: "php",        queryFile: "php.scm" },
};

const SUPPORTED_EXTENSIONS = new Set(Object.keys(LANG_CONFIGS));

// --- Parser cache ---

let _parser = null;
const _langCache = new Map();
const _queryCache = new Map();

async function getParser() {
    if (_parser) return _parser;
    const { Parser } = await import("web-tree-sitter");
    await Parser.init();
    _parser = new Parser();
    return _parser;
}

async function getLanguage(grammar) {
    if (_langCache.has(grammar)) return _langCache.get(grammar);
    await getParser();
    const { Language } = await import("web-tree-sitter");
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const wasmPath = resolve(
        require.resolve("tree-sitter-wasms/package.json"),
        "..", "out", `tree-sitter-${grammar}.wasm`
    );
    const lang = await Language.load(wasmPath);
    _langCache.set(grammar, lang);
    return lang;
}

async function getQuery(lang, grammar, queryFile) {
    const key = `${grammar}:${queryFile}`;
    if (_queryCache.has(key)) return _queryCache.get(key);
    const scmPath = join(dirname(fileURLToPath(import.meta.url)), "queries", queryFile);
    const scmSource = readFileSync(scmPath, "utf-8");
    const { Query } = await import("web-tree-sitter");
    const query = new Query(lang, scmSource);
    _queryCache.set(key, query);
    return query;
}

// --- Public API ---

/**
 * Check if file extension is supported.
 * @param {string} ext - e.g. ".js"
 */
export function isSupported(ext) {
    return SUPPORTED_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Get language name for extension.
 * @param {string} ext
 * @returns {string|null}
 */
export function languageFor(ext) {
    const cfg = LANG_CONFIGS[ext.toLowerCase()];
    return cfg ? cfg.grammar : null;
}

/**
 * Get all supported extensions.
 */
export function supportedExtensions() {
    return [...SUPPORTED_EXTENSIONS];
}

/**
 * Compute identity key for a definition.
 * @param {object} def - { name, parent?, line_start }
 * @returns {string}
 */
function defKey(def) {
    return def.parent ? `${def.parent}.${def.name}:${def.line_start}` : `${def.name}:${def.line_start}`;
}

/**
 * Parse a file and extract symbols and calls.
 *
 * @param {string} filePath - absolute file path
 * @param {string} source - file content
 * @param {{cloneDetection?: boolean}} opts - options (default: {})
 * @returns {Promise<{definitions: Array, imports: Array, calls: Array}>}
 *
 * definitions: { name, kind, line_start, line_end, parent?, signature?, key, clone_data? }
 * imports:     { name, source, line, kind: "import" }
 * calls:       { name, line, parent? }
 */
export async function parseFile(filePath, source, opts = {}) {
    const ext = extname(filePath).toLowerCase();
    const config = LANG_CONFIGS[ext];
    if (!config) {
        return { definitions: [], imports: [], calls: [] };
    }

    const lang = await getLanguage(config.grammar);
    const parser = await getParser();
    parser.setLanguage(lang);

    const tree = parser.parse(source);
    const query = await getQuery(lang, config.grammar, config.queryFile);
    const captures = query.captures(tree.rootNode);

    const definitions = [];
    const imports = [];
    const calls = [];

    for (const { name: captureName, node } of captures) {
        const startLine = node.startPosition.row + 1;
        const endLine = node.endPosition.row + 1;

        if (captureName === "definition.function") {
            const nameNode = node.childForFieldName("name");
            if (nameNode) {
                const def = {
                    name: nameNode.text,
                    kind: "function",
                    line_start: startLine,
                    line_end: endLine,
                    signature: extractSignature(node),
                    _node: node,
                };
                def.key = defKey(def);
                definitions.push(def);
            }
        } else if (captureName === "definition.class") {
            const nameNode = node.childForFieldName("name");
            if (nameNode) {
                const def = {
                    name: nameNode.text,
                    kind: "class",
                    line_start: startLine,
                    line_end: endLine,
                };
                def.key = defKey(def);
                definitions.push(def);
            }
        } else if (captureName === "definition.method") {
            const nameNode = node.childForFieldName("name");
            if (nameNode) {
                // Find parent class
                let parentName = null;
                let p = node.parent;
                while (p) {
                    if (p.type.includes("class") || p.type === "impl_item") {
                        const pName = p.childForFieldName("name");
                        if (pName) {
                            parentName = pName.text;
                            break;
                        }
                        // class_body or similar wrapper — no name field, keep walking
                    }
                    p = p.parent;
                }
                const def = {
                    name: nameNode.text,
                    kind: "method",
                    line_start: startLine,
                    line_end: endLine,
                    parent: parentName,
                    signature: extractSignature(node),
                    _node: node,
                };
                def.key = defKey(def);
                definitions.push(def);
            }
        } else if (captureName === "definition.variable") {
            // Variable declarations — extract name from declarator
            const text = node.text;
            const nameMatch = text.match(/(?:const|let|var|export\s+(?:const|let|var))\s+(\w+)/);
            if (nameMatch) {
                const def = {
                    name: nameMatch[1],
                    kind: "variable",
                    line_start: startLine,
                    line_end: endLine,
                };
                def.key = defKey(def);
                definitions.push(def);
            }
        } else if (captureName === "import") {
            const imp = extractImport(node, config.grammar);
            if (imp) imports.push({ ...imp, line: startLine });
        } else if (captureName === "call") {
            const callName = extractCallName(node);
            if (callName) {
                calls.push({ name: callName, line: startLine });
            }
        }
    }

    // --- Clone detection (opt-in) ---
    if (opts.cloneDetection) {
        const extractor = BODY_EXTRACTORS.get(config.grammar);

        for (const def of definitions) {
            if (def.kind !== "function" && def.kind !== "method") continue;
            if (!def._node) continue;

            if (extractor) {
                // Full extraction path (grammar in BODY_EXTRACTORS)
                if (extractor.skipNodes.has(def._node.type)) continue;

                const bodyNode = def._node.childForFieldName(extractor.bodyField);
                if (!bodyNode) continue;

                const stmtCount = countStatements(bodyNode, extractor.stmtTypes);
                if (stmtCount < 3) continue;

                const leaves = walkLeaves(bodyNode);
                const rawHash = computeRawHash(bodyNode.text);
                const normalizedTokens = normalizeTokens(leaves);
                const normHash = computeNormHash(normalizedTokens);
                const tokenStrings = ngrams(normalizedTokens, 5);
                const fingerprint = minhashSignature(tokenStrings, 64);
                const bands = lshBands(fingerprint, 16, 4);

                def.clone_data = {
                    raw_hash: rawHash,
                    norm_hash: normHash,
                    fingerprint,
                    stmt_count: stmtCount,
                    token_count: leaves.length,
                    bands,
                };
            } else {
                // Hashes-only fallback (grammar not in BODY_EXTRACTORS)
                const bodyText = source.split("\n").slice(def.line_start - 1, def.line_end).join("\n");
                const rawHash = computeRawHash(bodyText);

                const rawTokens = bodyText.replace(/\s+/g, " ").trim().split(/\s+/);
                const normalizedTokens = rawTokens.map(t => {
                    if (/^[a-zA-Z_]\w*$/.test(t)) return "$";
                    if (/^["']/.test(t)) return "$S";
                    if (/^\d/.test(t)) return "$N";
                    return t;
                });
                const normHash = computeNormHash(normalizedTokens);

                const stmtCount = (bodyText.match(/[;\n]/g) || []).length;
                if (stmtCount < 3) continue;

                def.clone_data = {
                    raw_hash: rawHash,
                    norm_hash: normHash,
                    fingerprint: null,
                    stmt_count: stmtCount,
                    token_count: normalizedTokens.length,
                    bands: [],
                };
            }
        }
    }

    // Clean up tree-sitter node references (can't survive tree.delete())
    for (const def of definitions) {
        delete def._node;
    }

    tree.delete();

    return { definitions, imports, calls };
}

// --- Helpers ---

function extractSignature(node) {
    const params = node.childForFieldName("parameters");
    if (params) return params.text;
    return null;
}

function extractCallName(node) {
    // call_expression -> function field is the callee
    const fn = node.childForFieldName("function");
    if (!fn) return null;

    // method call: obj.method(...)
    if (fn.type === "member_expression" || fn.type === "attribute") {
        const prop = fn.childForFieldName("property") || fn.childForFieldName("attribute");
        return prop ? prop.text : fn.text;
    }
    // simple call: func(...)
    if (fn.type === "identifier" || fn.type === "name") {
        return fn.text;
    }
    return fn.text;
}

function extractImport(node, grammar) {
    if (grammar === "javascript" || grammar === "typescript" || grammar === "tsx") {
        // import { X } from "source" or import X from "source"
        const source = node.childForFieldName("source");
        if (source) {
            const specifiers = [];
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child.type === "import_clause") {
                    // default import or named imports
                    for (let j = 0; j < child.childCount; j++) {
                        const sub = child.child(j);
                        if (sub.type === "identifier") {
                            specifiers.push(sub.text);
                        } else if (sub.type === "named_imports") {
                            for (let k = 0; k < sub.childCount; k++) {
                                const spec = sub.child(k);
                                if (spec.type === "import_specifier") {
                                    const name = spec.childForFieldName("name") || spec.childForFieldName("alias");
                                    if (name) specifiers.push(name.text);
                                }
                            }
                        }
                    }
                }
            }
            return {
                name: specifiers.join(", ") || "*",
                source: source.text.replace(/['"]/g, ""),
                kind: "import",
            };
        }
    } else if (grammar === "python") {
        // import X or from X import Y
        if (node.type === "import_from_statement") {
            const module = node.childForFieldName("module_name");
            const names = [];
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child.type === "dotted_name" && child !== module) {
                    names.push(child.text);
                } else if (child.type === "aliased_import") {
                    const n = child.childForFieldName("name");
                    if (n) names.push(n.text);
                }
            }
            return {
                name: names.join(", ") || "*",
                source: module ? module.text : "",
                kind: "import",
            };
        }
        if (node.type === "import_statement") {
            const names = [];
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child.type === "dotted_name") names.push(child.text);
            }
            return {
                name: names.join(", "),
                source: names[0] || "",
                kind: "import",
            };
        }
    }

    // Fallback: extract text
    return { name: node.text.slice(0, 100), source: "", kind: "import" };
}
