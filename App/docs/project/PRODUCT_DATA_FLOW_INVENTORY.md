# Product Data Flow, Storage, and Privacy Architecture Inventory

**Document ID:** `PRODUCT_DATA_FLOW_INVENTORY`  
**Phase:** `PHASE-15` (Task `P15-T001`)  
**Date:** 2026-09-15  
**Status:** Canonical Engineering & Legal Technical Inventory  
**Scope:** Read & Watch Application Runtime (Desktop Electron & Local Web Runtime)

---

## 1. Architectural Overview & Core Privacy Posture

Read & Watch is an offline, local-first personal library and knowledge management application for reading books, watching media, making annotations, taking notes, creating visual canvases, and mapping conceptual diagrams.

### 1.1 Local-First Grounding
- **Zero Remote Cloud Services:** The application does not require, connect to, or maintain any cloud backend, remote database, or proprietary sync service.
- **Zero User Accounts:** There are no user accounts, logins, passwords, authentication tokens, profiles, avatars, or telemetry identifiers.
- **Local Loopback Boundary:** On the desktop, the application executes an embedded internal HTTP service (`electron/desktop-service.mjs`) bound strictly to the loopback interface (`127.0.0.1`) on an ephemeral OS-assigned port. It accepts connections solely from the local application renderer authenticated by a cryptographically random in-memory session token (`X-ReadWatch-Session-Token`). It is never accessible over the local area network or internet.
- **Sandboxed Native Bridge:** The desktop Electron window runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. The renderer communicates with privileged OS APIs through exactly 5 strongly typed, least-privilege IPC methods (`window.readWatchDesktop`).
- **Source Publication Immutability:** Original books and media files remain strictly read-only and byte-identical. Read & Watch never writes to, moves, renames, or modifies user-owned source publications.

---

## 2. Canonical Data Classes Inventory

The table below provides a complete, exhaustive inventory of every piece of data processed or stored by Read & Watch across all implemented subsystems (Phases 01 through 14).

