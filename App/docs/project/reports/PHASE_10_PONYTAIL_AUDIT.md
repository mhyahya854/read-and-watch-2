# Phase 10 Ponytail Audit — Book-Linked Excalidraw Notes

**Date:** 2026-09-14  
**Phase:** PHASE-10  
**Auditor:** Antigravity automated audit

## Summary

| Metric | Value |
|--------|-------|
| Pinned runtime npm dependencies | **1** (`@excalidraw/excalidraw@0.18.1`) |
| Reinvented standard library (should use built-in) | **0** |
| Speculative abstractions (YAGNI) | **0** |
| Dead flexibility / unneeded features | **0** |
| Cloud / collaboration surface trimmed | **100%** |

## Dependency & Surface Area Audit

### 1. Pinned Excalidraw Engine
- Pinned exact version: `@excalidraw/excalidraw@0.18.1` (MIT License).
- Zero cloud collaboration packages installed (`@excalidraw/excalidraw` is client-only).
- Disabled Excalidraw cloud features:
  - `UIOptions.canvasActions.saveToActiveFile = false`
  - `UIOptions.canvasActions.loadScene = false`
  - `UIOptions.canvasActions.export = false` (handled natively by Read & Watch `.rwcanvas` export)
  - `UIOptions.canvasActions.saveAsImage = false`
  - Collaboration, room sharing, and cloud sync buttons completely suppressed.

### 2. Built-in Standard Libraries Used Exclusively on Server
The entire backend persistence layer (`server/canvas-store.mjs`) relies purely on standard Node.js built-ins:
- `node:sqlite`: Built-in SQLite database engine for metadata, links, and asset catalogs.
- `node:crypto`: `randomUUID()` for stable IDs and SHA-256 for asset hashing.
- `node:fs`: Native file system APIs with atomic rename (`.tmp` -> final).
- `node:path`: Path resolution and normalization.

Zero third-party ORMs, zero heavy schema validation libraries, and zero cloud storage SDKs.

## Code Simplicity Assessment

### What was added

| File | Purpose | Lines |
|------|---------|-------|
| `lib/canvas/types.ts` | Canonical canvas & link data structures | ~140 |
| `lib/canvas/validation.ts` | Strict runtime validators & URL sanitization | ~120 |
| `lib/canvas/history.ts` | Bounded memory undo/redo (50-entry cap) | ~55 |
| `lib/canvas/index.ts` | Barrel exports | ~8 |
| `server/canvas-store.mjs` | SQLite store, atomic disk I/O, revision conflict, export/import | ~460 |
| `components/canvas/read-watch-canvas.tsx` | Isolated Excalidraw wrapper, deep links, excerpt insertion | ~760 |
| `components/canvas/canvas-list.tsx` | Accessible canvas list, search, inline creation | ~280 |
| `components/canvas/index.ts` | Barrel exports | ~5 |
| `app/canvas-notes/page.tsx` | Standalone canvas library route | ~85 |
| `app/canvas-notes/[id]/page.tsx` | Full-screen canvas workspace route | ~45 |
| `tests/canvas-store.test.mjs` | Persistence, conflict, deep links, recovery & export tests | ~320 |

### What was cut or simplified

- **No Collaboration Server:** Real-time multi-user sockets were avoided entirely. Read & Watch is a local-first personal reading environment.
- **No Complex Conflict Resolution (OT/CRDT):** Simple, bulletproof optimistic revision checking (`expectedRevision` with HTTP 409 Conflict) and explicit "Reload Latest" UI prevents data loss without introducing complex distributed systems code.
- **No In-Memory Cache Layers:** Canvases are read on demand from SQLite / JSON file and autosaved on a simple 1000ms debounce.
- **Local Asset Serving:** Rather than creating a complex asset proxy or pipeline, Vite serves Excalidraw's distribution folder directly via a lightweight local route `/api/reader/excalidraw-assets/*`.

## Conclusion

**PASS** — Minimal necessary surface area, strict local-first data ownership, zero cloud residue, and zero speculative complexity.
