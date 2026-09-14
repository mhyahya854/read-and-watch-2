# Project State

Bootstrap and historical foundation: COMPLETE and CERTIFIED.

Legacy Task 4: SUPERSEDED - DO NOT EXECUTE.

Last completed phase: `PHASE-07` - Unified Reader Experience.

Current actionable phase: `PHASE-08` - Legacy Readest Parity and Retirement (`NOT_STARTED`).

Exact next task: `P08-T001` - audit legacy Readest feature parity and gap analysis.

Phase 07 implementation results:

- Unified the reflowable (Foliate-JS) and fixed-layout (Mozilla PDF.js) engines behind a single capability-driven Read & Watch reader interface (`App/app/app/reader/[id]/page.tsx`, `App/app/components/reader/`).
- Eliminated all format-conditional branching (`format === 'pdf'`, `isPdf`) across presentation components; reader chrome queries runtime capabilities (`canZoom`, `fontControls`, `textSearch`, `continuousLayout`, `canRotate`).
- Built modular reader component suite adhering strictly to the Warm Editorial design system: `ReaderShell`, `ReaderToolbar`, `ReaderSidebar`, `ReaderContents`, `ReaderSearch`, `ReaderBookmarks`, `ReaderSettingsDialog`, `ReaderViewport`, `ReaderStatus`.
- Implemented `ReaderHistory` with 50-entry bounded storage, consecutive location deduplication, forward truncation on branching navigation, and bi-directional Back/Forward stepping.
- Implemented canonical format-independent `Bookmark` model with atomic persistence to external data storage via `/api/reader/items/:id/bookmarks`.
- Implemented format-appropriate preferences and theming: Light, Warm, and Dark theme tokens (`.theme-warm`, `.theme-dark`), font family (Serif, Sans, Mono), font sizing (12–28px), line height, text alignment, and zoom (50%–300%) / rotation (90° increments) controls.
- Implemented accessible keyboard model (Arrow keys, Space bar, Ctrl+F, B for bookmarks, Esc to close modals/sidebars), touch swipe gesture handling, accessible `<dialog>` focus trapping, and error recovery states with retry and library return actions.
- Preserved complete engine invisibility: zero vendor chrome, toolbars, logos, or engine-native state storage.
- Reaffirmed Zero-OCR policy: image-only and scanned documents truthfully report lack of text capabilities, disabling search and displaying a clear "Image Scan" badge.
- Automated tests: 97/97 tests passing (5 new tests in `tests/reader-unified-experience.test.mjs` verifying history, bookmarks, preferences, error recovery, and zero format branching).
- Visual review: 101 responsive screenshots captured across Desktop, Tablet, and Mobile under `READ_WATCH_DATA_ROOT/visual-review/phase-07/` with `manifest.json` and `REVIEW_INDEX.md`.
- TypeScript 0 errors, oxlint 0 errors/warnings across 72 files, production build passing cleanly.
- Graphify: PASS - 828 nodes, 1703 edges, 60 communities, 0 import cycles.
- Ponytail: PASS - zero new npm dependencies, native Web/DOM APIs, zero dead code or premature abstractions.
- Phase 07 content commit `94aae776f8264aa53a8a8d70cae28e693d3cc0af` was pushed and verified on GitHub; the closure commit records that remote gate.

Starting Phase 07 local/remote HEAD: `9209598ab8ed5a25f9e14f74ae00d016c657086b`.

Phase 06 implementation results:

- Pinned official Mozilla PDF.js npm distribution: `"pdfjs-dist": "4.10.38"` (Apache-2.0, zero vulnerabilities); recorded in `App/docs/project/PROVENANCE_PDFJS.md`.
- Implemented production `PdfAdapter` under `App/app/lib/document/pdf-adapter.ts` fully conforming to the canonical `DocumentAdapter` contract with complete lifecycle state machine, metadata extraction, outline/TOC extraction, navigation, search with cancellation, selection, and versioned `pdf-geometry` text anchors (`schemaVersion: 1`).
- Implemented resolution-independent canvas rendering with `devicePixelRatio` backing store scaling, bounded by `MAX_CANVAS_DIMENSION = 8192` to prevent memory exhaustion on mobile and large zoom levels.
- Implemented synchronized `.textLayer` aligned directly to unscaled canvas CSS viewport with zero coordinate drift across zoom (0.25x - 5.0x) and orthogonal 90°/180°/270° rotation. Text selection overlay styled with the Phase 03 Warm Editorial palette.
- Enforced strict Zero-OCR policy: zero OCR dependencies, binaries, or background workers exist. Scanned/missing-text PDFs truthfully report lack of text capabilities, and the reader UI displays an "Image Scan" badge with disabled search.
- Added controlled local endpoints in `reader-vite-plugin.mjs` serving verified worker (`/api/reader/pdfjs/worker.mjs`), CMaps, and standard fonts with `X-Content-Type-Options: nosniff` and immutable caching headers, eliminating all third-party CDN dependencies.
- Refactored reader presentation layer at `App/app/app/reader/[id]/page.tsx` to be 100% capability-driven (`canZoom`, `canPaginate`, `canSearch`, `canAdjustFont`), eliminating format branching and passing the architectural audit.
- Source Immutability Gate passed: verified against real local publications (including local cookbook and library books). Confirmed 100% byte-identical SHA-256 hashes and modification timestamps before and after reader operations.
- Automated tests: 92/92 Node tests passing (23 new tests covering conformance, page geometry, features, edge cases, and source immutability).
- Visual review: 18 responsive screenshots captured across Desktop (1440x900), States, Tablet (1024x768), and Mobile (390x844) under `READ_WATCH_DATA_ROOT/visual-review/phase-06/` with `manifest.json` and `REVIEW_INDEX.md`.
- TypeScript 0 errors, oxlint 0 errors/warnings across 58 files, production build passing cleanly.
- Graphify: PASS - 730 nodes, 1405 edges, 51 communities, 0 import cycles.
- Ponytail: PASS - minimal dependency pin, zero Mozilla viewer bloat, zero OCR bloat, zero code bloat.
- Phase 06 content commit `5977f4a71f7a72db5a088683907bb1bc8152b357` was pushed and verified on GitHub; the closure commit records that remote gate.

