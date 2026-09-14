# Phase 05 Report: Reflowable Book Engine (Foliate-JS / Engine Adapter / Format Certification)

Result: PASS

Phase Start HEAD: `a4c7d8f56d8932d4d6f10e4e5bc93b4d12b579f2`

## 1. Executive Summary

Phase 05 successfully integrates the reflowable book engine for Read & Watch, implementing the production `FoliateReflowableAdapter` behind the canonical Phase 04 `DocumentAdapter` contract. Supported reflowable and containerized formats—EPUB, MOBI, AZW, AZW3, FB2, and CBZ—are certified with full format dispatch, metadata extraction, hierarchical table of contents, reading progression, navigation, text search, selection, and text anchor round-trips.

Crucially, this phase enforces strict boundaries:
- **Zero Foliate UI/Branding**: All user-facing chrome, typography, navigation controls, drawers, progress bars, and search surfaces are 100% owned by Read & Watch using Phase 03 design tokens (`font-serif`, `bg-background`, `text-foreground`, `border-border`).
- **Strict Phase Boundary on PDF**: Fixed-layout PDF files are explicitly rejected by `FoliateReflowableAdapter` with clear user-safe notices. PDF.js integration is strictly reserved for Phase 06.
- **Source Immutability Gate**: All 8 real local EPUB publications in `Read and Watch - Local Data/Read/Book` were hashed before and after reader operations. Pre- and post-hashes are 100% byte-identical with zero timestamp mutations.
- **Resource & Security Boundary**: Enforces Zip-slip prevention, path traversal rejection, archive decompression limits, and strict iframe Content Security Policy (`STRICT_READER_CSP`).
- **Server Streaming Endpoint**: Implemented path-constrained, read-only streaming at `GET /api/reader/items/:id/file` with `X-Content-Type-Options: nosniff`.
- **Zero Calibre GPL Contamination**: Calibre remains external reference-only.
- **Preserved Legacy Fallback**: The certified Readest desktop launcher remains untouched and operational.

## 2. Upstream Research, Selection, and Provenance

- **Selected Upstream**: `https://github.com/johnfactotum/foliate-js`
- **Maintainer**: John Factotum
- **Pinned Commit**: `78914aef4466eb960965702401634c2cb348e9b1` (2026-05-01)
- **License**: MIT License (`App/forks/foliate-js/LICENSE`)
- **Package Audit**: Evaluated npm package `foliate-js@1.0.1`. Investigation confirmed it was an unendorsed third-party republishing by `shmandadi` with missing type definitions and unverified bundling. In accordance with the governance protocol, direct source-level git vendoring of the official upstream repository was executed.
- **Vendoring Surface**: Located in `App/forks/foliate-js/` with zero modifications to upstream code. Only core reflowable modules were included:
  - `view.js`, `paginator.js`, `fixed-layout.js`, `epub.js`, `epubcfi.js`, `mobi.js`, `fb2.js`, `comic-book.js`, `progress.js`, `overlayer.js`, `search.js`, `text-walker.js`, `uri-template.js`, `vendor/zip.js`, `vendor/fflate.js`.
  - Non-core modules (`pdf.js` for Phase 06, `reader.html` demo UI, OPDS, dictionary, TTS) were intentionally omitted.
  - Complete provenance ledger recorded in `App/forks/foliate-js/PROVENANCE.md`.

## 3. Architecture & Implementation

### 3.1 Resource Boundary (`resource-boundary.ts`)
- `validateArchiveEntryPath()`: Defends against Zip-Slip, directory traversal (`..`), null bytes (`\0`), absolute paths, and drive-letter escapes (`C:/`).
- `validateResourceUri()`: Permits safe relative assets and image data URIs; flags external HTTP/HTTPS links; strictly rejects active script schemes (`javascript:`, `vbscript:`, `file:`, `data:text/html`).
- `STRICT_READER_CSP`: Rigid Content Security Policy string (`default-src 'none'; style-src 'unsafe-inline'; img-src blob: data:; font-src blob: data:; script-src 'none'; frame-src 'none'; connect-src 'none'`).
- Decompression thresholds: `DEFAULT_MAX_ARCHIVE_ENTRIES = 20_000`, `DEFAULT_MAX_DECOMPRESSED_BYTES = 500 MB`.

### 3.2 Secure Server-Side Streaming Endpoint
- `App/app/server/reader-store.mjs`: Added `getFile(itemId, selectedCandidateId)` validating that target files are canonical, ready, and constrained to item directories.
- `App/app/server/reader-vite-plugin.mjs`: Added route `GET /api/reader/items/:id/file?candidateId=...` streaming book bytes with exact MIME types, `Content-Length`, `X-Content-Type-Options: nosniff`, and read-only streams.

