# Read & Watch Master Plan

Canonical since: 2026-09-08 governance bootstrap

Status values: `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `COMPLETE`, `SUPERSEDED`.

## Governing rules

- Explicit current user instructions outrank this plan; the full hierarchy is in `AGENTS.md`.
- Engines provide capabilities. Read & Watch owns the experience and canonical data.
- Original exports, verified backup, original books, and protected personal data remain immutable and outside Git.
- One invocation works only on the current task or phase. When a phase completes, stop.
- No phase becomes complete before its commit is pushed and verified on GitHub.
- Every run and phase gate requires actual Graphify and Ponytail evidence.
- OCR is late and optional for usable-text documents. The application must work fully without OCR.

## Target architecture

```text
                              READ & WATCH
                                   |
                    OUR UI + OUR DATA + OUR LOGIC
                                   |
          +------------------------+------------------------+
          |                        |                        |
       LIBRARY                   READER                 KNOWLEDGE
          |                        |                        |
        React               DocumentAdapter                 |
          |                        |                        |
          |              +---------+---------+              |
          |              |                   |              |
          |      REFLOWABLE BOOK             PDF             |
          |              |                   |              |
          |         Foliate-JS             PDF.js            |
          |                                                  |
          |                         OUR ANNOTATIONS           |
          |                               |                  |
          |                    +----------+----------+       |
          |                    |                     |       |
          |                PAGE MARKS           BOOK NOTES   |
          |                                          |       |
          |                                      Excalidraw  |
          |                                                  |
          |                                           +------+------+
          |                                           |             |
          |                                      React Flow      Mermaid
          |                                     when useful     when useful
          |
          +---------------- OUR LIBRARY DATA ----------------+
                                   |
                         Read & Watch SQLite
                         + file-first recovery
                                   |
                      READ_WATCH_DATA_ROOT
```

```text
LATE OCR EXTENSION

PDF.js
  |
  +-- usable text PDF -> native text layer
  |
  +-- flat / unusable scan PDF
            |
            +-- PaddleOCR-VL
            +-- Tesseract validator
            +-- benchmarked Urdu/Nastaliq specialist
            +-- human review / correction memory
