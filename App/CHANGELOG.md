# Changelog

## 2026-09-14 - Phase 13 knowledge and diagram system

- Established calibrated 4-tier knowledge tool selection constitution (`docs/project/KNOWLEDGE_TOOL_SELECTION.md`): Native UI < Excalidraw < React Flow < Mermaid.
- Pinned and integrated `@xyflow/react@12.11.6` (MIT) for interactive semantic concept graphs, scoped strictly to `components/knowledge/concept-graph-canvas.tsx` as a transient client-side projection.
- Pinned and integrated `mermaid@12.0.0` (MIT) for text-defined technical diagrams, scoped strictly to `components/knowledge/mermaid-editor.tsx` with enforced `securityLevel: 'strict'`.
- Implemented canonical SQLite persistence in `server/knowledge-store.mjs`:
  - DDL tables: `knowledge_graphs`, `knowledge_nodes`, `knowledge_edges`, `mermaid_documents`.
  - Atomic file-first crash recovery mirrors in `user-data/knowledge/graphs/` and `user-data/knowledge/diagrams/`.
  - Optimistic concurrency control (`expectedRevision` with 409 Conflict rejection).
  - Soft-delete lifecycle tracking (`deleted_at_utc`).
  - Automated crash recovery reconstruction (`rebuildFromFiles()`).
  - Search invalidation integration (`notifySearchInvalidation()`).
- Implemented server-side deep link resolution (`resolveDeepLink()`) for 6 reference types: library items, document locations with anchors, annotations with quote preview, reader notes tab, Excalidraw canvases, and external web URLs. Unresolved links display a calm notice without crashing.
- Built Knowledge Hub dashboard (`app/knowledge/page.tsx`, `components/knowledge/knowledge-hub.tsx`) with 4 tabs: Concept Graphs, Text Diagrams, Standalone Canvases, and Tool Selection Guide.
- Built accessible alternative table/outline fallback view in `concept-graph-canvas.tsx` ensuring complete readability when visual graph cannot render.
- Integrated knowledge graphs and diagrams into derived search index (`server/search-store.mjs` FTS5 rebuild blocks 6 & 7).
- Integrated knowledge entities into Phase 12 portability system: backup bundles (`.rwbackup`), preflight conflict detection, restore application, and standalone `.rwgraph` / `.rwmermaid` exports.
- Added comprehensive automated tests in `tests/knowledge-store.test.mjs` (213/213 test cases passing across suite).
- Maintained 100% source book immutability across all local books.
- Recorded D-049 in `DECISIONS.md`; passed Graphify and Ponytail audits (`PHASE_13_GRAPHIFY_AUDIT.md`, `PHASE_13_PONYTAIL_AUDIT.md`).
- Respected stop condition: stopped after Phase 13 without beginning desktop packaging.

## 2026-09-14 - Phase 12 export and portability

- Established versioned portable schema family (`PORTABILITY_SCHEMA_VERSION = 1`) in `lib/portability/types.ts`: `read-watch.annotations`, `read-watch.notes`, `read-watch-canvas-export`, `read-watch.library-metadata`, `read-watch.backup`.
- Implemented runtime validation, schema version guard, and security rules in `lib/portability/validation.ts` (rejection of directory traversal `..`, absolute drive letters, and root paths).
- Authored canonical schema specifications and operational guides: `docs/project/PORTABLE_SCHEMAS.md`, `docs/project/BACKUP_AND_RESTORE.md`, and `docs/project/REFLOWABLE_ANNOTATION_PORTABILITY.md`.
- Implemented core portability and export engine (`server/portability-store.mjs`):
  - Annotation exports: machine-readable JSON with SHA-256 checksum and human-readable Markdown projection.
  - Notes and Canvas exports: item thoughts, notes, canvas scenes, bidirectional deep links, and base64-encoded image assets.
  - Library metadata export: standalone catalog records and item properties.
  - Full unified backup bundle (`.rwbackup`): self-contained, lossless archive with cryptographic checksum manifests; original EPUB/PDF files are strictly excluded to preserve lean storage and avoid media mutation.
  - Safe annotated-PDF derivative export using exact-pinned `pdf-lib@1.17.1` (MIT), drawing semi-transparent highlight rectangles and an editorial comments summary page. Enforces strict refusal guard against source path overwrites and verifies post-export byte-identical and mtime immutability.
  - Restore engine with preflight inspection (`/api/portability/restore/preflight`), conflict breakdown (identical vs divergent), and flexible conflict resolution (`skip`, `overwrite`, `copy`).
  - Automatic post-restore search index rebuild: derived SQLite FTS5 search tables are excluded from backups and deterministically reconstructed on restore via `searchStore.rebuildIndex()`.
