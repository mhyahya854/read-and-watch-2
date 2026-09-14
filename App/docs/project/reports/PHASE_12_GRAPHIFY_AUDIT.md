# Phase 12 Graphify Audit — Export and Portability

**Date:** 2026-09-14  
**Phase:** PHASE-12  
**Auditor:** Antigravity automated audit

---

## Summary

| Metric | Value | Status |
|---|---|---|
| Runtime Truth vs Export Separation | **100%** (Canonical stores authoritative) | PASS |
| Source Document Writes / Mutability | **0** (Byte-identical, mtime unchanged) | PASS |
| Source Overwrite Collisions | **0** (Refusal Guard enforced) | PASS |
| `pdf-lib` Scope Isolation | **100%** (Derivative export only, never in reader) | PASS |
| Derived Search Index Leakage into Backup | **0%** (FTS5 excluded; rebuilt on restore) | PASS |
| Absolute Paths in Export Schemas | **0** (Pure relative / opaque paths) | PASS |
| Import Cycles Introduced | **0** | PASS |

---

## Module Dependency Graph — Export & Portability Architecture

```
lib/portability/types.ts
  └── (pure TypeScript types: PortabilityFormat, BackupPackage, AnnotationExport, etc.)

lib/portability/validation.ts
  └── lib/portability/types.ts (fail-closed schema versioning, traversal & drive guards)

lib/portability/client.ts
  └── lib/portability/types.ts
  └── browser download helpers & typed fetch triggers for /api/portability/*

server/portability-store.mjs
  └── lib/portability/types.ts
  └── lib/portability/validation.ts
  └── pdf-lib (PDFDocument, rgb, StandardFonts — used exclusively for NEW derivative PDFs)
  └── consumes: libraryStore, annotationStore, readerStore, userDataStore, canvasStore, searchStore
  └── zero circular dependencies; strictly downstream from canonical domain stores

server/portability-vite-plugin.mjs
  └── server/portability-store.mjs
  └── mounts HTTP routes under /api/portability/*

components/settings/portability-settings.tsx
  └── lib/portability/client.ts
  └── lib/portability/types.ts
  └── components/ui/* (Button, Toast)

components/reader/reader-toolbar.tsx
  └── lib/portability/client.ts
  └── components/ui/dropdown-menu.tsx

components/study/study-browser.tsx
  └── lib/portability/client.ts
```

---

## Graph Invariant Checks

1. **Strict Downstream Derivation**:
   - `portability-store.mjs` reads from `libraryStore`, `annotationStore`, `readerStore`, `userDataStore`, and `canvasStore`. None of those stores depend on or import `portability-store`.
   - Export packages are serialized snapshots; they never become runtime state without an explicit user restore action.
2. **Search Index Rebuild Boundary**:
   - Backup bundles completely omit the derived SQLite search tables.
   - `applyRestore` explicitly invokes `searchStore.rebuildIndex()`, verifying that the derived search index preserves its strict one-way derivation from restored canonical stores.
3. **Immutability Enforcement**:
   - `exportAnnotatedPdf` compares source file SHA-256, file size, and filesystem mtime before and after derivative creation.
   - Hard path checks guarantee that output target paths cannot match the source media path.
4. **Zero Import Cycles**:
   - All portability types are centralized in `lib/portability/types.ts` with no reverse imports.

---

## Conclusion
Phase 12 strictly maintains architectural purity, unidirectional data flow, and source immutability guarantees.
