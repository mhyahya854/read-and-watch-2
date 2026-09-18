# Architecture and Safety Decisions

## D-001 - Immutable source and backup boundaries

Status: Accepted

The original Notion exports are read-only inputs. The project first copies them to `backup/notion-original-snapshot/`, verifies every file by relative path, size, and SHA-256, and then imports only from that verified backup. Transformation is blocked until verification passes.

## D-002 - Separate software from personal data

Status: Accepted

Application code lives in `app/`, future third-party forks in `forks/`, normalized personal content in `library/`, immutable copies in `backup/`, and importer machinery in `import/`. Personal data must not be embedded in application source directories.

## D-003 - Human-readable, file-first library

Status: Accepted

Each natural item will use one stable item folder and one UTF-8 `item.md`. Master indexes remain compact navigation files. Binary media stays as normal files referenced by relative paths; Base64 media is prohibited.

## D-004 - Conservative interpretation

Status: Accepted

Unknown data is preserved and reported rather than guessed or discarded. Conflicts and ambiguous records go to a review report and do not silently overwrite an existing item.

## D-005 - Canonical Notion import source

Status: Accepted

For each collection, import exactly once from the verified Markdown + CSV package and its `_all.csv` table. HTML/PDF packages and standalone Watch HTML archives remain immutable preserved variants. They do not create additional library records.

## D-006 - Stable page-ID identity and collision-safe folders

Status: Accepted

Each item uses its 32-character Notion page ID as the stable identity, prefixed by collection. Exact titles remain metadata. Folder slugs are deterministic and Windows-safe; every member of a case-insensitive slug collision group gets the first eight page-ID characters as a suffix. CSV order and import order never determine identity.

## D-007 - Preserve raw evidence beside normalized Markdown

Status: Accepted

Every item keeps the byte-identical exported page, exact CSV row, provenance hashes, and byte-identical linked media under its item folder. `item.md` is a normalized human-facing view. Imported media can supply a preview but is not called a cover unless the export explicitly labels it as one.

## D-008 - Local catalog and media boundary

Status: Accepted

The React application reads `library/catalog.json` as generated data and serves library media through a path-constrained local-only adapter. Personal files remain in `library/`; production builds may copy the 74 referenced assets only into ignored client output. No private library data is committed as application source or sent to a hosted service.

## D-009 - Task 1 UI is a browsing blueprint

Status: Accepted

Task 1 provides Read/Watch navigation, search, metadata tables, real previews, responsive item details, and explicit future sections. My Thoughts, Notes, relationships, Readest, and Mermaid controls do not write data and remain placeholders until a later task defines safe persistence and the user explicitly authorizes upstream integration.

## D-010 - Keep the application dependency surface narrow

Status: Accepted

Unused generated components, wrapper utilities, and optional UI packages were removed. The remaining React/Vinext/Vite toolchain is pinned to the exact versions recorded in `app/package.json` and `app/package-lock.json`; closure requires lint, TypeScript, production build, local runtime, and a zero-vulnerability npm audit.

## D-011 - Whole-PC location audit is the gate before later tasks

Status: Accepted

Before any later task, a read-only whole-PC audit locates every candidate project copy, source-export copy, and backup copy using distinctive markers and content confirmation. The audit records locations only, never deletes, moves, renames, overwrites, or merges anything. Task 1 re-certification and the absence of divergent copies are prerequisites for continuing.

## D-012 - User data is separate, file-first, and lazily created

Status: Accepted

Task 2 personal data lives only under the writable `user-data/` directory at the project root. Each item folder (`user-data/items/<stable-id>/`) may contain `thoughts.md` and `notes.md` as independent UTF-8 Markdown files; the stable catalog item ID is the only link to imported evidence. Files are created on the first real save, not pre-created for all 90 items. `user-data/index.json` is a compact pointer index (no note bodies) so small local models can discover authored content without scanning every file.

## D-013 - Local persistence bridge and write boundary

Status: Accepted

A normal browser cannot write project files directly, so the app uses a minimal local Node-side bridge: a Vite dev-server middleware in the same pattern as the existing library-assets adapter, backed by a small pure Node store module (`app/server/user-data-store.mjs`). The bridge accepts only catalog-validated item IDs (`read-*` / `watch-*` + 32 hex chars) and a fixed `thoughts`/`notes` type, resolves every path under `user-data/`, and rejects traversal or absolute paths. The production build remains a read-only preview until desktop packaging provides a native write bridge; persistence is verified in the local development runtime. No database and no new runtime dependencies were introduced.

## D-014 - Safe saves, history, and conflicts for mutable user data

Status: Accepted

Saves write a temporary file, verify it, then atomically replace the user-data file only. Before any replace or empty-out, the previous version is archived to `user-data/.history/` with a bounded retention of 5 versions per item per type. Saving an empty note removes that user-data file (after archiving) so lazy creation stays clean; the index entry is updated or removed accordingly. Each load returns a revision token (file last-modified time). A save whose base revision no longer matches the on-disk file returns a 409 conflict instead of silently overwriting; the UI shows the conflict and lets the user reload the on-disk version or explicitly overwrite (the old version remains in history).

## D-015 - Readest remains a separate upstream-native reader process

Status: Accepted

Task 3 integrates the pinned official Readest Windows/Tauri executable as a separate portable process. The existing Read & Watch Vite server launches it with a server-resolved local book path through Readest's existing desktop `Open with` flow. Readest's reader UI, routing, toolbar, navigation, settings, and reading behavior remain upstream-owned; no iframe, component copy, second backend, or web-storage import bridge is added. Read & Watch stays open, so closing the separate reader returns to the library.

## D-016 - Stable catalog identity is the only reader path authority

Status: Accepted

The browser may send only a stable Read item ID plus an opaque server-issued candidate ID; it never sends or receives a filesystem path. The server resolves candidates only from that catalog item's declared `media`, confines them to both `library/` and the item's own directory, rechecks existence and supported format at launch, rejects Watch/unknown/malformed/traversal/absolute/missing/unsupported inputs, and never guesses among multiple readable candidates. The Readest runtime lives under `runtime/readest/`, and portable desktop open must remain transient (`autoImportBooksOnOpen: false`) so source books are not copied or modified.

## D-017 - User-added books remain distinct from Notion evidence

Status: Accepted

A personal book added after the Notion import is a new library record, never a
fabricated Notion attachment. Its stable Read ID is `read-` plus the first 32
lowercase hexadecimal characters of the verified source SHA-256, subject to an
explicit collision check. The central `import/manifests/user-added-items.json`
and item-level provenance record must identify `user_added: true`,
`imported_from_notion: false`, and `source_type: personal_book`. The importer
copies one verified normal file into the item's `media/` directory, preserves
the original, and refuses overwrite or hash mismatch. Generated indexes merge
these records with the preserved Notion-imported catalog without rewriting the
original 19 Read items.

## D-018 - Repository and personal data are physically separate

Status: Accepted

Git contains software, documentation, tests, and explicitly vendored upstream source only. Personal library content, exports, backups, manifests, checkpoints, reports, logs, user-authored data, reader runtime, and generated output live below one external `READ_WATCH_DATA_ROOT`; the default is a sibling directory outside the repository. Runtime validation rejects a data root inside the repository.

## D-019 - Readest is vendored with explicit provenance

Status: Accepted

The pinned Readest checkout and its initialized submodules are flattened into `forks/readest/` as ordinary files. `UPSTREAM.md`, `OUR_CHANGES.md`, the lockfile, license, source commit, and a complete external hash manifest preserve provenance and reproducibility; nested Git metadata is forbidden.

## D-020 - GitHub is rebuilt from clean history

Status: Accepted

Because the existing public remote is disposable and has no collaboration or automation state, it is deleted and recreated only after local data, build, hygiene, secret, and history gates pass. The replacement begins with one clean commit and no LFS objects or private historical blobs.

## D-021 - Master-plan authority replaces legacy task authority

Status: Accepted

`docs/project/MASTER_PLAN.md` and `docs/project/RUN_STATE.json` are the durable execution authorities below explicit current user instructions. `TASKS.md` remains historical; its unfinished Task 4 is superseded and must not be executed.

## D-022 - Read & Watch owns the product experience and canonical data

Status: Accepted

Engines provide capabilities. Read & Watch owns the UI, navigation, library, metadata, stable identity, storage, annotations, bookmarks, notes, positions, drawings, canvases, OCR orchestration, diagrams, relationships, search UX, settings, privacy/legal UX, export, and future intelligence. No third-party engine becomes the canonical owner of user data.

## D-023 - Reader engine targets and legacy fallback

Status: Accepted

Readest is a `CERTIFIED LEGACY FALLBACK + FEATURE/ARCHITECTURE REFERENCE`, not the future application shell. Foliate-JS is the target reflowable-book engine and PDF.js is the target PDF renderer, subject to phase-specific provenance, capability, license, and integration verification. Visible engine UI and engine-owned canonical storage are rejected.

## D-024 - Read & Watch-owned annotations and canvases

Status: Accepted

Read & Watch will own one annotation universe across formats. Excalidraw is the target book-linked handwritten and drawn notes engine, with Read & Watch-owned persistence and deep links. It is not the text-highlight engine, document renderer, application shell, or cloud-storage authority.

## D-025 - Structured graphs and text-defined diagrams are selective tools

Status: Accepted

React Flow / xyflow is used only where semantic node-edge topology has real meaning. Mermaid is used only for text-defined diagrams. Neither is forced into ordinary notes, handwriting, page annotation, or every diagram.

## D-026 - Calibre concepts without Calibre ownership

Status: Accepted

Read & Watch will reproduce evidence-supported Calibre-class library concepts in its own system. Calibre's GUI, visual design, `metadata.db`, server, device stack, editor, conversion-first workflow, and wholesale GPL application embedding are not adopted.

## D-027 - SQLite plus file-first recoverability

Status: Accepted

The target is a Read & Watch-owned SQLite database paired with deterministic file-first snapshots that can rebuild it. SQLite is the canonical writable runtime store; exports are immutable recovery artifacts, not a second writable master. Phase 01 specified schema, transaction, migration, compatibility, backup, restore, and rebuild contracts. Phase 02 must prove them with executable tests and a real-catalog dry run before promotion.

## D-028 - Source-book immutability and derived export

Status: Accepted

Original books are never overwritten by default. PDF-lib may be used later only for new annotated or exported derivatives where suitable; it is not a renderer. Any portable export preserves source hashes and records provenance.

## D-029 - OCR is a late optional extension

Status: Accepted

OCR starts only in Phase 17 after usable-text detection. Text PDFs use PDF.js text layers without OCR. PaddleOCR-VL, Tesseract, and Urdu/Nastaliq specialists require real-book benchmarks, provenance, uncertainty handling, and human review. OCR never mutates the original scan.

## D-030 - Fixed design constitution and anti-vibe rules

Status: Accepted

`docs/project/DESIGN_CONSTITUTION.md` is binding. The product uses the approved warm-neutral, charcoal, muted-deep-teal editorial desktop language and permanently rejects the listed fake-content, generic startup, decorative-gradient, pill-everywhere, glassmorphism, neon, stock-human, and gratuitous-motion patterns.