```

## PHASE-00 - CERTIFIED HISTORICAL FOUNDATION

Status: `COMPLETE`

### Objective

Certify repository separation and completed Tasks 1-3 without redoing implementation.

### Dependencies

None.

### Scope

Clean public repository, external data root, immutable source/backup, deterministic import, current library/UI, persistent notes, safe legacy reader integration, recovery and hygiene evidence.

### Explicit non-goals

No new product implementation, reader replacement, annotation work, data migration, OCR, AI, or upstream acquisition.

### Checklist

- [x] P00-T001 Verify repository separation, clean history, recovery retention, and private-data boundary.
- [x] P00-T002 Certify Task 1: 19 original Read, 71 Watch, 90 Notion records, 74 attachments, importer, catalog, and initial UI.
- [x] P00-T003 Certify Task 2 persistent Thoughts/Notes, stable IDs, atomic saves, history, conflicts, path validation, index, UI, and tests.
- [x] P00-T004 Certify Task 3 Read audit, provenance-pinned Readest, secure resolution/launch, real-book gate, and source hashes.
- [x] P00-T005 Classify Readest as `CERTIFIED LEGACY FALLBACK + FEATURE/ARCHITECTURE REFERENCE`.
- [x] P00-T006 Verify local and GitHub baseline at commit `c065f0c81f2e5b8f652371db062c56d9c0000e06`.

### Verification gates

- [x] P00-G001 Current repository hygiene, backup, and library checks pass.
- [x] P00-G002 Parent tests, lint, TypeScript, build, and npm audit pass.
- [x] P00-G003 Historical and migration evidence supports every certification; unknowns are disclosed.
- [x] P00-G004 Graphify and Ponytail bootstrap audits exist with actual results.
- [x] P00-G005 GitHub contains the certified historical commit and forbidden paths are absent.

### Evidence and reports

`docs/project/reports/BOOTSTRAP_BASELINE_AUDIT.md`, `HISTORICAL_CERTIFICATION.md`, `LOCAL_GITHUB_RECONCILIATION.md`, `GRAPHIFY_BOOTSTRAP_AUDIT.md`, and `PONYTAIL_BOOTSTRAP_AUDIT.md`; detailed evidence external.

### Graphify requirement

Refresh the authored-app graph and run integrity diagnostics; keep generated output external.

### Ponytail requirement

Run the whole-repository complexity audit without applying risky cleanup.

### Git requirements

Historical completion commit: `c065f0c81f2e5b8f652371db062c56d9c0000e06`; bootstrap governance closure must be normally pushed and verified separately.

### Completion criteria

All gates above pass, historical claims are sanitized and evidence-backed, and the new governance system is pushed and verified.

### Stop condition

Stop after bootstrap closure. Do not start Phase 01.

## PHASE-01 - MASTER ARCHITECTURE AND DATA-MODEL DESIGN

Status: `NOT_STARTED`

### Objective

Translate the unified product direction into implementable architecture before major code changes.

### Dependencies

`PHASE-00`.

### Scope

Domain model; common Read/Watch entities; book and watch extensions; stable-ID compatibility; SQLite plus file-first strategy; migration/rollback; annotations, adapters, canvases, relationships, provenance, existing 90-record compatibility, user-added books, future OCR storage, and desktop-runtime boundaries.

### Explicit non-goals

No schema migration, reader integration, UI redesign, upstream clone, OCR, or production feature implementation.

### Checklist

- [ ] P01-T001 Capture the live Git/GitHub/protected-state baseline and Phase 01 fingerprint.
- [ ] P01-T002 Inventory current catalog, file-first records, mutable user data, reader bridge, and stable-ID contracts.
- [ ] P01-T003 Specify common Item plus Read-specific and Watch-specific entities without forcing Watch into a book schema.
- [ ] P01-T004 Design SQLite tables, keys, constraints, indexes, transaction boundaries, and schema-version strategy.
- [ ] P01-T005 Design file-first export, backup, restore, disaster recovery, and database rebuild contracts.
- [ ] P01-T006 Map all existing Notion-derived properties, 90 imported records, and user-added-book records losslessly.
- [ ] P01-T007 Specify `DocumentAdapter`, capabilities, lifecycle, errors, location, search, selection, and anchor contracts.
- [ ] P01-T008 Specify canonical annotation, canvas, relationship, reading-position, and source-hash ownership.
- [ ] P01-T009 Design deterministic migration, dry-run, rollback, idempotency, and failure-recovery protocol.
- [ ] P01-T010 Resolve or formally defer project licensing and direct third-party adoption constraints.
- [ ] P01-T011 Record architecture decisions and implementation slices without a massive rewrite.

### Verification gates

- [ ] P01-G001 Every existing field and stable identity has a documented target or explicit retained-unknown path.
- [ ] P01-G002 Schema and recovery design survive representative migration and restore walkthroughs without writes.
- [ ] P01-G003 Threat model covers paths, sources, transactions, conflicts, engine isolation, and canonical ownership.
- [ ] P01-G004 Graphify, Ponytail, governance validator, hygiene, app regressions, commit, push, and GitHub verification pass.

### Evidence and reports

Sanitized `docs/project/reports/PHASE_01_REPORT.md`; detailed mappings and any private samples external.

### Graphify requirement

Query/refine architecture and data-flow relationships; refresh if source changes and record integrity counts.

### Ponytail requirement

Challenge speculative entities, single-use abstractions, and premature flexibility; record what was cut or deferred.

### Git requirements

Commit architecture/governance only, push `master` normally, verify remote files and HEAD before marking complete.

### Completion criteria

An implementable, lossless, security-reviewed architecture exists with no migration performed.

### Stop condition

Stop after Phase 01 is pushed and verified. Do not start Phase 02.

## PHASE-02 - CALIBRE-CLASS READ & WATCH LIBRARY MANAGER FOUNDATION

Status: `NOT_STARTED`

### Objective

Build the Read & Watch-owned library data layer with SQLite plus file-first recoverability.

### Dependencies

`PHASE-01`.

### Scope

Stable IDs; common Read/Watch records; one logical book with formats; manual metadata; authors, series/position, languages, tags, status, rating, covers, custom properties, format inventory, duplicate detection, sort/filter/search, categories/views, provenance, Watch support, and lossless migration.

### Explicit non-goals

No Calibre database/GUI, metadata fetching requirement, reader engine, source mutation, or conversion-first workflow.

### Checklist

- [ ] P02-T001 Establish schema migrations and a test-only database harness.
- [ ] P02-T002 Implement repositories/transactions for common, Read-specific, Watch-specific, format, property, provenance, and relationship data.
- [ ] P02-T003 Implement deterministic dry-run migration preserving all stable IDs and Notion-derived properties.
- [ ] P02-T004 Implement file-first export/rebuild, backup, restore, and rollback.
- [ ] P02-T005 Implement multi-format logical books, inventory, collision-safe duplicate detection, and source-hash records.
- [ ] P02-T006 Implement manual metadata, custom properties, status/tags/rating, sort/filter/search, categories, and virtual views.
- [ ] P02-T007 Migrate the current catalog only after dry-run and protected-state gates pass.
- [ ] P02-T008 Verify Watch-specific semantics independently from Read/book semantics.

### Verification gates

- [ ] P02-G001 Record/field/count/stable-ID parity and provenance are exact; no source or backup drift.
- [ ] P02-G002 Transaction failure, rerun, rollback, restore, and rebuild tests pass.
- [ ] P02-G003 Search/filter/duplicate/multi-format behavior passes focused and real-catalog tests.
- [ ] P02-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

Sanitized `docs/project/reports/PHASE_02_REPORT.md`; private migration manifests and fingerprints external.

### Graphify requirement

Refresh schema/import/data-flow graph and verify no orphaned ownership path.

### Ponytail requirement

Audit repository/data-access layers for unnecessary interfaces, generic repositories, and duplicate models.

### Git requirements

Commit source/schema/docs only; never database or personal records. Push and verify before completion.

### Completion criteria

The current library runs on Read & Watch-owned SQLite with proven lossless file-first recovery.

### Stop condition

Stop after Phase 02 completion. Do not start Phase 03.

## PHASE-03 - UNIFIED DESIGN SYSTEM AND LIBRARY UI

Status: `NOT_STARTED`

### Objective

Build the approved unified Read & Watch shell and Calibre-class library interaction.

### Dependencies

`PHASE-02`.

### Scope

App shell, Read/Watch, sidebar/top navigation, search, filters, sorts, columns/views, manual property editing, detail/peek behavior, Highlights/Canvas entry points, settings foundation, responsiveness, accessibility, and truthful Privacy/Terms placeholders where appropriate.

### Explicit non-goals

No reader engine, annotation implementation, fake content, generic SaaS redesign, or final legal claims.

### Checklist

- [ ] P03-T001 Turn the design constitution into tokens, typography, spacing, icon, control, and state primitives.
- [ ] P03-T002 Implement the unified shell and navigation with Read, Watch, Highlights, Canvas Notes, Settings, Privacy, and Terms routes.
- [ ] P03-T003 Implement library table/database interactions: search, filters, sorts, columns, and valuable saved views.
- [ ] P03-T004 Implement manual metadata and custom-property editing with conflicts/recovery.
- [ ] P03-T005 Implement item detail/peek, provenance, progress, notes, highlights, and canvas entry points.
- [ ] P03-T006 Implement responsive, keyboard, focus, empty, error, loading, and first-run states.
- [ ] P03-T007 Remove mock/fake presentation content and verify all displayed data provenance.

### Verification gates

- [ ] P03-G001 Design constitution and anti-vibe audit pass.
- [ ] P03-G002 Desktop, constrained-width, keyboard, accessibility, and console checks pass.
- [ ] P03-G003 Data edits persist safely and never alter imported/source evidence.
- [ ] P03-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_03_REPORT.md`; private screenshots and test fixtures external when needed.

