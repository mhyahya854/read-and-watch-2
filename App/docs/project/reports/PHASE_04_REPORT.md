# Phase 04 Report: Document Adapter Foundation (Contract-First, Engine-Free)

Result: PASS

Phase Start HEAD: `3d550f3315d8885206531f8d07d07f94913e1f4e`

## 1. Executive Summary

Phase 04 establishes the format-independent document adapter foundation for Read & Watch. Adhering to the contract-first, engine-free mandate, this phase defines the universal boundaries that decouple reader presentation, navigation, search, and annotation layers from any concrete document engine. Read & Watch firmly retains ownership of identity, source descriptors, stable IDs, capability vocabulary, location envelopes, anchor envelopes, source hashes, errors, lifecycle state transitions, and cancellation semantics.

No third-party rendering engines (such as Foliate-JS or PDF.js) were introduced or integrated in Phase 04; those belong strictly to Phase 05 and Phase 06. The certified legacy Readest reader bridge remains fully functional.

## 2. Architecture & Modules Implemented

All authored document adapter infrastructure resides under `App/app/lib/document/`:

1. **Normalized Error Model (`errors.ts`)**:
   - Class `DocumentError` extending `Error` with stable `DocumentErrorCode` enum:
     - `UNSUPPORTED_FORMAT`, `UNSUPPORTED_CAPABILITY`, `INVALID_SOURCE`, `SOURCE_NOT_FOUND`, `SOURCE_CHANGED`, `OPEN_FAILED`, `PARSE_FAILED`, `NAVIGATION_FAILED`, `SEARCH_FAILED`, `ANCHOR_INVALID`, `ANCHOR_VERSION_UNSUPPORTED`, `ANCHOR_SOURCE_MISMATCH`, `CANCELLED`, `ADAPTER_CLOSED`, `INVALID_LIFECYCLE_STATE`.
   - Error messages are strictly sanitized and never leak local machine file system paths to the client.

2. **Capability Vocabulary (`capabilities.ts`)**:
   - `DocumentCapabilities` boolean contract:
     - `toc`: hierarchical table of contents extraction
     - `textSearch`: programmatic in-document search
     - `textSelection`: text highlight and range selection
     - `textAnchors`: robust position-independent text anchoring
     - `pageNavigation`: discrete 1-indexed page jumping
     - `semanticLocationNavigation`: progression/CFI/semantic positioning
     - `pagination`: paged display mode
     - `continuousLayout`: vertical continuous scroll mode
     - `zoom`: viewport scaling controls
     - `fontControls`: font family and size customization
     - `themeControls`: reader color theme customization
     - `spreadLayout`: two-page spread rendering
     - `bookmarks`: document-level bookmarking
     - `textExtraction`: raw text extraction per location
   - Standard capability profiles: `STANDARD_PDF_CAPABILITIES`, `STANDARD_REFLOWABLE_CAPABILITIES`.

3. **Immutable Source Descriptor (`source.ts`)**:
   - `ReadonlyDocumentSource`: contains `itemId`, `formatId`, `format`, `sourceHash`, `byteSize`, `title`, and `resolverRef`.
   - `validateDocumentSource()`: strictly validates invariants and prevents malformed descriptors from reaching adapters.

4. **Versioned Location Envelope (`location.ts`)**:
   - `DocumentLocation` outer envelope (`schemaVersion: 1`, `sourceHash`, `payload`):
     - `PageLocationPayload`: for fixed-layout formats (PDF, CBZ) with `pageNumber`, optional total pages and zoom.
     - `SemanticLocationPayload`: for reflowable formats (EPUB, MOBI) with `cfi`, `progression` (0.0 to 1.0), and chapter identifiers.
     - `ProgressionLocationPayload`: for continuous reflowable text with fractional offsets.
   - Includes `serializeDocumentLocation()`, `deserializeDocumentLocation()`, and `verifyLocationSourceHash()` guarding against cross-document state leaks and tamper.

5. **Versioned Anchor Envelope (`anchor.ts`)**:
   - `TextAnchor` outer envelope (`schemaVersion: 1`, `sourceHash`, `payload`):
     - `PdfGeometryAnchorPayload`: fixed page number, bounding rects, and text snippet.
     - `ReflowableRangeAnchorPayload`: CFI / DOM range, character offsets, prefix/exact/suffix context.
   - `serializeTextAnchor()`, `deserializeTextAnchor()`, and `verifyAnchorSourceHash()` enforce strict version matching (`schemaVersion === 1`) and payload validation.

6. **Canonical Adapter Contract (`adapter.ts`)**:
   - `DocumentAdapter` interface defining full lifecycle:
     - State machine: `created` -> `opening` -> `open` -> `closing` -> `closed` (or `failed`).
     - Methods: `open(source, options?)`, `close()`, `getMetadata()`, `getToc()`, `getCurrentLocation()`, `navigateTo(location, options?)`, `search(query, options?)`, `getSelection()`, `createAnchor(selection)`, `resolveAnchor(anchor, options?)`, `getCapabilities()`.
     - Supports cancellation tokens (`AbortSignal`) on asynchronous operations (`open`, `navigateTo`, `search`, `resolveAnchor`).