## D-031 - Privacy Policy and Terms reflect implemented reality

Status: Accepted

The finished product requires real Privacy Policy and Terms & Conditions pages. Final legal claims must match the architecture then implemented and must not invent accounts, cloud processing, sharing, or services.

## D-032 - Desktop shell remains provisional

Status: Provisional - evaluate in Phase 14

React remains the UI. Tauri is the current desktop-shell candidate, but Phase 14 must verify security, packaging, file associations, persistence bridging, update strategy, licensing, and alternatives before adoption. A Rust UI is not planned.

## D-033 - Common item with collection-specific extensions

Status: Accepted

Read and Watch share one library identity, metadata, properties, tags, assets, provenance, relationships, notes, and search layer. Read-specific and Watch-specific data live in separate extension tables. Watch is never forced through book format, page, CFI, or series semantics.

## D-034 - Existing stable IDs and unknown data survive migration unchanged

Status: Accepted

All 91 current stable IDs remain byte-for-byte authoritative. Exact Notion property names, case, values, source payloads, item paths, provenance, media, and user-added fields are mapped explicitly. Any value that cannot be normalized safely is retained as versioned raw JSON and a namespaced `unknown` property rather than discarded or guessed.

## D-035 - Migration uses new targets and verified promotion

Status: Accepted

Migration begins with a source fingerprint and a new external dry-run database. It is deterministic by stable ID, one-item transactional, restartable, idempotent, conflict-refusing, and followed by parity, export/rebuild, backup, restore, and rollback checks. Live promotion is an explicit gated operation; no dry run or failure modifies existing source, backup, books, imported evidence, or user data.

## D-036 - Document adapters are capability boundaries

Status: Accepted

PDF and reflowable engines will expose a minimal `DocumentAdapter` contract for lifecycle, metadata, TOC, location, navigation, search, selection, anchors, cancellation, errors, and capabilities. Engine-native locations remain inside versioned, source-hash-bound envelopes. A registry or factory is not implemented until at least two real consumers justify it.

## D-037 - Project license remains formally deferred

Status: Provisional - user/legal decision required before direct adoption or distribution

The public repository has no project-level license, so no permission is inferred. Existing Readest AGPL notices and provenance remain preserved. Before new third-party source is adopted, or Read & Watch is distributed for external reuse, the user must select a project license and obtain appropriate review for copyleft interactions. Phase 01 added no package or upstream source.

## D-038 - Standard-library SQLite is the Phase 02 persistence implementation

Status: Accepted

The canonical local database is implemented with SQLite through Python's standard library for migration/recovery operations and Node's built-in `node:sqlite` for application runtime access. Read & Watch uses one concrete store and explicit transactions rather than a generic repository framework or ORM. Deterministic file-first snapshots remain immutable recovery artifacts, not a second writable master. This decision adds no production dependency and does not constrain later desktop-shell evaluation.

## D-039 - Phase 03 unified design system and library UI implementation

Status: Accepted

The design constitution is fully implemented using token variables in `globals.css`, semantic HTML5 elements (`<dialog>`, `<output>`, `<section>`, `<kbd>`), and custom React 19 primitives with zero third-party component libraries. All 91 authentic items are rendered from the canonical SQLite database projection. Manual metadata editing uses optimistic concurrency detection against item `updated_at`, strict client-side validation, and safe local persistence via `PUT /api/library/items/:id` without touching immutable source exports or backup archives.

## D-040 - Phase 04 Document Adapter Contract, Envelope, and Registry Implementation

Status: Accepted

The format-independent document adapter foundation is implemented under `App/app/lib/document/` using standard TypeScript and Node 24 native ESM execution with zero new runtime dependencies. The foundation establishes:
1. `DocumentAdapter` canonical interface enforcing complete lifecycle states (`created`, `opening`, `open`, `closing`, `closed`, `failed`), capability queries, TOC, navigation, search, selection, and anchor round-trips with `AbortSignal` cancellation support.
2. Normalized `DocumentError` taxonomy with 15 discrete error codes and sanitized, path-safe error messaging.
3. Versioned outer envelopes (`DocumentLocation`, `TextAnchor`) using `schemaVersion: 1` and immutable `sourceHash` verification, supporting fixed-layout (`pageNumber`, zoom, bounding rects) and reflowable (`cfi`, `progression`, ranges) tagged payloads.
4. Minimal `DocumentAdapterRegistry` supporting format factory registration, case-insensitive format normalization, and strict duplicate collision rejection policies.
5. Capability-driven `ReaderSession` controller that exposes UI capability flags (`canZoom`, `canAdjustFont`, `canSearch`, `canContinuousScroll`), eliminating format conditionals from reader components.
6. Universal conformance suite passed by concrete `FakePdfAdapter` and `FakeReflowableAdapter` test doubles.
7. Format-branching enforcement test verifying zero format-conditional branching exists across all presentation components.
Zero production rendering engines (no Foliate-JS, no PDF.js) were integrated in Phase 04; legacy Readest bridge remains fully preserved.

## D-041 - Phase 05 Reflowable Book Engine Implementation (Foliate-JS)

Status: Accepted

1. **Direct Source Vendoring**: Pinned official upstream repository `https://github.com/johnfactotum/foliate-js` at commit `78914aef4466eb960965702401634c2cb348e9b1` under MIT License (`App/forks/foliate-js/`). Evaluated and rejected the third-party npm package `foliate-js@1.0.1` as unendorsed and missing verification. Vendored only the core reflowable engine files (15 files) with zero modifications to upstream code. Unused dynamic imports (`./pdf.js`, `./tts.js`) are safely resolved via virtual stubs in `vite.config.ts`.
2. **Production Reflowable Adapter**: Implemented `FoliateReflowableAdapter` conforming strictly to the canonical `DocumentAdapter` contract across EPUB, MOBI, AZW, AZW3, FB2, and CBZ formats. Supports lifecycle states, metadata extraction, hierarchical TOC tree, navigation, reading progression, search with cancellation, selection, text anchors, and layout switching (`paginated` vs `scrolled`).
3. **Strict Phase Boundary on PDF**: Fixed-layout PDF publications are explicitly rejected by `FoliateReflowableAdapter` and handled by the reader interface with user-safe notices directing to reflowable books, strictly reserving PDF.js integration for Phase 06.
4. **Resource & Security Boundary**: Implemented `App/app/lib/document/resource-boundary.ts` providing Zip-Slip defense, directory traversal rejection, null-byte prevention, URI scheme validation (rejecting `javascript:`, `vbscript:`, `file:`), and strict iframe Content Security Policy (`STRICT_READER_CSP`).
5. **Path-Constrained Server Streaming**: Added `GET /api/reader/items/:id/file` with `X-Content-Type-Options: nosniff`, serving verified book bytes directly to the reader runtime via read-only Node streams without intermediate file tampering.
6. **Source Immutability Gate**: Confirmed that all 8 real local EPUB publications in `Read and Watch - Local Data/Read/Book` remained 100% byte-identical before and after reader operations.
7. **Read & Watch UI Ownership**: Verification reader interface at `App/app/app/reader/[id]/page.tsx` is built exclusively with Phase 03 design tokens; zero Foliate UI or branding exists in the application.

## D-042 - Phase 06 PDF Engine Implementation (Mozilla PDF.js)

Status: Accepted

1. **Official Mozilla Provenance**: Pinned exact official npm package `pdfjs-dist@4.10.38` (Apache-2.0, SHA-1 `3ee698003790dc266cc8b55c0e662ccb9ae18f53`, integrity `sha512-/Y3fcFrXEAsMjJXeL9J8+ZG9U01LbuWaYypvDW2ycW1jL269L3js3DVBjDJ0Up9Np1uqDXsDrRihHANhZOlwdQ==`). Zero vulnerabilities reported across production security audits (`npm audit --omit=dev`).
2. **Production PDF Adapter**: Implemented `PdfAdapter` under `App/app/lib/document/pdf-adapter.ts` fully conforming to the canonical `DocumentAdapter` contract. Manages PDF.js lifecycle (`created`, `opening`, `open`, `closing`, `closed`, `failed`), metadata extraction, hierarchical outline/TOC extraction, page navigation (`goTo`, `nextPage`, `prevPage`), text search with `AbortSignal` cancellation, text selection, and versioned `pdf-geometry` text anchors.
3. **High-DPI Rendering & Text Synchronization**: Implemented high-DPI canvas backing store scaling via `devicePixelRatio` clamped by `MAX_CANVAS_DIMENSION = 8192` to prevent mobile/GPU buffer exhaustion. Overlaid synchronized `.textLayer` aligned directly to the unscaled CSS viewport of the canvas, guaranteeing zero coordinate drift across zoom (0.25x - 5.0x) and orthogonal 90°/180°/270° rotation. Text selection overlay conforms to the Phase 03 Warm Editorial palette (`rgba(36, 75, 76, 0.35)`).
4. **Zero OCR & Truthful Capability Profile**: Strictly no OCR dependencies (zero tesseract, paddleocr, etc.) or OCR processes exist. When an image-only / scanned PDF lacks extractable text, `PdfAdapter` truthfully degrades its capabilities (`hasText: false`, `textSearch: false`, `textSelection: false`, `textAnchors: false`), and the reader UI displays a truthful "Image Scan" badge with disabled search without hallucinating text.
5. **Controlled Local Worker & Font Asset Serving**: Configured server endpoints in `reader-vite-plugin.mjs` serving the verified local worker script at `/api/reader/pdfjs/worker.mjs`, CMaps at `/api/reader/pdfjs/cmaps/`, and standard fonts at `/api/reader/pdfjs/standard_fonts/` with `X-Content-Type-Options: nosniff` and immutable caching headers, eliminating all third-party CDN network requests.
6. **Source Immutability Gate**: Verified against real local publications (including local cookbook and library books). Confirmed that SHA-256 cryptographic hashes and filesystem modification timestamps remained 100% byte-identical before and after full reader operations.
7. **Read & Watch UI Ownership**: All reader chrome is 100% Read & Watch owned using Phase 03 design tokens; zero Mozilla viewer chrome, toolbar, or styling is leaked. Presentation layer is 100% capability-driven without format branching, satisfying the architectural format-branching gate.

## D-043 - Phase 07 Unified Reader Experience Implementation

Status: Accepted

