/**
 * Parameter aliases: common alternative names -> canonical schema names.
 * Applied BEFORE Zod validation so agents sending wrong param names still work.
 */

const ALIASES = {
    // read_file
    file_path: "path",
    filePath: "path",
    file: "path",

    // grep_search
    query: "pattern",
    search: "pattern",
    max_results: "limit",
    maxResults: "limit",
    maxMatches: "limit",
    max_matches: "limit",
    contextLines: "context",
    context_lines: "context",
    ignoreCase: "case_insensitive",
    ignore_case: "case_insensitive",

    // edit_file
    dryRun: "dry_run",
    "dry-run": "dry_run",

    // directory_tree
    maxDepth: "max_depth",
    depth: "max_depth",
};

export function coerceParams(params) {
    if (!params || typeof params !== "object") return params;
    const result = { ...params };
    for (const [alias, canonical] of Object.entries(ALIASES)) {
        if (alias in result && !(canonical in result)) {
            result[canonical] = result[alias];
            delete result[alias];
        }
    }
    return result;
}