- Built user-facing Portability Settings panel (`components/settings/portability-settings.tsx`) mounted in `/settings` with Apple-style polish, backup download trigger, and preflight restore inspection dialog.
- Added in-context export affordances in Reader Top Toolbar (`components/reader/reader-toolbar.tsx`) and Study Browser (`components/study/study-browser.tsx`).
- Added 6 comprehensive automated tests in `tests/portability-store.test.mjs` verifying schema validation, annotation export, canvas export, backup bundle generation, safe PDF derivative export with source immutability, and complete round-trip restoration (173/173 total test cases passing across suite).
- Maintained 100% source book immutability across all local publications.
- Recorded D-048 in `DECISIONS.md`, passed Graphify and Ponytail audits (`PHASE_12_GRAPHIFY_AUDIT.md`, `PHASE_12_PONYTAIL_AUDIT.md`).
- Captured visual review operational evidence in `READ_WATCH_DATA_ROOT/visual-review/phase-12/` (`REVIEW_INDEX.md`, `manifest.json`).

## 2026-09-14 - Phase 11 search, annotation browser, and study workflow

- Implemented derived, rebuildable SQLite FTS5 search index (`server/search-store.mjs`) managing `search_index_fts` with `unicode61 remove_diacritics 0`, `search_index_records`, and `search_index_meta` (zero new external npm dependencies, 100% offline).
- Engineered safe query pipeline (`server/search-query.mjs`, `lib/search/query.ts`) that normalizes user inputs, escapes FTS5 syntax operators, and extracts structured snippet tokens for HTML-safe `<mark>` rendering without dangerouslySetInnerHTML.
- Built unified Study & Annotation Browser (`app/highlights/page.tsx`, `components/study/study-browser.tsx`) featuring truthful artifact counters (highlights, comments, bookmarks, canvases, notes, total), debounced search (`/` shortcut), multi-kind filters, book filter dropdown, and direct source jumps.
- Enhanced book-local reader search (`components/reader/reader-search.tsx`) with semantic chapter/section labels, CFI/page locations, accessible `<output aria-live="polite">` regions, and truthful missing-text notice for scanned PDFs without invoking OCR.
- Built reader selection context menu (`components/reader/reader-selection-menu.tsx`) mounted in `ReaderViewport` supporting instant Copy, Define hook (offline notice), Translate hook (offline notice), Send to Item Notes (markdown excerpt append with citation and optimistic conflict protection), and Send to Canvas (adding excerpt card element to linked Excalidraw scenes).
- Wired direct URL jump navigation (`/reader/:id?annotationId=...` and `?location=...`) with source hash verification and calm mismatch alerts.
- Wired synchronous incremental invalidation hooks across all canonical stores (`annotationStore`, `canvasStore`, `userDataStore`, `readerStore`, `libraryStore`).
- Added 16 new automated tests across `tests/search-store.test.mjs`, `tests/book-local-search.test.mjs`, and `tests/study-workflow.test.mjs` (167/167 total test cases passing).
- Verified zero AI dependencies, zero vector database dependencies, and complete offline capability.
- Passed Graphify and Ponytail audits (`PHASE_11_GRAPHIFY_AUDIT.md`, `PHASE_11_PONYTAIL_AUDIT.md`).
- Captured external visual review evidence in `READ_WATCH_DATA_ROOT/visual-review/phase-11/` (`REVIEW_INDEX.md`, `manifest.json`).

## 2026-09-14 - Phase 10 book-linked Excalidraw notes

