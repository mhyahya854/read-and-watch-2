# Technology Ledger

## Read & Watch

Relationship: `CANONICAL APPLICATION`

Keep React, TypeScript, the current build stack unless evidence justifies migration, stable IDs, the external data root, safe local filesystem boundaries, repository hygiene, tests, and file-first recoverability.

## Foliate-JS

Relationship: `ENGINE / POSSIBLE PINNED FORK`

Intended capabilities: EPUB, MOBI, KF8/AZW3, FB2, CBZ, EPUB CFI, reflow, fixed layout, resources, progression, TOC, search primitives, selection, and locations.

Do not adopt Foliate app/demo chrome, library management, branding, experimental PDF as the primary PDF route, or engine-owned canonical user data. Research and pin only in Phase 05.

## PDF.js

Relationship: `PDF ENGINE`

Use for parsing, page rendering, text layer and selection, search primitives, navigation, outline, links, metadata, zoom, and rotation. Do not adopt Mozilla viewer UI/styling, canonical annotation storage, or source mutation.

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

Relationship: `CERTIFIED LEGACY FALLBACK + FEATURE/ARCHITECTURE REFERENCE`

Keep the verified reader integration, provenance, and fallback until Phase 08 parity passes. It is not the future UI, canonical reader, canonical annotation store, library manager, visual identity, or application shell.

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