7. **Adapter Registry (`registry.ts`)**:
   - `DocumentAdapterRegistry` and `defaultAdapterRegistry` singleton:
     - Format registration with collision prevention policy (`allowOverwrite: false` throws `DocumentError`).
     - Case-insensitive format normalization (`pdf`, `epub`, `cbz`, etc.).
     - Factory instantiation method `createAdapter(format)`.

8. **Session Controller (`session.ts`)**:
   - `ReaderSession`: Capability-driven reader state controller.
   - Provides snapshot state subscriptions for React UI components.
   - Exposes capability getters (`canZoom`, `canAdjustFont`, `canSearch`, `canContinuousScroll`, etc.), eliminating format-conditional UI code.

9. **Test Doubles & Universal Conformance Suite (`test-doubles/`)**:
   - `FakePdfAdapter`: 50-page fixed-layout simulation exercising page navigation, zoom, geometry anchors, search, cancellation, and closed-state guards.
   - `FakeReflowableAdapter`: 5-chapter reflowable simulation exercising progression navigation, font sizing, theme controls, range anchors, search, cancellation, and closed-state guards.
   - `conformance.ts`: Universal `runDocumentAdapterConformanceSuite()` verifying 18 behavioral invariants.

## 3. Test Suites & Verification Matrix

Five dedicated test suites were implemented under `App/app/tests/`:

| Test Suite | File | Checks / Assertions | Result |
| :--- | :--- | :--- | :--- |
| Universal Conformance | `document-adapter-conformance.test.mjs` | 18 invariants on FakePdfAdapter + 18 on FakeReflowableAdapter | PASS |
| Envelope Integrity | `document-envelopes.test.mjs` | 7 tests: source, location, anchor validation, serialization, tamper checks, error codes | PASS |
| Adapter Registry | `document-registry.test.mjs` | 4 tests: registration, overwrite collision, lookup, lifecycle | PASS |
| Reader Session Controller | `document-session.test.mjs` | 4 tests: capability-driven UI, state subscriptions, navigation, search, anchor round-trips | PASS |
| Format-Branching Enforcement | `format-branching-enforcement.test.mjs` | Full AST/regex scan of all presentation components in `components/` and routes in `app/` | PASS (0 violations) |

### Full Quality Verification Results

| Step | Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| Node Test Suite | `npm test` (in `App/app`) | PASS (53/53 tests) | 35 existing + 18 Phase 04 tests across 11 files |
| TypeScript Check | `npx tsc --noEmit` (in `App/app`) | PASS (0 errors) | `"allowImportingTsExtensions": true` enabled |
| Linter | `npm run lint` (in `App/app`) | PASS (0 errors, 0 warnings) | Scanned 54 authored files |
| Production Build | `npm run build` (in `App/app`) | PASS | Built cleanly via Vinext in 2.30s |
| Dependency Audit | `npm audit --omit=dev` (in `App/app`) | PASS (0 vulnerabilities) | Zero vulnerabilities found |
| Python Import Tests | `python -m unittest discover -s App/scripts/tests` | PASS (15/15 tests) | Complete module isolation |
| Script Hygiene Tests | `python App/scripts/tests/test_check_repository_hygiene.py` | PASS (2/2 tests) | Hygiene validator self-test |
| Library Verification | `python App/scripts/verify_library.py all` | PASS (91/91 items) | All physical book sources and hashes intact |
| Repository Hygiene | `python App/scripts/check_repository_hygiene.py` | PASS | Clean working tree; zero tracked artifacts |
| State Validation | `python App/scripts/validate_project_state.py` | PASS | Validates JSON schemas and phase states |

## 4. Graphify & Ponytail Audits

- **Ponytail Audit**: Result PASS (`PHASE_04_PONYTAIL_AUDIT.md`). Zero runtime dependencies added, zero engine-native leaks, pure TypeScript implementation with native Node 24 ESM execution.
- **Graphify Audit**: Result PASS (`PHASE_04_GRAPHIFY_AUDIT.md`).
  - Graph expanded from 390 nodes / 564 edges / 22 communities in Phase 03 to **569 nodes / 1048 edges / 34 communities** in Phase 04.
  - Core god nodes emerged cleanly: `ReaderSession` (38 edges), `DocumentError` (33 edges), `FakePdfAdapter` (24 edges), `FakeReflowableAdapter` (24 edges), `DocumentAdapter` (22 edges).
  - Graph integrity: 0 import cycles, 0 dangling endpoints, 0 duplicate edges, 0 self-loops.

## 5. Scope Boundary Compliance

- **No Third-Party Rendering Engines**: Foliate-JS and PDF.js were not installed or imported.
- **Legacy Readest Preservation**: Readest remains accessible via `reader-control.tsx` and `reader-store.mjs`.
- **Source Immutability**: All original files in `Read and Watch - Local Data` remain strictly untouched.
- **Git Cleanliness**: All Graphify outputs are saved to the external data directory.

## 6. Commit Verification

- Phase 04 Content Commit: `<PENDING_CONTENT_COMMIT>`
- Phase 04 Closure Commit: `<PENDING_CLOSURE_COMMIT>`