| Data Class | Description / Contents | Canonical vs Derived | Storage Location | Personal / User Authored? | Retention Policy | Export Capability | Included in Backup? | Delete / Reset Scope | External Transmission | Owning Component / Store |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Library Metadata** | Catalog entries: title, status, rating, tags, summary, Notion properties, source added date, revision | Canonical | SQLite (`items`, `item_properties`, `item_tags`, `tags`) | User curated | Indefinite until deleted by user | JSON export (`/api/portability/library-metadata`) | Yes (`.rwbackup`) | Individual item delete | Never | `server/library-store.mjs` |
| **Read Items** | Book-specific catalog extension (page count, reading metadata) | Canonical | SQLite (`read_items`) | User curated | Matches parent item lifecycle | Included in library metadata export | Yes (`.rwbackup`) | Cascade with item delete | Never | `server/library-store.mjs` |
| **Watch Items** | Media-specific catalog extension (watch progress, duration) | Canonical | SQLite (`watch_items`) | User curated | Matches parent item lifecycle | Included in library metadata export | Yes (`.rwbackup`) | Cascade with item delete | Never | `server/library-store.mjs` |
| **Source Asset Descriptors** | Relative path, file name, MIME type, byte size, format tag | Canonical | SQLite (`item_assets`, `asset_roles`) | System / User metadata | Indefinite until item removed | Included in library metadata export | Yes (`.rwbackup`) | Cascade with item delete | Never | `server/library-store.mjs` |
| **Source File Paths** | OS filesystem path or relative library path to original book | Canonical | SQLite (`item_assets.relative_path`) | Machine path / User filesystem | Indefinite until item removed | Excluded from portable exports to prevent machine leakage | Normalized relative path in backup | Cascade with item delete | Never | `server/library-store.mjs` |
| **Source Hashes** | SHA-256 cryptographic digest of source publication bytes | Canonical | SQLite (`item_assets.sha256`) | Cryptographic checksum | Indefinite; used for source immutability & duplicate detection | Included in library metadata export | Yes (`.rwbackup`) | Cascade with item delete | Never | `server/library-store.mjs` |
| **Reading Positions** | Current reading progression (page number, EPUB CFI, timestamp, percent) | Canonical | Atomic JSON mirror (`user-data/items/{id}/reading-state.json`) & SQLite | User reading activity | Persists across reading sessions | Included in item state export | Yes (`.rwbackup`) | Can be reset per item | Never | `server/reader-store.mjs` |
| **Reader Preferences** | Theme (light/warm/dark), font size, font family, line height, content width, layout mode | Canonical | Atomic JSON (`user-data/reader-settings.json`) & SQLite | User UI preference | Persists until modified or reset | Portable settings export (Phase 15) | Yes (portable settings) | Reset Reading Defaults | Never | `server/reader-store.mjs` |
| **Bookmarks** | Named reading locations with labels, snippets, page numbers, CFIs, and source hashes | Canonical | Atomic JSON (`user-data/items/{id}/bookmarks.json`) & SQLite | User authored | Indefinite until deleted | Included in annotations export & backup | Yes (`.rwbackup`) | Delete bookmark / delete item | Never | `server/reader-store.mjs` |
| **Text Annotations** | Highlights, underlines, and strikes with normalized coordinates or CFI ranges | Canonical | SQLite (`annotations`) & atomic JSON mirrors | User authored | Indefinite until deleted (supports soft delete) | JSON & Markdown export (`/api/portability/annotations`) | Yes (`.rwbackup`) | Delete single / batch annotations | Never | `server/annotation-store.mjs` |
| **Comments & Excerpts** | Markdown notes attached to highlights, quoted excerpts, and prefix/suffix anchors | Canonical | SQLite (`annotations`) & atomic JSON mirrors | User authored | Indefinite until deleted | JSON & Markdown export | Yes (`.rwbackup`) | Delete comment / annotation | Never | `server/annotation-store.mjs` |
| **Drawing Annotations** | Freehand vector strokes, arrows, rectangles, ellipses, and text boxes | Canonical | SQLite (`annotations`) & atomic JSON mirrors | User authored | Indefinite until deleted | JSON export & derivative PDF export | Yes (`.rwbackup`) | Delete drawing annotation | Never | `server/annotation-store.mjs` |
| **Item Thoughts** | Markdown thoughts log (`thoughts.md`) attached to a library item | Canonical | File-first atomic Markdown (`user-data/items/{id}/thoughts.md`) | User authored | Indefinite until cleared | Markdown export (`/api/portability/notes`) | Yes (`.rwbackup`) | Edit or clear in item view | Never | `server/user-data-store.mjs` |
| **Item Notes** | Structured Markdown notes (`notes.md`) attached to a library item | Canonical | File-first atomic Markdown (`user-data/items/{id}/notes.md`) | User authored | Indefinite until cleared | Markdown export (`/api/portability/notes`) | Yes (`.rwbackup`) | Edit or clear in item view | Never | `server/user-data-store.mjs` |
| **Canvases** | Excalidraw scenes: visual elements, shapes, text, bindings, scene state | Canonical | SQLite (`canvases`) & atomic JSON mirror (`user-data/canvases/{id}/canvas.json`) | User authored | Indefinite until deleted | `.rwcanvas` JSON export (`/api/portability/canvases`) | Yes (`.rwbackup`) | Delete canvas | Never | `server/canvas-store.mjs` |
| **Canvas Assets** | Embedded image files and diagrams within Excalidraw scenes | Canonical | SQLite (`canvas_assets`) & local file mirror (`user-data/canvases/{id}/assets/`) | User authored / added | Indefinite until canvas deleted | Embedded base64 in `.rwcanvas` | Yes (`.rwbackup`) | Cascade with canvas delete | Never | `server/canvas-store.mjs` |
| **Canvas Deep Links** | Bidirectional links connecting canvas elements to reading locations or annotations | Canonical | SQLite (`canvas_links`) | User authored | Indefinite until removed | Preserved in canvas export | Yes (`.rwbackup`) | Remove link | Never | `server/canvas-store.mjs` |
| **Knowledge Graphs** | Concept graphs (title, description, tags, layout) | Canonical | SQLite (`knowledge_graphs`) & atomic JSON mirror (`user-data/knowledge/graphs/`) | User authored | Indefinite until deleted | JSON export | Yes (`.rwbackup`) | Delete concept graph | Never | `server/knowledge-store.mjs` |
| **Knowledge Nodes & Edges** | Semantic concept nodes and relational edges with deep link references | Canonical | SQLite (`knowledge_nodes`, `knowledge_edges`) | User authored | Indefinite until graph deleted | JSON export | Yes (`.rwbackup`) | Cascade with graph delete | Never | `server/knowledge-store.mjs` |
| **Mermaid Diagrams** | Text-defined Mermaid diagram source code and title | Canonical | SQLite (`mermaid_documents`) & atomic file mirror (`user-data/knowledge/diagrams/`) | User authored | Indefinite until deleted | Text & SVG export | Yes (`.rwbackup`) | Delete diagram | Never | `server/knowledge-store.mjs` |
| **Search Index** | FTS5 full-text inverted index of items, notes, bookmarks, annotations, and canvases | **Derived** | SQLite FTS5 tables (`search_index_fts`, `search_index_records`, `search_index_meta`) | Derived from canonical content | Rebuilt automatically on startup or restore | Excluded (rebuildable locally) | No (strictly excluded) | Rebuild Search Index | Never | `server/search-store.mjs` |
| **Application Settings** | Global UI preferences: theme, typography defaults, accessibility, data root info | Canonical | Atomic JSON (`user-data/app-settings.json`) & SQLite | User preferences | Indefinite until reset | Portable JSON export (Phase 15) | Yes (portable settings export) | Reset Settings Defaults (safe) | Never | `server/settings-store.mjs` |
| **Backup Bundles** | Snapshot containing library, annotations, notes, and canvases with SHA-256 manifest | Archive | User-designated destination (`.rwbackup` file) | Complete user data snapshot | User controlled | File creation via Save Dialog | N/A (is backup) | User file deletion | Never | `server/portability-store.mjs` |
| **Annotated PDFs** | Derivative PDF file embedding vector annotations onto original PDF pages | Derived | User-designated export path | Derived user artifact | User controlled | File creation via Save Dialog | No (external user file) | User file deletion | Never | `lib/portability/pdf-export.ts` |
| **Desktop State** | Window bounds, maximize state, last open files | Ephemeral | Local desktop cache | Machine context | Session / restart lifecycle | None | No | Reset on fresh install | Never | `electron/main.mjs` |