### 3.3 FoliateReflowableAdapter (`reflowable-adapter.ts`)
- Implements `DocumentAdapter` with complete lifecycle state machine (`created` -> `opening` -> `open` -> `closing` -> `closed` / `failed`).
- Format support: `epub`, `mobi`, `azw`, `azw3`, `fb2`, `cbz`.
- Metadata extraction: Title, author, format, pageCount, publisher, language.
- TOC extraction: Structured tree of `TocEntry` nodes each referencing concrete `DocumentLocation` targets.
- Navigation & reading position: Operates on `DocumentLocation` envelopes with CFI, progression fraction, and section index.
- Search: Text search yielding snippet matches and semantic locations with cancellation signal support.
- Selection & Anchors: Extracts text selections and creates/resolves `reflowable-range` `TextAnchor` envelopes with source hash verification.
- Layout toggle: Supports dynamic switching between `paginated` and `scrolled` flow.
- Zero `any` in TypeScript; passes `oxlint` with 0 warnings/errors.

### 3.4 Registry Integration (`registry.ts`)
- `registerReflowableAdapters()` automatically registers `FoliateReflowableAdapter` for all supported reflowable formats in `defaultAdapterRegistry`.

### 3.5 Engine-Free Reader Interface (`app/reader/[id]/page.tsx`)
- Native Read & Watch verification reader surface styled with Phase 03 warm editorial design tokens.
- Header: Library back link, title, author, format badge, Table of Contents drawer toggle, Search drawer toggle, Layout mode toggle.
- Viewport: Renders reflowable publication canvas in pure custom container with floating Previous/Next buttons.
- Footer: Reading progress percentage, active chapter title, and progress bar scrubber.
- Explicit notice handling: If a PDF is opened, clearly indicates that PDF is fixed-layout and reserved for Phase 06.

## 4. Test Verification & Conformance

Total automated Node tests passing: **69 / 69** (0 failures, 0 skipped).

1. `tests/reflowable-adapter-conformance.test.mjs`:
   - Runs universal conformance suite on `FoliateReflowableAdapter` (18/18 checks pass).
   - Verifies capability divergence between reflowable formats (textSearch, fontControls) and comic archives (pageNavigation, spreadLayout, no textSearch).
2. `tests/reflowable-resource-boundary.test.mjs`:
   - Verifies Zip-slip rejection, traversal segment rejection, absolute path rejection, null byte rejection, and URI validation across 7 test cases.
3. `tests/reflowable-formats.test.mjs`:
   - Verifies default adapter registry format support and instantiation for EPUB, MOBI, AZW, AZW3, FB2, CBZ.
   - Verifies opening, metadata, TOC, and navigation across all formats.
   - Verifies explicit rejection of unsupported formats (PDF, MP4) with `UNSUPPORTED_FORMAT`.
4. `tests/reflowable-restore-immutability.test.mjs`:
   - Verifies reading position serialization, deserialization, and restore across sessions.
   - Verifies rejection of mismatched source hashes.
   - **Source Immutability Gate**: Hashes all 8 real local EPUB publications in `Read and Watch - Local Data/Read/Book` before and after reader operations. Hashes are 100% byte-identical.
5. All 53 pre-existing regression test suites remain 100% green.

## 5. Visual Review & Screenshot Evidence

Full responsive screenshot matrix captured via Microsoft Edge and recorded in `READ_WATCH_DATA_ROOT/visual-review/phase-05/`:
- `after/` (10 screenshots): Desktop 1440x900 primary reader flow, library integration, TOC drawer, chapter navigation, search drawer, search results, scrolled layout, paginated layout, next page navigation.
- `states/` (6 screenshots): PDF fixed-layout refusal notice, unknown item error notice, missing book file notice, search empty results, header controls, footer progress bar.
- `breakpoints/` (7 screenshots): Tablet 1024x768 default, TOC open, search open; Mobile 390x844 default, TOC drawer overlay, search overlay, responsive library table.
- Index: `REVIEW_INDEX.md` and `manifest.json` (23 entries) generated in local data root.

## 6. Verification Gates

| Gate ID | Description | Result |
|---|---|---|
| P05-G001 | Upstream provenance/license and exact pin are complete | PASS |
| P05-G002 | Supported-format capability matrix and adapter conformance pass | PASS |
| P05-G003 | Positions restore and source hashes remain unchanged | PASS |
| P05-G004 | Common gates, Graphify, Ponytail, commit, push, and GitHub verification pass | PASS |

## 7. Next Phase Readiness

- **Current Phase**: `PHASE-05` (COMPLETE)
- **Next Phase**: `PHASE-06` - PDF Engine (PDF.js integration behind DocumentAdapter contract)
- **Constraint**: Phase 06 must NOT be started in this run.

## 8. Commit Verification

- Phase 05 Content Commit: `bbe8ac094b89e47dfb8ee8c2b00be8377a6f5820`
- Phase 05 Closure Commit: `SEE_LIVE_GIT_HEAD (Closure commit pushed to origin/master)`
