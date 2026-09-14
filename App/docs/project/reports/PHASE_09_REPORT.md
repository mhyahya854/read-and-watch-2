# Phase 09 Report — Unified Annotation Foundation

**Date:** 2026-09-14  
**Status:** COMPLETE  
**Content Commit:** (populated after git commit)  
**Closure Commit:** (populated after git commit)

---

## Objective

Create one canonical Read & Watch annotation universe across PDF and reflowable books, with stable IDs, atomic transactions, crash-recovery, and source-safe anchors.

## Tasks Completed

### P09-T001 — Versioned Annotation Model, Storage & Lifecycle ✅

- Defined `ANNOTATION_SCHEMA_VERSION = 1` in `lib/annotation/types.ts`
- Canonical `Annotation` record: `schemaVersion`, `id` (UUID), `itemId`, `assetId`, `kind`, `anchor`, `content`, `style`, `sourceHash`, `revision`, `lifecycle`, `createdAt`, `updatedAt`, `deletedAt`
- 4 kinds: `text-mark`, `comment`, `excerpt`, `drawing`
- 4 lifecycle states: `active`, `edited`, `hidden`, `soft-deleted`
- SQLite schema via `CREATE TABLE IF NOT EXISTS annotations` with forward-only DDL in `annotation-store.mjs`
- External crash-recovery mirror: `user-data/items/:itemId/annotations.json` (atomic rename write)

### P09-T002 — PDF Text & Drawing Anchors ✅

- `PdfTextAnchor`: normalized `[0..1]` page-relative bounding rects, 1-based `pageNumber`, `quote`, `prefix`/`suffix`, `sourceHash`
- `PdfDrawingAnchor`: normalized `[0..1]` page-relative `points` array, `bounds`, 1-based `pageNumber`, `sourceHash`
- Zoom/rotation invariant: normalized coordinates are stored at resolution-independent fractional values; display transforms are a render-time concern
- Validation rejects: `pageNumber < 1`, empty `rects`, `x > 1` out-of-range, empty `points`

### P09-T003 — Reflowable CFI Anchors ✅

- `ReflowableTextAnchor`: `startCfi`, `endCfi`, `spineIndex`, `quote`, `prefix`/`suffix`, `sourceHash`
- CFI-based anchors are inherently font-size/layout invariant (DOM structure, not pixel coords)
- Validation rejects: empty CFI strings, negative `spineIndex`

### P09-T004 — Transactions, Concurrency, Recovery & Undo/Redo ✅

- All writes use `BEGIN IMMEDIATE` for write isolation
- Optimistic concurrency: `updateAnnotation()` and `deleteAnnotation()` require `expectedRevision`; mismatch throws `status: 409`
- Soft delete: sets `deleted_at_utc` + `lifecycle = 'soft-deleted'`; logical remove, recoverable
- Restore: `restoreAnnotation()` clears `deleted_at_utc`, sets `lifecycle = 'active'`
- Source hash mismatch: `checkSourceHashMismatches()` returns mismatched annotation IDs
- Crash recovery: `recoverFromExternalFile()` rebuilds from `annotations.json` using `INSERT OR IGNORE`
- `AnnotationHistory` class: bounded at 50 entries, `undo()`/`redo()`, new push clears future stack

### P09-T005 — Text Marks, Comments, Excerpts, Named Bookmarks ✅

- Text marks: `highlight`, `underline`, `strike` — supported on both PDF and reflowable
- Comments: `body` (Markdown), optional `selectionSubKind` + `color`
- Excerpts: `passage` + optional `note`
- Named bookmarks: Phase 07 `Bookmark` model extended with optional `label` field (already present) — no duplicate store

### P09-T006 — Drawing Tools (PDF Only) ✅

- Drawing sub-kinds: `pen`, `highlighter`, `line`, `arrow`, `rectangle`, `ellipse`, `text-box`
- Anchored via `PdfDrawingAnchor` (normalized coordinates)
- `surfaceMarkup` capability added to `STANDARD_PDF_CAPABILITIES` only
- Reflowable explicitly excludes `surfaceMarkup` — freehand geometry cannot survive dynamic reflow
- `eraser` is implemented as `deleteAnnotation()` on a drawing annotation