Starting Phase 06 local/remote HEAD: `14d9ca74d46a24962776858f71fb24845f0a452b`.

Phase 05 implementation results:

- Pinned official upstream Foliate-JS commit `78914aef4466eb960965702401634c2cb348e9b1` (MIT); recorded in `App/forks/foliate-js/PROVENANCE.md`.
- Vendored core reflowable rendering modules under `App/forks/foliate-js/` with zero modifications to upstream code. Non-core demo UI, TTS, OPDS, and PDF modules omitted.
- Implemented `FoliateReflowableAdapter` under `App/app/lib/document/reflowable-adapter.ts` conforming strictly to the canonical `DocumentAdapter` contract with full lifecycle state machine, metadata extraction, hierarchical TOC tree, navigation, text search with cancellation, selection, and text anchor round-trips.
- Implemented `resource-boundary.ts` enforcing Zip-Slip defense, directory traversal rejection, safe URI scheme validation, and strict reader Content Security Policy (`STRICT_READER_CSP`).
- Added path-constrained server streaming endpoint `GET /api/reader/items/:id/file` with `X-Content-Type-Options: nosniff` in `reader-vite-plugin.mjs` and `reader-store.mjs`.
- Implemented minimal verification reader interface at `App/app/app/reader/[id]/page.tsx` styled entirely with Phase 03 design tokens; zero Foliate UI or branding.
- Enforced strict PDF phase boundary: fixed-layout PDF items yield explicit user notices directing to reflowable items, strictly reserving PDF.js for Phase 06.
- Source Immutability Gate passed: all 8 real local EPUB publications in `Read and Watch - Local Data/Read/Book` verified 100% byte-identical before and after reader operations.
- Automated tests: 69/69 Node tests passing (16 new tests covering conformance, resource boundary, format support, and restore/immutability).
- Visual review: 23 responsive screenshots captured across Desktop (1440x900), Tablet (1024x768), and Mobile (390x844) under `READ_WATCH_DATA_ROOT/visual-review/phase-05/` with `manifest.json` and `REVIEW_INDEX.md`.
- TypeScript 0 errors, oxlint 0 errors/warnings across 57 files, production build passing cleanly.
- Graphify: PASS - 636 nodes, 1269 edges, 29 communities, 0 import cycles.
- Ponytail: PASS - zero new npm dependencies, minimal server streaming surface, zero code bloat.
- Phase 05 content commit `bbe8ac094b89e47dfb8ee8c2b00be8377a6f5820` was pushed and verified on GitHub; the closure commit records that remote gate.

Starting Phase 05 local/remote HEAD: `a4c7d8f56d8932d4d6f10e4e5bc93b4d12b579f2`.

Phase 04 implementation results:

- Implemented canonical `DocumentAdapter` contract under `App/app/lib/document/` with full lifecycle states, TOC, navigation, search, selection, and anchor round-trips with `AbortSignal` cancellation.
- Implemented normalized `DocumentError` taxonomy with 15 discrete error codes and sanitized, path-safe error messaging.
- Implemented `DocumentCapabilities` boolean contract and standard capability profiles (`STANDARD_PDF_CAPABILITIES`, `STANDARD_REFLOWABLE_CAPABILITIES`).
- Implemented versioned outer envelopes (`DocumentLocation`, `TextAnchor`) with `schemaVersion: 1`, tagged union payloads (`page`, `semantic`, `progression`; `pdf-geometry`, `reflowable-range`), and SHA-256 source-hash verification.
- Built minimal `DocumentAdapterRegistry` with duplicate collision rejection and format factory lookup.
- Implemented `ReaderSession` capability-driven session controller with snapshot state subscriptions, eliminating format conditionals from UI components.
- Created concrete fixed-layout (`FakePdfAdapter`) and reflowable (`FakeReflowableAdapter`) test doubles.
- Universal 18-point conformance suite passed by both test doubles.
- Format-branching enforcement test suite passing with 0 violations across all presentation components and routes.
- Node tests 53/53, TypeScript 0 errors, oxlint 0 errors/warnings, production build passing, zero vulnerability audit passing.
- Graphify: PASS - 569 nodes, 1048 edges, 34 communities, 0 import cycles.
- Ponytail: PASS - zero new runtime dependencies, pure TypeScript implementation with native Node 24 ESM execution.
- Scope boundary verified: zero third-party rendering engines integrated; legacy Readest bridge preserved.
- Phase 04 content commit `fc807ebe52ee01d7c9b7af26bffe6123b21cb1a2` was pushed and verified on GitHub; the closure commit records that remote gate.

Starting Phase 04 local/remote HEAD: `3d550f3315d8885206531f8d07d07f94913e1f4e`.

Phase 03 implementation results:


- Unified design system implemented adhering strictly to `DESIGN_CONSTITUTION.md` (warm ivory `#fbfbfa`, charcoal text `#1c1c1a`, deep muted teal accent `#244b4c`, editorial serif headings, clean UI sans, rectangular controls, 6px radii, compact desktop table density, no purple, no gradients).
- Unified shell and navigation supporting `/` (Library browser), `/highlights` (Phase 09 interim preview), `/canvas-notes` (Phase 10 interim preview), `/settings` (functional local settings categories), `/privacy` (local-first disclosure), and `/terms` (local-first software terms).
- Calibre-class library table with real-time search (`/` keyboard shortcut), faceted filters (type, status, tags), multi-column sorts, column visibility toggles, 6 pre-configured saved views, and arrow-key row navigation.
- Item detail peek pane with 8 functional tabs: Overview, Thoughts, Notes, Metadata, Media (with lightbox preview), Links, Highlights, and Canvas.
- Manual metadata editing with optimistic revisions, strict client-side validation, conflict detection, reload server copy action, and safe SQLite persistence via `PUT /api/library/items/:id`.
- Data truthfulness: all 91 items rendered with genuine provenance; zero fake ratings, books, reviews, or progress bars.
- Visual certification: 24 baseline screenshots captured in `before/` and 82 final review screenshots captured across `after/`, `states/`, and `breakpoints/` under `READ_WATCH_DATA_ROOT/visual-review/phase-03/` with full `manifest.json` and `REVIEW_INDEX.md`. No screenshots committed to Git.
- Node tests 35/35, Python tests 15/15, hygiene tests 2/2, library verification, lint, TypeScript, production build, and zero-vulnerability audit PASS.
- Graphify: PASS - 390 nodes, 564 edges, 22 communities, 0 import cycles.
- Ponytail: PASS - zero new dependencies, semantic HTML components, zero dead CSS.
- Phase 04 ("Document Adapter Foundation") has not been started.
- Phase 03 content commit `e5de157c03d524ee8cb4a2c09d968e3f18cebf33` was pushed and verified on GitHub; the closure commit records that remote gate.

Starting Phase 03 local/remote HEAD: `a58da7ce50ee0641a01f47cb8f49cca122b0f0be`.

Phase 01 results:

- Common Item plus separate Read/Watch extensions specified.
- SQLite canonical runtime plus deterministic file-first recovery accepted.
- Existing 91 stable IDs and all current source fields mapped losslessly.
- Migration, transaction, backup, restore, rebuild, adapter, ownership, and threat-model contracts specified.
- Project-level license formally deferred pending user/legal decision before direct adoption or distribution.
- Graphify: PASS - Phase 01 architecture query, 326 nodes, 402 edges, 22 communities, integrity clean.
- Ponytail: PASS - speculative frameworks and premature tables deferred; no unrelated cleanup applied.
- App regressions: 28/28 Node tests, 6/6 import tests, 2/2 hygiene tests, lint, TypeScript, build, and zero-vulnerability audit PASS.
- Immutable backup and 91-item library verification PASS. One stale historical user-added source path is retained with exact current source/copy hash evidence; no source was changed.
- Phase 01 content commit `b83cf89780b6f9c7e023f3374752c49a34022d40` was pushed and verified on GitHub; the closure commit records that remote gate.

Starting local/remote HEAD: `4b3037025e069851e1ccf73bbf1beb5b3285807d`.

Active blockers: none. Known pre-implementation requirements are the reviewed stale-provenance normalization before live migration and a project-license choice before direct third-party adoption or external distribution.

Scope boundary: Phase 01 is complete. No Phase 02 implementation, migration, product feature, UI redesign, reader integration, upstream acquisition, dependency addition, or OCR work occurred.
