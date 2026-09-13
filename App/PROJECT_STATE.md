# Project State

Bootstrap and historical foundation: COMPLETE and CERTIFIED.

Legacy Task 4: SUPERSEDED - DO NOT EXECUTE.

Last completed phase: `PHASE-03` - Unified Design System and Library UI.

Current actionable phase: `PHASE-04` - Document Adapter Foundation (`IN_PROGRESS`).

Exact next task: `P04-G004` - commit and push verified Phase 04 implementation, verify GitHub containment, and complete Phase 04 closure.

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