- Pinned official upstream release `@excalidraw/excalidraw@0.18.1` (MIT license) with verified React 19 compatibility.
- Designed and implemented canonical Read & Watch canvas schema (`CANVAS_SCHEMA_VERSION = 1`) in `lib/canvas/types.ts`: `ReadWatchCanvasDocument`, `CanvasMetadata`, `CanvasLinkRecord`, `CanvasAssetMeta`, `ExcalidrawSceneData`.
- Implemented runtime validation, URL sanitization, and MIME checks in `lib/canvas/validation.ts`.
- Implemented in-memory bounded history (`CanvasHistory`) capped at 50 revisions in `lib/canvas/history.ts`.
- Implemented file-first SQLite persistence in `server/canvas-store.mjs` with tables `canvases`, `canvas_links`, `canvas_assets`, atomic `.tmp` rename writes, optimistic concurrency control (409 Conflict), crash recovery mirror (`recovery.json`), bounded revision snapshots (cap 50), and standalone `.rwcanvas` export/import.
- Implemented 100% offline asset serving in `server/reader-vite-plugin.mjs` serving Excalidraw fonts and assets from `/api/reader/excalidraw-assets/*` with zero external CDN requests.
- Added 18 canvas REST API endpoints covering list, create, update, delete, restore, recovery, links, assets, and export.
- Built interactive client canvas components in `components/canvas/read-watch-canvas.tsx` and `canvas-list.tsx` supporting pen, highlighter, arrows, shapes, text, image uploads, quoted excerpts, and deep link navigation cards.
- Integrated Beside-Reader split mode in `components/reader/reader-shell.tsx` and `reader-toolbar.tsx` with responsive 320px minimum pane widths, preserving active reader engine and canvas state without remounting, plus mobile tab switching.
- Added standalone canvas library route (`/canvas-notes`) and full-screen canvas workspace route (`/canvas-notes/[id]`).
- Added 15 comprehensive unit and integration tests in `tests/canvas-store.test.mjs` (151/151 total tests passing).
- Maintained 100% source book immutability across all local books.
- Recorded D-046 in `DECISIONS.md`, passed Graphify and Ponytail audits.

## 2026-09-14 - Phase 09 unified annotation foundation

- Implemented unified Read & Watch annotation system covering all 13 annotation types across PDF (text marks + vector drawing) and reflowable books (text marks only).
- Added `lib/annotation/types.ts`: `ANNOTATION_SCHEMA_VERSION = 1`, `Annotation` record with `schemaVersion`, stable UUID `id`, `itemId`, `assetId`, `kind`, `anchor`, `content`, `style`, `sourceHash`, `revision`, `lifecycle`, `createdAt`, `updatedAt`, `deletedAt`.
- Added `lib/annotation/validation.ts`: strict validation of all anchor kinds, content payloads, normalized bounds `[0..1]`, lifecycle states, and schema version.
- Added `lib/annotation/history.ts`: `AnnotationHistory` bounded at 50 entries with `undo()`, `redo()`, `push()`, and `clear()`.
- Added `server/annotation-store.mjs`: SQLite persistence via `BEGIN IMMEDIATE` transactions; optimistic concurrency (revision mismatch → 409); soft delete; restore; batch create; source hash mismatch detection; atomic file-first crash-recovery mirror to `user-data/items/:itemId/annotations.json`.
- Extended `lib/document/capabilities.ts` with `textAnnotations` (all engines) and `surfaceMarkup` (PDF only — reflowable explicitly disabled because freehand geometry cannot survive dynamic reflow).
- Added 8 annotation API routes to `server/reader-vite-plugin.mjs`: GET list, POST create, POST batch, PUT update, DELETE soft-delete, PATCH restore, GET hash-check, POST recover.
- PDF anchors (`pdf-text`): normalized page-relative bounding rects `[0..1]`, zoom- and orthogonal-rotation-invariant, 1-based `pageNumber`, `quote`, `prefix`, `suffix`, `sourceHash`.
- PDF drawing anchors (`pdf-drawing`): normalized page-relative `points` and `bounds`, `[0..1]`-invariant, supports all 7 drawing sub-kinds (pen, highlighter, line, arrow, rectangle, ellipse, text-box).
- Reflowable anchors (`reflowable-text`): `startCfi`, `endCfi`, `spineIndex`, `quote`, `prefix`, `suffix`, `sourceHash` — inherently font-size and layout-invariant.
- Named bookmarks use Phase 07 `Bookmark` model with existing `label` field — no duplicate annotation store.
- Added 36 new tests (20 anchor + 16 transaction/recovery) — total suite: 136/136 pass.
- Source immutability verified: all 151 real local books remain 100% byte-identical (0 hash changes, 0 mtime modifications).
- Graphify audit: PASS — 0 engine leakage, 0 import cycles (`PHASE_09_GRAPHIFY_AUDIT.md`).
- Ponytail audit: PASS — 0 new runtime dependencies (`PHASE_09_PONYTAIL_AUDIT.md`).
- Recorded D-045 in `DECISIONS.md`.

## 2026-09-14 - Phase 08 legacy Readest parity and retirement

