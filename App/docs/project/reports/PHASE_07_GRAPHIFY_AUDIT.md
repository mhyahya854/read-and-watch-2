# Phase 07 Graphify Audit

Result: PASS

The codebase dependency graph was extracted and clustered using Graphify (`python -m graphify extract App/app --code-only` and `python -m graphify cluster-only`) after completing the Phase 07 unified reader experience across reflowable books and fixed-layout PDF publications.

## Graph Summary

- Nodes: 828 (expanded from 730 in Phase 06)
- Edges: 1703 (expanded from 1405 in Phase 06)
- Communities: 60 (expanded from 51 in Phase 06)
- Extraction Fidelity: 98% EXTRACTED, 2% INFERRED, 0% AMBIGUOUS (avg inferred confidence: 0.85)
- Import cycles: 0
- Missing endpoints: 0
- Dangling endpoints: 0
- Exact duplicate edges: 0
- Same-endpoint collapsed edges: 0
- Self-loops: 0
- Unverified nodes: 0

## Core Architectural Hubs & Abstractions

The updated dependency graph confirms that Phase 07 successfully introduced a single, cohesive presentation layer that queries runtime adapter capabilities rather than branching on file formats:

1. **`reader-context.tsx` (56 edges)**: React Context bridge connecting the unified UI components to `ReaderSession`, debounced persistence endpoints (`/api/reader/items/:id/state`, `/api/reader/items/:id/bookmarks`, `/api/reader/settings`), and capability queries.
2. **`ReaderSession` (49 edges)**: Universal document session coordinator maintaining location history (`ReaderHistory`), canonical bookmarks, preferences, zoom levels, rotation angles, and metrics (`currentPage`, `totalPages`, `readingProgress`, `currentChapter`).
3. **`reader-shell.tsx` & Modular Components (62 edges)**:
   - `ReaderToolbar`: Editorial header with library back link, metadata, format badges, location history cluster, sidebar tabs, zoom controls, and settings trigger.
   - `ReaderSidebar`: Docked panel on desktop, sliding sheet on mobile, coordinating Contents, Search, and Bookmarks tabs.
   - `ReaderContents`: Hierarchical table of contents with interactive query filtering.
   - `ReaderSearch`: Universal search grammar with truthful missing-text degradation and phrase highlighting.
   - `ReaderBookmarks`: Canonical user bookmark manager with timestamps and page badges.
   - `ReaderSettingsDialog`: Theme selector (Light, Warm, Dark), typography scaling, and keyboard shortcuts grid.
   - `ReaderViewport`: Mount container with floating flank navigation, loading skeletons, and error recovery actions.
   - `ReaderStatus`: Restrained footer with location context and reading progress percentage.
4. **`ReaderHistory` & `history.ts` (14 edges)**: Bounded, non-leaking navigation stack with deduplication and forward truncation.
5. **`Bookmark` & `bookmark.ts` (16 edges)**: Canonical schema version 1 bookmark envelope isolated from Phase 09 annotation models.
6. **`ReaderPreferences` & `preferences.ts` (19 edges)**: Editorial typography, theme, and layout preferences with safe range validation and clamping.
7. **`PdfAdapter` (44 edges)**: Production fixed-layout PDF adapter (Phase 06) reporting capabilities (`zoom`, `pageNavigation`, `pagination`).
8. **`FoliateReflowableAdapter` (37 edges)**: Production reflowable book adapter (Phase 05) reporting capabilities (`fontControls`, `continuousLayout`, `themeControls`).
9. **`reader-store.mjs` (34 edges)**: Server-side atomic file storage (`writeAtomic`) for reading states, bookmarks, and user settings.

## Architectural Invariants Certified

1. **Strict Format-Branching Elimination**: Verified by `tests/format-branching-enforcement.test.mjs`. UI components in `components/reader/` and routes in `app/reader/` contain 0 format conditionals (`format === 'pdf'`, `isPdf`, etc.). Every single control queries adapter capabilities.
2. **Complete Engine Invisibility**: Zero Foliate-JS, PDF.js, or Mozilla logos, branding, chrome, or default viewer controls exist in user-facing presentation code.
3. **Zero OCR Boundary**: Architecture strictly forbids OCR execution. Missing-text documents gracefully degrade with truthful UI indicators.
4. **Clean Storage Separation**: All generated Graphify artifacts (`graph.json`, `graph.html`, `.graphify_analysis.json`, `GRAPH_REPORT.md`) reside strictly in the external data root (`READ_WATCH_DATA_ROOT/App/graphify-out`) outside Git.
