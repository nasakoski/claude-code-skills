/**
 * AST-based file outline via tree-sitter WASM.
 *
 * Returns structural overview: functions, classes, interfaces with line ranges.
 * 10-20 lines instead of 500 -> 95% token reduction.
 * Output maps directly to read_file ranges.
 */

import { extname } from "node:path";
import { getParser, getLanguage } from "@levnikolaevich/hex-common/parser/tree-sitter";
import { grammarForExtension, supportedExtensions } from "@levnikolaevich/hex-common/parser/languages";
import { readUtf8Normalized } from "@levnikolaevich/hex-common/text/file-text";
import { validatePath, normalizePath } from "./security.mjs";
import { getGraphDB, symbolAnnotation, getRelativePath } from "./graph-enrich.mjs";

const LANG_CONFIGS = {
    ".js":   { outline: ["function_declaration", "class_declaration", "variable_declaration", "export_statement", "lexical_declaration"], skip: ["import_statement"], recurse: ["class_body"] },
    ".mjs":  { outline: ["function_declaration", "class_declaration", "variable_declaration", "export_statement", "lexical_declaration"], skip: ["import_statement"], recurse: ["class_body"] },
    ".jsx":  { outline: ["function_declaration", "class_declaration", "variable_declaration", "export_statement", "lexical_declaration"], skip: ["import_statement"], recurse: ["class_body"] },
    ".ts":   { outline: ["function_declaration", "class_declaration", "interface_declaration", "type_alias_declaration", "enum_declaration", "variable_declaration", "export_statement", "lexical_declaration"], skip: ["import_statement"], recurse: ["class_body"] },
    ".tsx":  { outline: ["function_declaration", "class_declaration", "interface_declaration", "type_alias_declaration", "enum_declaration", "variable_declaration", "export_statement", "lexical_declaration"], skip: ["import_statement"], recurse: ["class_body"] },
    ".py":   { outline: ["function_definition", "class_definition", "decorated_definition"], skip: ["import_statement", "import_from_statement"], recurse: ["class_body", "block"] },
    ".go":   { outline: ["function_declaration", "method_declaration", "type_declaration"], skip: ["import_declaration"], recurse: [] },
    ".rs":   { outline: ["function_item", "struct_item", "enum_item", "impl_item", "trait_item", "const_item", "static_item"], skip: ["use_declaration"], recurse: ["impl_item"] },
    ".java": { outline: ["class_declaration", "interface_declaration", "method_declaration", "enum_declaration"], skip: ["import_declaration"], recurse: ["class_body"] },
    ".c":    { outline: ["function_definition", "struct_specifier", "enum_specifier", "type_definition"], skip: ["preproc_include"], recurse: [] },
    ".h":    { outline: ["function_definition", "struct_specifier", "enum_specifier", "type_definition"], skip: ["preproc_include"], recurse: [] },
    ".cpp":  { outline: ["function_definition", "class_specifier", "struct_specifier", "namespace_definition"], skip: ["preproc_include"], recurse: ["class_specifier"] },
    ".cs":   { outline: ["class_declaration", "interface_declaration", "method_declaration", "namespace_declaration"], skip: ["using_directive"], recurse: ["class_body"] },
    ".rb":   { outline: ["method", "class", "module"], skip: ["require", "require_relative"], recurse: ["class", "module"] },
    ".php":  { outline: ["function_definition", "class_declaration", "method_declaration"], skip: ["namespace_use_declaration"], recurse: ["class_body"] },
    ".kt":   { outline: ["function_declaration", "class_declaration", "object_declaration"], skip: ["import_header"], recurse: ["class_body"] },
    ".swift": { outline: ["function_declaration", "class_declaration", "struct_declaration", "protocol_declaration"], skip: ["import_declaration"], recurse: ["class_body"] },
    ".sh":   { outline: ["function_definition"], skip: [], recurse: [] },
    ".bash": { outline: ["function_definition"], skip: [], recurse: [] },
};

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
                const nameMatch = firstLine.match(/(?:function|class|interface|type|enum|struct|def|fn|pub\s+fn)\s+(\w+)|(?:const|let|var|export\s+(?:const|let|var|function|class))\s+(\w+)/);
                const name = nameMatch ? (nameMatch[1] || nameMatch[2]) : null;

                entries.push({
                    start: startLine,
                    end: endLine,
                    depth,
                    text: firstLine.trim().slice(0, 120),
                    name,
                });

                for (let j = 0; j < child.childCount; j++) {
                    const sub = child.child(j);
                    if (recurseTypes.has(sub.type)) walk(sub, depth + 1);
                }
            }
        }
    }

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

export async function outlineFromContent(content, ext) {
    const config = LANG_CONFIGS[ext];
    const grammar = grammarForExtension(ext);
    if (!config || !grammar) return null;

    const sourceLines = content.split("\n");

    let lang;
    try {
        lang = await getLanguage(grammar);
    } catch (e) {
        throw new Error(`Outline error: ${e.message}`);
    }

    const parser = await getParser();
    parser.setLanguage(lang);
    const tree = parser.parse(content);
    return extractOutline(tree.rootNode, config, sourceLines);
}

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

export async function fileOutline(filePath) {
    filePath = normalizePath(filePath);
    const real = validatePath(filePath);
    const ext = extname(real).toLowerCase();

    if (!LANG_CONFIGS[ext]) {
        return `Outline unavailable for ${ext} files. Use read_file directly for non-code files (markdown, config, text). Supported code extensions: ${supportedExtensions().join(", ")}`;
    }

    const content = readUtf8Normalized(real);
    const result = await outlineFromContent(content, ext);
    const db = getGraphDB(real);
    const relFile = db ? getRelativePath(real) : null;
    return `File: ${filePath}\n\n${formatOutline(result.entries, result.skippedRanges, content.split("\n").length, db, relFile)}`;
}