---

## 3. Source Publication Lifecycle & Immutability Guarantees

1. **User Ownership:** Source publications (EPUB, PDF, MOBI, AZW, AZW3, FB2, FBZ, CBZ) reside on the user's local filesystem in folders managed by the user.
2. **Read-Only Access:** All document adapters (`PdfAdapter`, `FoliateReflowableAdapter`) open source publications using read-only Node.js file streams (`createReadStream`). There is no code path anywhere in the application that opens source publications with write (`w`, `r+`, `a`) permissions.
3. **Cryptographic Immutability Verification:** Upon initial ingestion, Read & Watch computes a SHA-256 digest of the source bytes. Automated regression tests verify that source books remain 100% byte-identical and preserve their filesystem modification times (`mtime`) before and after all reading, bookmarking, and annotation operations.
4. **Annotated Derivative PDF Policy:** When the user exports an annotated PDF, the application creates an entirely separate new file at an explicit user-selected destination path (`targetPath !== sourcePath`). The original source PDF is never overwritten.
5. **Backup Exclusion:** As explicitly declared in the Phase 12 specification and backup manifest (`sourceBooksIncluded: false`), Read & Watch backups contain user-created metadata and annotations, but do NOT bundle copyright-protected source book binaries.

---

## 4. Canonical Local Storage vs Derived Storage

### 4.1 Canonical Primary Storage
- **Directory Structure:** All application data is stored within `READ_WATCH_DATA_ROOT` outside the Git repository:
  - `state/read-watch.sqlite3`: Relational database with enforced foreign keys (`PRAGMA foreign_keys = ON`), WAL journal mode, and atomic transactions.
  - `user-data/items/{id}/`: File-first recovery mirrors for notes (`notes.md`), thoughts (`thoughts.md`), bookmarks (`bookmarks.json`), and reading positions (`reading-state.json`).
  - `user-data/canvases/{id}/`: File-first mirrors for Excalidraw scenes (`canvas.json`) and asset binaries.
  - `user-data/knowledge/`: File-first mirrors for concept graphs and Mermaid diagram definitions.
  - `user-data/app-settings.json`: Atomic JSON file storing global preferences.

### 4.2 Derived Rebuildable Storage
- **FTS5 Search Store:** The full-text search index (`search_index_fts`) is 100% derived from the canonical stores. Deleting the FTS5 tables results in zero user data loss; the index is deterministically rebuilt on demand from SQLite and file-first data.

---