- Evaluated native-versus-legacy parity across all 151 real local publications (8 EPUBs, 143 PDFs) across 14 distinct reader behaviors (`BEH-01` through `BEH-14`); achieved 100% parity (747 parity matches, 1,208 native superior advantages, 0 parity gaps, 0 blocked items).
- Verified rollback capability in an isolated worktree (`%TEMP%\rw-rollback`) at pre-retirement anchor commit `81a9276c190b4795b7093c55d175d0b73276fde7` with 97/97 tests passing prior to altering active launcher paths.
- Retired the legacy Readest desktop launcher; completely eliminated `import { spawn } from 'node:child_process'` and all process launching logic from `reader-store.mjs`.
- Updated `reader-control.tsx` to navigate directly to `/reader/:itemId` with query parameter preservation (`?candidate=:id`) for multiple-candidate books, removing obsolete launch states.
- Safely removed `App/forks/readest/` (9,066 vendored files) from current Git HEAD, permanently resolving Windows `MAX_PATH` checkout failures caused by deep Android/Kotlin test directories and reducing tracked paths from 9,262 to 196.
- Preserved complete upstream provenance, AGPL-3.0 license records, and Git recovery instructions in `App/docs/project/PROVENANCE_READEST.md`, `UPSTREAM_AND_LICENSE_LEDGER.md`, and `TECHNOLOGY_LEDGER.md`.
- Decoupled PDF unit test fixtures by copying `sample-paper.pdf` and `sample-alice.pdf` to `App/app/tests/fixtures/pdf/`.
- Added retirement enforcement test `App/app/tests/no-active-readest.test.mjs` verifying zero child process spawning, zero `forks/readest` imports, and null `readerExecutable` (100/100 tests passing).
- Updated repository hygiene tooling (`check_repository_hygiene.py`, `test_repository_hygiene.py`) adding `App/forks/readest/` to `FORBIDDEN_PREFIXES`.
- Re-verified source immutability: all 151 real local book files remained 100% byte-identical (0 hash changes).
- Captured 18 visual review screenshots under `Read and Watch - Local Data/visual-review/phase-08/` with `manifest.json` and `REVIEW_INDEX.md`.
- Completed Graphify audit (831 nodes, 1687 edges, 40 communities, 0 import cycles, zero reachability to Readest) and Ponytail audit (9,066 files deleted, 0 new runtime dependencies).

## 2026-09-14 - Phase 07 unified reader experience

- Unified the reflowable (Foliate-JS) and fixed-layout (Mozilla PDF.js) engines behind a single capability-driven Read & Watch reader interface (`App/app/app/reader/[id]/page.tsx`, `App/app/components/reader/`).
- Eliminated all format-conditional branching (`format === 'pdf'`, `isPdf`) across presentation components; reader chrome queries runtime capabilities (`canZoom`, `fontControls`, `textSearch`, `continuousLayout`, `canRotate`).
- Built modular reader component suite adhering strictly to the Warm Editorial design system: `ReaderShell`, `ReaderToolbar`, `ReaderSidebar`, `ReaderContents`, `ReaderSearch`, `ReaderBookmarks`, `ReaderSettingsDialog`, `ReaderViewport`, `ReaderStatus`.
- Implemented `ReaderHistory` with 50-entry bounded storage, consecutive location deduplication, forward truncation on branching navigation, and bi-directional Back/Forward stepping.
- Implemented canonical format-independent `Bookmark` model with atomic persistence to external data storage via `/api/reader/items/:id/bookmarks`.
- Implemented format-appropriate preferences and theming: Light, Warm, and Dark theme tokens (`.theme-warm`, `.theme-dark`), font family (Serif, Sans, Mono), font sizing (12–28px), line height, text alignment, and zoom (50%–300%) / rotation (90° increments) controls.
- Implemented accessible keyboard model (Arrow keys, Space bar, Ctrl+F, B for bookmarks, Esc to close modals/sidebars), touch swipe gesture handling, accessible `<dialog>` focus trapping, and error recovery states with retry and library return actions.
- Preserved complete engine invisibility: zero vendor chrome, toolbars, logos, or engine-native state storage.
- Reaffirmed Zero-OCR policy: image-only and scanned documents truthfully report lack of text capabilities, disabling search and displaying a clear "Image Scan" badge.
- Added 5 new automated tests verifying unified reader history, bookmarks, preferences, error recovery, and zero format branching (97/97 tests passing).
- Captured 101 responsive visual review screenshots across Desktop, Tablet, and Mobile in `READ_WATCH_DATA_ROOT/visual-review/phase-07/` with machine-readable `manifest.json` and human-readable `REVIEW_INDEX.md`.
- Completed Graphify audit (828 nodes, 1703 edges, 60 communities, 0 import cycles) and Ponytail complexity audit with zero new runtime dependencies.