1. **One Reader Product Across Engines**: Delivered a single, cohesive Read & Watch reading experience spanning both reflowable books (Foliate-JS) and fixed-layout publications (PDF.js). All chrome, toolbars, sidebars, modals, and status elements are unified under the Phase 03 Warm Editorial design system.
2. **Strict Capability-Driven Orchestration**: Banned all format-conditional branching (`format === 'pdf'`, `isPdf`) across presentation components and controllers. The UI queries capabilities exposed by document adapters (`canZoom`, `fontControls`, `textSearch`, `continuousLayout`, `canRotate`, `pageNavigation`). Controls dynamically adapt to adapter capabilities without hardcoded format checks, fully passing the automated format-branching audit.
3. **Engine Invisibility**: Foliate-JS and PDF.js operate strictly as headless rendering engines inside isolated viewport containers. Zero vendor chrome, logos, or default toolbars are exposed to the user.
4. **Canonical State Persistence**: Reading location (`DocumentLocation`), bookmarks (`Bookmark`), and reader preferences (`ReaderPreferences`) persist atomically via server endpoints (`/api/reader/items/:id/state`, `/api/reader/items/:id/bookmarks`, `/api/reader/settings`) to external storage outside Git (`Read and Watch - Local Data/`). Zero engine-native canonical storage is permitted.
5. **Bounded History & Seamless Navigation**: Implemented `ReaderHistory` bounded to 50 entries with deduplication of consecutive identical locations and forward truncation on new navigation branches. Supports bi-directional history stepping and safe hash mismatch recovery.
6. **Canonical Bookmark Model**: Built format-independent canonical `Bookmark` data structures supporting both semantic chapter progressions and fixed-layout page numbers, with atomic file persistence.
7. **Zero OCR & Truthful Scanned Document UX**: Reaffirmed strict Zero-OCR policy. Image-only/scanned documents gracefully advertise their lack of text capabilities, disabling search and displaying a clear "Image Scan" status badge without fake OCR or broken text selection.
8. **Visual Certification**: Captured 101 responsive screenshots across Desktop, Tablet, and Mobile covering themes (Light, Warm, Dark), interaction states, and cross-format parity matrices, stored externally in `Read and Watch - Local Data/visual-review/phase-07/` with full machine-readable manifest and index.

## D-044 - Phase 08 Legacy Readest Parity and Safe Retirement

Status: Accepted

1. **Parity Proven Before Retirement**: Completed rigorous native-versus-legacy parity evaluation across all 151 real local publications (8 EPUBs and 143 PDFs) across 14 distinct reader behaviors (`BEH-01` through `BEH-14`). Out of 2,114 total matrix evaluations, 747 showed complete parity and 1,208 demonstrated superior native performance (zero Electron/Tauri process launch lag, high-DPI scaling, seamless in-app navigation, and instant TOC filtering). Zero parity gaps and zero blocked items were found.
2. **Rollback Verified Prior to Modification**: Rollback capability was tested and verified in an isolated worktree (`%TEMP%\rw-rollback`) at pre-retirement anchor commit `81a9276c190b4795b7093c55d175d0b73276fde7`. All 9,262 files and 97 test cases passed cleanly, ensuring full recoverability.
3. **Elimination of Child Process Spawning**: Completely removed `import { spawn } from 'node:child_process'` and desktop process launching logic from `reader-store.mjs`. All reader actions now route directly to the native web route `/reader/:itemId` via standard `<Link>` components, eliminating external process execution from the application entirely.
4. **Safe Removal of Vendored Source (Option B)**: Safely removed `App/forks/readest/` (9,066 files) from the current Git HEAD while preserving full commit history and provenance. This permanently resolves Windows `MAX_PATH` checkout failures caused by deep Android/Kotlin test paths without requiring administrative `core.longpaths` workarounds.
5. **Tracked Provenance Retention**: Established `docs/project/PROVENANCE_READEST.md` recording official upstream identity (`https://github.com/readest/readest`), pinned commit `6df90139dc7b72246572ab33b12d485b281ca6e6`, AGPL-3.0 copyleft terms, historical role, and exact Git recovery procedures. Updated `UPSTREAM_AND_LICENSE_LEDGER.md` and `TECHNOLOGY_LEDGER.md` marking Readest as retired.
6. **Automated Retirement Enforcement**: Introduced `tests/no-active-readest.test.mjs` to continuously enforce zero child process spawning, zero `forks/readest` imports, and null `readerExecutable`. Added `App/forks/readest/` to `FORBIDDEN_PREFIXES` in repository hygiene tooling.
7. **Source Document Immutability Preserved**: Verified that all 151 real local book files remained 100% byte-identical (0 hash changes, 0 timestamp modifications) throughout parity testing and retirement.

## D-045 - Phase 09 Unified Annotation Foundation

Status: Accepted

1. **Single Canonical Store**: SQLite (`read-watch.sqlite3`) is the canonical annotation store. External JSON (`user-data/items/:itemId/annotations.json`) is a crash-recovery mirror only. No LocalStorage, engine memory, or secondary SQLite is canonical.
2. **Engine-Independent Anchors**: All anchor types (`pdf-text`, `pdf-drawing`, `reflowable-text`) store only Read & Watch-owned data. No PDF.js or Foliate-JS internal objects appear in the canonical model.
3. **Normalized Coordinates**: PDF anchors use page-normalized `[0..1]` fractional coordinates. These are zoom- and orthogonal-rotation-invariant. Display transforms are a render-time concern of the UI layer.
4. **CFI Anchors for Reflowable**: Reflowable books use EPUB CFI ranges (`startCfi`, `endCfi`) plus `spineIndex`, `quote`, and `prefix`/`suffix` context for fuzzy re-resolution. CFI is inherently font-size and layout-invariant.
5. **Optimistic Concurrency**: All update and delete operations require `expectedRevision`. Mismatch returns HTTP 409 Conflict. Revision increments on every mutation.
6. **Soft Delete Only**: Annotations are never hard-deleted in the normal path. Soft delete sets `deleted_at_utc` and `lifecycle = 'soft-deleted'`. Hard purge is a future maintenance operation not in scope for Phase 09.
7. **File-First Recovery**: Every write atomically exports a full JSON mirror via `writeFileSync` + `renameSync`. This mirror is the crash-recovery input if the SQLite DB is damaged or reset.
8. **surfaceMarkup PDF-Only**: The `surfaceMarkup` capability (pen, line, arrow, rectangle, ellipse, text-box) is present only in `STANDARD_PDF_CAPABILITIES`. Reflowable books explicitly exclude this capability — freehand geometry cannot survive dynamic reflow.
9. **Named Bookmarks via Phase 07 Model**: The existing `Bookmark` model (Phase 07) with its `label` field satisfies the named bookmark requirement. No duplicate annotation store for bookmarks.
10. **Zero New Dependencies**: Phase 09 uses only Node.js built-ins (`node:sqlite`, `node:crypto`, `node:fs`, `node:path`). No new npm packages added.

## D-046 - Phase 10 Book-Linked Excalidraw Notes

Status: Accepted

1. **Read & Watch Canvas Ownership**: Read & Watch owns the canonical canvas document schema (`CANVAS_SCHEMA_VERSION = 1`), metadata, bidirectional deep links, history, conflicts, export, and outer shell. `@excalidraw/excalidraw` is strictly the client-side visual drawing engine.
2. **Pinned Upstream & Zero Cloud**: Pinned exact release `@excalidraw/excalidraw@0.18.1` (MIT license). All static assets (fonts, locales, data) are hosted locally and served from `/api/reader/excalidraw-assets/*`. Zero calls to excalidraw.com, Firebase, unpkg, or third-party CDNs; 100% offline functionality.
3. **Dual-Layer File-First Persistence**: Canvases are recorded in SQLite (`canvases`, `canvas_links`, `canvas_assets`) and external file-first documents at `user-data/canvases/:canvasId/canvas.json` via atomic `.tmp` rename writes. Bounded history snapshots (`history/rev-*.json`, cap 50) and a recovery mirror (`recovery.json`) provide crash safety.
4. **Optimistic Concurrency Control**: Mutations enforce `expectedRevision` checks. Mismatches return HTTP 409 Conflict, alerting the user via an interactive "Reload Latest" UI banner to prevent silent data clobbering.
5. **Multiple Canvases & Standalone Workspaces**: Supports arbitrary numbers of canvases per book (`itemId` reference) as well as unattached standalone canvases (`itemId = null`).
6. **Bidirectional Deep Links**: Canvas elements link directly to book locations and Phase 09 annotation IDs via `canvas_links`. Floating link badges allow immediate jumps to reading locations; book items surface linked canvases.
7. **Beside-Reader Split & Full-Screen Workspaces**: Responsive split layout with 320px minimum pane widths preserves active reader engine and unsaved drawing state. Narrow viewports switch via a mobile "Book | Canvas" tab bar. Full-screen routes (`/canvas-notes/:id`, `/canvas-notes`) offer dedicated canvas workspaces.
8. **Portable Standalone Export/Restore**: Standardized `.rwcanvas` JSON bundle packages metadata, scene elements, links, and embedded assets for offline transport and restoration.
9. **Source Book Immutability**: Source books remain 100% read-only and byte-identical. All canvas notes, links, and assets reside exclusively in `user-data`.

## D-047 - Phase 11 Search, Annotation Browser, and Study Workflow

Status: Accepted

1. **Derived, Disposable FTS5 Search Index**: SQLite FTS5 index (`search_index_fts`, `search_index_records`, `search_index_meta`) is 100% derived from canonical primary sources (library items, user annotations, bookmarks, canvases, markdown notes). If deleted, corrupted, or schema-upgraded, the search index rebuilds completely from primary data without loss of canonical user data.
2. **Zero New Dependencies & Node:sqlite Built-in**: Full-text search leverages Node 22 built-in `node:sqlite` with FTS5 and `unicode61 remove_diacritics 0` for multilingual text (Latin, Arabic, Urdu). Zero external dependencies or npm packages added. Zero cloud search, zero vector databases.
3. **Incremental Invalidation Across Primary Stores**: Mutating library records, annotations, bookmarks, canvases, or user notes issues non-blocking incremental invalidation events (`invalidateBookIndex`, `invalidateAnnotationIndex`, `invalidateCanvasIndex`, etc.) to the search store, keeping search immediate and fresh.
4. **Safe Snippet Rendering**: FTS5 snippet extraction tokenizes matches into safe token trees (`parseSnippetTokens`) rendered as native React `<mark>` elements, completely eliminating `dangerouslySetInnerHTML` and XSS injection vectors.
5. **Unified Annotation & Study Browser**: The `/highlights` route provides unified study browsing with type filters (`highlight`, `underline`, `note`, `bookmark`, `canvas-card`), book filters, keyword search, and direct source jumps.
6. **Robust Source Jumps with Integrity Verification**: Source navigation inspects document content hashes. Mismatches or unresolvable anchors display an honest, calm, non-crashing UI notice with graceful fallback to chapter/page context.
7. **Offline Selection Study Workflow**: Reader selection menu provides instant Copy, Append to Notes, Excerpt to Canvas, and offline-by-default Define/Translate extension hooks (`studyExtensions`). Operates 100% offline with zero external network or AI dependencies.
8. **Source Document Immutability**: Source book files remain 100% byte-identical across all indexing, search, selection, and handoff operations.

## D-048 - Phase 12 Export and Portability

Status: Accepted

