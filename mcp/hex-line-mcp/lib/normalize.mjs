/**
 * Output normalization and smart truncation.
 * Based on shared/references/output_normalization.md patterns.
 *
 * - Normalizes runtime values (IPs, timestamps, UUIDs, large numbers)
 * - Deduplicates identical normalized lines with (xN) counts
 * - Smart truncation: first N + last N lines with gap indicator
 */

// Normalization patterns (applied in order)
const NORM_RULES = [
    [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<UUID>"],
    [/\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/g, "<TS>"],
    [/\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2}/g, "<TS>"],
    [/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?/g, "<IP>"],
    [/\/[0-9a-f]{8,}/gi, "/<ID>"],
    [/\b\d{3,}(?=\b|[a-zA-Z])/g, "<N>"],
    [/trace_id=[0-9a-fA-F]{1,8}/g, "trace_id=<TRACE>"],
];

/**
 * Normalize a single line by replacing runtime-specific values.
 */
function normalizeLine(line) {
    let result = line;
    for (const [rx, repl] of NORM_RULES) {
        result = result.replace(rx, repl);
    }
    return result;
}

/**
 * Deduplicate lines: group identical normalized lines, append (xN).
 *
 * @param {string[]} lines - raw output lines
 * @returns {string[]} deduplicated lines
 */
export function deduplicateLines(lines) {
    const groups = new Map();
    const order = [];

    for (const line of lines) {
        const norm = normalizeLine(line);
        if (groups.has(norm)) {
            groups.get(norm).count++;
        } else {
            const entry = { representative: line, count: 1 };
            groups.set(norm, entry);
            order.push(norm);
        }
    }

    // Sort by count descending (stable within same count)
    order.sort((a, b) => groups.get(b).count - groups.get(a).count);

    return order.map((norm) => {
        const { representative, count } = groups.get(norm);
        return count > 1 ? `${representative}  (x${count})` : representative;
    });
}

/**
 * Smart truncation: keep first N + last N lines with gap indicator.
 *
 * @param {string} text - full output text
 * @param {number} [headLines=40] - lines to keep from start
 * @param {number} [tailLines=20] - lines to keep from end
 * @returns {string} truncated text
 */
export function smartTruncate(text, headLines = 40, tailLines = 20) {
    const lines = text.split("\n");
    const total = lines.length;
    const maxLines = headLines + tailLines;

    if (total <= maxLines) return text;

    const head = lines.slice(0, headLines);
    const tail = lines.slice(total - tailLines);
    const skipped = total - maxLines;

    return [
        ...head,
        `\n--- ${skipped} lines omitted ---\n`,
        ...tail,
    ].join("\n");
}

/**
 * Full normalization pipeline: normalize -> deduplicate -> truncate.
 *
 * @param {string} text - raw output
 * @param {object} [opts]
 * @param {boolean} [opts.deduplicate=true]
 * @param {number} [opts.headLines=40]
 * @param {number} [opts.tailLines=20]
 * @returns {string}
 */
export function normalizeOutput(text, opts = {}) {
    const { deduplicate = true, headLines = 40, tailLines = 20 } = opts;
    const lines = text.split("\n");

    const processed = deduplicate ? deduplicateLines(lines) : lines;
    const result = processed.join("\n");

    return smartTruncate(result, headLines, tailLines);
}