## 2026-09-14 - Phase 06 PDF engine

- Pinned official Mozilla PDF.js npm distribution: `"pdfjs-dist": "4.10.38"` (Apache-2.0, SHA-1 `3ee698003790dc266cc8b55c0e662ccb9ae18f53`, integrity `sha512-/Y3fcFrXEAsMjJXeL9J8+ZG9U01LbuWaYypvDW2ycW1jL269L3js3DVBjDJ0Up9Np1uqDXsDrRihHANhZOlwdQ==`) with 0 vulnerabilities reported by `npm audit --omit=dev`.
- Documented upstream provenance and license in `App/docs/project/PROVENANCE_PDFJS.md` and updated `TECHNOLOGY_LEDGER.md` and `UPSTREAM_AND_LICENSE_LEDGER.md`.
- Implemented production `PdfAdapter` under `App/app/lib/document/pdf-adapter.ts` fully conforming to the canonical `DocumentAdapter` contract with complete lifecycle state machine, metadata extraction, outline/TOC extraction, navigation, search with cancellation, selection, and versioned `pdf-geometry` text anchors (`schemaVersion: 1`).
- Implemented resolution-independent canvas rendering with `devicePixelRatio` backing store scaling, bounded by `MAX_CANVAS_DIMENSION = 8192` to prevent memory exhaustion on mobile and large zoom levels.
- Implemented synchronized `.textLayer` aligned directly to unscaled canvas CSS viewport with zero coordinate drift across zoom (0.25x - 5.0x) and orthogonal 90°/180°/270° rotation. Text selection overlay styled with the Phase 03 Warm Editorial palette.
- Enforced strict Zero-OCR policy: zero OCR dependencies, binaries, or background workers exist. Scanned/missing-text PDFs truthfully report lack of text capabilities, and the reader UI displays an "Image Scan" badge with disabled search.
- Added controlled local endpoints in `reader-vite-plugin.mjs` serving verified worker (`/api/reader/pdfjs/worker.mjs`), CMaps, and standard fonts with `X-Content-Type-Options: nosniff` and immutable caching headers, eliminating all third-party CDN dependencies.
- Refactored reader presentation layer at `App/app/app/reader/[id]/page.tsx` to be 100% capability-driven (`canZoom`, `canPaginate`, `canSearch`, `canAdjustFont`), eliminating format branching and passing the architectural audit.
- Source Immutability Gate passed: verified against real local publications (including local cookbook and library books). Confirmed 100% byte-identical SHA-256 hashes and modification timestamps before and after reader operations.
- Added 23 automated tests across 5 new test suites covering conformance, page geometry, features, edge cases, and source immutability (92/92 Node tests passing).
- Captured 18 responsive screenshots across Desktop (1440x900), States, Tablet (1024x768), and Mobile (390x844) under `READ_WATCH_DATA_ROOT/visual-review/phase-06/` with `manifest.json` and `REVIEW_INDEX.md`.
- Completed Graphify audit (730 nodes, 1405 edges, 51 communities, 0 import cycles) and Ponytail complexity audit.

## 2026-09-14 - Phase 05 reflowable book engine

- Pinned official upstream Foliate-JS commit `78914aef4466eb960965702401634c2cb348e9b1` (MIT) and vendored core reflowable rendering modules under `App/forks/foliate-js/` with zero modifications to upstream code.
- Implemented production `FoliateReflowableAdapter` under `App/app/lib/document/reflowable-adapter.ts` conforming strictly to the canonical `DocumentAdapter` contract with full lifecycle state transitions, layout mode toggling, navigation, search with cancellation, selection, and anchor round-trips.
- Registered reflowable adapter across EPUB, MOBI, AZW, AZW3, FB2, and CBZ formats in `defaultAdapterRegistry`.
- Implemented `resource-boundary.ts` defending against Zip-Slip, directory traversal, unsafe resource protocols, and applying `STRICT_READER_CSP`.
- Added server streaming endpoint `GET /api/reader/items/:id/file` with `X-Content-Type-Options: nosniff` and path containment.
- Built verification reader interface at `App/app/app/reader/[id]/page.tsx` styled strictly with Phase 03 warm editorial design tokens; zero Foliate UI or branding.
- Enforced PDF phase boundary: fixed-layout PDF items yield explicit user notices directing to reflowable items, strictly reserving PDF.js for Phase 06.
- Source Immutability Gate passed: all 8 real local EPUB publications in `Read and Watch - Local Data/Read/Book` verified 100% byte-identical before and after reader operations.
- Added 16 automated tests covering adapter conformance, resource boundary, format certification, and restore/source immutability (69/69 Node tests passing).
- Captured 23 responsive screenshots across Desktop, Tablet, and Mobile in `READ_WATCH_DATA_ROOT/visual-review/phase-05/`.
- Completed Graphify audit (636 nodes, 1269 edges, 29 communities, 0 import cycles) and Ponytail complexity audit.

