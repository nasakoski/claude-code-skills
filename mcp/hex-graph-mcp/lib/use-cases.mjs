import { isAbsolute, relative, resolve } from "node:path";

import { findClones } from "./clones.mjs";
import { findCycles } from "./cycles.mjs";
import { getPrImpact } from "./pr-impact.mjs";
import {
    explainResolution,
    findDataflowsBySelector,
    findImplementationsBySelector,
    findSymbols,
    getArchitectureReport,
    getHotspots,
    getModuleMetricsReport,
    getReferencesBySelector,
    getSymbol,
    resolveStore,
} from "./store.mjs";
import { findUnusedExports } from "./unused.mjs";

function summarizeCount(count, singular, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`;
}

function compactNode(node) {
    if (!node) return null;
    return {
        symbol_id: node.id,
        qualified_name: node.qualified_name || null,
        workspace_qualified_name: node.workspace_qualified_name || null,
        name: node.name,
        display_name: node.display_name || node.name,
        kind: node.kind,
        language: node.language || null,
        file: node.file,
        line_start: node.line_start,
        line_end: node.line_end,
        is_exported: !!node.is_exported,
        is_default_export: !!node.is_default_export,
        module_key: node.module_key || null,
        module_name: node.module_name || null,
        package_key: node.package_key || null,
        package_name: node.package_name || null,
    };
}

function normalizeProjectFile(projectPath, filePath) {
    if (!filePath) return null;
    if (!projectPath) return filePath.replace(/\\/g, "/");
    const root = resolve(projectPath);
    const candidate = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
    const rel = relative(root, candidate);
    if (rel.startsWith("..")) {
        return { error: { code: "FILE_OUTSIDE_PROJECT", message: "File is outside the indexed project root", recovery: "Pass a file path inside the indexed project root" } };
    }
    return rel.replace(/\\/g, "/");
}

function dedupeRows(rows, keyFn) {
    const seen = new Set();
    const items = [];
    for (const row of rows || []) {
        const key = keyFn(row);
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(row);
    }
    return items;
}

function riskLevel(rank) {
    if (rank >= 3) return "high";
    if (rank >= 1) return "medium";
    return "low";
}

function summarizeEditedSymbol(symbol) {
    return {
        symbol: symbol.symbol,
        impact_counts: symbol.impact_counts,
        framework_origins: symbol.framework_origins,
        duplicate_risk: symbol.duplicate_risk,
        public_api_risk: symbol.public_api_risk,
        framework_entrypoint_risk: symbol.framework_entrypoint_risk,
    };
}

function trimForDetail(items, detailLevel, limit = 10) {
    return detailLevel === "full" ? items : items.slice(0, limit);
}

function buildSymbolSummary(symbol, references, implementations) {
    const parts = [
        `${symbol.kind} \`${symbol.display_name || symbol.name}\``,
        `in ${symbol.file}:${symbol.line_start}`,
        `${summarizeCount(references.total || 0, "reference")}`,
        `${summarizeCount(implementations.length || 0, "implementation link")}`,
    ];
    return parts.join(", ");
}

function nextActions(actions) {
    return [...new Set(actions.filter(Boolean))];
}

export function runFindSymbolsUseCase(query, { kind, limit = 20, path } = {}) {
    const base = findSymbols(query, { kind, limit, path });
    if (base?.error) return base;
    const candidates = base.matches || [];
    const summary = candidates.length
        ? `Found ${summarizeCount(candidates.length, "candidate symbol")} for "${query}".`
        : `No candidate symbols matched "${query}".`;
    return {
        query: base.query,
        summary,
        result: {
            candidates,
            disambiguation_hints: candidates.length > 1
                ? [
                    "Prefer workspace_qualified_name for cross-package symbols.",
                    "Pair name with file when several same-name symbols exist.",
                ]
                : [],
        },
        warnings: candidates.length ? [] : ["No semantic symbol matched the requested query."],
        next_actions: candidates.length
            ? ["Use inspect_symbol with the selected canonical identity."]
            : ["Broaden the query or index a larger project scope."],
        confidence: base.confidence,
        reason: base.reason,
        evidence: base.evidence,
        limits_applied: base.limits_applied,
    };
}