### Graphify requirement

Refresh UI/data relationships and identify accidental shell-to-engine coupling.

### Ponytail requirement

Audit component proliferation, wrappers, variant systems, dependencies, and decorative code.

### Git requirements

Commit only design-system/application source and sanitized evidence; push and verify.

### Completion criteria

The library UI is unified, functional, accessible, truthful, and constitution-compliant.

### Stop condition

Stop after Phase 03. Do not start the reader adapter.

## PHASE-04 - DOCUMENT ADAPTER FOUNDATION

Status: `NOT_STARTED`

### Objective

Create a format-independent reader contract with capability-driven UI.

### Dependencies

`PHASE-03`.

### Scope

Open/close, metadata, TOC, current location, navigation, search, selection, text anchors, capability reporting, lifecycle, errors, cancellation, and test doubles.

### Explicit non-goals

No Foliate-JS/PDF.js integration, reader chrome, OCR, or format-specific conditions scattered through the app.

### Checklist

- [ ] P04-T001 Finalize adapter types, capability vocabulary, lifecycle, cancellation, and errors.
- [ ] P04-T002 Define location and anchor envelopes with schema versions and source hashes.
- [ ] P04-T003 Build a minimal adapter registry/factory justified by at least PDF and reflowable consumers.
- [ ] P04-T004 Implement contract fixtures/test doubles and conformance tests.
- [ ] P04-T005 Wire capability-driven reader state without rendering a production document engine.
- [ ] P04-T006 Audit unrelated components for format branching and define enforcement.

### Verification gates

- [ ] P04-G001 Contract covers both target engine families without leaking engine-owned data.
- [ ] P04-G002 Lifecycle, error, cancellation, unsupported capability, and anchor-version tests pass.
- [ ] P04-G003 No production engine or source mutation was introduced.
- [ ] P04-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_04_REPORT.md` and adapter capability matrix.

### Graphify requirement

Verify adapters form the intended boundary and format logic does not bypass it.

### Ponytail requirement

Challenge factories, registries, interfaces, and capability abstractions that lack two real consumers.

### Git requirements

Commit contract/tests/docs, push, and verify before completion.

### Completion criteria

Both future engine integrations have a tested, minimal, ownership-safe contract.

### Stop condition

Stop after Phase 04. Do not acquire Foliate-JS.

## PHASE-05 - REFLOWABLE BOOK ENGINE

Status: `NOT_STARTED`

### Objective

Integrate a provenance-pinned Foliate-JS engine behind the adapter.

### Dependencies

`PHASE-04`.

### Scope

Evidence-supported EPUB, MOBI, KF8/AZW3, FB2, and CBZ support; TOC, reflow/fixed layout, pagination/scroll, selection, search, navigation, progress, CFI/location, and position restore.

### Explicit non-goals

No Foliate UI/branding/library, primary PDF route, engine-owned user storage, OCR, or unsupported-format claim.

### Checklist

- [ ] P05-T001 Research official upstream/forks, capabilities, maintenance, license, and security; choose and pin exact provenance.
- [ ] P05-T002 Acquire only the selected source/package and record notices, pin, and changes.
- [ ] P05-T003 Implement the reflowable adapter and resource boundary.
- [ ] P05-T004 Implement TOC, navigation, layout modes, progression, search, selection, CFI/location, and restore.
- [ ] P05-T005 Test each justified format with legal fixtures and available real books.
- [ ] P05-T006 Verify Read & Watch UI ownership and source-file immutability.

### Verification gates

- [ ] P05-G001 Upstream provenance/license and exact pin are complete.
- [ ] P05-G002 Supported-format capability matrix and adapter conformance pass.
- [ ] P05-G003 Positions restore and source hashes remain unchanged.
- [ ] P05-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_05_REPORT.md`; detailed real-book evidence external.

### Graphify requirement

Map engine boundary, resource flow, location ownership, and visible UI dependencies.

### Ponytail requirement

Audit copied engine code, wrappers, format shims, and dependency additions for the smallest viable integration.

### Git requirements

Commit only licensed/pinned source or package metadata, app integration, tests, notices, and sanitized report; push and verify.

### Completion criteria

Justified reflowable formats work through Read & Watch UI and adapter with preserved sources.

### Stop condition

Stop after Phase 05. Do not start PDF.js.

## PHASE-06 - PDF ENGINE

Status: `NOT_STARTED`

### Objective

Integrate PDF.js directly behind the adapter for usable text PDFs.

### Dependencies

`PHASE-05`.

### Scope

Parsing, rendering, selectable text layer, page navigation, outline, links, zoom, rotation, search, metadata, progress, high DPI, malformed input handling, and source immutability.

### Explicit non-goals

No Mozilla viewer chrome/styling, OCR, PDF source mutation, canonical PDF.js annotations, or pdf-lib rendering.

### Checklist

- [ ] P06-T001 Pin official PDF.js package/source and record license/provenance.
- [ ] P06-T002 Implement PDF adapter loading, cleanup, workers, errors, and capabilities.
- [ ] P06-T003 Implement page rendering and selectable synchronized text layer at high DPI.
- [ ] P06-T004 Implement navigation, outline, links, zoom, rotation, metadata, search, progress, and restore.
- [ ] P06-T005 Test text PDFs, missing text, malformed files, large files, and available real PDFs.
- [ ] P06-T006 Verify no OCR path or source write exists.

### Verification gates

