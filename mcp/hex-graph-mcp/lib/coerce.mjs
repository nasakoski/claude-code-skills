/**
 * Parameter aliases: common alternative names -> canonical schema names.
 * Applied BEFORE Zod validation so agents sending wrong param names still work.
 */

const ALIASES = {
    // index_project / watch_project / get_architecture
    root: "path",
    project: "path",
    dir: "path",
    directory: "path",
    file_path: "path",
    filePath: "path",
    langs: "languages",

    // search_symbols
    search: "query",
    name: "query",
    pattern: "query",
    type: "kind",
    max_results: "limit",
    maxResults: "limit",

    // get_impact / trace_calls / get_context
    symbol_name: "symbol",
    fn: "symbol",
    function_name: "symbol",
    max_depth: "depth",
    maxDepth: "depth",
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