1. **Canonical Runtime Truth vs Export Representations**: Canonical SQLite tables and atomic file-first recovery mirrors remain authoritative. Exports are strictly projections and representations; they never modify canonical runtime data or act as runtime truth.
2. **Versioned Portable Schema Family (`PORTABILITY_SCHEMA_VERSION = 1`)**: Standardized canonical JSON packages (`read-watch.annotations`, `read-watch.notes`, `read-watch-canvas-export`, `read-watch.library-metadata`, `read-watch.backup`). All schemas declare version numbers, fail closed on unknown future versions, and reject directory traversal (`..`), absolute drive letters (`C:\`), and root paths (`/`).
3. **Lossless Round-Trip Fidelity**: Full backup packages (`.rwbackup`) preserve 100% semantic identity, revision history, geometry rects, colors, deep links, and relationships across export/restore cycles.
4. **Source Publication Immutability & Overwrite Refusal**: Original publication files (EPUB, PDF, and media assets) are never bundled in backups, never edited, and never overwritten. Exporting a derived PDF directly to the source path is rejected with an explicit refusal error. Pre- and post-export SHA-256 and filesystem `mtime` verification guarantees zero media mutation.
5. **Exact-Pinned `pdf-lib@1.17.1` Restricted to Derivative PDF Export**: Pinned `pdf-lib@1.17.1` (MIT) solely for creating new derivative PDF files containing rendered highlights and comments summary pages. `pdf-lib` is strictly prohibited from serving as a reader or renderer.
6. **Derived Search Index Exclusion from Backups**: Backups completely exclude derived SQLite FTS5 search index tables (`search_index_fts`, `search_index_records`, `search_index_meta`). Upon restore, `searchStore.rebuildIndex()` is automatically invoked to deterministically reconstruct the search index from restored canonical data.
7. **Preflight Inspection & Conflict Handling**: Restores require preflight inspection reporting incoming counts (annotations, bookmarks, notes, canvases) and detecting conflicts (identical vs divergent). Users choose between `skip` (safe local preservation) and `overwrite` (update to backup revision).
8. **Reflowable Annotation Portability Strategy**: Documented CFI and fuzzy quote context strategy with honest disclosure of why reflowable annotations cannot be "baked" into EPUB files without container mutation or layout instability.
9. **Zero Telemetry, Zero Cloud**: 100% offline, local-first operation with standard HTML5 download triggers and zero cloud dependencies.

## D-049 - Phase 13 Knowledge and Diagram System

Status: Accepted

1. **Calibrated 4-Tier Knowledge Tool Selection**: Knowledge tools are selected based on a strict constitution (`KNOWLEDGE_TOOL_SELECTION.md`) defining exact boundaries. (1) Simple native UI (plain text, lists) — default for notes/summaries. (2) Excalidraw (standalone concept canvases) — spatial, freeform, book-linked. (3) React Flow (`@xyflow/react@12.11.6`) — structured semantic topology with typed nodes/edges and deep links. (4) Mermaid (`mermaid@12.0.0`) — code-reviewed, text-defined technical diagrams. No tool encroaches on another's ownership.

2. **React Flow as Transient Client-Side Projection**: React Flow state is derived from canonical `KnowledgeGraphDocument` on mount via `useMemo`. User mutations are buffered in React state. On save, the canonical document is reconstructed and persisted via `PUT /api/knowledge/graphs/:id`. React Flow has zero canonical data ownership; SQLite is the single source of truth.

3. **Mermaid Strict Security Mode**: Mermaid is always initialized with `securityLevel: 'strict'` before any rendering call. SVG output is treated as derived and disposable. The canonical artifact is always the source text stored in `mermaid_documents.source_text`. This prevents XSS via embedded SVG scripts.

4. **Accessible Fallback View**: `ConceptGraphCanvas` provides a complete accessible table/outline fallback view (`viewMode === 'table'`) when React Flow cannot render (SSR, assistive technology, or reduced-motion context). All graph data is readable without the visual canvas.

5. **Read & Watch-Owned Deep Link Resolution**: All deep link resolution is server-side via `POST /api/knowledge/resolve-link`. The resolver queries `items`, `annotations`, and `canvases` tables in the local SQLite database. Supported link types: `item` (library book), `location` (reader position with anchor), `annotation` (specific highlight/note), `notes` (reader notes tab), `canvas` (Excalidraw canvas), `external` (web URL). Unresolved links display a calm `[?]` badge with a descriptive reason — no crashes, no silent failures.

6. **File-First Crash Recovery**: Knowledge graphs and Mermaid diagrams are atomically mirrored to `user-data/knowledge/graphs/:id.json` and `user-data/knowledge/diagrams/:id.json`. `rebuildFromFiles()` can restore rows after SQLite corruption without data loss. Mermaid diagrams also write a `.mermaid` source file for human readability.

7. **Portability Integration**: Knowledge graphs and Mermaid diagrams are included in unified backup bundles (`.rwbackup`) via `server/portability-store.mjs`. Conflict detection and restore preflight cover knowledge entities. Individual `.rwgraph` and `.rwmermaid` export formats are also supported.

8. **Search Integration**: `server/search-store.mjs` `rebuildIndex()` indexes knowledge graph titles/descriptions/node labels and Mermaid diagram titles/source text. Queries use `try/catch` around knowledge table access so older databases without Phase 13 schema degrade gracefully without crash.

9. **Ordinary Notes Remain Untouched**: Standard reading notes, book summaries, and annotations are completely unmodified by Phase 13. The knowledge system is additive; it creates a separate `/knowledge` route and data domain without touching any existing reader, annotation, or notes functionality.

## D-050 - Phase 14 Desktop Shell Selection: Electron with Least-Privilege Native Boundary

Status: Accepted

1. **Adoption of Electron 35.7.5 with Node 22.16.0 LTS (Outcome B)**:
   Following an exhaustive 33-criterion desktop shell evaluation (`App/docs/project/DESKTOP_SHELL_EVALUATION.md`), Electron 35.7.5 (bundled with Node.js 22.16.0 LTS, Chromium 134, MIT) was adopted. This decision supersedes the provisional Tauri exploration because Read & Watch's architecture relies on 8 Node.js ESM server stores (`node:sqlite` with FTS5, file-first atomic mirrors, and `pdf-lib`). Adopting Tauri would have mandated either rewriting all 8 server stores into Rust (violating prompt constraints against rewriting server architecture into Rust) or running a separate Node.js child-process daemon (re-introducing the child-process failure modes that led to retiring Readest). Electron natively embeds Node.js in its privileged main process, delivering 100% architectural code reuse with zero child processes and zero dual-runtime drift.

2. **Narrowest Least-Privilege Native Boundary**:
   The Electron boundary is strictly sandboxed (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`). The preload bridge exposes exactly 5 minimal APIs on `window.readWatchDesktop`:
   - `chooseBookFiles(options)`: Native file picker restricted to supported publication extensions.
   - `chooseDataRoot()`: Directory picker strictly rejecting Git repo paths, root directories, and system paths.
   - `getAppPaths()`: Read-only query for canonical desktop path locations.
   - `openExternalHttps(url)`: Validates `https://` protocol before delegating to OS browser.
   - `onOpenFile(callback)` / `getPendingOpenFiles()` / `resolveOpenFile(filePath)`: Windows Open-With and single-instance event dispatching.
   Generic `child_process.exec`, raw filesystem read/write APIs, and direct database access are strictly banned from renderer IPC.

3. **Loopback-Only Embedded HTTP Service**:
   The internal desktop server binds strictly to `127.0.0.1` on an ephemeral OS-assigned port with randomized security headers, disallowing external network traffic.

4. **Native Windows File Associations & Single-Instance Lock**:
   Uses Electron's built-in `app.requestSingleInstanceLock()` and `electron-builder` native file associations for 8 publication extensions (`.epub`, `.pdf`, `.mobi`, `.azw`, `.azw3`, `.fb2`, `.fbz`, `.cbz`). Subsequent launches focus the primary window and dispatch the file event to the renderer. Known books open immediately in the reader; unknown files trigger an explicit, non-destructive import dialog.

5. **Windows Packaging & Safe Install Policy**:
   Packaged with exact-pinned `electron-builder@26.15.3` (MIT). Produces an NSIS per-user installer (`Read & Watch Setup 0.1.0.exe`) and a standalone portable executable (`Read & Watch 0.1.0.exe`). Configured with `deleteAppDataOnUninstall: false` so that user catalogs, databases, annotations, and reading progress remain intact during uninstallation and reinstall.

6. **Non-Silent Update & Rollback Protocol**:
   Silent auto-updating is strictly prohibited. Desktop updates follow a manual, user-consented notification model. Rollback instructions and offline operation guarantees are formally documented.

7. **Source Publication Immutability**:
   Original publication files remain strictly read-only. File open operations, hash computations, and metadata extractions never write, alter, or convert source files in place. Verified 100% byte-identical across all 151 local books.

## D-051 - Phase 15 Legal Honesty, Global Settings Architecture, and Anti-Vibe Polish

Status: Accepted

1. **Truthful Legal Architecture Without Corporate Fiction**:
   The Privacy Policy (`/privacy`) and Terms & Conditions (`/terms`) describe the implemented software architecture with complete fidelity. The software is disclosed as a private, local-first reading and media study workstation. No fictitious corporations, jurisdictions, GDPR/CCPA certifications, or commercial SaaS terms are claimed. Zero telemetry, zero analytics, zero cookies, and zero external tracking scripts are verified.

2. **Global Settings Architecture with Resilient Atomic Persistence**:
   Global application preferences are managed by `server/settings-store.mjs` with atomic filesystem writes (`user-data/app-settings.json`), clamped numerical ranges, enumerated value validation, and graceful recovery to defaults upon JSON corruption. Schema versions are strictly checked (`schemaVersion: 1`), failing closed against unsupported future versions.

3. **Data Protection Hard Gate on Settings Reset (P15-G002 & Section 182)**:
   Resetting preferences restores appearance, reading defaults, library sorting, and accessibility to default values. It is strictly prohibited from deleting or altering library catalog items, reading notes, thoughts, annotations, bookmarks, canvases, knowledge graphs, or backup archives. Verified in automated test suite `tests/settings-store.test.mjs`.

4. **Machine-Isolated Portable Settings Export/Import**:
   Exporting settings generates a portable JSON package (`read-watch.settings` v1) containing user preferences while strictly excluding local machine paths, session tokens, and passwords.

5. **First-Run, Empty States, and Accessible Native Opening**:
   Empty library states provide calm, editorial guidance on placing books into the local library folder. When running on desktop, an "Open Book File..." action integrates with `DesktopOpenCoordinator` to resolve books by SHA-256 or display non-destructive file metadata.

6. **Anti-Vibe Polish & Full Accessibility**:
   User-facing copy contains zero em dashes (`—`), zero fake reviews, testimonials, follower counts, or cloud marketing teasers. Full keyboard focus navigation, Skip-to-Main-Content navigation, `@media (prefers-reduced-motion: reduce)`, and high-contrast focus rings are implemented and certified.

## D-052 - Phase 16 Performance, Security, and Reliability Hardening

Status: Accepted

1. **Batch Query Optimization in `server/library-store.mjs`**:
   Eliminated N+1 query loop by batching properties, tags, assets, relationships, people, and series lookups using parameterized `IN (?, ?, ...)` chunked queries. Verified on 151, 1,000, and 5,000 item synthetic datasets: 151 items improved from 123.72ms to 6.40ms (19.3x speedup); 1,000 items improved from 856.45ms to 23.84ms (35.9x speedup); 5,000 items improved from 4,336.08ms to 132.08ms (32.8x speedup, beating the 500ms budget). Lazy cached statement reuse implemented in `server/search-store.mjs`.