export function runInspectSymbolUseCase(selector, {
    minConfidence = null,
    path,
    referenceLimit = 10,
    implementationLimit = 10,
} = {}) {
    const symbolResult = getSymbol(selector, { min_confidence: minConfidence, path });
    if (symbolResult?.error) return symbolResult;
    const resolutionResult = explainResolution(selector, { path });
    if (resolutionResult?.error) return resolutionResult;
    const referencesResult = getReferencesBySelector(selector, {
        limit: referenceLimit,
        min_confidence: minConfidence,
        path,
    });
    if (referencesResult?.error) return referencesResult;
    const implementationsResult = findImplementationsBySelector(selector, {
        limit: implementationLimit,
        path,
    });
    if (implementationsResult?.error) return implementationsResult;

    const symbol = symbolResult.result.symbol;
    const frameworkOrigins = [...new Set(
        (referencesResult.result.references || [])
            .map(reference => reference.origin)
            .filter(origin => origin?.startsWith("framework:")),
    )];
    return {
        query: {
            ...symbolResult.query,
            reference_limit: referenceLimit,
            implementation_limit: implementationLimit,
        },
        summary: buildSymbolSummary(
            symbol,
            referencesResult.result,
            implementationsResult.result.implementations || [],
        ),
        result: {
            symbol,
            resolution: resolutionResult.result,
            context: {
                module: symbolResult.result.module,
                siblings: symbolResult.result.siblings || [],
                incoming: symbolResult.result.incoming || [],
                outgoing: symbolResult.result.outgoing || [],
                provider_status: symbolResult.result.provider_status,
            },
            references_summary: {
                total: referencesResult.result.total,
                total_by_kind: referencesResult.result.total_by_kind,
                preview: referencesResult.result.references.slice(0, referenceLimit),
            },
            implementations_summary: {
                total: implementationsResult.result.implementations.length,
                preview: implementationsResult.result.implementations.slice(0, implementationLimit),
            },
            framework_roles: frameworkOrigins,
        },
        warnings: frameworkOrigins.length ? [] : [],
        next_actions: nextActions([
            referencesResult.result.total ? "Use find_references for the full usage list." : null,
            implementationsResult.result.implementations.length ? "Use find_implementations for the full override/implementation set." : null,
            "Use trace_paths to inspect blast radius around this symbol.",
        ]),
        confidence: symbolResult.confidence,
        reason: symbolResult.reason,
        evidence: {
            ...symbolResult.evidence,
            reference_count: referencesResult.result.total,
            implementation_count: implementationsResult.result.implementations.length,
        },
        limits_applied: {
            reference_limit: referenceLimit,
            implementation_limit: implementationLimit,
        },
    };
}

export function runTraceDataflowUseCase(selector, { path, limit, depth } = {}) {
    const base = findDataflowsBySelector(selector, { path, limit, depth });
    if (base?.error) return base;
    const flows = base.result || [];
    return {
        query: base.query,
        summary: flows.length
            ? `Found ${summarizeCount(flows.length, "dataflow path")} from the requested source.`
            : "No dataflow path matched the requested source/sink anchors.",
        result: {
            flows,
            anchors: {
                source: base.query.source,
                sink: base.query.sink || null,
            },
        },
        warnings: flows.length ? [] : ["No deterministic flow fact matched the requested anchors."],
        next_actions: nextActions([
            flows.length ? "Use trace_paths with path_kind=flow or mixed to inspect adjacent graph evidence." : null,
        ]),
        confidence: base.confidence,
        reason: base.reason,
        evidence: base.evidence,
        limits_applied: base.limits_applied,
    };
}