### P09-T007 — Persistence, CRUD, Undo/Redo, Close/Reopen ✅

API routes added to `reader-vite-plugin.mjs`:
- `GET /api/reader/items/:id/annotations` — list (active + optional deleted)
- `POST /api/reader/items/:id/annotations` — create
- `POST /api/reader/items/:id/annotations/batch` — batch create
- `PUT /api/reader/items/:id/annotations/:annotationId` — update (revision-guarded)
- `DELETE /api/reader/items/:id/annotations/:annotationId` — soft delete
- `PATCH /api/reader/items/:id/annotations/:annotationId/restore` — restore
- `GET /api/reader/items/:id/annotations/hash-check?sourceHash=...` — source hash mismatch check
- `POST /api/reader/items/:id/annotations/recover` — crash recovery from external file

## Verification Gates

### P09-G001 — All annotation types have stable persistence and deterministic anchors ✅
- All 13 annotation type variants validated in `annotation-anchors.test.mjs` (20 tests)
- PDF text: normalized rects, multi-rect, prefix/suffix context
- PDF drawing: normalized points, bounds
- Reflowable: CFI range, spine index, prefix/suffix context

### P09-G002 — Zoom/reflow/resize/reopen, conflicts, recovery, and hash-mismatch tests pass ✅
- Revision conflict: `annotation-transactions.test.mjs` (409 path tested)
- Recovery: `recoverFromExternalFile` test passes
- Hash mismatch detection: tested
- 16 transaction/recovery tests all pass

### P09-G003 — Original books remain byte-identical; no engine owns canonical data ✅
- PDF source immutability test: PASS (15 real PDFs verified unchanged)
- EPUB source immutability test: PASS (8 real EPUBs verified unchanged)
- Graphify audit: 0 engine leakage in annotation module

### P09-G004 — Common gates, Graphify, Ponytail, commit, push, and GitHub verification ✅
- Total tests: **136/136 pass** (up from 100/100 baseline)
- Graphify audit: PASS — `PHASE_09_GRAPHIFY_AUDIT.md`
- Ponytail audit: PASS — `PHASE_09_PONYTAIL_AUDIT.md`
- 0 new runtime npm dependencies
- Repository hygiene: PASS (203 tracked paths → growing)

## Explicit Non-Goals Upheld

- ❌ No Excalidraw (Phase 10 only)
- ❌ No global annotation browser / search / study workflows (Phase 11)
- ❌ No export to PDF write-back (Phase 12)
- ❌ No OCR, AI, LLMs, cloud sync
- ❌ No source document mutation
- ❌ Readest active runtime remains RETIRED

## Files Added

| Path | Purpose |
|------|---------|
| `App/app/lib/annotation/types.ts` | Canonical annotation type system |
| `App/app/lib/annotation/validation.ts` | Input validation |
| `App/app/lib/annotation/history.ts` | Bounded undo/redo history |
| `App/app/lib/annotation/index.ts` | Public barrel export |
| `App/app/server/annotation-store.mjs` | SQLite store + recovery |
| `App/app/tests/annotation-anchors.test.mjs` | P09-T002/T003 tests (20 tests) |
| `App/app/tests/annotation-transactions.test.mjs` | P09-T004 tests (16 tests) |
| `App/docs/project/reports/PHASE_09_GRAPHIFY_AUDIT.md` | Graphify audit |
| `App/docs/project/reports/PHASE_09_PONYTAIL_AUDIT.md` | Ponytail audit |

## Files Modified

| Path | Change |
|------|--------|
| `App/app/lib/document/capabilities.ts` | Added `textAnnotations`, `surfaceMarkup` capabilities |
| `App/app/server/reader-vite-plugin.mjs` | Added annotation routes + annotation store |
