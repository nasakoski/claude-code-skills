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
 * Parse a file and extract symbols and calls.
 *
 * @param {string} filePath - absolute file path
 * @param {string} source - file content
 * @returns {Promise<{definitions: Array, imports: Array, calls: Array}>}
 *
 * definitions: { name, kind, line_start, line_end, parent?, signature? }
 * imports:     { name, source, line, kind: "import" }
 * calls:       { name, line, parent? }
 */
export async function parseFile(filePath, source) {
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
                definitions.push({
                    name: nameNode.text,
                    kind: "function",
                    line_start: startLine,
                    line_end: endLine,
                    signature: extractSignature(node),
                });
            }
        } else if (captureName === "definition.class") {
            const nameNode = node.childForFieldName("name");
            if (nameNode) {
                definitions.push({
                    name: nameNode.text,
                    kind: "class",
                    line_start: startLine,
                    line_end: endLine,
                });
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
                        if (pName) parentName = pName.text;
                        break;
                    }
                    p = p.parent;
                }
                definitions.push({
                    name: nameNode.text,
                    kind: "method",
                    line_start: startLine,
                    line_end: endLine,
                    parent: parentName,
                    signature: extractSignature(node),
                });
            }
        } else if (captureName === "definition.variable") {
            // Variable declarations — extract name from declarator
            const text = node.text;
            const nameMatch = text.match(/(?:const|let|var|export\s+(?:const|let|var))\s+(\w+)/);
            if (nameMatch) {
                definitions.push({
                    name: nameMatch[1],
                    kind: "variable",
                    line_start: startLine,
                    line_end: endLine,
                });
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
    // call_expression → function field is the callee
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