export async function runAnalyzeChangesUseCase({
    path,
    baseRef,
    headRef = null,
    includePaths = false,
    maxSymbols = 25,
    maxPaths = 10,
}) {
    const base = await getPrImpact({
        path,
        baseRef,
        headRef,
        includePaths,
        maxSymbols,
        maxPaths,
    });
    if (base?.error) return base;
    const summary = base.result.summary;
    const highRiskItems = (base.result.symbols || []).filter(symbol => symbol.risk_level === "high");
    return {
        query: base.query,
        summary: [
            `${summarizeCount(summary.changed_file_count, "changed file")}`,
            `${summarizeCount(summary.changed_symbol_count, "changed symbol")}`,
            `${summarizeCount(summary.risk_counts.high, "high-risk item")}`,
        ].join(", "),
        result: {
            diff_summary: summary,
            changed_files: base.result.diff.changed_files,
            changed_symbols: base.result.symbols,
            high_risk_items: highRiskItems,
            deleted_api_warnings: base.result.deleted_symbols,
            unresolved_symbols: base.result.unresolved_symbols,
            supporting_paths_included: includePaths,
        },
        warnings: base.result.unresolved_symbols.length
            ? [`${summarizeCount(base.result.unresolved_symbols.length, "changed symbol")} could not be mapped back to the current index.`]
            : [],
        next_actions: nextActions([
            highRiskItems.length ? "Use trace_paths on the highest-risk changed symbols for deeper blast-radius review." : null,
            base.result.deleted_symbols.length ? "Review deleted API warnings before merging." : null,
        ]),
        confidence: base.confidence,
        reason: base.reason,
        evidence: base.evidence,
        limits_applied: base.limits_applied,
    };
}

export function runAnalyzeArchitectureUseCase({
    path,
    scope = null,
    limit = 15,
    detailLevel = "compact",
} = {}) {
    const store = resolveStore(path);
    if (!store) {
        return { error: { code: "NOT_INDEXED", message: "No project indexed", recovery: "Run index_project first" } };
    }
    const architecture = getArchitectureReport({ path, scopePath: scope, limit });
    if (architecture?.error) return architecture;
    const cycles = findCycles(store, { scopePath: scope });
    const metrics = getModuleMetricsReport({ path, scopePath: scope, minCoupling: 2, sort: "instability" });
    if (metrics?.error) return metrics;
    const compactCycles = trimForDetail(cycles.cycles || [], detailLevel, limit);
    const compactCoupling = trimForDetail(metrics.result || [], detailLevel, limit);
    const compactEdges = trimForDetail(architecture.result.cross_module_edges || [], detailLevel, limit);
    const compactHotspots = trimForDetail(architecture.result.hotspots || [], detailLevel, limit);
    const compactFramework = trimForDetail(architecture.result.framework || [], detailLevel, limit);
    return {
        query: {
            path,
            scope,
            limit,
            detail_level: detailLevel,
        },
        summary: [
            `${summarizeCount(architecture.result.modules.length, "module")}`,
            `${summarizeCount(cycles.cycles.length, "cycle")}`,
            `${summarizeCount(compactHotspots.length, "top risk")}`,
        ].join(", "),
        result: {
            workspace_summary: architecture.result.stats,
            modules: trimForDetail(architecture.result.modules, detailLevel, limit),
            module_boundaries: compactEdges,
            cycles: compactCycles,
            coupling: compactCoupling,
            framework_surfaces: compactFramework,
            top_risks: compactHotspots,
        },
        warnings: cycles.cycles.length
            ? [`${summarizeCount(cycles.cycles.length, "cycle")} detected across workspace modules.`]
            : [],
        next_actions: nextActions([
            cycles.cycles.length ? "Use analyze_changes on risky diffs before editing cycle-heavy modules." : null,
            "Use audit_workspace to inspect unused exports, hotspots, and duplicate code.",
        ]),
        confidence: architecture.confidence,
        reason: "architecture_review",
        evidence: {
            cycle_count: cycles.cycles.length,
            coupling_rows: metrics.result.length,
        },
        limits_applied: { limit, detail_level: detailLevel },
    };
}

