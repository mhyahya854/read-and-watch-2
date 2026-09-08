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

Status: Provisional - validate in Phase 01

The likely target is a Read & Watch-owned SQLite database paired with durable file-first export and recovery. Phase 01 must prove schema, transaction, migration, compatibility, backup, and recovery details before migration begins.

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
