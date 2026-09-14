# Phase 12 Report — Export and Portability

**Phase ID:** `PHASE-12`  
**Phase Title:** Export and Portability  
**Status:** `COMPLETE`  
**Completion Date:** 2026-09-14  
**Content Commit:** `de57a28` — Build Phase 12 export and portability  
**Closure Commit:** `SEE_LIVE_GIT_HEAD` — Close Phase 12 export and portability  
**Primary Verification Artifacts:**
- Unit & Integration Test Suites: `tests/portability-store.test.mjs` (173 total test cases passing across suite)
- Visual Review Artifacts: `READ_WATCH_DATA_ROOT/visual-review/phase-12/` (`REVIEW_INDEX.md`, `manifest.json`)
- Audits: `App/docs/project/reports/PHASE_12_GRAPHIFY_AUDIT.md`, `App/docs/project/reports/PHASE_12_PONYTAIL_AUDIT.md`
- Documentation:
  - `App/docs/project/PORTABLE_SCHEMAS.md`
  - `App/docs/project/BACKUP_AND_RESTORE.md`
  - `App/docs/project/REFLOWABLE_ANNOTATION_PORTABILITY.md`

---

## Executive Summary

Phase 12 delivers an end-to-end, lossless data portability and backup engine for *Read & Watch*. It establishes versioned, self-contained portable schema definitions (`schemaVersion: 1`), safe file-first backup and restore workflows with preflight conflict inspection, human-readable Markdown and structured JSON annotation exports, canvas/note provenance packages, and safe annotated PDF derivative generation.

Throughout all operations, original source publications (EPUB, PDF, and media files) remain completely immutable and untouched. The system enforces strict collision refusal guards and post-export byte/mtime integrity checks. Derived search indexes are cleanly separated from backups and deterministically rebuilt upon restore.

---

## Tasks Delivered

### P12-T001 — Portable Schema Family & Compatibility Guarantees ✅
- **Versioned Schema Types**: Defined canonical types in `lib/portability/types.ts`:
  - `read-watch.annotations` (v1)
  - `read-watch.notes` (v1)
  - `read-watch-canvas-export` (v1)
  - `read-watch.library-metadata` (v1)
  - `read-watch.backup` (v1)
- **Validation Guard (`lib/portability/validation.ts`)**: Enforces `schemaVersion === 1` and fails closed on unknown future versions. Rejects directory traversal (`..`), absolute drive letters (`C:\`), and root paths (`/`).
- **Comprehensive Specification**: Authored `docs/project/PORTABLE_SCHEMAS.md` documenting schema fields, canonical vs lossy representations, and semantic guarantees.

### P12-T002 — Annotation JSON and Markdown Exports ✅
- **Machine-Readable JSON**: Generates structured packages with SHA-256 checksums, normalized page and semantic progress anchors, colors, and timestamps.
- **Human-Readable Markdown**: Generates clean Markdown documents grouping annotations by publication with clear notices that Markdown is a human-readable projection rather than a lossless restore container.
- **In-Context Access**: Integrated export triggers directly in `StudyBrowser` (`/highlights`) and `ReaderToolbar` (`/reader/:id`).

### P12-T003 — Notes and Canvas Exports with Links & Provenance ✅
- **Notes Export**: Bundles item thoughts and notes with item IDs, publication titles, and timestamps.
- **Canvas Package Export**: Bundles canvas scenes, bidirectional deep links, and base64-encoded image assets into portable `.rwcanvas` structures.
- **Provenance Parity**: Deep links retain target item IDs, annotation IDs, and anchor payloads.

### P12-T004 — Library Metadata & Unified Backup/Restore Workflow ✅
- **Library Metadata Export**: Exports non-sensitive catalog records, item properties, collections, and media paths.
- **Unified Backup Bundle (`.rwbackup`)**: Bundles library metadata, annotations, bookmarks, notes, and canvases with cryptographic manifest checksums. Explicitly excludes original source publications to prevent bloat and media corruption.
- **Operational Documentation**: Authored `docs/project/BACKUP_AND_RESTORE.md` detailing backup procedures, disaster recovery, and verification steps.

### P12-T005 — Safe Annotated-PDF Derivative Export ✅
- **Isolated Tooling**: Exact-pinned `pdf-lib@1.17.1` in `package.json` for creating new derivative PDF documents. Strictly prohibited from acting as a reader or viewer.
- **Highlights & Summary Page**: Draws semi-transparent highlight rectangles over original page coordinates and appends a clean editorial summary page listing all comments and excerpts.
- **Refusal Guard**: Throws an immediate error if the target output path matches the original source path.
- **Source Immutability Gate**: Validates pre- and post-export SHA-256 hashes, file sizes, and filesystem `mtime` values. Source files remain 100% byte-identical.

### P12-T006 — Reflowable Annotation Portability Strategy ✅
- **Strategy Document**: Authored `docs/project/REFLOWABLE_ANNOTATION_PORTABILITY.md` analyzing reflowable pagination volatility across viewport sizes and fonts.
- **Standardized Anchors**: Documented CFI, text quote anchors with prefix/suffix context, and fractional spine progression.
- **Honest Limitations**: Documented why reflowable annotations cannot be "baked" into EPUB container files without violating zero-source-mutation rules.

### P12-T007 — Import/Restore Validation, Conflict Handling & Round-Trip Tests ✅
- **Preflight Inspection**: Endpoint `/api/portability/restore/preflight` inspects incoming packages, detects identical vs divergent records, and returns structured conflict counts.
- **Conflict Resolution**: Supports `skip` (preserves local edits), `overwrite` (applies backup revisions), and `copy` (imports canvases with fresh UUIDs).
- **Post-Restore Search Rebuild**: Automatically wipes derived search tables and triggers `searchStore.rebuildIndex()`.
- **UI Integration**: Built `components/settings/portability-settings.tsx` with Apple-style polish, file selection, preflight inspection card, and real-time status reporting.
- **Round-Trip Test Suite**: `tests/portability-store.test.mjs` verifies full round trips across clean environments with semantic equality assertions.

---

## Verification Gates

### P12-G001 — Export Schemas Validate and Round Trips Preserve Identity ✅
- Versioned schemas reject unknown future schema versions and malformed formats.
- Complete round trip across isolated test environments preserved 100% of annotations, bookmarks, notes, and canvas elements.

### P12-G002 — Derived PDFs Open Independently and Originals Remain Unchanged ✅
- Produced PDF derivatives open independently via `PDFDocument.load`.
- Original source PDF SHA-256 hash, file size, and filesystem mtime verified strictly unchanged.
- Overwrite attempts targeting the source document fail closed with an explicit refusal error.

### P12-G003 — Backup/Restore and File-First Recovery Work from Documented Inputs ✅
- Backup bundles validate against `validateBackupPackage`.
- Preflight inspection correctly reports incoming item, annotation, bookmark, note, and canvas counts.
- Applying restore populates stores and rebuilds the derived FTS5 search index.

### P12-G004 — Common Verification Gates Pass ✅
- 173/173 tests passing (`npm test`).
- 0 TypeScript errors (`npx tsc --noEmit`).
- 0 lint warnings or errors (`npm run lint`).
- Production build successful (`npm run build`).
- Graphify & Ponytail audits pass with zero extraneous dependencies.