- [ ] P06-G001 Adapter conformance and PDF feature matrix pass.
- [ ] P06-G002 Text selection/search alignment and high-DPI rendering pass across zoom/rotation.
- [ ] P06-G003 Original PDF hashes and modification times remain unchanged.
- [ ] P06-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_06_REPORT.md`; private book screenshots/hashes external.

### Graphify requirement

Map worker/render/text/navigation flow and verify annotation ownership remains outside PDF.js.

### Ponytail requirement

Audit viewer-wrapper duplication and reject copied Mozilla UI or premature OCR hooks.

### Git requirements

Commit pinned dependency, adapter/UI/tests/notices, sanitized report; push and verify.

### Completion criteria

Text PDFs are fully usable without OCR through Read & Watch-owned UI.

### Stop condition

Stop after Phase 06. Do not start unified reader polish.

## PHASE-07 - UNIFIED READER EXPERIENCE

Status: `NOT_STARTED`

### Objective

Unify reflowable and PDF reading behind one Read & Watch experience.

### Dependencies

`PHASE-06`.

### Scope

Shared shell, toolbar grammar, sidebars, keyboard conventions, settings language, TOC, search, history, bookmarks, progress, format-appropriate typography/zoom, themes/layout, optional headers/footers, restore, accessibility, touch, and keyboard.

### Explicit non-goals

No visible Foliate/PDF.js identity, annotations beyond bookmarks, Readest removal, OCR, or AI.

### Checklist

- [ ] P07-T001 Define shared reader navigation, toolbar, sidebar, status, and settings grammar.
- [ ] P07-T002 Implement adapter-capability-driven controls with no unrelated format branching.
- [ ] P07-T003 Implement TOC, search, back/forward history, bookmarks, progress, and restore across engines.
- [ ] P07-T004 Implement format-appropriate typography, zoom, themes, layout, and optional headers/footers.
- [ ] P07-T005 Implement keyboard, touch, focus, accessibility, loading, error, and recovery behavior.
- [ ] P07-T006 Verify real cross-format continuity and design constitution compliance.

### Verification gates

- [ ] P07-G001 Shared-reader parity matrix passes for both adapter families.
- [ ] P07-G002 Keyboard/touch/accessibility/console and restore tests pass.
- [ ] P07-G003 No visible engine brand or engine canonical storage remains.
- [ ] P07-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_07_REPORT.md` and cross-format parity matrix.

### Graphify requirement

Verify shared UI depends on capabilities/adapters, not engine internals.

### Ponytail requirement

Audit duplicated controls, format-specific branches, state layers, and settings abstractions.

### Git requirements

Commit shared reader work, tests, docs, sanitized evidence; push and verify.

### Completion criteria

PDF and reflowable reading feel like one Read & Watch product.

### Stop condition

Stop after Phase 07. Keep Readest fallback active.

## PHASE-08 - LEGACY READEST PARITY AND RETIREMENT

Status: `NOT_STARTED`

### Objective

Prove native-reader parity for every relied-on format/book before retiring active Readest use.

### Dependencies

`PHASE-07`.

### Scope

Feature/format/real-book parity, rollback plan, launcher/runtime removal, obsolete code cleanup, vendored-source archival/removal decision, and preserved license/history.

### Explicit non-goals

No early removal, history deletion, source-book change, new reader feature unrelated to parity, or license guess.

### Checklist

- [ ] P08-T001 Inventory every currently relied-on Readest format, book, behavior, and fallback path.
- [ ] P08-T002 Build and execute a native-versus-legacy parity matrix with real inputs.
- [ ] P08-T003 Resolve parity gaps or record blockers without disabling fallback.
- [ ] P08-T004 Design and verify rollback before changing active launcher/runtime paths.
- [ ] P08-T005 Remove active Readest runtime/launcher dependencies only after all parity gates pass.
- [ ] P08-T006 Decide and execute licensed vendored-source archival or safe removal while preserving provenance/reports.
- [ ] P08-T007 Run full reader, library, hygiene, fresh-clone, and protected-source regressions.

### Verification gates

- [ ] P08-G001 Every relied-on format and real book passes native parity.
- [ ] P08-G002 Rollback and provenance/license retention are verified.
- [ ] P08-G003 No obsolete active Readest path remains; protected sources are unchanged.
- [ ] P08-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_08_REPORT.md`; private parity evidence external.

### Graphify requirement

Prove active dependencies no longer reach Readest runtime while historical provenance remains reachable.

### Ponytail requirement

Identify obsolete launcher/runtime/vendor code for deletion only after parity evidence.

### Git requirements

Use auditable non-history-rewriting commits; push and verify removed/retained paths and licenses.

### Completion criteria

Native reader is certified; active Readest fallback is retired safely with history preserved.

### Stop condition

Stop after Phase 08. Do not start annotations.

## PHASE-09 - UNIFIED ANNOTATION FOUNDATION

Status: `NOT_STARTED`

### Objective

Create one canonical Read & Watch annotation universe across PDF and reflowable books.

### Dependencies

`PHASE-08`.

### Scope

Highlight, free highlight where useful, underline, strike-through, comment, excerpt, bookmark/named bookmark, pen, highlighter pen, eraser, line, arrow, rectangle, ellipse, text box; stable IDs; atomic transactions/history/conflicts/recovery; source-hash mismatch; PDF and CFI anchors.

### Explicit non-goals

No engine-owned canonical annotations, source mutation, Excalidraw canvas, OCR, or AI.

### Checklist

- [ ] P09-T001 Finalize versioned annotation types, ownership, lifecycle, and stable IDs.
- [ ] P09-T002 Implement PDF page/normalized-coordinate/text-context anchors and resolution tests.
- [ ] P09-T003 Implement reflowable CFI/range/quote/context/spine fallback anchors and resolution tests.
- [ ] P09-T004 Implement transactions, atomic recovery, bounded history, conflicts, and source-hash mismatch handling.
- [ ] P09-T005 Implement text marks, comments, excerpts, and named bookmarks.
- [ ] P09-T006 Implement pen/highlighter/eraser, line/arrow/rectangle/ellipse, and text boxes where capabilities permit.
- [ ] P09-T007 Implement select/edit/delete/show/hide/undo/redo and close/reopen persistence.

### Verification gates

- [ ] P09-G001 All annotation types have stable persistence and deterministic anchors.
- [ ] P09-G002 Zoom/reflow/resize/reopen, conflicts, recovery, and hash-mismatch tests pass.
- [ ] P09-G003 Original books remain byte-identical; no engine owns canonical data.
- [ ] P09-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_09_REPORT.md`; detailed book/anchor evidence external.

### Graphify requirement

Map annotation ownership, anchors, transactions, adapters, and recovery edges.

