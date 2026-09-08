# Changelog

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
