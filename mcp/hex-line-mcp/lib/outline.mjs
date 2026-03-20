/**
 * AST-based file outline via tree-sitter WASM.
 *
 * Returns structural overview: functions, classes, interfaces with line ranges.
 * 10-20 lines instead of 500 → 95% token reduction.
 * Output maps directly to read_file ranges.
 */

import { readFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { validatePath } from "./security.mjs";
import { getGraphDB, symbolAnnotation, getRelativePath } from "./graph-enrich.mjs";

// Language configs: extension → { grammar, outline, skip, recurse }
const LANG_CONFIGS = {
    ".js":   { grammar: "javascript", outline: ["function_declaration", "class_declaration", "variable_declaration", "export_statement", "lexical_declaration"], skip: ["import_statement"], recurse: ["class_body"] },
    ".mjs":  { grammar: "javascript", outline: ["function_declaration", "class_declaration", "variable_declaration", "export_statement", "lexical_declaration"], skip: ["import_statement"], recurse: ["class_body"] },
    ".jsx":  { grammar: "javascript", outline: ["function_declaration", "class_declaration", "variable_declaration", "export_statement", "lexical_declaration"], skip: ["import_statement"], recurse: ["class_body"] },
    ".ts":   { grammar: "typescript", outline: ["function_declaration", "class_declaration", "interface_declaration", "type_alias_declaration", "enum_declaration", "variable_declaration", "export_statement", "lexical_declaration"], skip: ["import_statement"], recurse: ["class_body"] },
    ".tsx":  { grammar: "tsx", outline: ["function_declaration", "class_declaration", "interface_declaration", "type_alias_declaration", "enum_declaration", "variable_declaration", "export_statement", "lexical_declaration"], skip: ["import_statement"], recurse: ["class_body"] },
    ".py":   { grammar: "python", outline: ["function_definition", "class_definition", "decorated_definition"], skip: ["import_statement", "import_from_statement"], recurse: ["class_body", "block"] },
    ".go":   { grammar: "go", outline: ["function_declaration", "method_declaration", "type_declaration"], skip: ["import_declaration"], recurse: [] },
    ".rs":   { grammar: "rust", outline: ["function_item", "struct_item", "enum_item", "impl_item", "trait_item", "const_item", "static_item"], skip: ["use_declaration"], recurse: ["impl_item"] },
    ".java": { grammar: "java", outline: ["class_declaration", "interface_declaration", "method_declaration", "enum_declaration"], skip: ["import_declaration"], recurse: ["class_body"] },
    ".c":    { grammar: "c", outline: ["function_definition", "struct_specifier", "enum_specifier", "type_definition"], skip: ["preproc_include"], recurse: [] },
    ".h":    { grammar: "c", outline: ["function_definition", "struct_specifier", "enum_specifier", "type_definition"], skip: ["preproc_include"], recurse: [] },
    ".cpp":  { grammar: "cpp", outline: ["function_definition", "class_specifier", "struct_specifier", "namespace_definition"], skip: ["preproc_include"], recurse: ["class_specifier"] },
    ".cs":   { grammar: "c_sharp", outline: ["class_declaration", "interface_declaration", "method_declaration", "namespace_declaration"], skip: ["using_directive"], recurse: ["class_body"] },
    ".rb":   { grammar: "ruby", outline: ["method", "class", "module"], skip: ["require", "require_relative"], recurse: ["class", "module"] },
    ".php":  { grammar: "php", outline: ["function_definition", "class_declaration", "method_declaration"], skip: ["namespace_use_declaration"], recurse: ["class_body"] },
    ".kt":   { grammar: "kotlin", outline: ["function_declaration", "class_declaration", "object_declaration"], skip: ["import_header"], recurse: ["class_body"] },
    ".swift": { grammar: "swift", outline: ["function_declaration", "class_declaration", "struct_declaration", "protocol_declaration"], skip: ["import_declaration"], recurse: ["class_body"] },
    ".sh":   { grammar: "bash", outline: ["function_definition"], skip: [], recurse: [] },
    ".bash": { grammar: "bash", outline: ["function_definition"], skip: [], recurse: [] },
};

// Parser cache (init once)
let _parser = null;
const _langCache = new Map();

async function getParser() {
    if (_parser) return _parser;
    try {
        const { Parser } = await import("web-tree-sitter");
        await Parser.init();
        _parser = new Parser();
        return _parser;
    } catch (e) {
        throw new Error(`tree-sitter init failed: ${e.message}. Run: cd mcp/hex-line-mcp && npm install`);
    }
}

async function getLanguage(grammar) {
    if (_langCache.has(grammar)) return _langCache.get(grammar);
    await getParser(); // ensure init
    try {
        const { Language } = await import("web-tree-sitter");
        const { createRequire } = await import("node:module");
        const require = createRequire(import.meta.url);
        // Absolute path for Windows compatibility (Gemini finding #3)
        const wasmPath = resolve(require.resolve("tree-sitter-wasms/package.json"), "..", "out", `tree-sitter-${grammar}.wasm`);
        const lang = await Language.load(wasmPath);
        _langCache.set(grammar, lang);
        return lang;
    } catch (e) {
        throw new Error(`Language "${grammar}" not available: ${e.message}`);
    }
}

/**
 * Extract structural outline entries from AST.
 */
function extractOutline(rootNode, config, sourceLines) {
    const entries = [];
    const skipTypes = new Set(config.skip);
    const outlineTypes = new Set(config.outline);
    const recurseTypes = new Set(config.recurse);

    function walk(node, depth) {
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            const type = child.type;
            const startLine = child.startPosition.row + 1;
            const endLine = child.endPosition.row + 1;

            if (skipTypes.has(type)) continue;

            if (outlineTypes.has(type)) {
                const firstLine = sourceLines[startLine - 1] || "";
                // Extract symbol name for graph annotation
                const nameMatch = firstLine.match(/(?:function|class|interface|type|enum|struct|def|fn|pub\s+fn)\s+(\w+)|(?:const|let|var|export\s+(?:const|let|var|function|class))\s+(\w+)/);
                const name = nameMatch ? (nameMatch[1] || nameMatch[2]) : null;

                entries.push({
                    start: startLine,
                    end: endLine,
                    depth,
                    text: firstLine.trim().slice(0, 120),
                    name,
                });

                // Recurse into class/struct bodies
                for (let j = 0; j < child.childCount; j++) {
                    const sub = child.child(j);
                    if (recurseTypes.has(sub.type)) {
                        walk(sub, depth + 1);
                    }
                }
            }
        }
    }

    // Collect skipped ranges for summary
    const skippedRanges = [];
    for (let i = 0; i < rootNode.childCount; i++) {
        const child = rootNode.child(i);
        if (skipTypes.has(child.type)) {
            skippedRanges.push({
                start: child.startPosition.row + 1,
                end: child.endPosition.row + 1,
            });
        }
    }

    walk(rootNode, 0);
    return { entries, skippedRanges };
}

