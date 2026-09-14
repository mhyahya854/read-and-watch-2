# Phase 10 Report — Book-Linked Excalidraw Notes

**Date:** 2026-09-14  
**Status:** COMPLETE  
**Content Commit:** `cfb9e06` — Build Phase 10 book-linked Excalidraw notes  
**Closure Commit:** `07bbcd38fd9f52ce2810a76a0cf984e6731cfce3` — Close Phase 10 book-linked Excalidraw notes  

---

## Objective

Integrate Excalidraw as a first-class reading and visual study workspace owned by Read & Watch. Ensure local-first canonical data ownership, multiple canvases per book, bidirectional deep links, beside-reader split and full-screen modes, bounded history, crash recovery, standalone export/restore, and 100% offline operation without cloud dependency.

---

## Tasks Completed

### P10-T001 — Pin Excalidraw Package, License, Assets, and Integration Boundary ✅
- Pinned exact upstream release: `"@excalidraw/excalidraw": "0.18.1"` with MIT license.
- Verified React 19 compatibility across client components and build pipeline.
- Recorded license, upstream provenance, and zero-cloud policy in `App/docs/project/TECHNOLOGY_LEDGER.md` and `App/docs/project/UPSTREAM_AND_LICENSE_LEDGER.md`.
- Configured local static asset serving from `node_modules/@excalidraw/excalidraw/dist/prod` via `/api/reader/excalidraw-assets/*`, completely eliminating external CDN calls.

### P10-T002 — Read & Watch Canonical Canvas Schema, Storage, History, Conflicts, and Recovery ✅
- Defined `CANVAS_SCHEMA_VERSION = 1` in `lib/canvas/types.ts`.
- Canonical data structures: `ReadWatchCanvasDocument`, `CanvasMetadata`, `CanvasLinkRecord`, `CanvasAssetMeta`, `ExcalidrawSceneData`.
- Strict runtime validation in `lib/canvas/validation.ts` ensuring schema conformance, URL protocol sanitization, element bounds sanity, and MIME/size limits on assets.
- Implemented in-memory bounded undo/redo history (`CanvasHistory`) capped at 50 revisions in `lib/canvas/history.ts`.
- Implemented file-first SQLite storage in `server/canvas-store.mjs` with tables:
  - `canvases` (metadata, book attachment, revision)
  - `canvas_links` (bidirectional links between elements and book locations/annotations)
  - `canvas_assets` (embedded images, MIME types, content hashes, byte sizes)
- File-first external persistence:
  - Canonical document: `user-data/canvases/:canvasId/canvas.json` (atomic write via `.tmp` rename)
  - Crash-recovery mirror: `user-data/canvases/:canvasId/recovery.json`
  - Bounded history snapshots: `user-data/canvases/:canvasId/history/rev-*.json` (cap=50)
- Optimistic concurrency control: Updates check `expectedRevision`; mismatches return HTTP 409 Conflict with conflict payload.

### P10-T003 — Book Attachment and Multiple Canvases per Book ✅
- Canvases support optional `itemId` attachment:
  - Attached canvas: Linked directly to a specific book item in the library.
  - Standalone canvas: Independent visual notebook with `itemId = null`.
- Books can have arbitrarily many canvases (`1:N` relationship).
- Implemented `CanvasList` component (`components/canvas/canvas-list.tsx`) with search, filter by book, inline creation, and deletion.
- Added API endpoints:
  - `GET /api/reader/canvases` (list all canvases)
  - `POST /api/reader/canvases` (create new canvas)
  - `GET /api/reader/items/:id/canvases` (list canvases attached to book)
  - `POST /api/reader/items/:id/canvases` (create canvas attached to book)

### P10-T004 — Drawing Tools, Freehand, Arrows, Shapes, Text, and Safe Asset/Excerpt Insertion ✅
- Embedded Excalidraw engine in `components/canvas/read-watch-canvas.tsx` with full drawing toolkit:
  - Pen, highlighter, free drawing
  - Arrows and connectors with automatic binding
  - Shapes (rectangles, diamonds, ellipses, lines)
  - Text elements with typography options
  - Eraser, selection, and multi-element transform
- Safe Image Asset Insertion:
  - Supported formats: PNG, JPEG, SVG, WebP (validated on upload).
  - Stored in `user-data/canvases/:canvasId/assets/:assetId`.
  - Served locally via `/api/reader/canvases/:id/assets/:assetId`.
- Quoted Excerpt Insertion:
  - Interactive "Insert Excerpt" modal allows pasting or quoting book passages.
  - Automatically generates an Excalidraw text box containing the excerpt with an attached deep link back to the book source.