### Ponytail requirement

Audit type explosion, duplicated anchor logic, generic event systems, and speculative sync abstractions.

### Git requirements

Commit schemas/code/tests/docs only; annotation data stays external. Push and verify.

### Completion criteria

One source-safe annotation system works across both reader families with recovery.

### Stop condition

Stop after Phase 09. Do not integrate Excalidraw.

## PHASE-10 - BOOK-LINKED EXCALIDRAW NOTES

Status: `NOT_STARTED`

### Objective

Integrate Excalidraw as a first-class reading/study workspace owned by Read & Watch.

### Dependencies

`PHASE-09`.

### Scope

One or more canvases per book; handwriting, drawing, arrows, shapes, text, safe images/excerpts; bidirectional location/highlight links; beside-reader and full-screen modes; persistence, export, and recovery without cloud dependency.

### Explicit non-goals

No normal text-highlighting role, document rendering, Excalidraw cloud canonical storage, or replacement application UI.

### Checklist

- [ ] P10-T001 Pin Excalidraw package/source and record license, assets, version, and integration boundary.
- [ ] P10-T002 Design Read & Watch-owned canvas schema, stable IDs, storage, history, conflicts, and recovery.
- [ ] P10-T003 Implement book attachment and multiple canvases per book.
- [ ] P10-T004 Implement pen, free drawing, arrows, shapes, text, and safe image/excerpt insertion.
- [ ] P10-T005 Implement canvas-object-to-book and highlight-to-canvas deep links.
- [ ] P10-T006 Implement beside-reader and full-screen workflows.
- [ ] P10-T007 Implement export/restore and verify no cloud dependency.

### Verification gates

- [ ] P10-G001 Persistence/recovery/conflict/export tests pass with original books unchanged.
- [ ] P10-G002 Bidirectional deep links survive reopen, book movement, and supported location changes.
- [ ] P10-G003 UI and storage remain Read & Watch-owned.
- [ ] P10-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_10_REPORT.md`; private canvas fixtures external.

### Graphify requirement

Map book/highlight/canvas ownership and deep-link paths; check dangling relationships.

### Ponytail requirement

Audit wrapper layers, duplicated drawing state, cloud leftovers, and unnecessary Excalidraw surface area.

### Git requirements

Commit integration code/notices/tests/docs only; canvases and private images remain external. Push and verify.

### Completion criteria

Book-linked handwritten/drawn notes are reliable, portable, recoverable, and locally owned.

### Stop condition

Stop after Phase 10. Do not start study/search aggregation.

## PHASE-11 - SEARCH, ANNOTATION BROWSER, AND STUDY WORKFLOW

Status: `NOT_STARTED`

### Objective

Unify book search, library metadata search, annotation discovery, and non-AI study actions.

### Dependencies

`PHASE-10`.

### Scope

Book-local and library-wide search; highlights/comments/bookmarks/drawings/canvases browser; filters; direct location jumps; copy; define/translate hooks; send to Notes/Canvas.

### Explicit non-goals

No required AI, embeddings, silent generated content, or detached search index without rebuild/recovery.

### Checklist

- [ ] P11-T001 Define searchable fields, index ownership, rebuild, invalidation, and privacy boundaries.
- [ ] P11-T002 Implement book-local search through adapter capabilities.
- [ ] P11-T003 Implement library metadata and annotation search with type/book filters.
- [ ] P11-T004 Implement unified annotation browser and direct location jumps.
- [ ] P11-T005 Implement selection copy, define/translate extension hooks, Notes handoff, and Canvas handoff.
- [ ] P11-T006 Implement keyboard/accessibility and empty/error/rebuild states.

### Verification gates

- [ ] P11-G001 Search result completeness/precision and index rebuild tests pass.
- [ ] P11-G002 Every result jumps to the correct source location or reports an unresolved anchor honestly.
- [ ] P11-G003 Core workflow functions with AI disabled/unavailable.
- [ ] P11-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_11_REPORT.md`; private search fixtures external.

### Graphify requirement

Map search/index/data-source/jump relationships and detect orphaned indexes.

### Ponytail requirement

Audit duplicate search stacks, premature query DSLs, and generic action registries.

### Git requirements

Commit search/workflow source and sanitized tests; indexes/user content remain external. Push and verify.

### Completion criteria

Users can find and act on library and study material without AI.

### Stop condition

Stop after Phase 11. Do not start portability work.

## PHASE-12 - EXPORT AND PORTABILITY

Status: `NOT_STARTED`

### Objective

Make library, notes, annotations, and canvases portable without mutating sources.

### Dependencies

`PHASE-11`.

### Scope

Annotation JSON/Markdown, notes, canvas, metadata, backup/restore, safe annotated-PDF derivatives, and a documented reflowable annotation strategy.

### Explicit non-goals

No overwrite-in-place, unsupported portability claim, PDF rendering via pdf-lib, or lossy export presented as complete.

### Checklist

- [ ] P12-T001 Specify versioned portable schemas and compatibility guarantees.
- [ ] P12-T002 Implement annotation JSON and Markdown exports.
- [ ] P12-T003 Implement notes and canvas exports with links/provenance.
- [ ] P12-T004 Implement library metadata export and documented backup/restore workflow.
- [ ] P12-T005 Implement safe annotated-PDF derivative export where verified suitable.
- [ ] P12-T006 Decide and document reflowable annotation portability with limitations.
- [ ] P12-T007 Implement import/restore validation, conflict handling, and round-trip tests.

### Verification gates