## 2026-09-13 - Phase 04 document adapter foundation

- Implemented the format-independent document adapter foundation under `App/app/lib/document/` with zero new runtime dependencies.
- Established the canonical `DocumentAdapter` contract with full lifecycle state machine (`created`, `opening`, `open`, `closing`, `closed`, `failed`), navigation, search, selection, and anchor resolution with `AbortSignal` cancellation support.
- Defined normalized `DocumentError` taxonomy covering 15 error codes with path-sanitized, client-safe error messages.
- Implemented `DocumentCapabilities` boolean contract (`toc`, `textSearch`, `textSelection`, `textAnchors`, `pageNavigation`, `semanticLocationNavigation`, `pagination`, `continuousLayout`, `zoom`, `fontControls`, `themeControls`, `spreadLayout`, `bookmarks`, `textExtraction`) and standard capability profiles.
- Implemented versioned outer envelopes (`DocumentLocation`, `TextAnchor`) with `schemaVersion: 1`, tagged union payloads, and SHA-256 source-hash verification.
- Built minimal `DocumentAdapterRegistry` with duplicate collision rejection and format factory lookup.
- Implemented `ReaderSession` capability-driven session controller with snapshot state subscriptions.
- Created fixed-layout (`FakePdfAdapter`) and reflowable (`FakeReflowableAdapter`) test doubles.
- Implemented universal 18-point conformance suite passed by both test doubles.
- Created format-branching enforcement test suite verifying zero format-conditional branching across presentation components and routes.
- Executed Graphify audit (569 nodes, 1048 edges, 34 communities, 0 import cycles) and Ponytail complexity audit.
- Preserved legacy Readest bridge and certified fallback; zero third-party rendering engines integrated.

## 2026-09-13 - Phase 03 unified design system and library UI

- Implemented the complete token, typography, and component foundation adhering strictly to `DESIGN_CONSTITUTION.md` (warm ivory canvas, charcoal text, deep muted teal accent, editorial serif headings, clean UI sans, 6px radii, and compact desktop density).
- Built custom accessible UI primitives using native HTML semantics (`Button`, `Input`, `Table`, `Badge`, `Kbd`, `Skeleton`, `Tooltip`, `Dialog`, `DropdownMenu`, `ToastProvider`) with zero external component libraries.
- Implemented the unified application shell and navigation across `/` (Library browser), `/highlights`, `/canvas-notes`, `/settings`, `/privacy`, and `/terms`.
- Built the Calibre-class library table with real-time search (`/` shortcut), faceted filters (type, status, tags), multi-column sorts, column visibility customization, saved views, and keyboard navigation.
- Built the item detail peek pane with 8 functional tabs: Overview, Thoughts, Notes, Metadata, Media (with lightbox preview), Links, Highlights, and Canvas.
- Implemented manual metadata editing with optimistic concurrency detection, validation, conflict detection, reload actions, and safe local persistence.
- Verified data truthfulness with all 91 authentic items rendered from canonical SQLite without fake ratings, placeholder books, or mock reviews.
- Captured 24 baseline screenshots and 82 final certification screenshots stored externally under `READ_WATCH_DATA_ROOT/visual-review/phase-03/`.
- Refreshed Graphify (390 nodes, 564 edges, 22 communities, 0 import cycles) and completed Ponytail audit with zero new dependencies.

## 2026-09-08 - Phase 02 library manager foundation

- Added the Read & Watch-owned SQLite schema, deterministic migration, canonical runtime store, and file-first recovery pipeline without adding a dependency.
- Preserved all 91 stable records, exact Read/Watch semantics, Notion properties, media, hashes, provenance, and the verified personal-book source binding.
- Added backend operations for manual metadata, properties, people/authors, Read series, tags, status, rating, search, sorting, filtering, saved views, relationships, duplicate detection, and format inventory.
- Migrated Thoughts and Notes to canonical SQLite persistence while retaining atomic Markdown recovery mirrors and bounded history.
- Proved dry-run/apply fingerprint equality, interruption recovery, resumable rerun, export/rebuild equivalence, online backup, restore, tamper detection, and rollback behavior.
- Updated the unchanged application UI, asset build, user-data bridge, and legacy reader bridge to consume SQLite.
- Refreshed Graphify and completed the Ponytail complexity audit; no Phase 03 UI work or later product phase started.

