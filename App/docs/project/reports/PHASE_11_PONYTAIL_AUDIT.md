# Phase 11 Ponytail Audit — Search, Annotation Browser, and Study Workflow

**Date:** 2026-09-14  
**Phase:** PHASE-11  
**Auditor:** Antigravity automated audit

---

## Summary

| Metric | Value | Status |
|---|---|---|
| New runtime npm dependencies added | **0** | PASS |
| Built-in SQLite FTS5 used | **Yes** (`node:sqlite`) | PASS |
| Premature query DSLs / parser abstractions | **0** | PASS |
| Vector embeddings / vector DB bloat | **0** | PASS |
| Reinvented standard library / platform APIs | **0** | PASS |
| Dead flexibility / speculative action registries | **0** | PASS |

---

## Dependency & Surface Area Audit

### 1. Zero External Search Packages
- Instead of adding heavy packages like `lunr`, `minisearch`, `flexsearch`, `meilisearch`, or cloud vector databases (`pinecone`, `weaviate`, `chroma`), Phase 11 leverages Node 22's built-in `node:sqlite` SQLite engine with native FTS5 full-text search.
- The `unicode61 remove_diacritics 0` tokenizer provides fast, case-insensitive, diacritic-preserving full-text indexing with BM25 ranking directly in the local SQLite database.
- Total new npm packages introduced: **0**.

### 2. Standard Native Web APIs
- **Clipboard**: Direct usage of `navigator.clipboard.writeText` with safe fallback; no bulky third-party copy-to-clipboard dependencies.
- **Selection**: Native `window.getSelection()` and `Range.getBoundingClientRect()` for floating context menu positioning.
- **Snippets**: Pure string regex parsing (`parseSnippetTokens`) producing clean token arrays for React rendering with native `<mark>` tags, avoiding insecure `dangerouslySetInnerHTML`.

### 3. Streamlined Offline Extension Hooks
- `studyExtensions` provides minimal typed interfaces (`DictionaryProvider`, `TranslationProvider`) with an in-memory module registry.
- Default state is clean `null` with calm, informative offline notifications. Zero network callers or background daemons are spawned when unconfigured.

---

## Code Simplicity & Net Sizing

| Component | Lines | Role |
|---|---|---|
| `lib/search/types.ts` | ~120 | Canonical normalized search types |
| `lib/search/query.ts` & `server/search-query.mjs` | ~100 | Input normalization & safe FTS5 escaping |
| `lib/search/client.ts` | ~85 | Fetch client for `/api/search` endpoints |
| `server/search-store.mjs` | ~680 | Derived FTS5 SQLite tables, rebuild & invalidation |
| `components/study/study-browser.tsx` | ~520 | Unified browser, counters, filters, snippets, jumps |
| `components/reader/reader-selection-menu.tsx` | ~740 | Copy, Define, Translate, Notes & Canvas handoff |
| `lib/study/extension-hooks.ts` | ~80 | Offline typed provider interfaces |

### What was cut or simplified:
- **No Complex Query Syntax**: Avoided arbitrary SQL or complex boolean AST query engines; simple prefix tokenization handles real reading searches reliably.
- **No Vector Embeddings / Model Weights**: Zero multi-gigabyte embeddings files or ONNX runtime bloat; instantaneous lexical FTS5 matches user notes and quotes accurately.
- **No Heavy Action Orchestrators**: Direct, straightforward event handlers for Notes append and Canvas insertion using existing Phase 9 and Phase 10 APIs.

---

## Conclusion
Phase 11 achieves full functional scope with zero new runtime dependencies, zero bloat, and standard library simplicity.
