/**
 * Parameter aliases: common alternative names -> canonical schema names.
 * Applied BEFORE Zod validation so agents sending wrong param names still work.
 */

const ALIASES = {
    // connection (all tools)
    hostname: "host",
    server: "host",
    username: "user",
    login: "user",
    key: "privateKeyPath",
    key_path: "privateKeyPath",
    identity: "privateKeyPath",

    // ssh-read-lines / ssh-edit-block / ssh-write-chunk / ssh-verify
    // NOTE: "path" is NOT aliased — it is canonical for ssh-search-code
    file_path: "filePath",
    file: "filePath",

    // ssh-read-lines
    start: "startLine",
    start_line: "startLine",
    offset: "startLine",
    end: "endLine",
    end_line: "endLine",
    max: "maxLines",
    max_lines: "maxLines",
    limit: "maxLines",

    // ssh-edit-block
    old_text: "oldText",
    new_text: "newText",
    old: "oldText",
    new: "newText",
    dryRun: "dryRun",
    dry_run: "dryRun",
    expected: "expectedReplacements",
    expected_replacements: "expectedReplacements",

    // ssh-search-code
    query: "pattern",
    search: "pattern",
    ignoreCase: "caseInsensitive",
    ignore_case: "caseInsensitive",
    case_insensitive: "caseInsensitive",
    context: "contextLines",
    context_lines: "contextLines",
    max_results: "maxResults",
    max_matches: "maxResults",
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