## 5. Desktop Local Service & Inter-Process Communication

### 5.1 Embedded Loopback Service (`electron/desktop-service.mjs`)
- **Binding:** Binds exclusively to IP address `127.0.0.1` (localhost loopback). It does NOT listen on `0.0.0.0`, LAN interfaces, or public interfaces.
- **Port Allocation:** Uses an OS-assigned ephemeral port (`port: 0`), preventing conflicts and fixed-port targeting by external software.
- **Session Authentication:** Generates a 256-bit cryptographically random hexadecimal session token (`randomBytes(32)`). All non-static HTTP requests must include this token in the `X-ReadWatch-Session-Token` header. Unauthorized local processes or browser tabs receive `HTTP 403 Forbidden`.
- **In-Process Operations:** Dispatches requests directly to Node.js stores (`DatabaseSync` SQLite and filesystem APIs) inside the main Electron process. No external servers, background daemons, or child processes are spawned.

### 5.2 Preload Context Bridge (`electron/preload.mjs`)
The renderer window cannot access Node.js APIs directly. Exactly 5 narrow functions are exposed on `window.readWatchDesktop`:
1. `chooseBookFiles(options)`: Triggers native OS file chooser with strict extensions filter (`.epub`, `.pdf`, `.mobi`, etc.). Returns user-selected file descriptors.
2. `chooseDataRoot()`: Triggers native OS directory chooser for selecting `READ_WATCH_DATA_ROOT`. Verifies that the selected folder is outside the Git repository.
3. `getAppPaths()`: Returns application metadata (`version`, `dataRoot`, `libraryRoot`, `isPackaged`). Excludes secrets and tokens.
4. `openExternalHttps(url)`: Validates URL protocol (`http:` or `https:`) and delegates opening to the default OS browser. Rejects all other protocols (`file:`, `javascript:`, etc.).
5. `onOpenFile(callback)`: Registers listener for files opened via Windows Explorer "Open With" or CLI arguments.

---

## 6. Third-Party Software Runtime Inventory

Every production third-party component has been inspected to verify its local execution and network behavior:

| Dependency | Version | License | Runtime Role | Receives User Content? | Network Activity | Execution Location |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Electron** | 35.7.5 | MIT | Desktop runtime shell & native window management | Yes (displays UI) | None (loopback only) | Local desktop process |
| **React / React-DOM** | 19.2.8 | MIT | Declarative UI rendering & state management | Yes (in DOM) | None | Local Chromium renderer |
| **vinext** | 1.0.0-beta.8 | MIT | Server-side rendering & route dispatch | Yes (processes pages) | None | Local Node.js loopback |
| **lucide-react** | 1.31.0 | ISC | Application iconography (pure SVG icons) | No | None | Local Chromium renderer |
| **pdfjs-dist** | 4.10.38 | Apache-2.0 | PDF document parsing & canvas text extraction | Yes (PDF pages) | None | Local web worker / renderer |
| **pdf-lib** | 1.17.1 | MIT | PDF vector manipulation for derivative export | Yes (during export) | None | Local Node.js / renderer |
| **@excalidraw/excalidraw** | 0.18.1 | MIT | Freehand canvas drawing & visual notation | Yes (canvas shapes) | None | Local Chromium renderer |
| **@xyflow/react** | 12.11.6 | MIT | Interactive concept graph node/edge renderer | Yes (graph nodes) | None | Local Chromium renderer |
| **mermaid** | 12.0.0 | MIT | Text-based diagram compilation to SVG | Yes (diagram text) | None | Local Chromium renderer |
| **Foliate-JS** | Vendored | BSD-3-Clause | Reflowable ebook parsing (EPUB, MOBI, CBZ) | Yes (book text) | None | Local Chromium renderer |

### Build-Time vs Production Runtime Distinction
Tooling such as **Vite**, **Wrangler**, **TypeScript**, **oxlint**, and **oxfmt** are utilized exclusively during development and build compilation. They are completely absent from the installed desktop runtime package and never receive or transmit runtime user data.

---

## 7. Network Communication & External Access Measurement

A comprehensive source code and runtime audit was conducted across the production codebase:

1. **Zero Outgoing Background Telemetry:** There are no analytics libraries, crash telemetry SDKs, usage beacons (`navigator.sendBeacon`), or background network pings anywhere in the product.
2. **Zero Remote CDNs / Web Fonts:** All styling, iconography, and font stacks (`Inter`, `Iowan Old Style`, `SFMono`) use local bundles or system-native font fallbacks. There are no `@import url('https://fonts.googleapis.com/...')` or external CDN `<script>` tags.
3. **Zero Unsolicited Network Requests:** The core application operates 100% offline. No network request is initiated during startup, library browsing, document reading, canvas editing, diagram rendering, searching, or preference saving.
4. **User-Triggered External Navigation:** The only external HTTP/HTTPS traffic that can occur is when the user intentionally clicks an external link (such as an external web citation in a note or the official Privacy/Terms link). This is explicitly intercepted by `openExternalHttps` and launched in the user's default system web browser. Read & Watch does not track or log these link clicks.
5. **No Automatic Update Polling:** The current build does not implement silent background update polling. The update section in Settings reflects the application's non-silent update policy.

---

## 8. Web Storage, Cookies, and Clipboard Audit

1. **Cookies:** Read & Watch does **not** set or read any HTTP cookies.
2. **Web Storage (`localStorage` / `sessionStorage`):** Application state is persisted canonically in SQLite and user-data files. Web Storage is not used as a canonical data store.
3. **IndexedDB / CacheStorage:** Not used for user data persistence.
4. **Clipboard Access:** The `navigator.clipboard.writeText` API is invoked **only upon explicit user action** (clicking "Copy" on a selected text snippet in the reader, or clicking "Copy SVG" in the Mermaid editor). Copied text remains strictly in the OS system clipboard and is never transmitted externally.

---

## 9. Desktop Permission & Boundary Matrix

| Capability | Permitted | Architectural Enforcement |
| :--- | :--- | :--- |
| **Read selected publication** | **YES** | User selects file via OS Open File dialog or Windows Open-With |
| **Write source publication** | **NO** | Streams opened read-only; no write API exists |
| **Read selected data root** | **YES** | Validated path outside Git repository |
| **Write inside selected data root** | **YES** | Bounded write operations (`state/`, `user-data/`, `library/`) |
| **Arbitrary renderer filesystem access** | **NO** | Node.js APIs absent from renderer (`nodeIntegration: false`) |
| **Shell execution (`exec`, `spawn`, `cmd`)** | **NO** | Strictly prohibited and absent from main IPC handlers |
| **Arbitrary URL navigation in app window** | **NO** | Window navigation handlers block non-loopback URLs |
| **External browser launch** | **YES (User-only)** | Validated `http:` and `https:` URLs opened via OS shell |
| **Microphone / Camera / Geolocation** | **NO** | Permissions not requested; Chromium permission handlers deny |
| **Multi-instance execution** | **NO** | Single-instance lock forwards arguments to primary instance |
| **Remote crash reporting** | **NO** | Electron `crashReporter` is completely disabled |

---

## 10. Conclusion and Legal Evidence Traceability

This data flow inventory reflects the verified, measured implementation of Read & Watch. Every statement in the user-facing Privacy Policy and Terms & Conditions directly traces to the technical facts documented above:
- Claims of local storage map to SQLite and `READ_WATCH_DATA_ROOT`.
- Claims of zero telemetry map to the measured absence of analytics code and network requests.
- Claims of source immutability map to read-only document adapters and automated SHA-256 regression tests.
- Claims of non-silent updates map to the absence of automated update polling.

## Portable library root, discovery and Raw intake (foundation slice)

Added by the user-authorized portable-library foundation slice. No later slice is
claimed by this section.

**Selected portable library.** The durable library is the selected library folder
itself: `<root>/Read`, `<root>/Watch`, `<root>/Raw`. Runtime-only data stays under
`<root>/App` (`state`, `user-data`, `search`, `ocr`, `backups`, `exports`).
`app/server/data-paths.mjs` exposes `dataRoot`, `readRoot`, `watchRoot`, `rawRoot`,
`runtimeAppRoot`, `stateRoot`, `searchRoot`, `userDataRoot`, the two shared
evidence roots, and the retained legacy `libraryRoot`. Canonical content is never
copied into `App/library`.

**Root validation and initialization.** `app/server/portable-library.mjs`
validates a root (absolute, outside the Git repository, contained, no traversal or
symlink escape) and initializes only the missing of `Read`, `Watch`, `Raw`. It is
idempotent, never overwrites, never moves and never deletes; a file occupying a
required folder path fails with `REQUIRED_FOLDER_PATH_IS_FILE`.