- [ ] P12-G001 Export schemas validate and representative round trips preserve identity/content.
- [ ] P12-G002 Derived PDFs open independently and originals remain unchanged.
- [ ] P12-G003 Backup/restore and file-first recovery work from documented inputs.
- [ ] P12-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_12_REPORT.md`; private exported samples external.

### Graphify requirement

Map canonical-to-export derivation and restore paths; detect ownership inversion.

### Ponytail requirement

Audit exporter abstractions, format proliferation, and dependencies, including whether pdf-lib is justified.

### Git requirements

Commit schemas/export code/tests/docs only; user exports stay external. Push and verify.

### Completion criteria

Supported data can be exported, independently checked, and restored without source mutation.

### Stop condition

Stop after Phase 12. Do not start knowledge graphs.

## PHASE-13 - KNOWLEDGE AND DIAGRAM SYSTEM

Status: `NOT_STARTED`

### Objective

Add freeform, structured, and text-defined knowledge tools only where each matters.

### Dependencies

`PHASE-12`.

### Scope

Standalone concept canvases, cross-book/concept relationships, React Flow semantic views, Mermaid diagrams, and links from graph nodes to books/passages/notes.

### Explicit non-goals

No React Flow for ordinary notes/handwriting, no Mermaid as freeform canvas, no universal graph abstraction, and no AI requirement.

### Checklist

- [ ] P13-T001 Define explicit selection criteria for Excalidraw, React Flow, Mermaid, or simple native UI.
- [ ] P13-T002 Implement standalone concept canvases only if evidence supports them.
- [ ] P13-T003 Pin and integrate React Flow for meaningful semantic topology.
- [ ] P13-T004 Pin and integrate Mermaid for text-defined diagrams.
- [ ] P13-T005 Implement Read & Watch-owned relationships and deep links to source material.
- [ ] P13-T006 Verify graph/diagram export, persistence, accessibility, and recovery.

### Verification gates

- [ ] P13-G001 Each implemented tool has a justified use case and no duplicated ownership.
- [ ] P13-G002 Semantic graph integrity and deep-link tests pass with no dangling silent failures.
- [ ] P13-G003 Ordinary notes and annotations remain simple and independent.
- [ ] P13-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_13_REPORT.md`; private graphs/canvases external.

### Graphify requirement

Compare code architecture graph with product semantic-graph ownership and verify no accidental conflation.

### Ponytail requirement

Aggressively audit unnecessary graph layers, generic node frameworks, and overlapping diagram engines.

### Git requirements

Commit pinned dependencies/notices/source/tests/docs only; personal graphs remain external. Push and verify.

### Completion criteria

Knowledge tools are selective, linked, recoverable, and simpler than a universal graph system.

### Stop condition

Stop after Phase 13. Do not begin desktop packaging.

## PHASE-14 - DESKTOP NATIVE INTEGRATION

Status: `NOT_STARTED`

### Objective

Evaluate and, if justified, implement a Windows-first desktop shell while retaining React UI.

### Dependencies

`PHASE-13`.

### Scope

Tauri or best-supported alternative; secure chooser/filesystem bridge, associations, open-with, processes, native persistence, packaging, install, and update strategy.

### Explicit non-goals

No Rust UI, broad filesystem authority, silent auto-update, source mutation, or shell adoption without evidence.

### Checklist

- [ ] P14-T001 Compare Tauri and viable alternatives for security, maintenance, size, licensing, and current architecture fit.
- [ ] P14-T002 Record the accepted shell decision and exact provenance/pin.
- [ ] P14-T003 Implement least-privilege chooser, filesystem, process, and persistence commands.
- [ ] P14-T004 Implement file associations and open-with behavior with stable-ID/import boundaries.
- [ ] P14-T005 Implement Windows packaging and documented install/uninstall behavior.
- [ ] P14-T006 Define update strategy, signing requirements, rollback, and offline behavior.
- [ ] P14-T007 Run threat-model, fresh-install, path, process, and protected-source tests.

### Verification gates

- [ ] P14-G001 Native boundary exposes only explicit least-privilege commands.
- [ ] P14-G002 Packaging/install/open-with/persistence and rollback tests pass on Windows.
- [ ] P14-G003 React remains the UI and personal data remains external to Git/install assets.
- [ ] P14-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_14_REPORT.md`; installers/signing/private path evidence external.

### Graphify requirement

Map web/native trust boundary, commands, capabilities, and filesystem/process reachability.

### Ponytail requirement

Audit native commands, plugins, wrappers, and platform abstractions for least surface area.

### Git requirements

Commit shell source/config/notices/tests/docs, never installers, keys, runtime, or personal paths. Push and verify.

### Completion criteria

A secure, verified Windows desktop application exists or a documented evidence-based alternative decision is complete.

### Stop condition

Stop after Phase 14. Do not start final product polish.

## PHASE-15 - PRIVACY, TERMS, SETTINGS, AND PRODUCT POLISH

Status: `NOT_STARTED`

### Objective

Implement truthful legal pages, settings, recovery UX, accessibility, and complete application states.

### Dependencies

`PHASE-14`.

### Scope

Privacy Policy, Terms & Conditions, settings, accessibility, keyboard behavior, errors, empty/loading/first-run states, import/add-item, local-data disclosure, backup/recovery UX, and security messaging.

### Explicit non-goals

No invented legal claims, fake users/accounts/testimonials/metrics, SaaS marketing, or unimplemented cloud/service promises.

### Checklist

- [ ] P15-T001 Inventory actual data flows, storage, third parties, permissions, exports, updates, and network behavior.
- [ ] P15-T002 Draft and review Privacy Policy and Terms against implemented architecture and jurisdictional needs.
- [ ] P15-T003 Implement legal routes, version/date display, and accessible navigation.
- [ ] P15-T004 Implement settings with validated defaults, persistence, reset, import/export, and recovery.
- [ ] P15-T005 Complete first-run, add/import, empty, loading, error, offline, and recovery states.
- [ ] P15-T006 Complete keyboard and accessibility review and fix in-scope failures.
- [ ] P15-T007 Audit all visible copy against the design constitution and product truthfulness.

### Verification gates

- [ ] P15-G001 Legal text maps to measured current behavior and has no deceptive claims.
- [ ] P15-G002 Settings, reset, first-run, recovery, keyboard, and accessibility checks pass.
- [ ] P15-G003 Anti-vibe and fake-content audit passes.
- [ ] P15-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_15_REPORT.md`; legal-review limitations clearly stated.

### Graphify requirement

Map legal claims/settings to actual data/network/native components and flag unsupported claims.

### Ponytail requirement