export function runAuditWorkspaceUseCase({
    path,
    scope = null,
    detailLevel = "compact",
    showSuppressed = false,
    cloneType = "all",
    cloneThreshold = 0.80,
    cloneMinStmts = null,
} = {}) {
    const store = resolveStore(path);
    if (!store) {
        return { error: { code: "NOT_INDEXED", message: "No project indexed", recovery: "Run index_project first" } };
    }
    const unused = findUnusedExports(store, { scopePath: scope, kind: "all" });
    const visibleUnused = showSuppressed ? unused.unused : unused.unused.filter(item => !item.suppressed);
    const hotspots = getHotspots({ path, scopePath: scope, minCallers: 2, minComplexity: 15, limit: 20 });
    const clones = findClones(store, {
        type: cloneType,
        threshold: cloneThreshold,
        minStmts: cloneMinStmts,
        kind: "all",
        scope,
        crossFile: true,
        format: "json",
        suppress: true,
    });
    return {
        query: {
            path,
            scope,
            detail_level: detailLevel,
            show_suppressed: showSuppressed,
            clone_type: cloneType,
        },
        summary: [
            `${summarizeCount(visibleUnused.length, "unused export")}`,
            `${summarizeCount(hotspots.length, "hotspot")}`,
            `${summarizeCount(clones.summary?.total_groups || 0, "clone group")}`,
        ].join(", "),
        result: {
            unused_exports: trimForDetail(visibleUnused, detailLevel, 15),
            uncertain_unused_exports: trimForDetail(unused.uncertain || [], detailLevel, 10),
            hotspots: trimForDetail(hotspots, detailLevel, 15),
            clones: trimForDetail(clones.groups || [], detailLevel, 10),
            risk_summary: {
                unused_exports: visibleUnused.length,
                uncertain_unused_exports: unused.uncertain.length,
                hotspots: hotspots.length,
                clone_groups: clones.summary?.total_groups || 0,
            },
            suppressed_items: showSuppressed ? unused.unused.filter(item => item.suppressed) : [],
        },
        warnings: nextActions([
            visibleUnused.length ? `${summarizeCount(visibleUnused.length, "unused export")} should be reviewed before public API cleanup.` : null,
            clones.summary?.total_groups ? `${summarizeCount(clones.summary.total_groups, "clone group")} may indicate duplicate logic.` : null,
        ]),
        next_actions: nextActions([
            visibleUnused.length ? "Use find_references before deleting exports that look unused." : null,
            hotspots.length ? "Use inspect_symbol or trace_paths on the top hotspots." : null,
            clones.summary?.total_groups ? "Use analyze_edit_region before introducing new similar methods in clone-heavy areas." : null,
        ]),
        confidence: "heuristic",
        reason: "workspace_maintenance_audit",
        evidence: {
            total_exported: unused.total_exported,
            hotspot_count: hotspots.length,
            clone_group_count: clones.summary?.total_groups || 0,
        },
        limits_applied: { detail_level: detailLevel },
    };
}