**Discovery.** Canonical titles are `<collection>/<category>/<title folder>/`
containing exactly one Markdown file whose base name equals the folder name.
Approved Read categories are Books, Study Materials, Manuals & Reference,
Documents, Other; approved Watch categories are Anime, Movies, Series,
Documentaries, Specials, Other. `Source Imports`, `Administration`,
`Filesystem_Inventory*`, `Raw Export Records`, shared evidence and audit folders
are excluded. Discovery returns structured diagnostics and never mutates
Markdown, and it does not populate the runtime database.

**Measured against the real library.** 145 Read titles, 74 Watch titles, 219
total, 0 diagnostics — identical before and after initialization. The only
filesystem change was creating the missing empty `Raw/` folder. No `App/state`
directory and no database were created.

**Raw.** Offline intake foundation only: recursive enumeration returning relative
path, byte size and extension, with no hashing on startup, no OCR, no
classification and no network access. Content promotion, the intake form, artwork
enrichment and database/search rebuild remain future slices.

**Privacy mapping.** The selected root is user-chosen and never committed; no
machine-specific path appears in source or tests; committed tests are synthetic
fixtures only; Raw performs zero external requests, which is asserted by a
committed test that inspects the module for any network access.

## Portable runtime rebuild, write-back and derived search

Added by the portable-library rebuild/write-back slice. No later slice is
claimed by this section.

**Data ownership.** For the selected portable library, the canonical durable
record is the title Markdown plus its file-first assets under `Read/` and
`Watch/`. SQLite (`App/state/read-watch.sqlite3`) is the optimized
runtime/query/conflict store and is rebuildable from those records. The FTS5
search tables stay derived and rebuildable. Notes, thoughts, bookmarks,
annotations, canvases and knowledge objects keep their existing file-first or
runtime stores and are not bulk-deleted by a title rebuild. The earlier table in
this document describing SQLite as the canonical library store remains accurate
for the legacy managed-library `App/library` model; the portable model uses
Markdown as the durable record.

**Rebuild path.** `app/server/portable-rebuild.mjs` reuses the single portable
discovery and parser. It validates stable identity, derives the physical
category/path, derives asset descriptors from Markdown paths (Read) and bounded
direct children of the title folder plus `Media/` (Watch), and applies all valid
titles in one transaction. Duplicate stable ids fail closed; a malformed
required identity is isolated and the run is reported `partial`; items absent
from the portable set are retained; a second unchanged rebuild changes nothing.
Migration `002_relax_item_identity.sql` widens the runtime identity check to the
actual portable `read-`/`watch-` plus 8-64 hex format without rewriting ids. A
pre-rebuild runtime database copy is created under `App/backups/` before the
first real rebuild.

**Write-back path.** `app/server/portable-writeback.mjs` validates app-managed
personal fields, detects external Markdown edits by the stored content hash,
refuses same-field conflicts with a structured 409, merges non-conflicting
external edits, stages a temporary file, creates bounded per-title recovery
evidence, opens the SQLite transaction, atomically replaces Markdown, and then
commits. A failed replace rolls the database back and never reports success; a
failed commit restores the previous Markdown or retains an explicit divergence
journal under `App/state/`. Unknown YAML keys, unknown body sections, Unicode,
Arabic, Urdu, apostrophes and ampersands survive; absent personal values stay
absent.

**Search.** After a successful rebuild the existing FTS5 store is rebuilt from
the runtime library projection. Search stays derived and never becomes a second
canonical store. OCR-derived page text remains separate and provenance-tagged;
this slice does not change OCR search semantics.

**Measured real-library result.** 145 Read + 74 Watch = 219 titles, 219 unique
stable ids, 0 duplicate ids, 0 duplicate canonical paths, 0 rebuild errors,
282 derived assets (152 readable), search index reporting 219 library items.
The second rebuild changed 0 items. Read/Watch file counts, byte totals and
Markdown hashes were identical before and after, and 13 sampled source binaries
were byte-identical by SHA-256. No real Markdown was rewritten. A pre-rebuild
database backup was verified by SHA-256 before the mutation.

**Limitations.** Watch media indexing is bounded to direct children of the title
folder and `Media/`; deep trees are not traversed. No external metadata refresh,
artwork download, Raw organization, OCR benchmark, Phase 18 work or platform
certification is claimed by this section.
