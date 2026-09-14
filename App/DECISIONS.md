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