/**
 * Parse content string into outline entries.
 * Reusable core — no file I/O, no validatePath.
 *
 * @param {string} content  Source text (LF-normalized)
 * @param {string} ext      Lowercase extension including dot (e.g. ".mjs")
 * @returns {Promise<{entries: Array, skippedRanges: Array} | null>}  null if unsupported ext
 */
export async function outlineFromContent(content, ext) {
    const config = LANG_CONFIGS[ext];
    if (!config) return null;

    const sourceLines = content.split("\n");

    let lang;
    try {
        lang = await getLanguage(config.grammar);
    } catch (e) {
        throw new Error(`Outline error: ${e.message}`);
    }

    const parser = await getParser();
    parser.setLanguage(lang);
    const tree = parser.parse(content);
    return extractOutline(tree.rootNode, config, sourceLines);
}

/**
 * Format outline entries into display string.
 */
function formatOutline(entries, skippedRanges, sourceLineCount, db, relFile) {
    const lines = [];

    if (skippedRanges.length > 0) {
        const first = skippedRanges[0].start;
        const last = skippedRanges[skippedRanges.length - 1].end;
        const count = skippedRanges.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
        lines.push(`${first}-${last}: (${count} imports/declarations)`);
    }

    for (const e of entries) {
        const indent = "  ".repeat(e.depth);
        const anno = db ? symbolAnnotation(db, relFile, e.name) : null;
        const suffix = anno ? `  ${anno}` : "";
        lines.push(`${indent}${e.start}-${e.end}: ${e.text}${suffix}`);
    }

    lines.push("");
    lines.push(`(${entries.length} symbols, ${sourceLineCount} source lines)`);
    return lines.join("\n");
}

/**
 * Generate file outline.
 *
 * @param {string} filePath
 * @returns {Promise<string>} formatted outline
 */
export async function fileOutline(filePath) {
    const real = validatePath(filePath);
    const ext = extname(real).toLowerCase();

    if (!LANG_CONFIGS[ext]) {
        return `Outline unavailable for ${ext} files. Use read_file directly for non-code files (markdown, config, text). Supported code extensions: ${Object.keys(LANG_CONFIGS).join(", ")}`;
    }

    const content = readFileSync(real, "utf-8").replace(/\r\n/g, "\n");
    const result = await outlineFromContent(content, ext);
    const db = getGraphDB(real);
    const relFile = db ? getRelativePath(real) : null;
    return `File: ${filePath}\n\n${formatOutline(result.entries, result.skippedRanges, content.split("\n").length, db, relFile)}`;
}