## 2026-09-08 - Phase 01 architecture and data-model design

- Specified the common Item model with separate Read and Watch extensions and preserved all 91 existing stable IDs.
- Accepted a Read & Watch-owned SQLite runtime with deterministic file-first recovery; no database or migration was created.
- Added schema, transaction, migration, backup, restore, rebuild, document-adapter, ownership, and threat-model contracts.
- Mapped every current catalog, import, provenance, user-added, media, and Notion-property field to a normalized or retained-unknown path.
- Formally deferred the project-level license decision before direct third-party adoption or external distribution.
- Ran Graphify and Ponytail against the architecture and kept speculative frameworks, sync, event sourcing, graph databases, and premature abstractions out of the design.
- No application behavior, reader, UI, upstream dependency, source data, or OCR feature changed.

## 2026-09-08 - One-time governance and planning bootstrap

- Added the canonical master-plan, run-state, phase-index, verification, blocker, architecture, design, technology, licensing, data-safety, and execution-governance system under `docs/project/`.
- Certified the sanitized historical foundation for repository separation and Tasks 1-3 against live local, external-data, and GitHub evidence.
- Classified Readest as the certified legacy fallback and superseded the unfinished legacy Task 4 without marking its work complete.
- Established the unified native reader direction: Read & Watch-owned experience and data, Foliate-JS for reflowable formats, PDF.js for PDF, and late OCR.
- Refreshed Graphify and ran the Ponytail whole-repository complexity audit; committed summaries contain no private library content.
- Added dependency-free master-plan/state validation.
- No reader, library redesign, annotation, canvas, graph, desktop, OCR, AI, or other new product feature was implemented.

## 2026-09-08 - Repository separation

- Moved all personal, backup, runtime, generated, and operational evidence out of the Git repository into a verified sibling local-data root.
- Added a single external data-root resolver used by the application and import utilities.
- Converted the pinned Readest integration from a nested repository into a provenance-documented vendored source tree.
- Added automated repository-hygiene checks and prepared a clean one-commit public history.
- No Task 4, Mermaid, graph, AI, annotation, or recommendation features were started.

## 2026-08-31

- Started Task 1.
- Added the durable resume/checkpoint documents.
- Established software, personal-data, immutable-backup, importer, report, and log boundaries.
- Added placeholder documentation for future Readest and Mermaid forks without cloning or modifying them.
- Created a verified, read-only snapshot of the source collections with complete SHA-256 manifests and a PASS report.
- Added a machine-readable and human-readable audit of the verified Notion packages, including 19 Read records, 71 Watch records, properties, attachments, variants, and duplicate-title risk.
- Added a tested, restartable, provenance-preserving staged importer; its full 90-record preflight passes with complete attachment and link accounting.
- Imported and verified all 90 library items and 74 attachments with zero conflicts.
- Generated compact Read/Watch master indexes plus a 90-item real-data catalog for the UI; full library/index/catalog verification passes.

## 2026-09-01

- Added the local React 19/TypeScript/Vinext/Tailwind browsing application backed by the verified 90-item catalog.
- Added Read and Watch navigation, collection-specific property tables, search, keyboard selection, real preview media, responsive item details, and explicit future Readest/Mermaid placeholders.
- Added a path-constrained local media adapter; production output contains exactly 74 referenced assets totaling 66,994,442 bytes.
- Verified desktop and 390x844 mobile behavior, missing-artwork fallbacks, long-title truncation, empty fields, detail selection, loaded media, and an empty browser console.
- Added a local SVG application icon and verified its production request returns HTTP 200.
- Removed 57 unused generated UI component files and unused helper/dependency layers.
- Upgraded and pinned the React/Vinext/Vite/Cloudflare toolchain; lint, TypeScript, production build, production runtime, and npm audit all pass with zero vulnerabilities.
- Refreshed the Graphify code map to 237 nodes, 254 edges, and 14 communities; multigraph diagnostics report zero missing, dangling, duplicate, or self-loop edges.
- Re-ran the complete source-to-backup-to-library certification. All checks pass, all 8 backup files remain read-only, and all 90 items plus 74 attachments remain verified.
- Completed Task 1 and recorded the final evidence in `reports/UI_VERIFICATION.md` and `reports/TASK_1_FINAL_REPORT.md`.