### P10-T005 — Bidirectional Deep Links Between Canvas Elements and Books ✅
- Deep link structure (`CanvasLinkRecord`):
  - Canvas side: `canvasId`, `elementId`.
  - Book side: `itemId`, optional `annotationId`, `locationEnvelope` (progression, CFI, or page number), and descriptive `label`.
- Bidirectional endpoints:
  - `GET /api/reader/items/:id/canvas-links` (find all canvases and elements linked to a book)
  - `GET /api/reader/annotations/:id/canvas-links` (find canvas elements referencing a specific annotation)
  - `POST /api/reader/canvases/:id/links` (attach deep link to canvas element)
  - `DELETE /api/reader/canvases/:id/links/:linkId` (remove link)
- Interactive Floating Deep Link Card:
  - Selecting a linked element in the canvas shows a link badge.
  - Clicking the link navigates to the book reader at the exact location or opens the reader pane in split mode.

### P10-T006 — Beside-Reader Split Mode and Full-Screen Workspaces ✅
- Beside-Reader Split Mode (`components/reader/reader-shell.tsx`):
  - Toggle button in `ReaderToolbar` (`PenTool` icon) opens the canvas side-by-side with the reading surface.
  - Reader pane and Canvas pane maintain independent minimum widths (320px) to prevent layout collapse.
  - Preserves active reading engine and unsaved canvas drawing state without unmounting or reloading.
  - Responsive mobile tab switcher ("Book" | "Canvas") for seamless switching on narrow screens.
- Full-Screen Workspaces:
  - Dedicated full-screen route: `/canvas-notes/:id` (`app/canvas-notes/[id]/page.tsx`).
  - Standalone canvases index: `/canvas-notes` (`app/canvas-notes/page.tsx`).

### P10-T007 — Standalone Export/Restore and 100% Offline Operation ✅
- Standalone `.rwcanvas` Format:
  - JSON bundle containing canonical metadata, scene data, deep links, and base64-encoded asset files.
  - Export endpoint: `GET /api/reader/canvases/:id/export` (downloads `.rwcanvas`).
  - Import endpoint: `POST /api/reader/canvases/import` (restores canvas, links, and assets into local storage).
- Zero Cloud Guarantee:
  - All Excalidraw assets (Virgil, Cascadia, Excalifont fonts, translations) are served locally from `/api/reader/excalidraw-assets/*`.
  - Zero network requests to external domains; completely functional without an internet connection.

---

## Verification Gates

### P10-G001 — Persistence, Recovery, Conflict, and Export Tests Pass ✅
- 15 automated integration tests in `tests/canvas-store.test.mjs`:
  - Canvas creation, reading, and metadata updates.
  - File-first external JSON persistence and atomic rename.
  - Optimistic concurrency control (409 Conflict on revision mismatch).
  - Bounded history snapshots (verified cap at 50 revisions).
  - Soft delete and restore lifecycle.
  - Crash recovery from external `recovery.json` mirror.
  - Standalone `.rwcanvas` export and import round-trip.
  - Asset upload, storage, and retrieval.
- Source book immutability: PASS (0 writes to source files; verified by SHA-256 hashes).

### P10-G002 — Bidirectional Deep Links Survive Reopen, Movement, and Location Changes ✅
- Tested link creation, lookup by book item, lookup by annotation, and element association.
- Deep links persist in SQLite `canvas_links` table and in external `canvas.json` envelope.
- Survives reader and canvas close/reopen cycles.

### P10-G003 — UI and Storage Remain Read & Watch-Owned ✅
- Excalidraw is strictly the canvas rendering engine; Read & Watch owns the outer shell, document lifecycle, persistence, export, deep links, and toolbar integration.
- Zero reliance on Excalidraw Cloud or Firebase.

### P10-G004 — Common Gates, Graphify, Ponytail, Commit, Push, and GitHub Verification ✅
- Unit test suite: **151/151 tests passing** (`npm test`).
- TypeScript checking: **0 errors** (`npx tsc --noEmit`).
- Linter: **0 warnings, 0 errors** (`npm run lint`).
- Production build: **Successful** (`npm run build`).
- Repository hygiene: **PASS** (`check_repository_hygiene.py`).
- Project governance: **PASS** (`validate_project_state.py`).
- Graphify audit: **PASS** (`PHASE_10_GRAPHIFY_AUDIT.md`).
- Ponytail audit: **PASS** (`PHASE_10_PONYTAIL_AUDIT.md`).

---

## Stop Condition Verification

Phase 10 is complete. Phase 11 (Search, Annotation Browser, and Study Workflow) will NOT be started in this phase.
