# Phase 06 Graphify Audit

Result: PASS

The codebase dependency graph was extracted and clustered using Graphify (`python -m graphify extract App/app --code-only` and `python -m graphify cluster-only`) after completing the Phase 06 PDF engine integration with Mozilla PDF.js, high-DPI canvas rendering, synchronized text layer, local worker routes, and capability-driven reader controls.

## Graph Summary

- Nodes: 730 (expanded from 636 in Phase 05)
- Edges: 1405 (expanded from 1269 in Phase 05)
- Communities: 51
- Extraction Fidelity: 98% EXTRACTED, 2% INFERRED, 0% AMBIGUOUS (avg inferred confidence: 0.85)
- Import cycles: 0
- Missing endpoints: 0
- Dangling endpoints: 0
- Exact duplicate edges: 0
- Same-endpoint collapsed edges: 0
- Self-loops: 0
- Unverified nodes: 0

## Core Architectural Hubs & Abstractions

The updated graph reveals the Phase 06 production PDF engine cleanly integrated into the application topology:

1. **`PdfAdapter` (44 edges)**: Production fixed-layout document adapter implementing the canonical `DocumentAdapter` contract. Manages PDF.js engine lifecycle, high-DPI canvas rendering, synchronized text layer, outline/TOC extraction, text search with cancellation, selection, and text anchors while strictly encapsulating PDF.js internals (`PDFDocumentProxy`, `PDFPageProxy`, `TextContent`, `RenderingTask`).
2. **`renderPage` (`pdf-adapter.ts`)**: High-DPI canvas render coordinator calculating device pixel ratio bounds, canvas backing store scaling, and synchronized `.textLayer` layout.
3. **`defaultAdapterRegistry` (`registry.ts`)**: Updated format registry mapping `pdf` to `PdfAdapter` alongside existing reflowable formats, providing unified, format-agnostic adapter instantiation for presentation components.
4. **`source.ts` (`createSourceFromCandidate`, `createSampleSource`)**: Centralized source descriptor factories mapping catalog candidates to safe, immutable `ReadonlyDocumentSource` descriptors without path exposure.
5. **`FoliateReflowableAdapter` (37 edges)**: Preserved Phase 05 reflowable document adapter.
6. **`ReaderSession` (38 edges)**: Format-agnostic session coordinator mediating between presentation state subscriptions and underlying document adapter capabilities.
7. **`DocumentLocation` & `TextAnchor` (24 edges)**: Format-independent location and versioned anchor envelopes (`schemaVersion: 1`).
8. **`createLibraryStore()` (29 edges)**: Preserved Phase 02/03 SQLite catalog store.

## Architectural Boundary Verification

1. **Zero Engine-Native UI Leakage**: Zero Mozilla PDF.js viewer chrome, toolbar HTML, or default viewer CSS exists in the application. The reader surface at `App/app/app/reader/[id]/page.tsx` is built 100% with Read & Watch Phase 03 design tokens.
2. **Strict Format-Branching Elimination**: The presentation layer (`reader/[id]/page.tsx`) branches exclusively on adapter capabilities (`canZoom`, `canPaginate`, `canSearch`, `canAdjustFont`), completely eliminating format string conditionals (`format === 'pdf'`) and satisfying the architectural format-branching gate.
3. **Zero OCR Boundary**: Strictly zero OCR libraries, binaries, or background workers exist. Scanned PDFs degrade capabilities truthfully without hallucinating text.
4. **Clean Storage Separation**: All generated Graphify artifacts (`graph.json`, `graph.html`, `manifest.json`, `GRAPH_REPORT.md`) reside strictly in the external local data root (`READ_WATCH_DATA_ROOT/App/graphify-out`) and are excluded from Git.
