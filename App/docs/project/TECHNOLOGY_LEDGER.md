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

Relationship: `DERIVED PDF EXPORT TOOL`

Use only for new annotated/exported derivatives where suitable. It is not a PDF renderer, and originals are never overwritten by default. The dependency is currently installed but unused; Ponytail records it for phase-scoped cleanup or later justified use.

## Excalidraw

Relationship: `BOOK-LINKED HANDWRITTEN / DRAWN NOTES ENGINE`

Use for handwriting, free drawing, sketches, arrows, shapes, text, safe images/excerpts, book-linked canvases, and deep links to passages/pages. Do not use it as the normal highlight engine, document renderer, canonical UI/database, or cloud-storage dependency. Read & Watch owns persistence.

## React Flow / xyflow

Relationship: `STRUCTURED GRAPH TOOL, ONLY WHEN IT MATTERS`

Use for semantic node-edge structures, knowledge graphs, meaningful cross-book relationships, and topology-dependent workflows. Do not use for handwriting, basic drawings, ordinary notes, or every diagram.

## Mermaid

Relationship: `TEXT-DEFINED DIAGRAM TOOL`

Use for flowcharts, sequence, ER, state, and other text-defined/generated technical diagrams. Do not use as a handwriting, freeform canvas, page annotation, or universal diagram editor.

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