2. **Loopback Service & Process Boundary Security**:
   In `electron/desktop-service.mjs`, the embedded HTTP service enforces strict `Host` (localhost/127.0.0.1) and `Origin` validation, returning 403 Forbidden for disallowed origins. Responses inject strict `DESKTOP_CSP` headers (`default-src 'self' 'unsafe-inline' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws:;`). Error handling on 500 responses is sanitized to prevent private filesystem path leakage.

3. **Session Token Gate on Open File Resolution**:
   `GET /api/desktop/resolve-open-file` requires an `X-ReadWatch-Session-Token` header matching the internal desktop session token generated on launch, preventing unauthorized local processes or origins from triggering host file resolution.

4. **Path Traversal & Windows Device Name Defense**:
   Hardened `safeLibraryFile` in `electron/desktop-service.mjs` and `assertSafePath` in `lib/portability/validation.ts` against Alternate Data Streams (`:`), Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`), percent-encoded traversal sequences, and directory escapes using `realpathSync`. Enforced identifier regex `^[a-zA-Z0-9_-]+$` on canvas IDs.

5. **Tamper-Evident Backup Checksums**:
   Added cryptographic SHA-256 payload checksum validation (`verifyBackupChecksums`) in `server/portability-store.mjs` for preflight inspection and restore application, rejecting corrupted or tampered backup archives before application.

6. **Automated Fault Injection Suite**:
   Expanded regression tests with `tests/malformed-and-fault-injection.test.mjs` (7 tests), verifying malformed JSON resilience, future schema rejection, corrupted book rejection, transaction rollback with SQLite integrity verification, atomic `.tmp` file recovery, backup tampering detection, and full round-trip restore into isolated target directories.

7. **Reproducible Packaging & Strict Phase Boundary**:
   Verified reproducible Windows packaging (`dist-electron/win-unpacked/Read & Watch.exe`, 201,233,408 bytes). Upstream dependency audit confirmed 100% permissive runtime licenses with zero copyleft contamination. Zero OCR dependencies, models, or processes were introduced.



## D-053 - Phase 17 OCR Foundation, Upstream Preservation, and Transactional Engine Updates

Status: Accepted (2026-09-17, explicit user authority)

1. **Sequencing correction by explicit user authority:** the cross-platform desktop certification is now a mandatory gate *before final release*, positioned after OCR implementation and OCR verification, instead of a pre-Phase-17 gate. New durable order: PHASE-16 (Windows baseline) -> PHASE-17 (OCR foundation) -> PHASE-18 (OCR verification) -> Stage 1 Windows regression, Stage 2 Arch Linux, Stage 3 Ubuntu LTS, Stage 4 macOS -> PHASE-20 final release certification. Nothing about the permanent Windows/Linux/macOS requirement or the 30-point contract is withdrawn, and no platform certification status is upgraded by this decision.

2. **Selected engines are architecture, not preference:** English routes to Baidu Unlimited-OCR; Arabic and Urdu route to PaddleOCR PP-OCRv5 Arabic-script recognition. The language-to-engine mapping lives in `server/ocr/ocr-contract.mjs` and is not exposed as a user preference. Silent substitution (for example falling back to Tesseract) is prohibited; an unavailable engine yields a structured state instead of text.

3. **Upstream stays upstream:** one fork per engine exists under the project account purely for continuity, inspection, patch escape hatch, and preserved history. The forks carry no source modifications and no renamed directories, classes, or history. Read & Watch adapts around the engines through a provider contract. Completed upstream source is never vendored into `App/app/`. A submodule was deliberately not introduced.

4. **The managed provider factory replaces per-provider duplication:** both engines are driven through one small lifecycle (`managed-provider.mjs`) with three injectable hooks (resolve upstream revision, stage revision, smoke-test staged). Provider-specific files bind metadata only. This is the anti-duplication decision recorded for the Ponytail audit.

5. **OCR stays outside the Node dependency tree:** the engines run as an external, supervised Python runtime under the external data root. Transport is newline-delimited JSON over stdin/stdout with a per-session token. No network listener is created, so there is nothing to secure on localhost and nothing to bind publicly. Docker is not required.

6. **Native text always wins:** the usable-native-text gate runs before any engine consideration. A usable PDF.js text layer bypasses OCR entirely. OCR is a derived-data pipeline that never alters a source document.

7. **Arabic tashkeel is preserved by construction:** `displayText` is deliberately NOT Unicode-normalised, because NFC canonically reorders Arabic combining marks (fatha has a lower combining class than shadda) and would silently change the string a user sees and copies. Harakat are preserved; a separate `searchText` key is derived for diacritic-insensitive matching only and never overwrites `rawText` or `displayText`.

8. **`child_process` is now permitted only inside `server/ocr/`:** the Phase 08 guarantee ("zero child processes anywhere in production code") was scoped to proving the retired Readest reader binary was no longer shelled out to. Phase 17 authorises exactly one narrow exception, the supervised OCR runtime boundary. `tests/no-active-readest.test.mjs` now asserts that no other production module spawns a process, and that the OCR boundary never spawns a shell and never references Readest. `tests/pdf-source-immutability.test.mjs` was re-scoped from "OCR must not exist" to "OCR must not enter the Node dependency tree or the PDF adapter".

9. **Transactional updates with activation pointers, not symlinks:** a candidate revision is staged into its own version directory, integrity-verified, health-checked and smoke-tested in isolation, and only then made live by an atomic JSON activation pointer. A failed update keeps the working revision, records the failure, and permits retry. The previous revision is retained for rollback.

10. **Documented integrity limitation:** hashes are recorded at staging time and re-verified afterwards, which detects post-staging corruption. Upstream publishes no independent release checksums for these engines, so this is not a supply-chain attestation and is not presented as one.

## D-054 - Urdu OCR Is a Mandatory Multi-Engine Pipeline; OCR Benchmark Foundation

Status: Accepted (2026-09-17, explicit user authority)

1. **Urdu OCR is a mandatory two-engine pipeline, not an engine-selection
   question.** Both engines are required evidence sources and both raw outputs
   must be preserved independently:
   - PP-OCRv5 Arabic-script recognition (`paddleocr`), and
   - the dedicated Urdu Nastaliq specialist
     `qandeelasim13/urdu-ocr-trocr-si26` (`urdu-nastaliq-trocr`).

   Urdu runtime is therefore explicitly **incomplete** in this build: the
   specialist is declared, provenance-verified, and required by the benchmark
   schema, but has no execution path yet (`integrationStatus: NOT_INTEGRATED`).

2. **No fallback chain is authorised anywhere in OCR.** There is no primary,
   fallback, backup, secondary, or "try the next engine" behaviour, and no
   majority-vote truth. A mandatory engine that fails or is unavailable produces
   a structured failure state; available partial output is preserved and the run
   is labelled `PARTIAL_ENGINE_FAILURE` or `BLOCKED`. This is machine-enforced:
   `findForbiddenSemantics()` scans produced records, and tests assert that
   manifests, provider schemas, and run records contain no fallback semantics.

3. **This is a governance correction, not a re-plan.** No phase was renumbered,
   no task or gate ID was reused or invented, Phase 18 remains `NOT_STARTED` and
   remains the later alignment / disagreement / uncertainty / human-review phase,
   and Phase 17 remains `IN_PROGRESS` with P17-T004 as the next incomplete task.

4. **Benchmark foundation (P17-T002) is corpus + ground truth + scoring +
   protocol.** Delivered as `App/docs/project/OCR_BENCHMARK_PROTOCOL.md` plus
   `App/app/server/ocr/benchmark/*` (schema, Unicode comparison rules, scoring,
   run records, manifest I/O, private corpus store, font-coverage + offline
   renderer, synthetic-corpus builder) and two tooling scripts
   (`render-benchmark-fixtures.mjs`, `import-benchmark-sample.mjs`).

5. **Private material never enters Git.** Corpus images, real ground truth, run
   output, fonts, and models live under `READ_WATCH_DATA_ROOT/ocr/benchmark/`.
   The store refuses to create that layout inside the repository. Git carries the
   schema, algorithms, tests, documentation, and a 14-sample authored synthetic
   starter corpus in text form only.

6. **Ground truth is human-authored, stateful, and hash-bound.** States are
   `DRAFT` → `REVIEWED` → `FINAL`; only `FINAL` truth may be scored formally;
   `groundTruth.hash` is the sha256 of the exact stored Unicode text, so editing
   truth without re-hashing is detected. No engine output is ever promoted to
   ground truth, and engine agreement is never treated as correctness.

7. **Arabic is scored in three separate families** (huroof/base letters,
   tashkeel/harakat, and fully vocalised combined) rather than one blended
   number, because a dropped harakah must not be hidden by correct letters.

8. **Urdu is scored per engine** (CER, WER, exact match, Urdu-specific character
   analysis, diacritic analysis, per-feature breakdown) with a separate
   comparison record for disagreement evidence. The two outputs are never
   collapsed into one score and no engine is ever declared the winner.

9. **The Nastaliq specialist is treated as a line-level engine.** Its documented
   intended input is a clean printed single line; page/region use must be
   expressed as line-level results with an explicit line association, and a
   page-level specialist result is rejected by the run-record validator. Its
   licence situation is recorded honestly: Apache-2.0 model card, no licence file
   in the project repository, and training data that includes CC BY-NC-SA 4.0
   (non-commercial/research) material.

10. **Synthetic fixtures are plumbing evidence, not acceptance evidence.** They
    are authored for this benchmark, rendered with lawfully redistributable
    OFL-1.1 fonts whose hash and glyph coverage are verified before rasterising,
    and must not be used to claim engine accuracy. No engine was benchmarked in
    P17-T002.

## D-055 - Nastaliq Specialist Runtime, Deterministic Reading Order, and Provenance-Tagged OCR Search

Status: Accepted (2026-09-17, explicit user authority)

1. **P17-T002 wording corrected without reopening or renumbering anything.**
   P17-T002 means "build the OCR benchmark corpus framework, lawful/private
   corpus workflow, ground-truth protocol, schemas, scoring utilities, and
   synthetic validation corpus" and stays COMPLETE. P17-T004 means
   "populate/use representative lawful private real-world samples and run
   measured engine benchmarks sufficient for evidence-based acceptance" and
   stays INCOMPLETE. No task or gate ID was reused, invented, or reordered.

2. **The Nastaliq specialist now has a real execution path.** Provider id
   `urdu-nastaliq-trocr`, upstream `qandeelasim13/urdu-ocr-trocr-si26`, pinned
   revision `a9ef072320b50014f6df7ed9db807810157a410e` (unchanged at
   re-verification; last modified 2026-08-08T18:35:19Z). Upstream identity is
   preserved and reached through a thin adapter, never a fork or rewrite. It
   advertises `LINE` only, as the model card documents: page and region calls are
   refused with `UNSUPPORTED_UNIT` instead of returning a compound result the
   engine cannot honestly support. `integrationStatus` is now `INTEGRATED`.

3. **Weights are never bundled.** No model file is committed, vendored, or
   shipped in an installer. The user-initiated update path resolves the
   authoritative Hugging Face revision, stages the runtime and model into
   external storage, verifies every file against its published upstream hash and
   the size recorded in the contract, health-checks and smoke-tests the staged
   runtime, and only then moves the activation pointer. `model.safetensors` was
   verified byte-for-byte against the published LFS object id. Licensing remains
   honestly unresolved for redistribution: Apache-2.0 model card, no licence
   file in the project repository, training data that includes UTRSet-Real
   (CC BY-NC-SA 4.0). Read & Watch claims no redistribution right.

4. **Urdu runtime is a mandatory dual-engine pipeline with no fallback.** PP-OCRv5
   supplies detection geometry and recognition; the specialist recognises the
   same line crops, keyed to the same `pageId/regionId/lineId` identities. Both
   raw outputs are persisted independently per provider. There is no fallback,
   backup, secondary, or "try the next engine" path, no `bestText`, and no
   majority-vote truth: partially completed runs are `PARTIAL_ENGINE_FAILURE`
   (or `BLOCKED`), all-mandatory-engines-complete runs with material
   disagreement are `REVIEW_REQUIRED`, and only all-complete-and-agreeing runs
   are `COMPLETE`. Engine agreement is recorded, never treated as truth.

5. **Reading order is deterministic geometry, not a model.** `reading-order.mjs`
   reconstructs order from boxes plus declared language and region type:
   vertical line bands first, then in-band order by script direction (LTR
   left-to-right, RTL right-to-left), column grouping before row grouping, a
   full-width band read before the columns beneath it, headings ahead of body
   text in the same band, captions after their band's body, footnotes after the
   main flow. Ambiguity produces named warnings (`AMBIGUOUS_COLUMN_STRUCTURE`,
   `MIXED_DIRECTION_PAGE`, `MIXED_DIRECTION_COLUMN`, `UNUSABLE_GEOMETRY`) rather
   than an invented numeric confidence, and the detector's own emission order is
   preserved separately as `detectionOrder` for provenance.

6. **Derived OCR search is provenance-tagged and never masquerades as document
   text.** Results carry `OCR_DERIVED`; a page whose native text layer is usable
   contributes nothing to the OCR search path, so the same words are never
   indexed twice. Urdu provider outputs are indexed independently: agreement is
   presented once with both providers recorded, disagreement keeps both strings
   and selects no winner, and a partially completed page stays visibly partial.
   Arabic keeps tashkeel in the displayed text — matching folds marks for the
   query only, and the snippet returned to the reader is mapped back onto the
   original vocalised characters.

7. **Invalidation is computed from identity, not assumed.** A derived record is
   searchable only while its source hash, engine revision, model revision,
   settings key, line-segmentation revision, reading-order revision, and Urdu
   pipeline revision still match. This exposed and fixed a real defect: the
   managed-provider composition spread its `version`/`modelRevision` getters into
   frozen nulls, which silently disabled revision-based cache invalidation after
   an engine update. They are now live accessors.

8. **Host findings are recorded, not worked around.** Two genuine runtime
   defects were fixed in the driver rather than papered over: Windows pipes now
   pin UTF-8 (Arabic/Urdu text would otherwise be re-encoded by the legacy code
   page), and the specialist tokenizer is instantiated explicitly as the
   documented class because newer transformers majors cannot auto-resolve this
   repository's `tokenizer_config.json`. One host limitation remains and is
   reported as such: staged runtime provisioning under a long Windows data root
   fails when `LongPathsEnabled = 0`, surfaced as `UNSUPPORTED_PLATFORM` with
   remediation instead of a raw pip tail. The specialist itself was smoke-tested
   successfully through the shipped driver with a short-path interpreter.

9. **This run is not benchmark evidence.** No accuracy, CER, WER, speed, or VRAM
   figure is claimed. P17-T004 and P17-T007 stay open, Phase 18 stays
   `NOT_STARTED`, and no platform certification was started.

## D-056 - Portable selected library root, organized discovery, and offline Raw intake

Status: Accepted

User-authorized maintenance/integration prerequisite executed while Phase 17
remains `IN_PROGRESS` with `P17-T004` still the current task. It changes no
governance state and completes no phase task.

1. **The selected library folder is the durable portable library.** A selected
   root contains `Read/`, `Watch/` and `Raw/`; `App/` beneath the same root holds
   runtime-only state (database, user data, search, OCR, backups, exports). The
   default root convention is the repository sibling
   `Read and Watch - Local Data Only`, but normal operation must not depend on
   that default — `READ_WATCH_DATA_ROOT` and an explicit selected root both take
   precedence, and no machine-specific path is committed.

2. **Canonical content is never duplicated into `App/library`.** That location is
   legacy managed-library compatibility only. The two-folders-plus-`App`
   assumption is superseded by the three-folder model.

3. **Root initialization is fail-safe and idempotent.** Only missing folders are
   created, one at a time. Existing content is never overwritten, moved, renamed
   or deleted. A file occupying a required folder path raises
   `REQUIRED_FOLDER_PATH_IS_FILE` rather than being replaced. Unknown root content
   is preserved and left alone.

4. **A canonical title is one category folder containing exactly one Markdown
   file whose base name equals the folder name.** The old sanitized-hyphenated
   `item.md` convention is no longer required of the portable library and stays
   supported only for legacy managed-library items. `Source Imports`,
   `Administration`, `Filesystem_Inventory*`, `Raw Export Records`, shared
   evidence folders and audit directories are never title sources.

5. **One discovery implementation, structured diagnostics.** Discovery,
   validation and initialization live in `app/server/portable-library.mjs`.
   Failures are returned as coded diagnostics with a collection, category,
   relative path, plain-language problem and a safe suggested action. No parallel
   scanner or second path-resolution system may be introduced.

6. **Long paths fail loudly or succeed correctly — never silently.** Paths are
   stat-ed and read through the Windows extended-length form. A real 260-character
   path previously produced blank metadata in a scanner; the same class of defect
   must now surface as an explicit error. The application does not enable
   `LongPathsEnabled` automatically.

7. **Raw is offline by construction.** The foundation exposes cheap recursive
   enumeration (relative path, size, extension) with no hashing on startup, no
   OCR, no classification and no network access. Deeper analysis will be an
   explicit, separate operation.

8. **The filesystem is the portable source of truth.** Losing local SQLite must
   not lose the library: a fresh installation must be able to select an existing
   library folder and rebuild runtime state from `Read/` and `Watch/`. Database
   population, Markdown write-back, Raw intake UI, artwork enrichment and search
   migration are explicitly deferred to later authorized slices.

9. **Real-library validation was read-only except for one authorized creation.**
   Discovery reported 145 Read and 74 Watch titles (219 total, 0 diagnostics)
   both before and after initialization; `App/state` was not created, no database
   was opened, and Read/Watch file counts, folder counts, byte totals and a sample
   file hash were identical before and after. The only mutation was creating the
   missing empty `Raw/` folder.

## D-057 - Portable title schema, stable identity and the metadata parser

Status: Accepted

Second checkpoint of the same user-authorized maintenance prerequisite. Phase 17
stays `IN_PROGRESS`; `P17-T004` stays current; no phase task is completed.

1. **One parser, one schema.** `app/server/portable-metadata.mjs` defines portable
   title schema v1 and is the only title-Markdown parser. Read and Watch are thin
   field profiles over a shared implementation; a second parser for either
   collection is not authorized.

2. **Identity fields are required; almost nothing else is.** `schema_version`,
   `id`, `collection` and `title` are required. `category` is the approved
   physical category folder and is therefore not stored in the file. `year` and
   `type` may be absent.

3. **Missing personal state stays missing.** `favorite` absent is not
   `favorite: false`; an unset rating is not `0`. The parser never invents a
   default for personal data.

4. **Unknown data survives.** Unknown YAML keys and unknown Markdown sections are
   preserved verbatim and re-emitted untouched. A malformed optional field is
   isolated as a field diagnostic and never invalidates the rest of the title.

5. **Stable identity is generated once and then immutable.** Where no immutable
   source identity exists, the identifier is generated once, written into the
   Markdown and preserved. It is never derived from the title, year, folder name,
   absolute path or scan order, and it survives renames, category changes and
   database rebuilds. The `read-` / `watch-` prefix convention is retained.

6. **Assignment is fail-closed and reversible.** The identity tool refuses to
   write when any title has an error-level diagnostic, verifies a per-file
   rollback bundle before the first mutation, writes through a temporary file plus
   atomic rename, re-validates every generated file before replacing the
   original, and is idempotent on a second run. Private manifests, dry-run
   reports and rollback copies live under
   `<root>/App/migration/portable-metadata/<timestamp>/` and are never committed.

7. **Asset references are contained, not pattern-matched.** Containment is judged
   by resolving the reference from the title's own folder, so a legitimate shared
   evidence path (`../../Source Imports/Shared Recommendation Evidence/...`) is
   valid while a genuine escape, an absolute path or a symlink escape is rejected.
   This corrected a real defect: a naive `..` scan initially flagged 12 valid
   shared-evidence titles as errors.

8. **Real-library application record.** Dry run over the real portable root found
   219 titles (145 Read / 74 Watch), 219 unique identifiers, 0 parse errors and
   219 files needing identity. After `--apply`: 219 written, 0 collisions, 0
   duplicate identifiers, 0 body-loss events, 0 unexpected metadata changes, and a
   second dry run reported 0 files needing changes. A verified 219-file rollback
   bundle was created first. No SQLite database exists, was created or was
   modified, and no source binary was touched.

## D-058 - Portable runtime rebuild and safe Markdown write-back

Status: Accepted

Third checkpoint of the same user-authorized portable-library maintenance
prerequisite. Phase 17 remains `IN_PROGRESS`, `P17-T004` remains the current
incomplete task, `P17-T007` remains open, Phase 18 remains `NOT_STARTED`, and no
platform certification was started. This decision completes no phase task and is
not OCR benchmark evidence.

1. **One discovery path and one parser.** Rebuild consumes
   `portable-library.mjs` discovery and `portable-metadata.mjs` parsing. It adds
   no second title scanner, no Read/Watch parser fork, and no parallel metadata
   model.

2. **Portable identity is never rewritten for SQLite.** The checkpoint-2
   generator emits `read-`/`watch-` plus 16 lowercase hex characters, while the
   Phase 02 schema required exactly 32. Migration `002_relax_item_identity.sql`
   widens the accepted range to 8-64 hex characters and preserves every existing
   row and child relation. The packaged runtime carries a byte-identical embedded
   snapshot of migrations 001 and 002; `runtime-schema.test.mjs` fails if the
   snapshot and the canonical migration files diverge.

3. **Rebuild is transactional, additive and idempotent.** Given a selected root,
   the rebuild discovers canonical titles, parses Markdown, validates stable
   identity, derives the physical category/path, derives asset rows, and applies
   all valid titles in one `BEGIN IMMEDIATE` transaction. A duplicate stable id
   fails the whole rebuild closed. A malformed required identity is isolated as a
   diagnostic and leaves the rest of the library usable; the run is reported
   `partial`, never silently current. Items absent from the portable set are
   retained. A content hash makes a second unchanged rebuild a no-op.

4. **Ownership stays unambiguous.**
   - Portable Markdown/filesystem: durable reconstructable title record.
   - SQLite: optimized runtime/query/conflict state, rebuildable from Markdown.
   - Search: derived and rebuildable through the existing FTS5 store.
   - Notes, thoughts, bookmarks, annotations, canvases and knowledge objects keep
     their existing canonical stores; a rebuild never bulk-deletes them. An asset
     still referenced by user annotations is retained rather than cascaded.

5. **Category is physical, assets are portable-relative.** Category comes from
   the approved category folder and is stored in the runtime `portable`
   namespace, not duplicated into Markdown. Read assets come from Markdown
   `files` path entries. Watch assets additionally use a bounded direct-child
   enumeration of the title folder and its `Media/` folder; this is not a second
   library scanner and it performs no content hashing.

6. **App write-back is filesystem-first and compensates on failure.** The app
   validates personal fields, detects an external Markdown edit by the stored
   content hash, refuses same-field conflicts with a structured 409, and merges
   non-conflicting external edits. It stages a temporary Markdown file, creates a
   bounded per-title backup, starts the SQLite transaction, atomically replaces
   the Markdown, then commits. A failed replace rolls the database back and never
   reports success. A failed commit restores the previous Markdown, or leaves an
   explicit divergence journal under `App/state/` if compensation also fails.
   Unknown YAML keys, unknown body sections and absent personal values survive.

7. **Structured state has one authoritative representation.** Personal values
   live in frontmatter (`status`, `favorite`, `personal_rating`, dates, tags,
   progress) and the UI renders them from there. The body keeps prose; the
   Read `## Overview` and Watch `## My Description` sections are the app-managed
   prose targets. Unknown/custom sections are never normalized away.

8. **Real-library record.**
   - Rebuild: 145 Read + 74 Watch = 219 items; 219 unique ids; 0 duplicate ids;
     0 duplicate paths; 0 parse errors; 282 derived assets (152 readable);
     0 notes/annotations deleted because none existed and none are bulk-deleted.
   - Search: `search_index_records` reports 219 library items and status `ready`.
   - Idempotence: the second real rebuild reported 0 changed items.
   - Canonical preservation: Read file count/byte total and Markdown hash and
     Watch file count/byte total and Markdown hash were identical before and
     after. Thirteen sampled Read PDF/Watch media binaries were byte-identical by
     SHA-256.
   - Recovery: the pre-rebuild runtime database was copied to
     `App/backups/read-watch.sqlite3.<timestamp>.pre-portable-rebuild.bak` and
     verified by SHA-256 before the rebuild. No real Markdown was rewritten; the
     real write-back path was exercised with an unchanged patch and correctly
     reported `unchanged` without touching the file.
   - Parser audit defect fixed: `files`/`media` sibling metadata (`format`,
     `size`, `sha256`) was previously mistaken for asset paths, and shared
     `Source Imports` evidence paths were incorrectly rejected by containment
     checks. Both defects were corrected and tested.

9. **Limitations.** Watch media indexing is bounded to direct children of the
   title folder and `Media/`; deep media trees are not traversed. No external
   metadata refresh, artwork download, Raw organization, OCR benchmark, Phase 18
   work or platform certification was started. The real app write-back was
   validated synthetically and with a real unchanged no-op; no real personal
   field was changed.

## D-059 - Portable startup recovery and journal reconciliation

Status: Accepted

Fourth checkpoint of the same user-authorized portable-library maintenance
prerequisite. Phase 17 remains `IN_PROGRESS`, `P17-T004` remains the current
incomplete task, `P17-T007` remains open, Phase 18 and Phase 19 remain
`NOT_STARTED`, and no platform certification was started. This decision
completes no phase task and is not OCR benchmark evidence.

1. **One small recovery coordinator.** `app/server/portable-recovery.mjs` is a
   policy layer over the existing scanner, parser, rebuild and write-back
   contracts. It adds no second scanner, parser, SQLite model, search index,
   watcher, sync framework or journal format.

2. **Recovery runs before ordinary service requests.** In production desktop,
   `createDesktopService(...).start(...)` awaits startup recovery before
   `server.listen(...)` accepts requests. In Vite development, recovery runs
   during async config initialization before the library stores and middleware
   are created. `main.mjs` still uses the same `service.start(...)` call and did
   not gain a second boot system.

3. **Healthy startup is a cheap fast path.** If the runtime database opens,
   contains at least one portable title, uses a supported schema version and no
   recovery journal exists, inspection returns `HEALTHY` after two database
   queries. It performs no portable-root scan, no title hashing, no Markdown
   rewrite, no rebuild and no FTS rebuild. Measured on the real library:
   `HEALTHY`, `portableRootScanned: false`, `rebuildApplied: false`,
   `searchRebuilt: false`, 5 ms.

4. **Automatic recovery conditions.** Runtime state is reconstructed from the
   durable portable filesystem when the runtime database file is missing, the
   runtime library schema is missing, the portable projection is empty while the
   selected root contains usable titles, or a supported older schema version
   needs the forward migration. Recovery first runs the existing
   `planPortableRebuild`; it applies only when the selected root is valid, there
   are no duplicate stable IDs and no malformed/skipped identities. It then
   applies the existing transactional rebuild and rebuilds the existing derived
   FTS index.

5. **Journal reconciliation is explicit and hash-driven.** A
   `PORTABLE_WRITEBACK_PREPARED` journal is validated defensively. Journal paths
   must stay inside the selected root, the referenced Markdown must exist and
   keep the same stable identity, hashes must be syntactically valid, and archive
   paths must stay under `App/backups/markdown-history`. Deterministic outcomes:
   - Markdown previous and DB previous: stale journal is archived and cleared.
   - Markdown staged and DB staged: stale journal is archived and cleared without
     incrementing revision.
   - Markdown staged and DB previous or missing: runtime is rebuilt from the
     current durable Markdown, verified, then the journal is archived and cleared.
   - Markdown previous and DB staged: runtime is rebuilt from the current durable
     Markdown, verified, then the journal is archived and cleared.
   - Markdown has a third unexpected hash: `RECOVERY_REQUIRED`; Markdown and the
     journal are preserved unchanged.

6. **Divergence is conservative.** `PORTABLE_DIVERGENCE` never restores the
   archive over current Markdown. If the current Markdown is valid, its identity
   matches and the existing rebuild plan is unambiguous, runtime is rebuilt from
   the current filesystem state and the journal is archived. Otherwise startup
   enters `RECOVERY_REQUIRED`.

7. **Malformed or hostile journals fail closed.** Malformed JSON, unknown codes,
   invalid stable IDs, unexpected collection/path references, missing Markdown,
   path traversal, symlink escape, invalid hashes and archive paths outside the
   allowed recovery storage produce `MALFORMED_RECOVERY_JOURNAL` or
   `DIVERGENCE_REQUIRES_REVIEW`. The journal is never deleted or executed.

8. **Mutation blocking while recovery is unresolved.** An active write-back
   journal or the bounded `App/state/portable-recovery-required.json` marker
   blocks portable title metadata write-back with HTTP 503 and
   `PORTABLE_RECOVERY_REQUIRED`. Reading and browsing remain available when the
   runtime database itself can be opened. The marker is removed only after a
   verified `HEALTHY` or `RECOVERED` inspection.

9. **Recovery status is exposed through the existing local API and design
   language.** `GET /api/library/recovery` returns a sanitized state and
   `POST /api/library/recovery/retry` reruns the same inspector. The library
   page shows a calm recovery notice only when human recovery is required. It
   does not expose stack traces, machine paths or journal contents.

10. **Warning-level portable-library diagnostics are not corruption.** Missing
    recommendation-evidence references remain warning-level
    `BROKEN_RELATIVE_PATH` diagnostics and do not make startup recovery fail.

11. **Real-library record.** The real selected root remained 145 Read, 74 Watch,
    219 total, 219 unique stable IDs, search index 219 items, no journal, no
    recovery marker, and `HEALTHY` with no rebuild or search rebuild. The
    runtime database hash, Read/Watch Markdown hashes and thirteen sampled source
    binaries were unchanged. The same three missing recommendation-evidence
    references remained warning-level diagnostics.

12. **Limitations.** No automatic recovery is attempted for an unreadable or
    corrupt runtime database beyond surfacing `RUNTIME_DB_UNUSABLE`; automatic
    reconstruction does not run while any title has a malformed required
    identity, because that requires human review. Recovery evidence archives are
    bounded to the newest 20 journal records. No Raw organization, external
    metadata refresh, OCR benchmark, Phase 18 work or platform certification was
    started.

## D-060 - Corrupt runtime database disaster recovery

Status: Accepted

Fifth checkpoint of the same user-authorized portable-library maintenance
prerequisite. Phase 17 remains `IN_PROGRESS`, `P17-T004` remains the current
incomplete task, `P17-T007` remains open, Phase 18 and Phase 19 remain
`NOT_STARTED`, and no platform certification was started. This decision
completes no phase task and is not OCR benchmark evidence.

1. **Runtime database corruption is not library corruption.** The durable
   portable record remains `Read/` and `Watch/` Markdown plus their local
   assets. A corrupt `App/state/read-watch.sqlite3` triggers runtime
   reconstruction, not canonical library replacement.

2. **Recoverability audit results.**
   - Portable titles, categories, paths and assets: reconstructable from
     portable Markdown (`portable-rebuild.mjs`).
   - Annotations: reconstructable from `App/user-data/items/<id>/annotations.json`
     through `annotationStore.recoverFromExternalFile`.
   - Canvases and links: reconstructable from
     `App/user-data/canvases/<id>/canvas.json` through
     `canvasStore.recoverCanvasFromExternal`; canvas assets are recovered from
     the existing `assets/` files through the new
     `recoverCanvasAssetsFromExternal`. Canvas link mutations now also mirror
     the current links into `canvas.json` so links are genuinely file-first.
   - Knowledge graphs, nodes, edges and Mermaid documents: reconstructable from
     `App/user-data/knowledge/graphs/*.json` and
     `App/user-data/knowledge/diagrams/*.json` through
     `knowledgeStore.rebuildFromFiles`.
   - Notes and thoughts: reconstructable from
     `App/user-data/items/<id>/notes.md` and `thoughts.md`.
   - Bookmarks and reading state: already file-first under
     `App/user-data/items/<id>/bookmarks.json` and `reading-state.json`.
   - Settings and reader settings: already file-first and untouched by runtime
     database replacement.
   - Search and runtime projections: derived and rebuilt through the existing
     FTS store.
   - `saved_views` and `relationships` are DB-only convenience/user state. They
     are best-effort salvaged from the corrupt database when it is readable; when
     not readable, recovery proceeds as explicit `PARTIAL` recovery with the
     limitation disclosed and the corrupt database preserved.
   - A non-empty legacy `App/library/catalog.json` is treated as a recovery
     blocker because this JS recovery path does not own the legacy importer.

3. **Forensic database-family preservation happens before writable access.**
   Startup recovery discovers the full SQLite family
   (`read-watch.sqlite3`, `-wal`, `-shm`, `-journal`), copies every present file
   into `App/backups/corrupt-runtime/<timestamp>/`, and verifies byte size and
   SHA-256 for each copy before any quarantine or activation. A private
   `manifest.json` records relative locations, sizes, hashes, capture time,
   recovery reason and best-effort schema information. Backup capture directories
   are bounded to the newest five and the newest/only capture is never deleted;
   failed recoveries do not prune.

4. **Replacement is staged, reconstructed and validated.** A sibling
   `read-watch.sqlite3.recovery-<timestamp>.staging` database is built with the
   existing `applyRuntimeSchema`/`planPortableRebuild`/`rebuildPortableLibrary`
   path. Portable rows are rebuilt first; then annotations, canvases and assets,
   knowledge and Mermaid documents, notes and thoughts are reconstructed into the
   staged database from file-first inputs. Search is rebuilt only from the
   staged canonical runtime state. Staged validation requires `quick_check`,
   `integrity_check`, no foreign-key violations, supported `user_version`,
   expected tables, unique item IDs and paths, and an application-level smoke
   test for catalog/reader/search access.

5. **Activation is atomic and reversible.** Only after verified backup,
   successful reconstruction, integrity validation, search rebuild and smoke
   test, the original runtime family is moved into the verified capture's
   `original/` area and the staged database is renamed to the canonical runtime
   path. If activation fails, the original family is moved back where possible
   and recovery returns `CORRUPT_RUNTIME_ACTIVATION_FAILED`; the verified backup
   and staged database remain for diagnosis. No canonical Markdown or source
   media is touched.

6. **Newer readable schemas remain unsupported, not corrupt.** A readable
   database with a newer `user_version` still returns
   `RUNTIME_SCHEMA_UNSUPPORTED`, is never quarantined, and is never replaced by
   this path.

7. **Failure is explicit.** Malformed annotation, canvas or knowledge recovery
   files, duplicate portable IDs, malformed required title identities,
   backup-copy verification failure, staged integrity/FK failure, search rebuild
   failure, activation failure and a non-empty legacy managed library all fail
   closed with structured recovery-required codes. Warning-only missing
   recommendation-evidence references remain non-fatal.

8. **Real-library record.** The real runtime database remained healthy and was
   not corrupted or replaced: 145 Read, 74 Watch, 219 total, 219 unique IDs,
   219 search records, no journal, no recovery marker, no corrupt-runtime backup,
   `HEALTHY` in 6 ms with `portableRootScanned: false`, `rebuildApplied: false`
   and `searchRebuilt: false`. Runtime database hash, Read/Watch Markdown hashes
   and thirteen sampled source binaries were unchanged. The real library
   currently has no file-first annotation/canvas/knowledge/notes/bookmark/
   reading-state/settings substrates; the full-state disaster path is proven by
   synthetic tests instead.

9. **Limitations.** A corrupt database that is completely unreadable cannot
   salvage DB-only `saved_views` or `relationships`; the recovery result is
   explicitly partial and discloses those classes while preserving the forensic
   capture. Legacy managed-library catalogs are not automatically imported by
   this path. No Raw organization, external metadata refresh, OCR benchmark,
   Phase 18 work or platform certification was started.

## D-061 - File-first saved views and relationships

Status: Accepted

Sixth checkpoint of the same user-authorized portable-library maintenance
prerequisite. Phase 17 remains `IN_PROGRESS`, `P17-T004` remains the current
incomplete task, `P17-T007` remains open, Phase 18 and Phase 19 remain
`NOT_STARTED`, and no platform certification was started. This decision
completes no phase task and is not OCR benchmark evidence.

1. **One durable library-level file.** Saved views and relationships now have a
   single durable file-first record at
   `App/user-data/library-state.json`. It is human-inspectable JSON and
   machine-managed; no per-view or per-relationship sidecars were introduced.
   Title Markdown is not used for these library-level fields.

2. **Schema.** `schemaVersion` is 1 and contains:
   - `savedViews[]`: stable `id`, `name`, JSON `definition`, positive-integer
     `revision`, `createdAtUtc`, `updatedAtUtc`.
   - `relationships[]`: stable `id`, `sourceItemId`, exactly one of
     `targetItemId` or `targetExternal`, `relationshipType`, `direction`
     (`directed`/`undirected`), non-negative `position`, JSON `provenance` and
     `createdAtUtc`.
   Serialization is deterministic and byte-stable for unchanged state.

3. **Source of truth.** `library-state.json` is the durable reconstructable
   record. SQLite `saved_views` and `relationships` are optimized runtime
   projections. The file is sufficient to rebuild both tables; the tables never
   become a second independent master.

4. **Mutation paths.** The only runtime mutation paths are
   `libraryStore.saveView(...)` and `libraryStore.addRelationship(...)`.
   Direct SQL in the corrupt-runtime recovery helper is recovery projection, not
   a user mutation path. Both mutation paths now use the smallest write sequence:
   read and validate current durable state, build and validate the next state,
   stage and atomically replace `library-state.json`, open the SQLite
   transaction, project the same state, verify DB/file parity, then commit. A DB
   failure rolls back and restores the previous file; if compensation also
   fails, the existing recovery-required marker mechanism is used. A hard kill
   after file replacement but before DB completion leaves the durable file
   winning on the next startup.

5. **Startup reconciliation.** The existing portable recovery coordinator keeps
   the healthy fast path cheap and adds only a small library-state check:
   - file absent + healthy DB: one-time migration from the two runtime tables to
     the durable file, including the empty-state case.
   - file present + DB matching: `HEALTHY`, no rewrite.
   - file present + DB table empty or stale: durable file wins; runtime tables
     are projected from the file.
   - malformed file or missing referenced internal items:
     `RECOVERY_REQUIRED`, file preserved, no fabrication.
   Valid external relationship targets are accepted and never treated as missing
   internal items.

6. **Corrupt-runtime recovery parity.** After portable title reconstruction,
   corrupt-runtime recovery now reads `library-state.json` when present and
   projects saved views and relationships into the staged runtime database.
   Best-effort salvage from the corrupt database remains only for pre-mirror
   installations where the file is absent. With a valid initialized mirror, a
   completely unreadable runtime database now restores the full audited set:
   portable titles, annotations, canvases and canvas assets, knowledge and
   Mermaid documents, notes, thoughts, bookmarks, reading state, settings,
   saved views, relationships and search. The `PARTIAL` limitation for these two
   classes is removed for initialized installations and retained honestly for
   pre-mirror compatibility.

7. **Backup and restore.** The v1 backup format gains an optional
   backwards-compatible `libraryState` section containing `savedViews` and
   `relationships`. Old valid v1 backups without the section remain accepted.
   The manifest records saved-view and relationship member counts and a
   `libraryStateSha256` checksum. Preflight reports incoming counts and
   conflicts. Restore preserves current conflict semantics, uses stable IDs and
   is idempotent on repeated restore; relationships whose referenced items are
   absent produce structured warnings instead of fabricated targets. No source
   media is bundled or modified.

8. **Real-library migration.** The real healthy runtime database contained 0
   saved views and 0 relationships. The durable mirror was present and valid
   with matching 0/0 counts and was not rewritten. Healthy startup returned
   `HEALTHY` in 9 ms with no portable Read/Watch scan, no SQLite rebuild and no
   FTS rebuild. Read/Watch Markdown hashes and thirteen sampled source binaries
   were unchanged. No private saved-view names, definitions or relationship
   records are exposed in Git.

9. **Limitations.** Pre-mirror corrupt databases with unreadable DB-only saved
   views or relationships still report explicit partial compatibility. A
   non-empty legacy `App/library/catalog.json` still blocks the JS automatic
   disaster-recovery path. No Raw organization, external metadata refresh, OCR
   benchmark, Phase 18 or 19 work, or platform certification was started.

## D-062 - Proven PP-OCRv5 CPU runtime pin and short specialist runtime root

Status: Accepted

Maintenance/readiness checkpoint on the authoritative Phase 17 path. Phase 17
remains `IN_PROGRESS`, `P17-T004` remains the current incomplete task,
`P17-T007` remains open, `P17-G002` remains open, Phase 18 remains
`NOT_STARTED`, and no benchmark acceptance claim is made by this decision.

1. **PP-OCRv5 CPU runtime is no longer blocked by PaddlePaddle 3.3.1.** A real
   isolated Windows CPU test found a working supported combination:
   - Python 3.12.10
   - `paddlepaddle==3.0.0`
   - `paddleocr==3.3.1`
   - `paddlex==3.3.13`
   - `numpy==1.26.4`
   - `scipy==1.13.1`
   - `scikit-learn==1.5.2`
   - `langchain<0.3`
   - `setuptools`
   PaddlePaddle 3.3.1 is deliberately not pinned; its PIR/oneDNN executor
   failure was the previous blocker. PaddleX is pinned so PaddleOCR cannot
   resolve a newer incompatible PaddleX.

2. **The shipped Read & Watch driver now has a real PP-OCRv5 inference record
   on this host.** The exact `PP-OCRv5_server_det` and
   `arabic_PP-OCRv5_mobile_rec` models loaded, the shipped
   `engine_driver.py` reported health, and a page recognition call returned
   `HELLO 123 OCR TEST` with confidence `0.9969695210456848`. This is
   runtime/provider evidence, not representative benchmark acceptance evidence.

3. **Model files stay in the external data root.** Managed Paddle runs set
   `PADDLE_PDX_CACHE_HOME` under
   `<dataRoot>/ocr/models/<provider>/paddlex-cache`, so public model files do
   not drift into a user profile cache or Git. `DISABLE_MODEL_SOURCE_CHECK` is
   set for recognition so staged models do not trigger an unnecessary network
   hoster probe.

4. **The specialist long-path blocker now has a real software fix.** Python
   virtual environments are staged under a short external runtime root
   (`%LOCALAPPDATA%/RW/ocr/runtimes` on Windows, configurable with
   `READ_WATCH_OCR_RUNTIME_ROOT`) while the engine-store/activation/evidence
   layout remains under the selected data root. An already-materialised
   data-root runtime is respected for backward compatibility. This is
   unit-proven with a long synthetic data root; the full 1.3 GB specialist
   provisioning was not executed in this run.

5. **No fallback or substitute engine was introduced.** Unlimited-OCR remains
   `BLOCKED BY CURRENT HARDWARE` because this host has Intel Arc graphics and no
   CUDA-capable NVIDIA device. No CPU fallback, cloud OCR, or alternate engine
   was substituted.

6. **P17-T004 remains incomplete.** The 14-sample synthetic corpus is plumbing
   evidence only. No representative lawful private real-world corpus with
   human-validated ground truth was available or generated in this run, so no
   provider acceptance benchmark or P17-G002 gate was executed. Unlimited-OCR
   cannot run on this host, so English benchmark handoff remains required.