## 2026-09-01 (Task 2)

- Completed a read-only whole-PC location audit on C: and D:; exactly one
  confirmed project copy exists, with no diverged copies. Recorded the
  evidence in `reports/WHOLE_PC_LOCATION_AUDIT.md`,
  `reports/PROJECT_COPY_COMPARISON.md`, and `reports/PROJECT_LOCATIONS.json`.
- Re-certified Task 1 against the live filesystem (16/16 gates pass).
- Added Task 2 local persistence for My Thoughts and Notes in a separate
  writable `user-data/` area: lazy-created UTF-8 Markdown files keyed by
  stable catalog item IDs, atomic temp+rename saves, bounded `.history/`
  retention, conflict detection, and a compact `user-data/index.json`.
- Added a minimal local write bridge (Vite dev-server middleware + pure Node
  store) with server-side path validation and no new dependencies.
- Wired the editors into the item detail UI with Save, Ctrl+S, save-state
  indicators, unsaved-changes warnings, safe switching, and an Edit/Preview
  toggle that preserves raw Markdown.
- Added 14 automated persistence tests; all pass.
- Verified the UI in headless Chrome (desktop and 390x844 mobile): 24/24
  checks pass with an empty console.
- Re-checked protected evidence after Task 2: source exports, verified
  backup, imported library, manifests, and Task 1 reports are unchanged.
- Completed Task 2 and recorded the evidence in
  `reports/TASK_2_PERSISTENCE_VERIFICATION.md` and
  `reports/TASK_2_FINAL_REPORT.md`. Task 3 (Readest/Mermaid) is not started.

## 2026-09-02 (Task 3 partial)

- Re-certified the protected Task 1/2 baseline and audited all 19 Read items;
  the catalog contains zero local book files and 19 preview images.
- Pinned the official Readest repository at
  `6df90139dc7b72246572ab33b12d485b281ca6e6` on a clean local integration
  branch, with only provenance/change-ledger files added to the fork.
- Built a verified portable Windows/Tauri Readest executable and configured
  transient separate-window open under the project-owned runtime tree.
- Added a dependency-free stable-ID reader bridge that resolves only
  catalog-declared Read media, rejects unsafe or unsupported targets, and
  requires explicit opaque selection when more than one book is available.
- Activated the Read-only `Open in Reader` UI while preserving Watch and future
  Mermaid behavior.
- Added 11 reader tests; the combined suite passes 25/25. Lint, TypeScript,
  production build, desktop/mobile UI, live API, native Readest UI, and seven
  upstream fixture formats pass verification.
- Re-hashed all protected data after implementation; every aggregate exactly
  matches its pre-Task-3 baseline.
- Recorded detailed evidence in `reports/TASK_3_READEST_DIFF.md`,
  `reports/TASK_3_READER_VERIFICATION.md`, and
  `reports/TASK_3_FINAL_REPORT.md`.
- Left Task 3 incomplete at its only blocked gate: no genuine personal book is
  available for the required catalog-to-native-reader end-to-end test. Task 4,
  Mermaid, AI, and reader redesign were not started.

## 2026-09-02 (Task 3 certification)

- Added the explicitly authorized personal PDF as a new user-added twentieth
  Read item with a deterministic content-derived stable ID and provenance that clearly excludes
  Notion import origin.
- Copied the verified source into the normal item `media/` directory; source,
  library-copy, before-reader, and after-reader SHA-256 values all match.
- Extended the existing deterministic catalog/index and verification tooling
  to include separately manifested user-added items without rewriting any of
  the original 19 Read records.
- Verified the genuine 201-page PDF end to end through the parent Read UI and
  upstream-native Readest: cover/title/author, readable pages 10/19/33,
  sequential and contents navigation, close-to-library, and reopening pass.
- Made the existing library footer count derive from the catalog total and
  prevented book formats from being duplicated into the production build.
- Re-ran the 25/25 parent suite, all 14 Task 2 persistence cases, lint,
  TypeScript, production build, read-only library verification, browser
  console, fork, runtime, and protected-data checks; all pass.
- Certified Task 3 complete in
  `reports/TASK_3_REAL_BOOK_VERIFICATION.md`. Task 4, Mermaid, annotations,
  drawings, AI, and reader redesign were not started.
