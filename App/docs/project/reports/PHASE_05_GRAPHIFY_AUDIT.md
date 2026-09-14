# Phase 05 Graphify Audit

Result: PASS

The codebase dependency graph was extracted and clustered using Graphify (`graphify extract App/app --code-only` and `graphify cluster-only`) after completing the Phase 05 reflowable book engine integration, vendored Foliate-JS core, resource boundary, server streaming endpoint, and verification reader interface.

## Graph Summary

- Nodes: 636 (expanded from 569 in Phase 04)
- Edges: 1269 (expanded from 1048 in Phase 04)
- Communities: 29
- Extraction Fidelity: 98% EXTRACTED, 2% INFERRED, 0% AMBIGUOUS
- Import cycles: 0
- Missing endpoints: 0
- Dangling endpoints: 0
- Exact duplicate edges: 0
- Same-endpoint collapsed edges: 0
- Self-loops: 0
- Unverified nodes: 0

## Core Architectural Hubs & Abstractions

The updated graph reveals the Phase 05 production reflowable engine cleanly integrated into the application topology:

1. **`FoliateReflowableAdapter` (37 edges)**: Production reflowable document adapter implementing canonical `DocumentAdapter`. Manages Foliate engine lifecycle, navigation, search, selection, and layout mode transitions while strictly encapsulating engine internals.
2. **`ReaderSession` (38 edges)**: Central session coordinator mediating between presentation state subscriptions and underlying document adapter capabilities.
3. **`validateArchiveEntryPath` & `validateResourceUri` (`resource-boundary.ts`)**: Pure security barrier defending against directory traversal, Zip-slip, and unsafe protocol execution.
4. **`defaultAdapterRegistry` (`registry.ts`)**: Format registry mapping EPUB, MOBI, AZW, AZW3, FB2, CBZ to `FoliateReflowableAdapter`.
5. **`createLibraryStore()` (29 edges)**: Preserved Phase 02/03 SQLite catalog store.
6. **`DocumentLocation` & `TextAnchor` (22 edges)**: Format-independent location and anchor envelopes.

## Architectural Boundary Verification

1. **Zero Engine-Native UI Leakage**: Foliate's demo reader UI (`reader.html`, toolbars, menus) was intentionally omitted during vendoring. The verification reader surface at `App/app/app/reader/[id]/page.tsx` is built 100% with Read & Watch Phase 03 design tokens.
2. **Strict Phase Boundary on PDF**: Fixed-layout PDF files are not handled by `FoliateReflowableAdapter` and yield an explicit refusal notice directing users to reflowable publications, reserving PDF.js strictly for Phase 06.
3. **Clean Storage Separation**: All generated Graphify artifacts (`graph.json`, `graph.html`, `manifest.json`, `GRAPH_REPORT.md`) reside strictly in the external local data root (`READ_WATCH_DATA_ROOT/App/graphify-out`) and are excluded from Git.