Audit settings sprawl, unused flags, duplicated state, and decorative/promo components.

### Git requirements

Commit truthful legal/settings/polish work and tests; push and verify.

### Completion criteria

The product is complete in ordinary states, accessible, and legally honest about actual behavior.

### Stop condition

Stop after Phase 15. Do not begin hardening.

## PHASE-16 - PERFORMANCE, SECURITY, AND RELIABILITY HARDENING

Status: `NOT_STARTED`

### Objective

Harden the completed non-OCR product for large, malformed, interrupted, and fresh-install scenarios.

### Dependencies

`PHASE-15`.

### Scope

Large library/book performance, memory, reader stability, traversal defenses, unsafe/malformed files, dependencies, CSP, crash recovery, transactions, backups, regressions, fresh clone/install, deterministic build, and hygiene.

### Explicit non-goals

No feature expansion, safety weakening, premature OCR, or benchmark fabrication.

### Checklist

- [ ] P16-T001 Define representative performance/reliability/security benchmarks and budgets.
- [ ] P16-T002 Measure and optimize large-library and large-book paths with before/after evidence.
- [ ] P16-T003 Audit traversal, symlink/junction, file parsing, content rendering, CSP, and process boundaries.
- [ ] P16-T004 Test malformed documents, interrupted writes, crashes, transaction failures, and restore.
- [ ] P16-T005 Audit dependencies/licenses/vulnerabilities and remove or constrain unjustified surface.
- [ ] P16-T006 Verify fresh clone, deterministic build, fresh install, backup validation, and clean repository.
- [ ] P16-T007 Expand regression suites for library, reader, annotations, canvases, search, export, graphs, desktop, and legal/settings.

### Verification gates

- [ ] P16-G001 Performance budgets and memory/stability tests pass or documented blockers stop completion.
- [ ] P16-G002 Security threat-model cases and dependency/CSP audits pass.
- [ ] P16-G003 Crash/transaction/backup/fresh-clone/install/deterministic-build gates pass.
- [ ] P16-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_16_REPORT.md`; detailed benchmarks and sensitive paths external.

### Graphify requirement

Run full authored-code dependency/security-path graph and clean integrity diagnostics.

### Ponytail requirement

Run full repo audit; remove dead/obsolete complexity only with regression evidence.

### Git requirements

Use focused hardening commits, no generated/private benchmark artifacts; push and verify.

### Completion criteria

The full non-OCR product passes defined performance, security, recovery, and reproducibility gates.

### Stop condition

Stop after Phase 16. OCR remains unstarted.

## PHASE-17 - OCR FOUNDATION - LATE PHASE

Status: `NOT_STARTED`

### Objective

Add OCR only for PDFs whose native text layer is absent or unusable.

### Dependencies

`PHASE-16`.

### Scope

Usable-text detection; benchmark-driven PaddleOCR-VL candidate; English, Urdu, Arabic, mixed pages; regions, reading order, boxes, selectable overlay, source preservation, provenance.

### Explicit non-goals

No OCR for usable text, source alteration, unbenchmarked engine adoption, silent truth claims, or final Urdu specialization.

### Checklist

- [ ] P17-T001 Define and test the usable-native-text decision gate.
- [ ] P17-T002 Build a representative, lawful, private benchmark corpus and ground-truth protocol.
- [ ] P17-T003 Verify exact OCR code/model/dataset licenses, provenance, size, runtime, and hardware constraints.
- [ ] P17-T004 Benchmark primary candidates and accept an architecture only from evidence.
- [ ] P17-T005 Implement OCR orchestration, regions, reading order, boxes, text overlay, caching, and cancellation.
- [ ] P17-T006 Implement OCR provenance, uncertainty fields, invalidation, recovery, and source-hash binding.
- [ ] P17-T007 Verify English, Urdu, Arabic, mixed-language, layout, and source preservation.

### Verification gates

- [ ] P17-G001 Usable-text PDFs bypass OCR reliably.
- [ ] P17-G002 Accepted engine meets documented accuracy/performance/license gates on representative inputs.
- [ ] P17-G003 OCR output is derived, provenance-bound, recoverable, and never silently authoritative.
- [ ] P17-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_17_REPORT.md`; private benchmark images/text and model artifacts external.

### Graphify requirement

Map native-text decision, OCR pipeline, provenance, cache, overlay, and source boundaries.

### Ponytail requirement

Audit model/runtime wrappers, duplicate preprocessors, fallback chains, and premature optimization.

### Git requirements

Commit orchestration/config/tests/docs/notices only; models, OCR outputs, and books remain external. Push and verify.

### Completion criteria

Scanned PDFs gain a provenance-safe selectable OCR layer while normal PDFs remain native-text-first.

### Stop condition

Stop after Phase 17. Do not begin specialist verification.

## PHASE-18 - OCR VERIFICATION AND URDU/NASTALIQ SPECIALIZATION

Status: `NOT_STARTED`

### Objective

Benchmark independent engines and build uncertainty-aware Urdu/Nastaliq verification.

### Dependencies

`PHASE-17`.

### Scope

PaddleOCR, Tesseract `eng`/`urd`/`ara`, licensed specialists, region alignment, disagreement, confidence, review queue, correction memory, human verification, normal/archival modes, and transcription states.

### Explicit non-goals

No simplistic majority truth, silent unusual-text rewrite, global correction replacement, unsupported `FULLY_PROOFREAD` claim, or source mutation.

### Checklist

- [ ] P18-T001 Select licensed specialist candidates from official sources and record provenance.
- [ ] P18-T002 Benchmark PaddleOCR, Tesseract language modes, and specialists against representative ground truth.
- [ ] P18-T003 Implement region alignment and character/token-level disagreement records.
- [ ] P18-T004 Implement confidence model and uncertainty review queue without majority-vote truth.
- [ ] P18-T005 Implement scoped correction memory and human verification workflow.
- [ ] P18-T006 Implement Normal and Archival Maximum Accuracy modes.
- [ ] P18-T007 Enforce `MACHINE_TRANSCRIBED`, `CONSENSUS_VERIFIED`, `HUMAN_VERIFIED`, and `FULLY_PROOFREAD` states.

