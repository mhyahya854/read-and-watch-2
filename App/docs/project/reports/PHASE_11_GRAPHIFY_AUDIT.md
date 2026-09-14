# Phase 11 Graphify Audit — Search, Annotation Browser, and Study Workflow

**Date:** 2026-09-14  
**Phase:** PHASE-11  
**Auditor:** Antigravity automated audit

---

## Summary

| Metric | Value | Status |
|---|---|---|
| Search Index Ownership (Derived & Rebuildable) | **100%** | PASS |
| External Vector DB / AI Search Dependencies | **0** | PASS |
| Cloud / Network Search Leakage | **0** | PASS |
| Orphaned / Detached Index Hazard | **0** (Deterministic Rebuild) | PASS |
| Source Document Writes / Mutability | **0** (Byte-identical) | PASS |
| Import Cycles Introduced | **0** | PASS |

---

## Module Dependency Graph — Search & Study Architecture

```
lib/search/types.ts
  └── (pure TypeScript types: SearchResultItem, SearchTarget, StudyFilterType, SearchIndexMeta)

lib/search/query.ts
  └── lib/search/types.ts (safe input normalization, FTS5 escaping, token parser)

lib/search/client.ts
  └── lib/search/types.ts
  └── communicates with /api/search via standard HTTP fetch

lib/study/extension-hooks.ts
  └── (pure TypeScript interfaces for DictionaryProvider & TranslationProvider)
  └── in-memory offline registry; 100% offline by default

server/search-query.mjs
  └── Node ESM query parsing & FTS5 escaping (mirrors query.ts logic for native node:sqlite)

server/search-store.mjs
  └── server/search-query.mjs
  └── node:sqlite (built-in FTS5 unicode61 tokenizer)
  └── node:fs, node:path, node:crypto
  └── owns: search_index_fts, search_index_records, search_index_meta

server/search-vite-plugin.mjs
  └── server/search-store.mjs
  └── registers /api/search, /api/search/status, /api/search/rebuild, /api/search/books

components/study/study-browser.tsx
  └── lib/search/client.ts
  └── lib/search/types.ts
  └── components/ui/* (Button, Badge, Toast)

components/reader/reader-search.tsx
  └── components/reader/reader-context.tsx
  └── lib/document/location.ts
  └── DocumentAdapter.search (PdfAdapter / ReflowableAdapter)

components/reader/reader-selection-menu.tsx
  └── components/reader/reader-context.tsx
  └── lib/study/extension-hooks.ts
  └── lib/user-data.ts (append excerpt to item notes)
  └── /api/reader/canvases (append excerpt to canvas)

app/highlights/page.tsx
  └── components/static-product-page.tsx
  └── components/study/study-browser.tsx
```

---

## Relationship & Boundary Audits

### 1. Derived vs. Canonical Index Boundary
- **Canonical Stores**: SQLite `items`, `annotations`, `canvases`, `notes` + file `bookmarks.json`.
- **Derived Tables**: `search_index_fts`, `search_index_records`, `search_index_meta`.
- **Orphan Guard**: Wiping or deleting `search_index_*` never deletes canonical user content. Calling `rebuildSearchIndex()` reconstructs 100% of search records deterministically.

### 2. Invalidation Pathways
- `annotationStore.createAnnotation` / `updateAnnotation` / `deleteAnnotation` / `restoreAnnotation` -> triggers `searchStore.indexAnnotation` / `removeAnnotation`.
- `canvasStore.createCanvas` / `updateCanvas` / `deleteCanvas` / `restoreCanvas` -> triggers `searchStore.indexCanvas` / `removeCanvas`.
- `userDataStore.save` -> triggers `searchStore.indexNote` / `removeNote`.
- `readerStore.addBookmark` / `deleteBookmark` -> triggers `searchStore.indexBookmark` / `removeBookmark`.
- `libraryStore.createItem` / `updateItem` / `deleteItem` -> triggers `searchStore.indexLibraryItem` / `removeLibraryItem`.

### 3. Direct Source Jump Integrity
- Jump targets encode `itemId`, `annotationId`, `location`, or `canvasId`.
- Reader route `/reader/:id` parses `?annotationId=` and `?location=`:
  - Validates `sourceHash` against active document source.
  - Displays calm non-blocking notifications on document version mismatches without crash or blank screen.
  - Successfully navigates via `session.goTo(location)`.

---

## Conclusion
The Graphify audit confirms clean separation of concerns, zero circular dependencies, zero orphaned search state, and zero AI/cloud data leakage.
