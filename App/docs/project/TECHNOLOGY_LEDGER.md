# Technology Ledger

## Read & Watch

Relationship: `CANONICAL APPLICATION`

Keep React, TypeScript, the current build stack unless evidence justifies migration, stable IDs, the external data root, safe local filesystem boundaries, repository hygiene, tests, and file-first recoverability.

## Foliate-JS

Relationship: `VENDORED REFLOWABLE ENGINE`

Capabilities: EPUB, MOBI, KF8/AZW3, FB2, CBZ, EPUB CFI, reflow, fixed layout, resources, progression, TOC, search primitives, selection, and locations encapsulated behind Read & Watch `DocumentAdapter`.

Pinned upstream commit `78914aef4466eb960965702401634c2cb348e9b1` (MIT), vendored under `App/forks/foliate-js/` with zero modifications. Foliate app/demo chrome, branding, and engine-owned user data are excluded; all presentation UI is Read & Watch owned. PDF rendering is intentionally omitted and reserved for Phase 06 PDF.js.

## PDF.js

Relationship: `PRODUCTION PDF ENGINE (PINNED PACKAGE)`

Capabilities: Parsing, high-DPI page rendering, synchronized selectable text layer, page navigation, hierarchical outline, internal links, zoom, 90-degree rotation, metadata extraction, search, progress, and text anchors encapsulated behind Read & Watch `DocumentAdapter`.

Pinned exact package: `pdfjs-dist@4.10.38` (Apache-2.0). Worker is served locally from controlled application assets (`/api/reader/pdfjs/worker.mjs`) matching the exact engine version without CDN dependencies. Mozilla viewer chrome, styling, and canonical annotations are excluded; all UI is 100% Read & Watch owned. Embedded PDF JavaScript execution is strictly disabled.

## pdf-lib

Relationship: `DERIVED PDF EXPORT TOOL (PINNED PACKAGE)`

Pinned exact package: `pdf-lib@1.17.1` (MIT). Official upstream: `https://github.com/Hopding/pdf-lib`. Role: Safe generation of NEW annotated derivative PDFs in Phase 12. Strict boundaries: It is NOT a PDF renderer, NOT a reader, NOT a text extractor, and NOT a canonical annotation engine. Original source PDFs are NEVER mutated or overwritten. All UI rendering and reading remain 100% owned by Mozilla PDF.js behind Read & Watch `PdfAdapter`.

## Excalidraw

Relationship: `BOOK-LINKED HANDWRITTEN / DRAWN NOTES ENGINE (PINNED PACKAGE)`

Capabilities: Handwriting, free drawing, sketches, arrows, lines, rectangles, ellipses, text, selection, safe image/excerpt insertion, and local canvas scene representation encapsulated behind Read & Watch `ReadWatchCanvas`.

Pinned exact package: `@excalidraw/excalidraw@0.18.1` (MIT). Bundled fonts (Virgil, Cascadia, ComicShanns, Excalifont, Assistant, Lilita, Nunito, Xiaolai, Liberation) and localization assets are served 100% locally from the pinned package via `/api/reader/excalidraw-assets/` without CDN reliance. Collaboration, cloud storage, room servers, and external analytics are strictly disabled (`isCollaborating: false`). Read & Watch owns canonical identity, book association, SQLite metadata, atomic file-first persistence, revision-guarded concurrency, recovery, and bidirectional deep links.


## React Flow / xyflow

Relationship: `STRUCTURED GRAPH TOOL, ONLY WHEN IT MATTERS (PINNED PACKAGE)`

Pinned exact package: `@xyflow/react@12.11.6` (MIT). Official upstream: `https://github.com/xyflow/xyflow`. Role: Structured semantic topology, concept maps, argument structures, and cross-book relationship graphs in Phase 13. Strict boundaries: React Flow is strictly a transient client-side visual projection. Read & Watch owns canonical graph schema in SQLite (`knowledge_graphs`, `knowledge_nodes`, `knowledge_edges`) and atomic file-first recovery mirrors. Not used for freehand drawing, writing primary long-form text notes, or replacing ordinary bookmark lists.

## Mermaid

Relationship: `TEXT-DEFINED DIAGRAM TOOL (PINNED PACKAGE)`

Pinned exact package: `mermaid@12.0.0` (MIT). Official upstream: `https://github.com/mermaid-js/mermaid`. Role: Text-defined diagrams (flowcharts, sequence diagrams, state machines, class diagrams, ER diagrams) in Phase 13. Strict boundaries: Source text is canonical. Rendered SVG is disposable and derived client-side. Rendered strictly with `securityLevel: 'strict'`. Zero loose mode, zero inline script evaluation, zero remote network calls; 100% offline. Not used as a freehand canvas or universal note editor.

## Readest

Relationship: `RETIRED LEGACY FALLBACK + ARCHITECTURE REFERENCE (HISTORICAL)`

Retired in Phase 08 following 100% native parity verification across all 151 real local books. Upstream AGPL-3.0 provenance and commit history preserved at pre-retirement anchor `81a9276c190b4795b7093c55d175d0b73276fde7`. Active launcher and vendored source removed from HEAD per Decision D-044 and `docs/project/PROVENANCE_READEST.md`.

## Calibre

Relationship: `LIBRARY-MANAGER AND READER FEATURE REFERENCE`

Reproduce valuable concepts in Read & Watch: one logical book with multiple formats; title, authors, series/position, languages, tags, rating, status, cover, manual identifiers, custom properties, format inventory, duplicate detection, search/sort/filter, categories, virtual collections, manual metadata, progress, annotations, notes, canvases, relationships, and provenance.

Do not adopt Calibre's GUI/design, `metadata.db`, Content Server, device stack, news downloader, full plugin ecosystem, ebook editor, conversion-first reading, source mutation, or wholesale GPL embedding. Metadata fetching is not required initially.

## OCR engines

Relationship: `LATE PHASE ONLY`

PaddleOCR-VL is the primary candidate; Tesseract is a validator; Urdu/Nastaliq specialists remain benchmarked TBD. Do not install, benchmark, or integrate them before Phase 17.

## Tauri

Relationship: `PROVISIONAL FUTURE DESKTOP CANDIDATE`

Phase 14 evaluates Windows packaging, secure chooser and filesystem bridge, associations, open-with behavior, local processes, persistence, installation/update, and alternatives. React remains the UI; no Rust UI is planned.