### Verification gates

- [ ] P18-G001 Accuracy/disagreement results are reproducible on held-out representative pages.
- [ ] P18-G002 Review/correction/state transitions require appropriate evidence and never overclaim.
- [ ] P18-G003 Source scans remain unchanged and every output identifies engines/models/settings.
- [ ] P18-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_18_REPORT.md`; private ground truth, outputs, and model artifacts external.

### Graphify requirement

Map engine comparisons, region alignment, confidence, correction, and verification-state transitions.

### Ponytail requirement

Audit ensemble layers, scoring formulas, correction machinery, and modes for evidence-supported necessity.

### Git requirements

Commit algorithms/config/tests/docs/notices only; benchmark content/models remain external. Push and verify.

### Completion criteria

OCR verification is honest, reproducible, reviewable, and strong on representative Urdu/Nastaliq material.

### Stop condition

Stop after Phase 18. Optional intelligence remains unstarted.

## PHASE-19 - OPTIONAL INTELLIGENCE LAYER

Status: `NOT_STARTED`

### Objective

Optionally add user-controlled intelligence only after structured foundations are reliable.

### Dependencies

`PHASE-18`.

### Scope

Potential explain selection, chapter summary, ask-book, cross-book comparison, semantic search, embeddings, relationship/concept suggestions, and diagram suggestions.

### Explicit non-goals

No mandatory AI, silent source alteration, fake evidence, hidden network use, privacy-boundary violation, or claim that generation is source truth. This phase may remain `NOT_STARTED` indefinitely.

### Checklist

- [ ] P19-T001 Obtain explicit user authorization and define a concrete first intelligence use case.
- [ ] P19-T002 Specify local/remote data flow, privacy, consent, retention, cost, provenance, and disable/offline behavior.
- [ ] P19-T003 Benchmark candidate approach against a non-AI baseline and representative tasks.
- [ ] P19-T004 Implement the smallest authorized feature with explicit generated-content labels and citations/anchors.
- [ ] P19-T005 Implement user control, deletion, export, error, and fallback behavior.
- [ ] P19-T006 Test hallucination, prompt/content injection, privacy leakage, source immutability, and unsupported claims.

### Verification gates

- [ ] P19-G001 Explicit authorization, measurable benefit, and privacy architecture exist.
- [ ] P19-G002 Generated output is clearly labeled, controllable, removable, and never source evidence by default.
- [ ] P19-G003 Product remains fully useful when intelligence is disabled.
- [ ] P19-G004 Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass.

### Evidence and reports

`docs/project/reports/PHASE_19_REPORT.md`; private prompts/content/evals external.

### Graphify requirement

Map every intelligence data flow to canonical sources, providers/models, storage, and user-visible output.

### Ponytail requirement

Challenge frameworks, agent layers, vector stores, abstractions, and dependencies against the one authorized use case.

### Git requirements

Commit only authorized source/config/tests/docs; no keys, private prompts, embeddings, or user content. Push and verify.

### Completion criteria

The authorized optional feature is beneficial, transparent, controllable, and privacy-safe, or the phase remains not started.

### Stop condition

Stop after the authorized Phase 19 scope. Do not begin final certification in the same invocation.

## PHASE-20 - FINAL RELEASE CERTIFICATION

Status: `NOT_STARTED`

### Objective

Certify the implemented product end state and only then declare project completion.

### Dependencies

`PHASE-18`; `PHASE-19` only if implemented.

### Scope

Repository, master checklist, blockers, data protection, reader/annotation/canvas/library/knowledge/OCR/intelligence regressions where implemented, performance, security, clone/install/package, docs, licenses, provenance, privacy, terms, backup/restore, Graphify, Ponytail, and final fingerprint.

### Explicit non-goals

No new feature, skipped blocker, invented PASS, history rewrite, or release claim before remote verification.

### Checklist

- [ ] P20-T001 Freeze release candidate and capture repository, dependency, artifact, and protected-data fingerprints.
- [ ] P20-T002 Reconcile every master-plan task/gate, blocker, decision, report, and optional-phase status.
- [ ] P20-T003 Run complete library, reader, annotation, canvas, search, export, knowledge, desktop, legal, and settings regressions.
- [ ] P20-T004 Run OCR and intelligence regressions only where implemented, with provenance and privacy checks.
- [ ] P20-T005 Run performance, security, malformed-input, recovery, backup/restore, fresh-clone, deterministic-build, fresh-install, and packaging gates.
- [ ] P20-T006 Complete license/notices/provenance/privacy/terms/documentation audit.
- [ ] P20-T007 Run final Graphify, Ponytail, hygiene, secret/private-boundary, and repository-state audits.
- [ ] P20-T008 Commit, push, verify GitHub and release artifacts, then record final certification.

### Verification gates

- [ ] P20-G001 Zero unexplained active blockers or failed required gates remain.
- [ ] P20-G002 All implemented subsystems, protected-state, security, performance, recovery, clone/install/package, legal, and documentation gates pass.
- [ ] P20-G003 Graphify, Ponytail, hygiene, provenance, and final fingerprint pass.
- [ ] P20-G004 Completion commit and required artifacts are pushed and verified on GitHub.
- [ ] P20-G005 `PROJECT COMPLETE` is recorded only after P20-G001 through P20-G004 pass.

### Evidence and reports

`docs/project/reports/PHASE_20_FINAL_CERTIFICATION.md`; detailed private evidence external.

### Graphify requirement

Run final full authored-code graph, integrity diagnostics, architecture-conformance queries, and sanitized summary.

### Ponytail requirement

Run final whole-repository complexity audit and resolve or explicitly justify every material finding.

### Git requirements

Use normal signed/reviewed release procedures where configured, never force-push, verify remote HEAD/tree/artifacts, and avoid self-referential commit loops.

### Completion criteria

All required gates pass and the verified remote records `PROJECT COMPLETE`.

### Stop condition

Stop permanently after reporting the verified completion commit and release evidence.