export function runAnalyzeEditRegionUseCase({
    path,
    file,
    lineStart,
    lineEnd,
    detailLevel = "compact",
} = {}) {
    const store = resolveStore(path);
    if (!store) {
        return { error: { code: "NOT_INDEXED", message: "No project indexed", recovery: "Run index_project first" } };
    }
    const normalizedFile = normalizeProjectFile(path, file);
    if (normalizedFile?.error) return normalizedFile;

    const editedRows = store.db.prepare(
        `SELECT
            symbol_node_id,
            display_name,
            file,
            line_start,
            line_end,
            external_callers_count,
            downstream_return_flow_count,
            downstream_property_flow_count,
            sink_reach_count,
            clone_sibling_count
         FROM hex_line_edit_impacts
         WHERE file = ?
           AND line_start <= ?
           AND line_end >= ?
         ORDER BY line_start`
    ).all(normalizedFile, lineEnd, lineStart);

    if (!editedRows.length) {
        return {
            query: { path, file: normalizedFile, line_start: lineStart, line_end: lineEnd, detail_level: detailLevel },
            summary: "No indexed symbol overlaps the requested edit region.",
            result: {
                file: normalizedFile,
                range: { line_start: lineStart, line_end: lineEnd },
                edited_symbols: [],
                impact_summary: {
                    edited_symbol_count: 0,
                    external_callers: 0,
                    downstream_flows: 0,
                    clone_siblings: 0,
                },
                external_callers: [],
                downstream_flow: [],
                clone_siblings: [],
                similar_symbols: [],
                duplicate_risk: { level: "low", reasons: [] },
                public_api_risk: { level: "low", symbols: [] },
                framework_entrypoint_risk: { level: "low", symbols: [] },
            },
            warnings: ["The selected lines do not intersect a symbol definition in the current graph index."],
            next_actions: ["Broaden the line range or run index_project after recent edits."],
            confidence: "exact",
            reason: "edit_region_no_symbols",
            evidence: {},
            limits_applied: {},
        };
    }

    const editedSymbols = editedRows.map((row) => {
        const node = store.getNodeById(row.symbol_node_id);
        const facts = store.db.prepare(
            `SELECT
                fact_kind,
                target_symbol_id,
                target_display_name,
                target_file,
                target_line,
                intermediate_symbol_id,
                intermediate_display_name,
                path_kind,
                flow_hops,
                source_anchor_kind,
                target_anchor_kind,
                access_path_json,
                confidence,
                origin
             FROM hex_line_edit_impact_facts
             WHERE edited_symbol_id = ?
             ORDER BY fact_kind, target_file, target_line`
        ).all(row.symbol_node_id);
        const frameworkRows = dedupeRows(
            store.frameworkIncomingEdges(row.symbol_node_id) || [],
            entry => `${entry.origin}|${entry.file}|${entry.line ?? ""}`,
        );
        const externalCallers = facts.filter(fact => fact.fact_kind === "external_caller");
        const downstreamFlow = facts.filter(fact => fact.fact_kind !== "external_caller" && fact.fact_kind !== "clone_sibling");
        const cloneSiblings = facts.filter(fact => fact.fact_kind === "clone_sibling");
        const similarSymbols = dedupeRows(
            (store.findByName(node?.name || row.display_name) || [])
                .filter(candidate => candidate.id !== row.symbol_node_id)
                .map(candidate => compactNode(candidate)),
            candidate => `${candidate.file}:${candidate.line_start}:${candidate.name}`,
        );
        const duplicateReasons = [];
        let duplicateRank = 0;
        if (cloneSiblings.length) {
            duplicateRank += 2;
            duplicateReasons.push(`${summarizeCount(cloneSiblings.length, "clone sibling")} already exists.`);
        }
        if (similarSymbols.some(candidate => candidate.kind === node?.kind)) {
            duplicateRank += 1;
            duplicateReasons.push("Same-name symbols already exist in the workspace.");
        }
        const publicApiSymbols = [];
        let publicApiRank = 0;
        if (node?.is_exported) {
            publicApiRank += 1;
            publicApiSymbols.push(node.display_name || node.name);
        }
        if (row.external_callers_count > 0) {
            publicApiRank += 2;
            publicApiSymbols.push(node.display_name || node.name);
        }
        const frameworkRank = frameworkRows.length ? 2 : 0;
        return {
            symbol: compactNode(node || {
                id: row.symbol_node_id,
                name: row.display_name,
                display_name: row.display_name,
                kind: "symbol",
                language: null,
                file: row.file,
                line_start: row.line_start,
                line_end: row.line_end,
            }),
            impact_counts: {
                external_callers: row.external_callers_count,
                downstream_return_flow: row.downstream_return_flow_count,
                downstream_property_flow: row.downstream_property_flow_count,
                sink_reach: row.sink_reach_count,
                clone_siblings: row.clone_sibling_count,
            },
            external_callers: trimForDetail(externalCallers, detailLevel, 10),
            downstream_flow: trimForDetail(downstreamFlow, detailLevel, 12),
            clone_siblings: trimForDetail(cloneSiblings, detailLevel, 10),
            similar_symbols: trimForDetail(similarSymbols, detailLevel, 10),
            framework_origins: frameworkRows.map(entry => entry.origin).filter(Boolean),
            duplicate_risk: {
                level: riskLevel(duplicateRank),
                reasons: duplicateReasons,
            },
            public_api_risk: {
                level: riskLevel(publicApiRank),
                reasons: publicApiRank ? ["Symbol is exported or has external callers."] : [],
            },
            framework_entrypoint_risk: {
                level: riskLevel(frameworkRank),
                reasons: frameworkRows.length ? ["Framework overlay edges target this symbol."] : [],
            },
        };
    });

    const aggregateExternalCallers = dedupeRows(
        editedSymbols.flatMap(symbol => symbol.external_callers || []),
        fact => `${fact.target_file}:${fact.target_line}:${fact.target_display_name}`,
    );
    const aggregateFlows = dedupeRows(
        editedSymbols.flatMap(symbol => symbol.downstream_flow || []),
        fact => `${fact.fact_kind}:${fact.target_file}:${fact.target_line}:${fact.target_display_name}:${fact.path_kind}:${fact.target_anchor_kind}`,
    );
    const aggregateClones = dedupeRows(
        editedSymbols.flatMap(symbol => symbol.clone_siblings || []),
        fact => `${fact.target_file}:${fact.target_line}:${fact.target_display_name}`,
    );
    const aggregateSimilar = dedupeRows(
        editedSymbols.flatMap(symbol => symbol.similar_symbols || []),
        candidate => `${candidate.file}:${candidate.line_start}:${candidate.name}`,
    );
    const publicApiSymbols = editedSymbols
        .filter(symbol => symbol.public_api_risk.level !== "low")
        .map(symbol => symbol.symbol.display_name || symbol.symbol.name);
    const frameworkSymbols = editedSymbols
        .filter(symbol => symbol.framework_entrypoint_risk.level !== "low")
        .map(symbol => symbol.symbol.display_name || symbol.symbol.name);
    const duplicateLevel = editedSymbols.some(symbol => symbol.duplicate_risk.level === "high")
        ? "high"
        : editedSymbols.some(symbol => symbol.duplicate_risk.level === "medium")
            ? "medium"
            : "low";
    const editedLanguages = [...new Set(editedSymbols.map(symbol => symbol.symbol.language).filter(Boolean))];

    return {
        query: {
            path,
            file: normalizedFile,
            line_start: lineStart,
            line_end: lineEnd,
            detail_level: detailLevel,
        },
        summary: [
            `${summarizeCount(editedSymbols.length, "edited symbol")}`,
            `${summarizeCount(aggregateExternalCallers.length, "external caller")}`,
            `${summarizeCount(aggregateFlows.length, "downstream flow")}`,
            `duplicate risk ${duplicateLevel}`,
        ].join(", "),
        result: {
            file: normalizedFile,
            range: { line_start: lineStart, line_end: lineEnd },
            languages: editedLanguages,
            edited_symbols: trimForDetail(editedSymbols.map(summarizeEditedSymbol), detailLevel, 10),
            impact_summary: {
                edited_symbol_count: editedSymbols.length,
                external_callers: aggregateExternalCallers.length,
                downstream_flows: aggregateFlows.length,
                clone_siblings: aggregateClones.length,
            },
            external_callers: trimForDetail(aggregateExternalCallers, detailLevel, 12),
            downstream_flow: trimForDetail(aggregateFlows, detailLevel, 12),
            clone_siblings: trimForDetail(aggregateClones, detailLevel, 10),
            similar_symbols: trimForDetail(aggregateSimilar, detailLevel, 10),
            duplicate_risk: {
                level: duplicateLevel,
                reasons: editedSymbols.flatMap(symbol => symbol.duplicate_risk.reasons).slice(0, 6),
            },
            public_api_risk: {
                level: publicApiSymbols.length ? "high" : "low",
                symbols: publicApiSymbols,
            },
            framework_entrypoint_risk: {
                level: frameworkSymbols.length ? "high" : "low",
                symbols: frameworkSymbols,
            },
        },
        warnings: nextActions([
            publicApiSymbols.length ? `${summarizeCount(publicApiSymbols.length, "edited symbol")} is part of the public surface or has external callers.` : null,
            frameworkSymbols.length ? `${summarizeCount(frameworkSymbols.length, "edited symbol")} participates in framework wiring.` : null,
        ]),
        next_actions: nextActions([
            aggregateExternalCallers.length ? "Use find_references on the edited symbols before changing their public contract." : null,
            aggregateFlows.length ? "Use trace_dataflow for the edited symbols when return/property flow matters." : null,
            duplicateLevel !== "low" ? "Search existing same-name symbols or clone siblings before adding a duplicate method." : null,
        ]),
        confidence: "exact",
        reason: "edit_region_semantic_impact",
        evidence: {
            edited_symbol_count: editedSymbols.length,
            external_caller_count: aggregateExternalCallers.length,
            downstream_flow_count: aggregateFlows.length,
        },
        limits_applied: { detail_level: detailLevel },
    };
}
