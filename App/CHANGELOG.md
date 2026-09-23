# Changelog

## 2026-09-23 - Phase 17 visual corpus and truth-lock continuation

- Independently opened all 16 original private candidate images, verified current source and rendered-image hashes, manually transcribed five visual drafts (including a new English REGION crop), and corrected one visible punctuation defect. All 17 candidates remain DRAFT; zero FINAL, locks, or formal engine runs. One private human-review pack records the remaining exact text and lawful-use confirmations.
- Added one useful REGION candidate from an existing local source page and corrected a visibly low-contrast Urdu sample label. Urdu/English mixed and stronger exact Arabic/Urdu truth coverage remain unresolved.
- Closed a benchmark integrity gap: FINAL now requires a recorded, unchanged REVIEWED draft; FINAL reads recheck their hash; locks verify the actual source, private corpus image, and FINAL truth; locked images and truth cannot be overwritten. LINE import and schema validation now require `line.exactText`.
- Rechecked current hardware, runtime pins, specialist model revision, and upstream code/model/dataset terms. A proposed P17-G002 decision rule and licence-scope options are recorded without approving the gate. Phase 17 remains IN_PROGRESS; P17-T004, P17-T007, and P17-G002 remain OPEN; Phase 18 remains NOT_STARTED.

## 2026-09-23 - Phase 17 final evidence pass; closure remains blocked

- Inspected only metadata and hashes in the application-resolved external OCR benchmark root. Sixteen registered formal candidates (4 English, 4 Arabic, 6 Urdu, 2 English/Arabic mixed) from 10 source hashes exist, but all truth remains DRAFT and none is locked or FINAL; no formal engine run or representative accuracy/performance result exists. All source and sample-image hashes match; source hashes remained unchanged after regression.
- Verified this host has Intel Arc graphics and no NVIDIA CUDA device. The previously proven PP-OCRv5 CPU pin set and specialist short runtime-root repair remain current; the older CPU/MAX_PATH findings are historical. No provider substitution or model download occurred.
- Reconciled current Phase 17 protocol/state wording and recorded the missing lawful-use declarations, representative coverage and acceptance decision rule without inventing thresholds or promoting draft truth. P17-T004, P17-T007, and P17-G002 remain open; Phase 17 is IN_PROGRESS and Phase 18 NOT_STARTED.
- Regression: 627 total / 626 passing / 1 skipped / 0 failing; OCR-targeted 180/180; packaged Read parity 5/5; Read visual 30/30; Watch visual 28/28; typecheck, lint, build, hygiene, governance, and incremental Graphify pass. Ponytail read-only review found no justified code deletion.

## 2026-09-19 - Audit and harden Read study workspace

- **Adversarial re-audit of the Read redesign commit** (`7bedf93`). Every headline claim was re-verified from source, runtime behaviour and persistence; confirmed defects were repaired rather than reported.
- **CRITICAL: annotation ownership was not enforced.** `GET`/`PUT`/`DELETE`/`RESTORE` of `/api/reader/items/:itemId/annotations/:annotationId` looked the annotation up by id alone, so Book A could read, edit, delete or resurrect Book B's annotation. Ownership is now asserted in the annotation store for every one of those operations (404 as if absent), for both the Vite middleware and the packaged Electron service. Batch create binds every row to the route item and refuses a payload naming another book; single create rejects a contradictory payload item; creating an annotation for an unknown item is refused.
- **CRITICAL: recovery could inject cross-book annotations.** A recovery file under `items/<itemId>/annotations.json` was allowed to contain records claiming a different `itemId`. Foreign records are now refused and reported, and the owner is rebound to the file's item.
- **CRITICAL: the reflowable adapter invented a selection.** `getSelection()` returned hard-coded "Software abstractions should reflect natural domain boundaries." when nothing was selected, so a highlight action with no selection created a persistent annotation for text the user never chose. The production adapter now returns `null` (the explicit `setSelection` test seam remains) and the reader reports "select text first".
- **CRITICAL: PDF anchors were fabricated geometry.** `createTextAnchor` stored a full-width 5%-high stripe when it could not resolve the selection, and `pdfTextAnchorFromSelection` did the same. PDF anchors now require real selection rectangles: the adapter computes them from the live selection relative to the rendered page, and both the adapter and the anchor builder fail loudly (creating nothing) when geometry is unavailable.
- **Reflowable anchors no longer forge CFIs.** A CFI-shaped string was manufactured when the engine had none. Anchors now carry `fidelity: 'cfi'` only with a genuine CFI; otherwise they are section-level (spine, offsets when available, quote, context, canonical location). Validation rejects `fidelity: 'cfi'` without a CFI, and historical anchors are never rewritten.
- **Multi-line marks lost every line but the first.** The overlay rendered `rects[0]` only. It now renders every rectangle of the annotation, with one accessible element per mark and the remaining fragments marked as presentation, and a browser assertion requires at least three fragments for a multi-line selection.
- **The annotation overlay was shifted by the pane offset.** Viewport-relative page bounds were assigned directly to an absolutely positioned overlay. Positions are now computed in the overlay's own offset-parent space, and the harness asserts numeric equality with the rendered page in split, after zoom and after rotation.
- **Rotation moved marks.** Normalized coordinates were captured in the rendered (rotated) space. They are now stored in canonical unrotated page space and transformed into the current render space; a 360-degree rotation returns the rendered geometry exactly to its original form. Ink coordinates are clamped to the page.
- **Zoom and rotate never re-rendered the page.** `session.setZoom`/`setRotation` updated the adapter's stored values and the toolbar label without re-rendering, so the document silently stayed at the old scale. The adapter contract gained an optional `refresh()`, implemented by the PDF adapter, and the session now refreshes after view-only changes.
- **The unified Canvas model could drift from the scene.** A single reconciliation helper (`lib/canvas/scene-sync.ts`) now owns the invariants: block rename updates the visual label, block delete removes its visual block/label and every connector touching it, relationship delete removes only its connector, direction changes update arrowheads, relationship labels appear **on** the connector, relationships created before their blocks were placed gain their connector automatically, loaded canvases are healed once, and deleting an app-owned visual element detaches the semantic record instead of leaving a ghost `elementId`. Ordinary freeform drawings are never touched.
- **A reconciliation race silently destroyed new blocks.** The scene-change guard read a stale knowledge ref during the same update cycle and deleted the just-created block elements; the ref is now updated before the scene write, and the editor remounts per canvas so one canvas can never inherit another's document state.
- **Canvas saves could dead-end in a 409 conflict.** After the first successful saves the editor kept sending the stale revision and every later save failed. The single-writer path now adopts the server revision and re-applies the user's current state once, surfacing a real conflict only if that retry also fails; each item also carries the canonical location so the fallback is honest.
- **Item-scope gaps on canvas subroutes.** `links`, `assets` (upload and fetch), `export` and `recover` accepted a canvas id without checking the owning item. All of them now assert ownership, and the client scopes every item-sensitive canvas request.
- **Unified Canvas architecture defect in the selection menu.** The historical "Send to Canvas" action created a detached Excalidraw text card through an unscoped global canvas endpoint. It now creates a real source annotation for the selection and promotes it into the item's Knowledge Canvas as a structured, source-linked block with a visual element, refusing duplicates.
- **Source links used the wrong query parameter.** Generated links used `?annotation=` while the reader resolves `?annotationId=`, so some Canvas-to-source jumps could not focus the annotation. All generators use the canonical parameter, and annotation-promoted blocks keep a canonical location fallback so a source-linked block is never stranded if its annotation is deleted. Legacy graph deep links of every type (annotation, item, location, external) are preserved on import.
- **Note saves reported success on failure.** `saveAnnotationNote` swallowed persistence errors while the UI closed the editor and toasted success. It now resolves only after the server accepted the write and rejects otherwise; the editor stays open with the draft intact and no false success is shown.
- **The study pane (and note drafts) were unmounted by layout changes.** Full-reader mode removed the study pane from the tree. It is now hidden with CSS like the reader pane, so an in-progress note draft survives full/split/minimized transitions.
- **Location canvases invented page numbers for reflowable books** and matched locations by `JSON.stringify`. Labels are now capability-driven (`Page N` for fixed layout, location/section text for reflowable) and location identity uses one canonical key shared by client and server, so key order can no longer hide a canvas. New location canvases require a real current location.
- **Design-constitution regressions fixed:** the purple tooltip icon, two literal `✕` glyphs (now Lucide `X`), the pill-shaped selection toolbar and borderless blur treatment, and pill preset chips were replaced with theme tokens and modest radii; new user-facing copy avoids em dashes.
- Tests: `npm test` reports 624 total / 623 passing / 0 failing / 1 skipped (the single skip is pre-existing). 29 new tests: cross-book annotation GET/PUT/DELETE/RESTORE, batch ownership, recovery ownership, unknown owners, synthetic-selection removal, no-forged-CFI anchors, PDF geometry refusal, document-to-annotation anchor conversion, multi-rect merging, rotation inverse properties, canonical location keys and honest labels, location-scope validation, the full semantic/visual reconciliation matrix (rename, delete, delayed connector, direction, label, orphan detach), promotion provenance and visual placement, legacy deep-link conversion, canvas subroute ownership, canvas owner validation and file-first recovery of semantic/visual bindings. A new parity suite drives the **Electron desktop service over HTTP** against a synthetic data root for the same ownership rules.
- Visual verification: the Read harness was strengthened from 28 to **30 asserted states** and now proves geometry and semantics rather than presence: numeric overlay alignment (split, after zoom, after rotation), a real page-size change on zoom, at least three fragments for a multi-line highlight, 360-degree rotation restoring the original geometry, block rename reflected in the persisted visual label, a named connector whose label is the relationship label, a direction change that adds the start arrowhead, app-owned block/label/connector elements present in the saved scene, Book A/B isolation at both UI and API level, and no annotation created from a reflowable book with no selection. The Watch harness still passes all 28 of its states.
- Governance: Phase 17 remains `IN_PROGRESS`, `P17-T004` remains current and OPEN, `P17-T007` and `P17-G002` remain OPEN, and Phase 18 remains `NOT_STARTED`.

## 2026-09-19 - Per-book Read study workspace and unified Knowledge Canvas

- **Read now has its own study workspace; Watch is unchanged.** Every Read book/document owns its annotations, annotation notes, and Knowledge Canvases, and nothing from Book A can appear in Book B. Watch keeps its existing title-scoped knowledge graph; no Watch behaviour was redesigned.
- **One unified Knowledge Canvas per book, not a graph plus a canvas.** The canvas document was extended with `scope` and structured `knowledge` (blocks + named relationships) instead of adding a Read knowledge graph. No Read `knowledge_graphs` row is created, there is no second React Flow system, and the old empty Read "Highlights"/"Canvas" tabs are gone.
- **Structured knowledge and freeform drawing share one surface.** Blocks carry type/title/body/source, relationships carry arbitrary UTF-8 labels plus directed/mutual direction, and both are persisted in the same document as the Excalidraw scene. Blocks can be placed as real canvas elements with real connectors, and the panel also exposes an accessible list view.
- **Every annotation can have a note, stored inside the annotation.** Notes live in the annotation's own `content_json` (`content.note`) - no new table, no separate notes document. Creating a highlight, editing its note, reloading, and deleting only the note (leaving the mark) are all covered by tests. Notes also work on underline, strike and drawing marks.
- **The reader can actually annotate now.** Highlight, underline and strike creation from a text selection (plus a compact contextual menu and toolbar group), a book-scoped annotation list with type/quote/note/page context, an annotation inspector, jump-to-source, and delete. This closes a real gap: previously the annotation store existed but no reader path ever created an annotation.
- **PDF freehand markup is anchored, not screen-pixel based.** Drawing stores normalized page-relative stroke points and bounds, so a mark survives reload and stays attached to the correct page region when the zoom changes (verified in the browser harness).
- **Three reader layout states.** Split, full and minimized, all preserving book, page/CFI, zoom and annotation state. Minimizing hides the reader pane with CSS rather than unmounting it, because the document adapter renders into a container owned by that pane.
- **Canvas scope: whole book or page/location.** Location scope stores the canonical reader location (PDF page, or the reflowable CFI/section the engine reports), source hash and human label. Multiple canvases of either scope are supported, and the reader toolbar shows how many canvases are linked to the current location.
- **Annotation -> Knowledge Canvas with provenance.** "Add to Knowledge Canvas" inserts a source-linked block (annotation id, book id, page/section label, quote) and refuses to add the same annotation to the same canvas twice. A failed write is reported, never shown as success. Source-linked blocks and annotation entries both lead back to the exact source.
- **Legacy compatibility without destructive migration.** Existing Read canvases appear as book-level canvases (no location is fabricated for them). Existing Read-associated knowledge graphs are listed with *Import into Knowledge Canvas*, which projects nodes/edges into blocks/relationships (labels, direction, bidirectional flags and deep links preserved), records the legacy graph id as provenance, leaves the original untouched, and refuses a second import of the same graph.
- **Primary sidebar cleanup.** `/highlights`, `/knowledge` and `/canvas-notes` are no longer primary navigation now that both collections own their study surfaces. The routes remain for compatibility, deep links, migration and recovery. Settings stays anchored bottom-left.
- **Read library detail has a real Study section** summarising the book's annotations (with notes) and Knowledge Canvases, with jump-to-source links, replacing the previous placeholders that told the user the feature was unavailable.
- **File-first, recovery, export and search all carry the new data.** Scope and structured knowledge live in `canvas.json`/`recovery.json`/history; `recoverCanvasFromExternal` and corrupt-runtime reconstruction restore them; canvas export/import keeps scope, blocks, relationships and ownership; search indexes annotation notes, block titles/bodies and relationship labels with the owning book.
- **Electron parity.** The packaged desktop service now implements the same reader-scoped annotation routes, canvas scope parameters, study summary and legacy-graph import that the Vite middleware exposes. Previously the annotation client called `/api/reader/items/:id/annotations`, which only existed in the dev server.
- **Fixed a canvas save race.** Scene autosave and structured-knowledge saves now serialise through one queue; two overlapping optimistic-concurrency PUTs previously made the second fail with a 409 conflict banner during normal use.
- Tests: `npm test` reports 595 total / 594 passing / 0 failing / 1 skipped (the single skip is pre-existing). 21 new tests in `read-study-workspace` drive the real stores and HTTP middleware: scope persistence and migration, legacy-scope defaults, structured block/relationship persistence with Unicode labels, canvas ownership isolation, annotation notes (create/edit/reload/delete-note-keeps-mark), underline/strike/drawing anchors, cross-book isolation, annotation promotion with duplicate detection, legacy graph import idempotency and non-destructiveness, file-first recovery of scope and knowledge, export/import ownership, search indexing, selection-rectangle normalization, and reader layout transitions.
- Visual verification: a new synthetic-root harness (`App/app/scripts/capture_read_study_workspace.mjs`) captured 28 asserted Read states - PDF open, all three reader layout modes and restore, highlight/underline/strike, note editor and saved note, annotation inspector, freehand drawing plus its reload/zoom survival, new book canvas, book canvas list, page/location canvas, two canvases on one book, structured blocks, a custom Unicode relationship, mutual direction, a placed block with freeform content, annotation promotion, source-linked provenance, Book B isolation, the library Study section, and the cleaned-up sidebar. The existing Watch harness still passes all 28 of its states against the new sidebar and Read tabs.
- Governance: Phase 17 remains `IN_PROGRESS`, `P17-T004` remains current and OPEN, `P17-T007` and `P17-G002` remain OPEN, and Phase 18 remains `NOT_STARTED`. No OCR work, no Read redesign beyond this scope, no Phase 18, no VM certification.

## 2026-09-19 - Audit and harden desktop shell and Watch workspace

- **Adversarial re-audit of the two preceding commits** (`d486d41`, `72976c0`). Every headline claim was re-verified from source, runtime behaviour, persistence, and recovery rather than from the original report or screenshots. Confirmed defects were repaired, not merely reported.
- **Watch title isolation is now enforced at the API, not just hidden in the UI.** `?itemId=` scoping on `GET`/`PUT`/`DELETE` for graphs and diagrams now requires that the record's owner is exactly that item; a legacy/unassigned record is no longer reachable through an item-scoped route, so it can never silently become a title's artifact. The same guard now covers direct canvas open/mutate/delete, and the Electron desktop service received the same semantics as the Vite middleware.
- **Ownership is immutable for ordinary saves.** A graph or diagram update that changes `associatedItemId` is refused with `409`; only backup/restore passes the explicit `allowOwnershipChange` option. Backup, file-first rebuild, and corrupt-runtime staged recovery all restore the same owner (or legacy/unassigned when the owning item no longer exists) instead of reassigning it.
- **Fixed real state-leak and stale-state bugs in the Watch workspace.** Switching Watch A -> Watch B in the same mounted detail panel previously kept the previous title's `activeGraphId`; the workspace is now keyed by title, the active graph id is resolved against the current title's list, and unsaved graph edits prompt before being discarded. Switching Graph 1 -> Graph 2 now actually swaps the editable graph (the canvas is keyed by graph id and its React Flow projection is re-derived from the canonical document).
- **Add Block now opens its editor immediately.** The stale `doc.nodes` closure that made the first edit require a second click has been removed; block creation opens the inspector for the node object that was just created.
- **Multiple relationships are visually distinct, not just stored.** The claimed "curveOffset" multi-edge implementation did not exist. Relationships now use a deterministic routing function (`lib/knowledge/edge-routing.ts`): distinct named handle anchors per relationship in a group, plus alternating bezier curvature beyond four. Two same-direction relationships between one pair and an opposite-direction pair each render, select, and delete independently. Custom UTF-8 labels (including Arabic/Urdu/CJK) and the directed/mutual flags were verified end to end.
- **"Add to Graph" no longer reports success for a failed write.** Promotion checks the HTTP response for 409/404/5xx/network failure, surfaces a calm error, and never marks the highlight as added or switches tool on failure. Already-promoted evidence is detected from the graph's annotation deep links so a reload cannot silently duplicate it.
- **Loading and error states are real.** Graphs, diagrams, and highlights now set a loading flag before their request and show a product-level error state with a retry instead of a console message. A graph/diagram load failure can no longer present an empty workspace as if it were the truth.
- **Global legacy views no longer enumerate Watch-owned artifacts.** `/api/knowledge/summary`, the Knowledge hub, and the global Canvas Notes list exclude Watch-title-owned graphs, diagrams, and canvases while keeping legacy/unassigned and Read-associated content. Read keeps its existing Overview/Thoughts/Notes/Metadata/Media/Links/Highlights/Canvas tabs; no Watch Workspace tab exists for Read.
- **The media preview dialog now resolves through real, tested classification** (`lib/media-kind.ts`) instead of duplicated extension arrays in the component and the tests.
- **DATA-SAFETY REPAIR: the committed screenshot script was unsafe and is gone.** `App/scripts/capture_watch_workspace_screenshots.mjs` contained real library item IDs and titles and created synthetic graphs/diagrams/canvases against the user's actual items. It has been deleted from the active tree and replaced by `App/scripts/capture_shell_and_watch_workspace.mjs`, which builds a synthetic portable library in a temporary root, asserts the intended DOM state before every screenshot, asserts API responses, and cleans up by deleting the entire temporary root. No history rewrite was performed, so the old commit still contains the earlier script.
- **Synthetic residue created by the old script was removed from the real data root.** A read-only audit found three soft-deleted graphs, one soft-deleted diagram, and one still-active canvas created against real library items by the faulty tooling. They were backed up with hashes and identifiers outside Git, removed completely (including mirror files and search state), and the rest of the user library was verified unchanged.
- Applied the project design constitution to the graph: theme-token colours instead of indigo/violet hex values, no purple/neon/glassmorphism, Lucide icons, warmer density.
- Tests: `npm test` reports 574 total / 573 passing / 0 failing / 1 skipped (the single skip is the pre-existing one). The new `watch-workspace-isolation` suite contains 15 tests that drive the real API middleware and stores: cross-title graph/diagram/canvas rejection, legacy non-adoption, ownership-immutability, global-summary filtering, Unicode label and direction persistence, parallel-edge preservation, block-delete cascade, file-first ownership/soft-delete rebuild, backup/restore ownership, search-index single-row ownership, edge-routing determinism, title-switch graph resolution, and highlight-duplicate detection. The corrupt-runtime fixture now also asserts ownership survives staged recovery. The shell-layout file's six tests that simulated local variables or re-implemented component logic were replaced with seven tests: three exercise the real `lib/shell/shell-state.ts` and `lib/media-kind.ts` modules and four are narrow static contracts that a browser-less test can still check honestly.
- Visual verification: `App/scripts/capture_shell_and_watch_workspace.mjs` captured 28 screenshots against a synthetic temporary data root, each gated on an explicit DOM assertion and each capturing a distinct asserted state (only the intentional split-restore round trip repeats a view). Zero screenshots were taken without a verified state, and the temporary root was deleted at the end of the run.
- Graphify (real run on the `App/app` corpus): 272 files detected (268 code / 1 doc / 2 papers / 1 image, ~231,238 words), AST extraction 2449 nodes / 7045 edges, post-build graph 2448 nodes / 6054 edges / 102 communities. The structural diagnostic surfaced a `GRAPH HEALTH WARNING`: 638 dangling-endpoint edges (AST import edges whose module node was not emitted), 0 missing-endpoint edges, 0 self-loops, 337 collapsed directed and 353 collapsed undirected same-endpoint groups. Semantic LLM extraction was not performed because no Gemini/Google API key is configured and this host cannot dispatch the semantic subagents required by the skill; the semantic sidecar was written empty and the graph is explicitly structural-only.
- Ponytail (read-only simplification audit): no new dependency, framework, sidebar, ownership guard, or duplicate scanner. Findings applied - unused exported shell helpers are now wired into the real render path, debug scaffolding was removed from the visual harness, and the duplicated-logic tests were replaced with tests over the real modules. One deliberate duplication (a 10-line items-column probe in two stores) was kept because a shared module would be more code than it removes.
- Governance: stale `RUN_STATE.json` OCR wording corrected (PP-OCRv5 CPU is proven operational on the pinned runtime, and the specialist MAX_PATH problem is fixed). Phase 17 remains `IN_PROGRESS`, `P17-T004` remains current and OPEN, `P17-T007` and `P17-G002` remain OPEN, and Phase 18 remains `NOT_STARTED`.

## 2026-09-18 - Phase 17 OCR readiness: PP-OCRv5 CPU unblock and specialist short runtime root

- Found and verified a working PP-OCRv5 CPU runtime on this Windows host: `paddlepaddle==3.0.0`, `paddleocr==3.3.1`, `paddlex==3.3.13`, `numpy==1.26.4`, `scipy==1.13.1`, `scikit-learn==1.5.2`, `langchain<0.3` and `setuptools`. PaddlePaddle 3.3.1 remains deliberately unused because of its PIR/oneDNN CPU failure.
- Pinned that proven combination in the PaddleOCR provider contract. A single pip resolution with these pins installs a working environment instead of an empty runtime or an incompatible latest PaddleX.
- The shipped Read & Watch `engine_driver.py` loaded the official `PP-OCRv5_server_det` and `arabic_PP-OCRv5_mobile_rec` models and returned real page-recognition output (`HELLO 123 OCR TEST`, confidence `0.9969695210456848`). This is runtime/provider evidence only, not representative benchmark acceptance evidence.
- Managed Paddle runs now set `PADDLE_PDX_CACHE_HOME` under the external data-root model area and set `DISABLE_MODEL_SOURCE_CHECK=True`, so public model files remain outside Git and staged recognition does not trigger an unnecessary network hoster probe.
- Fixed the specialist staged-runtime path blocker by using a short external Python runtime root (`%LOCALAPPDATA%/RW/ocr/runtimes` on Windows, overridable with `READ_WATCH_OCR_RUNTIME_ROOT`) while activation/evidence stay under the selected data root. Existing data-root runtimes remain respected. The fallback is unit-proven with a long synthetic data root; the full 1.3 GB specialist provisioning was not executed in this run.
- Unlimited-OCR remains `BLOCKED BY CURRENT HARDWARE`: this host has Intel Arc graphics and no CUDA-capable NVIDIA device. No CPU fallback, cloud OCR or substitute engine was introduced.
- Representative private real-world corpus with human-validated ground truth remains unavailable, so no P17-T004 acceptance benchmark or P17-G002 gate was executed. The 14-sample synthetic corpus remains plumbing evidence only.
- Tests: `npm test` reports 546 total / 545 passing / 0 failing / 1 skipped. TypeScript, lint, build, repository hygiene and governance validation pass. Real Graphify incremental run: 2,374 nodes / 5,760 post-build edges / 101 communities / 0 unverified, 0 missing/dangling, 0 self-loop and 0 duplicate edges. Semantic extraction remains unavailable because no LLM backend is configured.
- Governance: Phase 17 remains `IN_PROGRESS`, `P17-T004` remains the current incomplete task, `P17-T007` and `P17-G002` remain open, and Phase 18 remains `NOT_STARTED`.

## 2026-09-18 - Library integrity diagnostics

- Added a read-only `GET /api/library/integrity` endpoint, exposed through both the Electron desktop service and the Vite development middleware, using one shared helper in `app/server/library-state.mjs`.
- The diagnostic reports sanitized mirror presence/validity, saved-view and relationship counts, semantic file/runtime parity and the existing recovery status. It never exposes saved-view names or definitions, relationship records or item IDs, absolute paths, hashes, journal contents or stack traces.
- Parity is semantic, not count-only: saved-view and relationship classes are compared through the normalized state machinery, so equal counts with different content are reported as `MISMATCH`.
- Missing mirror reports `MIRROR_MISSING` and does not create the file. Malformed mirror reports `RECOVERY_REQUIRED` without rewriting it. Database unavailability surfaces the existing recovery state instead of duplicating corrupt-runtime logic.
- Added a compact Library Integrity subsection to Settings -> Portability & Backup with healthy, mismatch, missing-mirror and recovery-required states, a non-blocking loading state, a factual request-failure state and a Retry reconciliation button that calls the existing `POST /api/library/recovery/retry` route. There is no polling, watcher, background monitor, telemetry or new recovery path.
- Updated the existing restore summaries minimally so backup/restore UI now reports saved views and relationships alongside annotations, bookmarks, notes and canvases.
- Tests: `npm test` reports 545 total / 544 passing / 0 failing / 1 skipped. The new `library-integrity` suite covers exact-match healthy state, semantic mismatches with equal counts, file/runtime count divergence in both directions, missing mirror, malformed mirror, database unavailability, empty 0/0, complex definitions, external relationship targets, repeated read-only diagnostics, API privacy exclusions, no database or mirror mutation, and retry through the existing recovery route.
- UI verification used a synthetic temporary root and headless Chrome at desktop width. Healthy, mismatch and recovery-required Settings states rendered correctly in Portability & Backup; the real library was not modified.
- Real-library validation was read-only: mirror present, valid, 0 saved views and 0 relationships in both file and runtime, parity matching, recovery `HEALTHY`, diagnostic duration in the low-millisecond range, no portable Read/Watch scan, no SQLite rebuild, no FTS rebuild and no state mutation.
- Gates: TypeScript, lint, production build, repository hygiene, governance validation and a real Graphify incremental update all pass. Graphify structure: 2,373 nodes, 5,758 post-build edges, 96 communities, 0 unverified nodes, 0 missing/dangling endpoints, 0 self-loop edges and 0 duplicate edges. Semantic extraction remains unavailable because no LLM backend is configured. Ponytail review found one read-only helper, one endpoint and one small Settings subsection, with no diagnostics framework, telemetry, polling, watcher, event bus, dependency or second recovery route.

## 2026-09-18 - File-first saved views and relationships

- Added `App/user-data/library-state.json` as the durable file-first record for library-level saved views and relationships. SQLite `saved_views` and `relationships` are now runtime projections, not independent masters. The file uses schema version 1, deterministic serialization, stable IDs, saved-view definitions/revisions/timestamps and full relationship records including external targets, direction, position and provenance.
- `libraryStore.saveView(...)` and `libraryStore.addRelationship(...)` now stage and atomically replace the durable file first, project the same state into SQLite inside a transaction, verify DB/file parity, and only then commit. A failed database transaction restores the previous file or uses the existing recovery-required marker if compensation also fails. A hard kill after file replacement but before SQLite completion leaves the durable file winning on the next startup.
- Added one-time healthy migration: when the mirror is absent, the runtime tables are validated and written to `library-state.json` once, including the empty 0/0 state. When the file exists, matching state returns `HEALTHY` without rewriting; empty or stale runtime tables are reconciled from the durable file. Malformed state or missing internal references enter `RECOVERY_REQUIRED` without overwriting the file or fabricating targets.
- Corrupt-runtime disaster recovery now restores saved views and relationships from the durable file after portable title reconstruction. With an initialized mirror, a completely unreadable runtime database recovers the full audited user-state set without the former `PARTIAL` limitation for these classes. Pre-mirror installations without the file keep best-effort salvage and honest partial compatibility.
- Backup/restore keeps schema v1 and adds an optional backwards-compatible `libraryState` section. The manifest carries saved-view/relationship member counts and a `libraryStateSha256` checksum. Old v1 backups without the section remain valid. Restore uses stable IDs, preserves existing conflict semantics, is idempotent on repeated restore, and warns instead of fabricating missing relationship targets.
- Tests: `npm test` reports 534 total / 533 passing / 0 failing / 1 skipped. New `library-state` coverage includes empty and non-empty migration, complex external/undirected/provenance relationships, stale-DB reconciliation, malformed-mirror recovery, duplicate-ID/name and missing-reference validation, saveView revision behavior, relationship mirror parity, hard-crash reconciliation, commit-failure compensation, backup checksum coverage, backup round trip and repeated-restore idempotence. The full synthetic corrupt-runtime fixture now asserts exact saved-view and relationship parity and no partial limitation.
- Real-library migration was non-destructive: 0 saved views and 0 relationships in the healthy runtime database, a valid matching 0/0 durable mirror that was not rewritten, `HEALTHY` in 9 ms with no portable-root scan, SQLite rebuild or FTS rebuild, and no canonical Markdown or sampled source binary changes.
- Gates: TypeScript, lint, production build, repository hygiene, governance validation and a real Graphify incremental update all pass. Graphify structure: 2,359 nodes, 5,709 post-build edges, 99 communities, 0 unverified nodes, 0 missing/dangling endpoints, 0 self-loop edges and 0 duplicate edges. Semantic extraction remains unavailable because no LLM backend is configured. Ponytail review found one compact durable file, one focused helper, no per-view/per-relationship files, no second runtime model, no second recovery coordinator, no new dependency, no watcher, no daemon and no parallel journal framework. No OCR benchmark, Phase 18/19 work or platform certification was started.

## 2026-09-18 - Corrupt runtime SQLite disaster recovery

- Extended startup recovery so a genuinely unreadable or unusable `App/state/read-watch.sqlite3` is reconstructed through one focused helper instead of stopping at `RUNTIME_DB_UNUSABLE`. A readable database with a newer unsupported schema still returns `RUNTIME_SCHEMA_UNSUPPORTED` and is never quarantined or replaced.
- The full SQLite family (`read-watch.sqlite3`, `-wal`, `-shm`, `-journal`) is copied byte-for-byte to `App/backups/corrupt-runtime/<timestamp>/` and verified by size and SHA-256 before any quarantine or activation. A private manifest records relative location, size, hash, capture time, reason and best-effort schema state. Captures are bounded to the newest five, the newest/only capture is never deleted, and failed recoveries are not pruned.
- A replacement database is built at `App/state/read-watch.sqlite3.recovery-<timestamp>.staging`. Portable titles are rebuilt through the existing scanner/parser/rebuild path; annotations, canvases and canvas assets, knowledge graphs, Mermaid diagrams, notes and thoughts are reconstructed from file-first recovery files. Bookmarks, reading state, settings and reader settings remain file-first and untouched. Search is rebuilt from staged canonical state through the existing FTS store.
- Canvas link mutations now mirror links into `canvas.json`, and canvas asset rows can be recovered from the existing asset files through `recoverCanvasAssetsFromExternal`, so the canvas recovery substrate is genuinely file-first.
- Staged validation requires `PRAGMA quick_check`, `PRAGMA integrity_check`, foreign-key validation, supported `user_version`, expected tables, unique portable IDs and paths, and an application-level catalog/reader/search smoke test. Only then is the original family quarantined and the staged database atomically activated. Activation failure restores the original where possible and returns `CORRUPT_RUNTIME_ACTIVATION_FAILED`.
- `saved_views` and `relationships` are the only DB-only runtime classes audited. They are best-effort salvaged when the corrupt database is readable; otherwise recovery returns an explicit `PARTIAL` result with the limitation disclosed, while preserving the forensic capture. A non-empty legacy `App/library/catalog.json` blocks automatic recovery because the legacy importer is not part of this path.
- Tests: `npm test` reports 521 total / 520 passing / 0 failing / 1 skipped. The new `corrupt-runtime-recovery` suite covers random-byte and truncated databases, WAL/SHM family preservation, backup failure and backup hash mismatch, duplicate portable IDs, malformed annotation/canvas/knowledge recovery files, newer readable schemas, the healthy fast path, staged integrity/foreign-key/search/activation failures, and second-startup idempotence. A full synthetic fixture proves semantic parity for portable titles, annotations, canvas links and assets, knowledge graphs, Mermaid diagrams, notes, thoughts, bookmarks, reading state and settings.
- Real-library validation was non-destructive: 145 Read, 74 Watch, 219 total, 219 unique IDs, 219 search records, no journal, no recovery marker, no corrupt-runtime backup, `HEALTHY` in 6 ms with no portable-root scan, rebuild or FTS rebuild. Runtime database hash, Read/Watch Markdown hashes and thirteen sampled source binaries were unchanged. The real library currently has no file-first user-state substrates; the all-class path is proven synthetically.
- Gates: TypeScript, lint, production build, repository hygiene, governance validation and a real Graphify incremental update all pass. Graphify structure: 2,318 nodes, 5,568 post-build edges, 97 communities, 0 unverified nodes, 0 missing/dangling endpoints, 0 self-loop edges and 0 duplicate edges. Semantic extraction remains unavailable because no LLM backend is configured. Ponytail review found no second recovery framework, duplicated SQLite backup logic, duplicated file-first reconstruction logic, new dependency, background daemon, watcher or parallel journal format; the one focused helper and the existing store recovery APIs are reused. No OCR benchmark, Phase 18/19 work or platform certification was started.

## 2026-09-18 - Portable startup recovery and write-back journal reconciliation

- Added `app/server/portable-recovery.mjs`: one startup recovery coordinator over the existing scanner, parser, rebuild and write-back contracts. It performs a cheap healthy inspection, reconstructs runtime SQLite from portable Markdown only when the database file, runtime schema or portable projection is missing or empty, and rebuilds the existing derived FTS index.
- Added defensive `portable-writeback-journal.json` reconciliation. Prepared journals are compared by current Markdown hash, `previousSha256`, `stagedSha256` and the runtime portable `markdown_sha256`. Stale journals are archived and cleared; filesystem-versus-database disagreement rebuilds runtime from the durable Markdown, verifies it, then archives and clears the journal; an unexpected third hash, ambiguous divergence, malformed JSON, unknown code, invalid stable id, path escape, missing Markdown or invalid hash enters `RECOVERY_REQUIRED` with the journal preserved.
- `PORTABLE_DIVERGENCE` is handled conservatively. The archive is never restored over current Markdown. Runtime is reconciled from the current filesystem only when the current Markdown is valid, its stable identity matches and the existing rebuild plan is unambiguous.
- Recovery now runs before the desktop service begins listening. `createDesktopService(...).start(...)` awaits startup recovery before `server.listen(...)`, and the Electron `main.mjs` lifecycle still uses the same single `service.start(...)` call. Vite runs the same recovery coordinator before creating its library/search stores.
- Added `GET /api/library/recovery` and `POST /api/library/recovery/retry` plus a calm library-page recovery notice. The UI shows the recovery state only when human recovery is required and never exposes stack traces, machine paths or journal contents.
- Portable title metadata write-back is blocked with HTTP 503 and `PORTABLE_RECOVERY_REQUIRED` while an active journal or the bounded `App/state/portable-recovery-required.json` marker exists. Reading and browsing remain available when the runtime database can be opened.
- Tests: `npm test` reports 510 total / 509 passing / 0 failing / 1 skipped (this Windows account cannot create symlinks). The new `portable-recovery` suite covers the healthy fast path, missing and search-only runtime rebuild, all five Prepared journal outcomes, safe and ambiguous divergence, malformed JSON, traversal, invalid stable id, unavailable root, duplicate ids, malformed title identity, warning-only evidence, canonical preservation, second-startup idempotence, mutation blocking, and recovery-before-request ordering.
- Real-library validation: 145 Read, 74 Watch, 219 total, 219 unique stable ids, 219 searchable library records, no journal and no recovery marker. Startup returned `HEALTHY` with `portableRootScanned: false`, `rebuildApplied: false`, `searchRebuilt: false` in 5 ms. Runtime database hash, Read/Watch Markdown hashes and thirteen sampled source binaries were unchanged. The three missing recommendation-evidence references remained warning-level diagnostics.
- Gates: TypeScript, lint, production build, repository hygiene, governance validation, real Graphify incremental update (2,285 nodes / 5,435 edges / 96 communities, 0 unverified, 0 dangling, 0 self-loop, 0 duplicate) and Ponytail review all pass. Semantic Graphify extraction remains unavailable because no LLM backend is configured. Ponytail removed duplicated reconciliation branches in the same run.
- Governance unchanged: Phase 17 remains `IN_PROGRESS`, `P17-T004` remains current, `P17-T007` remains open, Phase 18 and Phase 19 remain `NOT_STARTED`, and no OCR benchmark or platform certification was started.

## 2026-09-18 - Portable library runtime rebuild and safe Markdown write-back

- Added `app/server/portable-rebuild.mjs` and `scripts/rebuild-portable-library.mjs`: a dry-run or `--apply` rebuild that discovers canonical titles with the existing scanner, parses them with the existing parser, validates stable identity, derives physical category/path and asset descriptors, and applies all valid titles in one SQLite transaction. Duplicate stable ids fail closed; a malformed required identity is isolated as a `partial` diagnostic; items absent from the portable set are retained; a content hash makes an unchanged rebuild a no-op.
- Added `app/server/portable-writeback.mjs` and wired it into the library item save path: app-managed personal fields (`status`, `favorite`, `personal_rating`, dates, tags, progress) plus title/type/people/series/Overview prose are validated, merged against external Markdown edits, staged, atomically written, and committed with SQLite. Same-field external edits return a structured 409 conflict. A failed Markdown replace rolls the database back and never reports success; a failed commit restores the previous Markdown or retains an explicit divergence journal.
- Added migration `002_relax_item_identity.sql` and `app/server/runtime-schema.mjs`. The runtime schema now accepts the actual portable `read-`/`watch-` plus 8-64 hex identity format without rewriting any existing id; the packaged runtime uses a drift-tested embedded snapshot of the canonical migrations.
- Connected the existing derived FTS5 search store to the rebuilt library; search remains derived and rebuildable, and OCR-derived search provenance is unchanged.
- Added the portable runtime route to both the Vite middleware and the Electron desktop service (`POST /api/library/rebuild`), portable asset serving alongside the legacy library root, and portable-aware reader resolution.
- Fixed two real parser defects found by the real-library audit: `files`/`media` sibling metadata (`format`, `size`, `sha256`) was mistaken for asset paths, and legitimate shared `Source Imports` evidence paths were rejected by containment checks. Both are covered by tests.
- Tests: `npm test` reports 488 total / 487 passing / 0 failing / 1 skipped (this Windows account cannot create symlinks). Added `portable-rebuild`, `portable-writeback`, and `runtime-schema` suites covering fresh rebuild, Read/Watch ingestion, category derivation, stable ids, rename/category moves, duplicate-id rejection, malformed identity isolation, unknown YAML/body preservation, Unicode/Arabic/Urdu, CRLF, personal-field validation, external-edit conflicts, failure compensation, idempotence, search rebuild and source-binary immutability.
- Real-library validation: 145 Read + 74 Watch = 219 items, 219 unique stable ids, 0 duplicate ids/paths, 282 derived assets (152 readable), search index at 219 library items, second rebuild changed 0 items. The pre-rebuild runtime database was backed up and hash-verified first; Read/Watch file counts, byte totals and Markdown hashes and 13 sampled source binaries were unchanged. No real Markdown was rewritten; the real write-back path was exercised with an unchanged no-op.
- Honest limits: Watch media indexing is bounded to direct children of the title folder and `Media/`; no external metadata refresh, artwork download, Raw organization, OCR benchmark, Phase 18 work or platform certification was started. Phase 17 remains `IN_PROGRESS` with `P17-T004` current and `P17-T007` open.

## 2026-09-17 - P17-T005: Nastaliq specialist runtime, Urdu dual-engine orchestration, reading order, and OCR reader search

- **Governance wording corrected (no task reopened or renumbered).** P17-T002 now reads "build the OCR benchmark corpus framework, lawful/private corpus workflow, ground-truth protocol, schemas, scoring utilities, and synthetic validation corpus" and stays COMPLETE; P17-T004 now reads "populate/use representative lawful private real-world samples and run measured engine benchmarks sufficient for evidence-based acceptance" and stays INCOMPLETE. `DECISIONS.md` D-055, `MASTER_PLAN.md`, `PROJECT_STATE.md`, `RUN_STATE.json`.
- **The mandatory Urdu Nastaliq specialist now runs.** New `provider-urdu-nastaliq.mjs` (provider id `urdu-nastaliq-trocr`, upstream `qandeelasim13/urdu-ocr-trocr-si26`, revision `a9ef072320b50014f6df7ed9db807810157a410e`), a Hugging Face revision resolver, transactional staging/verification/hash-recording hooks (`specialist-provisioning.mjs`), and real LINE recognition in the shipped `engine_driver.py` (`recognize_line`). `integrationStatus` is `INTEGRATED`; the engine is LINE-only and refuses PAGE/REGION with `UNSUPPORTED_UNIT`.
- **Real specialist smoke test (SMOKE TEST ONLY, not benchmark evidence).** The shipped driver loaded the exact pinned revision on CPU with Python 3.12.10, torch 2.14.0+cpu, transformers 5.17.0, and executed a synthetic line fixture successfully (16,739 ms total, no CUDA). `model.safetensors` (1,335,747,032 bytes) matched the published upstream sha256 exactly. Artifacts: `READ_WATCH_DATA_ROOT/ocr/evidence/smoke/`.
- **Weights are never bundled or committed.** The model is downloaded by the user-initiated update path into `READ_WATCH_DATA_ROOT/ocr/models/urdu-nastaliq-trocr/<revision>/`, hash-verified, and only then activated. No installer, Git tree, or test contains weights; a test enforces this.
- **Urdu dual-engine orchestration with no fallback semantics.** New `urdu-pipeline.mjs`: PP-OCRv5 detection + recognition plus per-line specialist recognition keyed to the same page/region/line identities, both outputs preserved independently, disagreement recorded as review evidence with no winner, `COMPLETE` withheld unless every mandatory engine completes, `PARTIAL_ENGINE_FAILURE` when one does not, `BLOCKED` when none can run, and cancellation that is never reported as complete.
- **Deterministic reading order (`reading-order.mjs`) and line segmentation (`line-segmentation.mjs`).** Geometry-based column grouping, script-direction-aware in-band ordering, headings before body, captions after their band, footnotes after the main flow, stable `pageId/regionId/lineId` identities, and named ambiguity warnings instead of invented confidence. PP-OCRv5's own detection boxes supply line geometry, so no extra detector was added.
- **Derived OCR search is wired into the reader.** New `ocr-search.mjs`, `GET /api/ocr/search`, `POST /api/ocr/recognize/urdu`, and reader search integration: `NATIVE_TEXT` and `OCR_DERIVED` hits are distinguished, pages with usable native text are never duplicated from OCR, Urdu provider outputs are indexed independently with both provenances preserved, Arabic keeps tashkeel in displayed text while matching folds marks, and invalidation follows source hash, engine revision, model revision, settings, line-segmentation revision, reading-order revision, and Urdu pipeline revision.
- **Real defects fixed.** Windows OCR pipes now pin UTF-8 (Arabic/Urdu text was otherwise re-encoded by the legacy code page); the specialist tokenizer is instantiated explicitly because newer transformers majors cannot auto-resolve this repository's tokenizer config; the managed-provider composition no longer freezes `version`/`modelRevision` into nulls (which had silently disabled revision-based cache invalidation); staged-update failures preserve their specific structured state instead of flattening into a generic update failure.
- **Settings.** The existing OCR section lists the specialist, its model licence and redistribution posture, its recognition unit, and an Urdu block that states both required engines and reports Urdu as Complete / Partial / Not installed rather than claiming completion from one engine.
- **Tests: 337 -> 406 passing, 0 failing** (`npm test`). New suites: `ocr-reading-order` (13), `ocr-line-segmentation` (7), `ocr-specialist-provider` (14), `ocr-urdu-dual-engine` (14), `ocr-urdu-cancellation` (3), `ocr-derived-search` (15), `ocr-search-http-and-safety` (6). No test was weakened; one stale assertion that the specialist is `NOT_INTEGRATED` was updated to the new, evidenced `INTEGRATED` state.
- **Honest limits.** No accuracy, CER, WER, speed, or VRAM figure is claimed; the smoke test is not benchmark evidence. P17-T004 and P17-T007 remain open, Phase 18 remains `NOT_STARTED`, no platform certification was started, and the staged specialist runtime cannot be provisioned on this host while `LongPathsEnabled = 0` (reported as `UNSUPPORTED_PLATFORM`).

## 2026-09-17 - P17-T002: OCR benchmark corpus, ground-truth protocol, and mandatory multi-engine Urdu

- Recorded the explicit user decision that Urdu OCR is a **mandatory multi-engine pipeline**: PP-OCRv5 Arabic-script recognition AND the dedicated Nastaliq specialist `qandeelasim13/urdu-ocr-trocr-si26`, both required, both raw outputs preserved. There is no fallback chain, no backup engine, no automatic substitution, and no majority-vote truth; a mandatory engine that is unavailable produces a structured failure state instead of a substitute (`DECISIONS.md` D-054).
- Published `docs/project/OCR_BENCHMARK_PROTOCOL.md`: privacy boundary, lawful sourcing, corpus categories, sample identity, manifest schema, ground-truth states, mandatory-provider policy, Arabic three-family metrics (huroof / tashkeel / fully vocalised), per-engine Urdu metrics and disagreement records, the line-level Nastaliq contract with the specialist's documented limits, mixed-language pages, layout/reading-order truth, provenance binding, completion states, and acceptance limitations.
- Added the benchmark foundation in `App/app/server/ocr/benchmark/`: schema and manifest validation, deterministic Unicode comparison rules, transparent scoring utilities, run/group records with `COMPLETE`, `PARTIAL_ENGINE_FAILURE`, `BLOCKED`, `REVIEW_REQUIRED`, and `MACHINE_TRANSCRIBED`, the hash-bound private corpus store, a font-coverage-checking offline renderer, and the synthetic-corpus builder.
- Added the private corpus layout under `READ_WATCH_DATA_ROOT/ocr/benchmark/` (corpus, ground-truth, manifests, per-engine runs plus combined, reports, temp, fonts). The store refuses to create it inside the repository, and no corpus image, real ground truth, font, or model is committed.
- Authored and actually rendered a 14-sample lawful synthetic starter corpus with lawfully redistributable OFL-1.1 fonts whose sha256 and glyph coverage are verified before rasterising (Noto Nastaliq Urdu for Urdu, Noto Naskh Arabic for Arabic, Noto Sans for English), using headless Chromium with DNS refused. The corpus proves plumbing only and is not acceptance evidence.
- Added `App/app/scripts/render-benchmark-fixtures.mjs` and `App/app/scripts/import-benchmark-sample.mjs` (private sample registration from a lawful source with an editable, human-authored ground-truth draft; the tool never invents ground truth).
- Registered the specialist's verified provenance and honest limits: model revision `a9ef072320b50014f6df7ed9db807810157a410e`, Apache-2.0 model card, no licence file in the project repository, training data including CC BY-NC-SA 4.0 material, upstream-reported CER 0.52 and character accuracy 47.66%, single-line intended input, `integrationStatus: NOT_INTEGRATED` — so Urdu recognition is explicitly incomplete in this build.
- Governance: `MASTER_PLAN.md` Phase 17 now carries the mandatory Urdu dual-engine rule and P17-T002 is checked; P17-T004 is the next incomplete task; Phase 18 remains `NOT_STARTED`.
- Tests: 303 -> 337 passing (`npm test`). 34 new P17-T002 tests cover all 38 required cases, including Urdu dual-engine enforcement, refusal of single-engine completion, preservation of partial output when one engine fails, refusal of engine substitution, disagreement without a winner, ground truth as the correctness authority, line-level specialist identity, and no-fallback-semantics checks.
- Honest limits: no OCR engine has been benchmarked (P17-T004 outstanding); synthetic fixtures are not representative of real books; English (no CUDA device) and PP-OCRv5 (Paddle 3.3.1 PIR/oneDNN CPU failure) real-engine execution remain blocked on this host. No accuracy, speed, CER, or WER figure is claimed for any engine.

## 2026-09-17 - Phase 17 OCR foundation, authorised providers, and transactional engine updates

- Corrected the durable sequencing by explicit user authority: Phase 16 (Windows baseline) then Phase 17 OCR foundation then Phase 18 OCR verification, and only then the four cross-platform certification stages (Windows regression, Arch Linux, Ubuntu LTS, macOS) followed by final release certification. The permanent Windows/Linux/macOS requirement is unchanged and the historical Windows Stage 1 certification is preserved.
- Forked both authorised upstream engines under the project GitHub account without source modification: `mhyahya854/Unlimited-OCR` and `mhyahya854/PaddleOCR`. Both forks currently track upstream `main` at the same commit as official upstream head.
- Added a Read & Watch-owned OCR provider contract (`App/app/server/ocr/ocr-contract.mjs`) with structured capability states and explicit language routing: English to Baidu Unlimited-OCR, Arabic and Urdu to PaddleOCR PP-OCRv5 Arabic-script recognition. No engine substitution and no fabricated capability.
- Added the usable-native-text decision gate (`native-text-gate.mjs`) so pages with usable embedded PDF text never invoke OCR.
- Added a supervised OCR runtime boundary (`runtime-bridge.mjs`) that keeps Python engine packages out of the Node/Electron dependency tree, enforces a per-session token, supports in-band cancellation and timeouts, and guarantees teardown so no orphan runtime survives app shutdown.
- Added the canonical OCR result schema and derived, source-hash-bound cache (`ocr-store.mjs`) plus Arabic text representations (`text-representations.mjs`): `rawText` untouched, `displayText` preserving harakat without Unicode reordering, `searchText` as a separate diacritic-insensitive index key.
- Added a transactional engine update manager (`update-manager.mjs`): stage, integrity-verify, health-check and smoke-test in isolation, validate the adapter contract, then atomically switch a portable activation pointer; failed updates keep the working revision, and rollback restores the previous one.
- Added an OCR section to Settings with per-provider status, installed and model revisions, hardware/runtime notes, install, check for update, update, rollback, and update-all, plus an explicitly marked selectable OCR text overlay for pages without native text.
- Added the Read & Watch-owned Python engine driver (`server/ocr/driver/engine_driver.py`) as the only place upstream OCR Python APIs are touched. It makes no network call during recognition; user documents are never uploaded anywhere.
- OCR is off by default and every OCR artifact lives under the external data root; no model weights, runtimes, page images, or OCR output are committed.
- Tests: 297 -> 303 passing (`npm test`). New suites cover routing, the native-text gate, tashkeel preservation, source immutability, cache invalidation, update staging/activation/rollback, corrupted-download rejection, cancellation, no-orphan shutdown, offline-only recognition, provenance, settings-reset data safety, and the OCR HTTP surface.
- Honest limits carried forward: real-engine smoke verification for Unlimited-OCR is BLOCKED BY CURRENT HARDWARE (no CUDA device on this host, matching upstream's documented NVIDIA-only inference path); benchmark corpus, accuracy metrics, and the reader-side merge of OCR text into book-local search remain outstanding as P17-T002, P17-T004, and P17-T007. No accuracy, speed, VRAM, CER, or WER figure is claimed.

## 2026-09-17 - Windows Cross-Platform Desktop Certification (30/30 Invariants Passed)

- Completed formal Stage 1 cross-platform contract certification for Windows desktop inside a clean, isolated reference VM (`ReadWatch-Windows-CrossPlatform-30`, Windows 11 Pro 64-bit Build 26200.5050 in Oracle VirtualBox 7.2.18).
- Achieved **100% PASS (30/30 Invariants Passed, 0 Failures)** in automated guest suite execution (`192 seconds` runtime).
- Packaged and verified canonical NSIS installer `Read & Watch Setup 0.1.0.exe` (252,674,455 bytes, SHA-256 `E2A9F16EC02214B50479AF89BDB7ED2DE5FA78C203A3C27D5F4DE181E9793F09`, Git commit `ada8b20205cfe3e51e461b0bc6e249e9b14d7408`).
- Verified all 30 invariants across 10 categories: Canonical Source Provenance, Artifact Integrity, Clean Silent Installation, Cold Launch Autonomy, No Repository Dependency, No Dev-Server Dependency, No External Node Daemon, Process Tree Conformance, Loopback Service Isolation, PDF Engine Functionality, Reflowable EPUB Functionality, Annotation Persistence, Bookmark Persistence, Notes and Thoughts Persistence, Canvas Functionality, Knowledge Graph Functionality, Strict Mermaid Diagram Rendering, Library Metadata Search, Global FTS5 Study Search, Settings Persistence, Settings Reset Data Safety Hard Gate, In-App Privacy Route, In-App Terms Route, OS File Associations ("Open With"), Single-Instance Forwarding, Offline Core Guarantee, Tamper-Evident Backup, Deterministic Restore, Source Immutability (bit-identical book fixtures), and Uninstall User Data Retention.
- Resolved key runtime and headless automation edge cases:
  - Bypassed host network SYN drop timeouts by switching to direct host-side VHD physical sector extraction (`extract_30point_evidence.py`).
  - Addressed Windows 11 App Install Control / SmartScreen headless interception via direct Win32 `CreateProcess` (`UseShellExecute = $false`).
  - Eliminated NSIS uninstaller mutex collision during silent reinstall via `_?=$installDir` in-place execution and process cleanup.
  - Factored shared portability constants and schemas into pure ESM `server/portability-schema.mjs` for standalone production execution.
- Extracted and archived 33 authentic evidence artifacts in `READ_WATCH_DATA_ROOT/cross-platform/windows/evidence/`.
- Authored formal certification report: `docs/project/reports/WINDOWS_CROSS_PLATFORM_CERTIFICATION.md`.
- Updated governance ledger: `docs/project/CROSS_PLATFORM_DESKTOP_CERTIFICATION.md` and `PROJECT_STATE.md`.
- Next target in pre-Phase-17 platform sequence: Stage 2: Arch Linux (`NOT_STARTED`). Phase 17 (OCR Foundation) remains strictly sequenced behind all platform gates.

## 2026-09-15 - Phase 16 performance, security, and reliability hardening

- Established frozen performance, reliability, and security benchmark budgets in `docs/project/HARDENING_BENCHMARKS.md`.
- Generated reproducible synthetic benchmark datasets (151, 1,000, and 5,000 items; 100-page PDF) in external disposable storage outside Git (`READ_WATCH_DATA_ROOT/hardening/phase-16/benchmarks/`).
- Measured and eliminated N+1 relational query loops in `server/library-store.mjs` via chunked batch fetching (`IN (?, ?, ...)`) across 6 auxiliary relational tables (properties, tags, assets, relationships, people, series):
  - 151 items: 123.72ms -> 6.40ms (19.3x speedup).
  - 1,000 items: 856.45ms -> 23.84ms (35.9x speedup).
  - 5,000 items: 4,336.08ms -> 132.08ms (32.8x speedup, beating the 500ms budget).
- Optimized FTS5 search statement preparation with lazy cached statement reuse in `server/search-store.mjs`.
- Security boundary hardening across desktop service and portability layers:
  - Loopback service validation (`electron/desktop-service.mjs`): strict `Host` and `Origin` whitelist rejection (403 Forbidden for non-local origins).
  - Content Security Policy (CSP): injected strict `DESKTOP_CSP` headers (`default-src 'self' 'unsafe-inline' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws:;`).
  - Session token authentication: required `X-ReadWatch-Session-Token` on sensitive desktop endpoints (`/api/desktop/resolve-open-file`).
  - Sanitized 500 server error responses with zero private filesystem path leaks.
  - Hardened path traversal defenses (`safeLibraryFile` in `desktop-service.mjs` and `assertSafePath` in `lib/portability/validation.ts`) with reparse point resolution (`realpathSync`), Alternate Data Stream (`:`) rejection, Windows device name defense (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`), and percent-encoded sequence blocking.
  - Strict regex containment (`^[a-zA-Z0-9_-]+$`) on canvas identifiers in `server/canvas-store.mjs`.
- Added tamper-evident backup verification with cryptographic SHA-256 payload checksum validation (`verifyBackupChecksums`) in `server/portability-store.mjs` for preflight and restore.
- Expanded automated regression suite with `tests/malformed-and-fault-injection.test.mjs` (7 tests), expanding total test coverage to 229 passing tests across 32 suites.
- Completed comprehensive dependency, license, and reachability audit (`docs/project/UPSTREAM_AND_LICENSE_LEDGER.md` and `docs/project/TECHNOLOGY_LEDGER.md`): 100% permissive runtime dependencies (MIT, Apache-2.0, ISC) with zero copyleft contamination.
- Validated reproducible build and Windows desktop packaging: `npm run build` and `npm run desktop:pack` producing `dist-electron/win-unpacked/Read & Watch.exe` (201,233,408 bytes, SHA-256 recorded in external ledger).
- Authored Phase 16 Graphify AST audit (`docs/project/reports/PHASE_16_GRAPHIFY_AUDIT.md`) and Ponytail audit (`docs/project/reports/PHASE_16_PONYTAIL_AUDIT.md`).
- Authored comprehensive Phase 16 completion report (`docs/project/reports/PHASE_16_REPORT.md`).
- Recorded Decision D-052 in `DECISIONS.md`.
- All 229 automated tests pass with 0 failures; repository hygiene and project governance checks pass.
- Respected stop condition: stopped cleanly after Phase 16 closure without starting Phase 17 (OCR remains unstarted).

## 2026-09-15 - Phase 15 privacy, terms, settings, and product polish

- Conducted whole-product data flow, network, permission, and third-party inventory (`docs/project/PRODUCT_DATA_FLOW_INVENTORY.md`). Verified zero telemetry, zero analytics, zero cookies, zero external font/script CDNs, zero background outbound traffic.
- Authored truthful Privacy Policy (`app/privacy/page.tsx`): 18 comprehensive sections, Table of Contents, stable anchor IDs, local-first disclosure, external search transparency, and removal of stale "separate reader process" claims.
- Authored user-centric Terms & Conditions (`app/terms/page.tsx`): 15 structured sections, complete user ownership of notes and content, explicit backup responsibility, warranty and liability disclaimers, and standard open-source attribution without invented corporate entities.
- Established legal metadata constants in `lib/legal-metadata.ts` (`APP_VERSION = '0.1.0'`, `LEGAL_DOCUMENT_VERSION = '1.0.0'`, `LEGAL_EFFECTIVE_DATE = 'September 15, 2026'`).
- Added accessible Skip-to-Main-Content navigation anchor (`#main-content`) across `app/layout.tsx` and all product page templates.
- Implemented global application settings architecture:
  - Canonical data models and schemas in `lib/settings/types.ts` and `schema.ts`: appearance (theme, font scale), reading defaults (typography, line spacing, margins, layout), library defaults, and accessibility. Clamped ranges, enumerated value validation, and fail-closed `schemaVersion > 1` guard.
  - Persistent server store in `server/settings-store.mjs` with atomic writes to `user-data/app-settings.json` and resilient JSON corruption recovery to defaults.
  - Mounted `/api/settings` endpoints in Vite development plugin and Electron desktop service.
  - Interactive Settings Manager in `components/settings/settings-manager.tsx` mounted on `/settings`.
  - Machine-isolated portable settings export and import (`read-watch.settings` v1).
  - Hard-gated Settings Reset safety verification (`tests/settings-store.test.mjs` - `P15-G002` / Section 182): resetting preferences restores interface defaults without deleting or modifying books, notes, thoughts, annotations, bookmarks, canvases, diagrams, or backups.
- Completed first-run, add/import, empty, loading, and error states in `components/library-browser.tsx`:
  - Calm, informative empty states for Read and Watch collections with placement guidance and Settings links.
  - Desktop native "Open Book File..." action integrated with `DesktopOpenCoordinator`.
  - Desktop unregistered publication inspection modal with SHA-256 computation, format details, and clear non-destructive placement guidance.
  - 1-click "Reset filters" on 0-match search results.
- Executed whole-product visible copy and anti-vibe audit:
  - Eliminated all em dashes (`—`) across all user-facing JSX/TSX copy in `app/`, `components/`, and `lib/`.
  - Verified zero fake reviews, testimonials, ratings, metrics, avatars, user accounts, or cloud teasers.
  - Removed legacy Readest runtime references in `README.md`.
- Executed accessibility remediation:
  - Full keyboard focus order and dialog focus management (auto-focusing first element, trapping, and restoring focus to trigger on close in `components/ui/dialog.tsx`).
  - Added Escape key dismissal to all dialogs and modals.
  - Implemented `@media (prefers-reduced-motion: reduce)` and `[data-reduce-motion="reduce"]` CSS overrides.
  - Implemented high-contrast focus ring style (`[data-high-contrast-focus="true"]`).
- Generated external visual review evidence in `READ_WATCH_DATA_ROOT/visual-review/phase-15/` (`manifest.json`, `REVIEW_INDEX.md`).
- Passed Graphify audit (`docs/project/reports/PHASE_15_GRAPHIFY_AUDIT.md`) and Ponytail audit (`docs/project/reports/PHASE_15_PONYTAIL_AUDIT.md`).
- Recorded D-051 in `DECISIONS.md`.
- All 222 automated tests pass with 0 failures; repository hygiene and project governance checks pass.
- Respected stop condition: stopped cleanly after Phase 15 closure without starting Phase 16.

## 2026-09-14 - Phase 14 desktop native integration

- Executed exhaustive 33-criterion desktop shell evaluation matrix (`docs/project/DESKTOP_SHELL_EVALUATION.md`) comparing Electron, Tauri v2, Neutralinojs, Wails, and NW.js. Selected Outcome B (Adopt Electron 35.7.5) due to native Node.js 22.16.0 LTS embedding (`node:sqlite`, FTS5, file-first recovery mirrors, `pdf-lib`), delivering 100% architectural reuse of the 8 canonical application stores with zero child processes and zero dual-runtime drift.
- Pinned exact dependencies in `package.json`: `electron@35.7.5` (MIT) and `electron-builder@26.15.3` (MIT). Pinned zero extraneous native plugins, relying on native platform capabilities (Ponytail compliance).
- Authored canonical desktop architectural specifications:
  - `docs/project/DESKTOP_SHELL_EVALUATION.md`: 33-criterion comparative analysis, trade-off matrix, and justification.
  - `docs/project/DESKTOP_NATIVE_BOUNDARY.md`: Formal least-privilege boundary contract defining exactly 5 exposed IPC functions.
  - `docs/project/DESKTOP_INSTALL_AND_UPDATE.md`: NSIS installer design, data preservation guarantees, non-silent update policy, and rollback procedures.
  - `docs/project/DESKTOP_THREAT_MODEL.md`: Concrete threat analysis covering 10 abuse cases with preventive mitigations.
- Implemented embedded desktop HTTP service (`electron/desktop-service.mjs`) binding strictly to `127.0.0.1:0` with random security token protection, serving client assets and directly executing canonical application stores in-process.
- Implemented hardened preload script (`electron/preload.mjs`) with `contextIsolation: true` and `nodeIntegration: false`, exposing `window.readWatchDesktop`:
  - `chooseBookFiles(options)`: OS file dialog restricted to supported publication formats.
  - `chooseDataRoot()`: Directory picker rejecting Git repository, root, and system paths.
  - `getAppPaths()`: Read-only query for system data locations.
  - `openExternalHttps(url)`: Protocol-validated external link opener.
  - `onOpenFile(callback)` / `getPendingOpenFiles()` / `resolveOpenFile(filePath)`: Windows Open-With and single-instance event dispatching.
- Implemented main process window manager (`electron/main.mjs`) with single-instance locking (`app.requestSingleInstanceLock()`), protocol-guarded navigation handlers, and graceful store shutdown on quit.
- Registered native Windows file associations for 8 publication formats (`.epub`, `.pdf`, `.mobi`, `.azw`, `.azw3`, `.fb2`, `.fbz`, `.cbz`) and mounted `DesktopOpenCoordinator` in `app/layout.tsx` for SHA-256 book matching and non-destructive external file dialogs.
- Configured NSIS per-user packaging with `deleteAppDataOnUninstall: false`, ensuring user catalogs, databases, and annotations persist cleanly across uninstalls and upgrades.
- Updated repository hygiene guards (`scripts/check_repository_hygiene.py`, `scripts/test_repository_hygiene.py`, `.gitignore`) to forbid `dist-electron/` and installer binaries from Git.
- Added comprehensive automated test suite (`tests/desktop-native-boundary.test.mjs`) verifying boundary inventory, HTTPS URL validation, argument canonicalization, data root git protection, loopback HTTP dispatch, and source book immutability (219/219 test cases passing across suite).
- Generated NSIS installer (`Read & Watch Setup 0.1.0.exe`) and portable executable (`Read & Watch 0.1.0.exe`) via `npm run package:win`, verifying packaging and recording SHA-256 checksums in external review directories.
- Captured packaging and operational review evidence in `READ_WATCH_DATA_ROOT/desktop-review/phase-14/` and `visual-review/phase-14/` (`manifest.json`, `REVIEW_INDEX.md`).
- Maintained 100% byte-identical source immutability across all 151 local books.
- Recorded D-050 in `DECISIONS.md`; updated `docs/project/TECHNOLOGY_LEDGER.md` and `docs/project/UPSTREAM_AND_LICENSE_LEDGER.md`.
- Respected stop condition: stopped cleanly after Phase 14 closure without beginning Phase 15.

## 2026-09-14 - Phase 13 knowledge and diagram system

- Established calibrated 4-tier knowledge tool selection constitution (`docs/project/KNOWLEDGE_TOOL_SELECTION.md`): Native UI < Excalidraw < React Flow < Mermaid.
- Pinned and integrated `@xyflow/react@12.11.6` (MIT) for interactive semantic concept graphs, scoped strictly to `components/knowledge/concept-graph-canvas.tsx` as a transient client-side projection.
- Pinned and integrated `mermaid@12.0.0` (MIT) for text-defined technical diagrams, scoped strictly to `components/knowledge/mermaid-editor.tsx` with enforced `securityLevel: 'strict'`.
- Implemented canonical SQLite persistence in `server/knowledge-store.mjs`:
  - DDL tables: `knowledge_graphs`, `knowledge_nodes`, `knowledge_edges`, `mermaid_documents`.
  - Atomic file-first crash recovery mirrors in `user-data/knowledge/graphs/` and `user-data/knowledge/diagrams/`.
  - Optimistic concurrency control (`expectedRevision` with 409 Conflict rejection).
  - Soft-delete lifecycle tracking (`deleted_at_utc`).
  - Automated crash recovery reconstruction (`rebuildFromFiles()`).
  - Search invalidation integration (`notifySearchInvalidation()`).
- Implemented server-side deep link resolution (`resolveDeepLink()`) for 6 reference types: library items, document locations with anchors, annotations with quote preview, reader notes tab, Excalidraw canvases, and external web URLs. Unresolved links display a calm notice without crashing.
- Built Knowledge Hub dashboard (`app/knowledge/page.tsx`, `components/knowledge/knowledge-hub.tsx`) with 4 tabs: Concept Graphs, Text Diagrams, Standalone Canvases, and Tool Selection Guide.
- Built accessible alternative table/outline fallback view in `concept-graph-canvas.tsx` ensuring complete readability when visual graph cannot render.
- Integrated knowledge graphs and diagrams into derived search index (`server/search-store.mjs` FTS5 rebuild blocks 6 & 7).
- Integrated knowledge entities into Phase 12 portability system: backup bundles (`.rwbackup`), preflight conflict detection, restore application, and standalone `.rwgraph` / `.rwmermaid` exports.
- Added comprehensive automated tests in `tests/knowledge-store.test.mjs` (213/213 test cases passing across suite).
- Maintained 100% source book immutability across all local books.
- Recorded D-049 in `DECISIONS.md`; passed Graphify and Ponytail audits (`PHASE_13_GRAPHIFY_AUDIT.md`, `PHASE_13_PONYTAIL_AUDIT.md`).
- Respected stop condition: stopped after Phase 13 without beginning desktop packaging.

## 2026-09-14 - Phase 12 export and portability

- Established versioned portable schema family (`PORTABILITY_SCHEMA_VERSION = 1`) in `lib/portability/types.ts`: `read-watch.annotations`, `read-watch.notes`, `read-watch-canvas-export`, `read-watch.library-metadata`, `read-watch.backup`.
- Implemented runtime validation, schema version guard, and security rules in `lib/portability/validation.ts` (rejection of directory traversal `..`, absolute drive letters, and root paths).
- Authored canonical schema specifications and operational guides: `docs/project/PORTABLE_SCHEMAS.md`, `docs/project/BACKUP_AND_RESTORE.md`, and `docs/project/REFLOWABLE_ANNOTATION_PORTABILITY.md`.
- Implemented core portability and export engine (`server/portability-store.mjs`):
  - Annotation exports: machine-readable JSON with SHA-256 checksum and human-readable Markdown projection.
  - Notes and Canvas exports: item thoughts, notes, canvas scenes, bidirectional deep links, and base64-encoded image assets.
  - Library metadata export: standalone catalog records and item properties.
  - Full unified backup bundle (`.rwbackup`): self-contained, lossless archive with cryptographic checksum manifests; original EPUB/PDF files are strictly excluded to preserve lean storage and avoid media mutation.
  - Safe annotated-PDF derivative export using exact-pinned `pdf-lib@1.17.1` (MIT), drawing semi-transparent highlight rectangles and an editorial comments summary page. Enforces strict refusal guard against source path overwrites and verifies post-export byte-identical and mtime immutability.
  - Restore engine with preflight inspection (`/api/portability/restore/preflight`), conflict breakdown (identical vs divergent), and flexible conflict resolution (`skip`, `overwrite`, `copy`).
  - Automatic post-restore search index rebuild: derived SQLite FTS5 search tables are excluded from backups and deterministically reconstructed on restore via `searchStore.rebuildIndex()`.
- Built user-facing Portability Settings panel (`components/settings/portability-settings.tsx`) mounted in `/settings` with Apple-style polish, backup download trigger, and preflight restore inspection dialog.
- Added in-context export affordances in Reader Top Toolbar (`components/reader/reader-toolbar.tsx`) and Study Browser (`components/study/study-browser.tsx`).
- Added 6 comprehensive automated tests in `tests/portability-store.test.mjs` verifying schema validation, annotation export, canvas export, backup bundle generation, safe PDF derivative export with source immutability, and complete round-trip restoration (173/173 total test cases passing across suite).
- Maintained 100% source book immutability across all local publications.
- Recorded D-048 in `DECISIONS.md`, passed Graphify and Ponytail audits (`PHASE_12_GRAPHIFY_AUDIT.md`, `PHASE_12_PONYTAIL_AUDIT.md`).
- Captured visual review operational evidence in `READ_WATCH_DATA_ROOT/visual-review/phase-12/` (`REVIEW_INDEX.md`, `manifest.json`).

## 2026-09-14 - Phase 11 search, annotation browser, and study workflow

- Implemented derived, rebuildable SQLite FTS5 search index (`server/search-store.mjs`) managing `search_index_fts` with `unicode61 remove_diacritics 0`, `search_index_records`, and `search_index_meta` (zero new external npm dependencies, 100% offline).
- Engineered safe query pipeline (`server/search-query.mjs`, `lib/search/query.ts`) that normalizes user inputs, escapes FTS5 syntax operators, and extracts structured snippet tokens for HTML-safe `<mark>` rendering without dangerouslySetInnerHTML.
- Built unified Study & Annotation Browser (`app/highlights/page.tsx`, `components/study/study-browser.tsx`) featuring truthful artifact counters (highlights, comments, bookmarks, canvases, notes, total), debounced search (`/` shortcut), multi-kind filters, book filter dropdown, and direct source jumps.
- Enhanced book-local reader search (`components/reader/reader-search.tsx`) with semantic chapter/section labels, CFI/page locations, accessible `<output aria-live="polite">` regions, and truthful missing-text notice for scanned PDFs without invoking OCR.
- Built reader selection context menu (`components/reader/reader-selection-menu.tsx`) mounted in `ReaderViewport` supporting instant Copy, Define hook (offline notice), Translate hook (offline notice), Send to Item Notes (markdown excerpt append with citation and optimistic conflict protection), and Send to Canvas (adding excerpt card element to linked Excalidraw scenes).
- Wired direct URL jump navigation (`/reader/:id?annotationId=...` and `?location=...`) with source hash verification and calm mismatch alerts.
- Wired synchronous incremental invalidation hooks across all canonical stores (`annotationStore`, `canvasStore`, `userDataStore`, `readerStore`, `libraryStore`).
- Added 16 new automated tests across `tests/search-store.test.mjs`, `tests/book-local-search.test.mjs`, and `tests/study-workflow.test.mjs` (167/167 total test cases passing).
- Verified zero AI dependencies, zero vector database dependencies, and complete offline capability.
- Passed Graphify and Ponytail audits (`PHASE_11_GRAPHIFY_AUDIT.md`, `PHASE_11_PONYTAIL_AUDIT.md`).
- Captured external visual review evidence in `READ_WATCH_DATA_ROOT/visual-review/phase-11/` (`REVIEW_INDEX.md`, `manifest.json`).

## 2026-09-14 - Phase 10 book-linked Excalidraw notes

- Pinned official upstream release `@excalidraw/excalidraw@0.18.1` (MIT license) with verified React 19 compatibility.
- Designed and implemented canonical Read & Watch canvas schema (`CANVAS_SCHEMA_VERSION = 1`) in `lib/canvas/types.ts`: `ReadWatchCanvasDocument`, `CanvasMetadata`, `CanvasLinkRecord`, `CanvasAssetMeta`, `ExcalidrawSceneData`.
- Implemented runtime validation, URL sanitization, and MIME checks in `lib/canvas/validation.ts`.
- Implemented in-memory bounded history (`CanvasHistory`) capped at 50 revisions in `lib/canvas/history.ts`.
- Implemented file-first SQLite persistence in `server/canvas-store.mjs` with tables `canvases`, `canvas_links`, `canvas_assets`, atomic `.tmp` rename writes, optimistic concurrency control (409 Conflict), crash recovery mirror (`recovery.json`), bounded revision snapshots (cap 50), and standalone `.rwcanvas` export/import.
- Implemented 100% offline asset serving in `server/reader-vite-plugin.mjs` serving Excalidraw fonts and assets from `/api/reader/excalidraw-assets/*` with zero external CDN requests.
- Added 18 canvas REST API endpoints covering list, create, update, delete, restore, recovery, links, assets, and export.
- Built interactive client canvas components in `components/canvas/read-watch-canvas.tsx` and `canvas-list.tsx` supporting pen, highlighter, arrows, shapes, text, image uploads, quoted excerpts, and deep link navigation cards.
- Integrated Beside-Reader split mode in `components/reader/reader-shell.tsx` and `reader-toolbar.tsx` with responsive 320px minimum pane widths, preserving active reader engine and canvas state without remounting, plus mobile tab switching.
- Added standalone canvas library route (`/canvas-notes`) and full-screen canvas workspace route (`/canvas-notes/[id]`).
- Added 15 comprehensive unit and integration tests in `tests/canvas-store.test.mjs` (151/151 total tests passing).
- Maintained 100% source book immutability across all local books.
- Recorded D-046 in `DECISIONS.md`, passed Graphify and Ponytail audits.

## 2026-09-14 - Phase 09 unified annotation foundation

- Implemented unified Read & Watch annotation system covering all 13 annotation types across PDF (text marks + vector drawing) and reflowable books (text marks only).
- Added `lib/annotation/types.ts`: `ANNOTATION_SCHEMA_VERSION = 1`, `Annotation` record with `schemaVersion`, stable UUID `id`, `itemId`, `assetId`, `kind`, `anchor`, `content`, `style`, `sourceHash`, `revision`, `lifecycle`, `createdAt`, `updatedAt`, `deletedAt`.
- Added `lib/annotation/validation.ts`: strict validation of all anchor kinds, content payloads, normalized bounds `[0..1]`, lifecycle states, and schema version.
- Added `lib/annotation/history.ts`: `AnnotationHistory` bounded at 50 entries with `undo()`, `redo()`, `push()`, and `clear()`.
- Added `server/annotation-store.mjs`: SQLite persistence via `BEGIN IMMEDIATE` transactions; optimistic concurrency (revision mismatch → 409); soft delete; restore; batch create; source hash mismatch detection; atomic file-first crash-recovery mirror to `user-data/items/:itemId/annotations.json`.
- Extended `lib/document/capabilities.ts` with `textAnnotations` (all engines) and `surfaceMarkup` (PDF only — reflowable explicitly disabled because freehand geometry cannot survive dynamic reflow).
- Added 8 annotation API routes to `server/reader-vite-plugin.mjs`: GET list, POST create, POST batch, PUT update, DELETE soft-delete, PATCH restore, GET hash-check, POST recover.
- PDF anchors (`pdf-text`): normalized page-relative bounding rects `[0..1]`, zoom- and orthogonal-rotation-invariant, 1-based `pageNumber`, `quote`, `prefix`, `suffix`, `sourceHash`.
- PDF drawing anchors (`pdf-drawing`): normalized page-relative `points` and `bounds`, `[0..1]`-invariant, supports all 7 drawing sub-kinds (pen, highlighter, line, arrow, rectangle, ellipse, text-box).
- Reflowable anchors (`reflowable-text`): `startCfi`, `endCfi`, `spineIndex`, `quote`, `prefix`, `suffix`, `sourceHash` — inherently font-size and layout-invariant.
- Named bookmarks use Phase 07 `Bookmark` model with existing `label` field — no duplicate annotation store.
- Added 36 new tests (20 anchor + 16 transaction/recovery) — total suite: 136/136 pass.
- Source immutability verified: all 151 real local books remain 100% byte-identical (0 hash changes, 0 mtime modifications).
- Graphify audit: PASS — 0 engine leakage, 0 import cycles (`PHASE_09_GRAPHIFY_AUDIT.md`).
- Ponytail audit: PASS — 0 new runtime dependencies (`PHASE_09_PONYTAIL_AUDIT.md`).
- Recorded D-045 in `DECISIONS.md`.

## 2026-09-14 - Phase 08 legacy Readest parity and retirement

- Evaluated native-versus-legacy parity across all 151 real local publications (8 EPUBs, 143 PDFs) across 14 distinct reader behaviors (`BEH-01` through `BEH-14`); achieved 100% parity (747 parity matches, 1,208 native superior advantages, 0 parity gaps, 0 blocked items).
- Verified rollback capability in an isolated worktree (`%TEMP%\rw-rollback`) at pre-retirement anchor commit `81a9276c190b4795b7093c55d175d0b73276fde7` with 97/97 tests passing prior to altering active launcher paths.
- Retired the legacy Readest desktop launcher; completely eliminated `import { spawn } from 'node:child_process'` and all process launching logic from `reader-store.mjs`.
- Updated `reader-control.tsx` to navigate directly to `/reader/:itemId` with query parameter preservation (`?candidate=:id`) for multiple-candidate books, removing obsolete launch states.
- Safely removed `App/forks/readest/` (9,066 vendored files) from current Git HEAD, permanently resolving Windows `MAX_PATH` checkout failures caused by deep Android/Kotlin test directories and reducing tracked paths from 9,262 to 196.
- Preserved complete upstream provenance, AGPL-3.0 license records, and Git recovery instructions in `App/docs/project/PROVENANCE_READEST.md`, `UPSTREAM_AND_LICENSE_LEDGER.md`, and `TECHNOLOGY_LEDGER.md`.
- Decoupled PDF unit test fixtures by copying `sample-paper.pdf` and `sample-alice.pdf` to `App/app/tests/fixtures/pdf/`.
- Added retirement enforcement test `App/app/tests/no-active-readest.test.mjs` verifying zero child process spawning, zero `forks/readest` imports, and null `readerExecutable` (100/100 tests passing).
- Updated repository hygiene tooling (`check_repository_hygiene.py`, `test_repository_hygiene.py`) adding `App/forks/readest/` to `FORBIDDEN_PREFIXES`.
- Re-verified source immutability: all 151 real local book files remained 100% byte-identical (0 hash changes).
- Captured 18 visual review screenshots under `Read and Watch - Local Data/visual-review/phase-08/` with `manifest.json` and `REVIEW_INDEX.md`.
- Completed Graphify audit (831 nodes, 1687 edges, 40 communities, 0 import cycles, zero reachability to Readest) and Ponytail audit (9,066 files deleted, 0 new runtime dependencies).

## 2026-09-14 - Phase 07 unified reader experience

- Unified the reflowable (Foliate-JS) and fixed-layout (Mozilla PDF.js) engines behind a single capability-driven Read & Watch reader interface (`App/app/app/reader/[id]/page.tsx`, `App/app/components/reader/`).
- Eliminated all format-conditional branching (`format === 'pdf'`, `isPdf`) across presentation components; reader chrome queries runtime capabilities (`canZoom`, `fontControls`, `textSearch`, `continuousLayout`, `canRotate`).
- Built modular reader component suite adhering strictly to the Warm Editorial design system: `ReaderShell`, `ReaderToolbar`, `ReaderSidebar`, `ReaderContents`, `ReaderSearch`, `ReaderBookmarks`, `ReaderSettingsDialog`, `ReaderViewport`, `ReaderStatus`.
- Implemented `ReaderHistory` with 50-entry bounded storage, consecutive location deduplication, forward truncation on branching navigation, and bi-directional Back/Forward stepping.
- Implemented canonical format-independent `Bookmark` model with atomic persistence to external data storage via `/api/reader/items/:id/bookmarks`.
- Implemented format-appropriate preferences and theming: Light, Warm, and Dark theme tokens (`.theme-warm`, `.theme-dark`), font family (Serif, Sans, Mono), font sizing (12–28px), line height, text alignment, and zoom (50%–300%) / rotation (90° increments) controls.
- Implemented accessible keyboard model (Arrow keys, Space bar, Ctrl+F, B for bookmarks, Esc to close modals/sidebars), touch swipe gesture handling, accessible `<dialog>` focus trapping, and error recovery states with retry and library return actions.
- Preserved complete engine invisibility: zero vendor chrome, toolbars, logos, or engine-native state storage.
- Reaffirmed Zero-OCR policy: image-only and scanned documents truthfully report lack of text capabilities, disabling search and displaying a clear "Image Scan" badge.
- Added 5 new automated tests verifying unified reader history, bookmarks, preferences, error recovery, and zero format branching (97/97 tests passing).
- Captured 101 responsive visual review screenshots across Desktop, Tablet, and Mobile in `READ_WATCH_DATA_ROOT/visual-review/phase-07/` with machine-readable `manifest.json` and human-readable `REVIEW_INDEX.md`.
- Completed Graphify audit (828 nodes, 1703 edges, 60 communities, 0 import cycles) and Ponytail complexity audit with zero new runtime dependencies.

## 2026-09-14 - Phase 06 PDF engine

- Pinned official Mozilla PDF.js npm distribution: `"pdfjs-dist": "4.10.38"` (Apache-2.0, SHA-1 `3ee698003790dc266cc8b55c0e662ccb9ae18f53`, integrity `sha512-/Y3fcFrXEAsMjJXeL9J8+ZG9U01LbuWaYypvDW2ycW1jL269L3js3DVBjDJ0Up9Np1uqDXsDrRihHANhZOlwdQ==`) with 0 vulnerabilities reported by `npm audit --omit=dev`.
- Documented upstream provenance and license in `App/docs/project/PROVENANCE_PDFJS.md` and updated `TECHNOLOGY_LEDGER.md` and `UPSTREAM_AND_LICENSE_LEDGER.md`.
- Implemented production `PdfAdapter` under `App/app/lib/document/pdf-adapter.ts` fully conforming to the canonical `DocumentAdapter` contract with complete lifecycle state machine, metadata extraction, outline/TOC extraction, navigation, search with cancellation, selection, and versioned `pdf-geometry` text anchors (`schemaVersion: 1`).
- Implemented resolution-independent canvas rendering with `devicePixelRatio` backing store scaling, bounded by `MAX_CANVAS_DIMENSION = 8192` to prevent memory exhaustion on mobile and large zoom levels.
- Implemented synchronized `.textLayer` aligned directly to unscaled canvas CSS viewport with zero coordinate drift across zoom (0.25x - 5.0x) and orthogonal 90°/180°/270° rotation. Text selection overlay styled with the Phase 03 Warm Editorial palette.
- Enforced strict Zero-OCR policy: zero OCR dependencies, binaries, or background workers exist. Scanned/missing-text PDFs truthfully report lack of text capabilities, and the reader UI displays an "Image Scan" badge with disabled search.
- Added controlled local endpoints in `reader-vite-plugin.mjs` serving verified worker (`/api/reader/pdfjs/worker.mjs`), CMaps, and standard fonts with `X-Content-Type-Options: nosniff` and immutable caching headers, eliminating all third-party CDN dependencies.
- Refactored reader presentation layer at `App/app/app/reader/[id]/page.tsx` to be 100% capability-driven (`canZoom`, `canPaginate`, `canSearch`, `canAdjustFont`), eliminating format branching and passing the architectural audit.
- Source Immutability Gate passed: verified against real local publications (including local cookbook and library books). Confirmed 100% byte-identical SHA-256 hashes and modification timestamps before and after reader operations.
- Added 23 automated tests across 5 new test suites covering conformance, page geometry, features, edge cases, and source immutability (92/92 Node tests passing).
- Captured 18 responsive screenshots across Desktop (1440x900), States, Tablet (1024x768), and Mobile (390x844) under `READ_WATCH_DATA_ROOT/visual-review/phase-06/` with `manifest.json` and `REVIEW_INDEX.md`.
- Completed Graphify audit (730 nodes, 1405 edges, 51 communities, 0 import cycles) and Ponytail complexity audit.

## 2026-09-14 - Phase 05 reflowable book engine

- Pinned official upstream Foliate-JS commit `78914aef4466eb960965702401634c2cb348e9b1` (MIT) and vendored core reflowable rendering modules under `App/forks/foliate-js/` with zero modifications to upstream code.
- Implemented production `FoliateReflowableAdapter` under `App/app/lib/document/reflowable-adapter.ts` conforming strictly to the canonical `DocumentAdapter` contract with full lifecycle state transitions, layout mode toggling, navigation, search with cancellation, selection, and anchor round-trips.
- Registered reflowable adapter across EPUB, MOBI, AZW, AZW3, FB2, and CBZ formats in `defaultAdapterRegistry`.
- Implemented `resource-boundary.ts` defending against Zip-Slip, directory traversal, unsafe resource protocols, and applying `STRICT_READER_CSP`.
- Added server streaming endpoint `GET /api/reader/items/:id/file` with `X-Content-Type-Options: nosniff` and path containment.
- Built verification reader interface at `App/app/app/reader/[id]/page.tsx` styled strictly with Phase 03 warm editorial design tokens; zero Foliate UI or branding.
- Enforced PDF phase boundary: fixed-layout PDF items yield explicit user notices directing to reflowable items, strictly reserving PDF.js for Phase 06.
- Source Immutability Gate passed: all 8 real local EPUB publications in `Read and Watch - Local Data/Read/Book` verified 100% byte-identical before and after reader operations.
- Added 16 automated tests covering adapter conformance, resource boundary, format certification, and restore/source immutability (69/69 Node tests passing).
- Captured 23 responsive screenshots across Desktop, Tablet, and Mobile in `READ_WATCH_DATA_ROOT/visual-review/phase-05/`.
- Completed Graphify audit (636 nodes, 1269 edges, 29 communities, 0 import cycles) and Ponytail complexity audit.

## 2026-09-13 - Phase 04 document adapter foundation

- Implemented the format-independent document adapter foundation under `App/app/lib/document/` with zero new runtime dependencies.
- Established the canonical `DocumentAdapter` contract with full lifecycle state machine (`created`, `opening`, `open`, `closing`, `closed`, `failed`), navigation, search, selection, and anchor resolution with `AbortSignal` cancellation support.
- Defined normalized `DocumentError` taxonomy covering 15 error codes with path-sanitized, client-safe error messages.
- Implemented `DocumentCapabilities` boolean contract (`toc`, `textSearch`, `textSelection`, `textAnchors`, `pageNavigation`, `semanticLocationNavigation`, `pagination`, `continuousLayout`, `zoom`, `fontControls`, `themeControls`, `spreadLayout`, `bookmarks`, `textExtraction`) and standard capability profiles.
- Implemented versioned outer envelopes (`DocumentLocation`, `TextAnchor`) with `schemaVersion: 1`, tagged union payloads, and SHA-256 source-hash verification.
- Built minimal `DocumentAdapterRegistry` with duplicate collision rejection and format factory lookup.
- Implemented `ReaderSession` capability-driven session controller with snapshot state subscriptions.
- Created fixed-layout (`FakePdfAdapter`) and reflowable (`FakeReflowableAdapter`) test doubles.
- Implemented universal 18-point conformance suite passed by both test doubles.
- Created format-branching enforcement test suite verifying zero format-conditional branching across presentation components and routes.
- Executed Graphify audit (569 nodes, 1048 edges, 34 communities, 0 import cycles) and Ponytail complexity audit.
- Preserved legacy Readest bridge and certified fallback; zero third-party rendering engines integrated.

## 2026-09-13 - Phase 03 unified design system and library UI

- Implemented the complete token, typography, and component foundation adhering strictly to `DESIGN_CONSTITUTION.md` (warm ivory canvas, charcoal text, deep muted teal accent, editorial serif headings, clean UI sans, 6px radii, and compact desktop density).
- Built custom accessible UI primitives using native HTML semantics (`Button`, `Input`, `Table`, `Badge`, `Kbd`, `Skeleton`, `Tooltip`, `Dialog`, `DropdownMenu`, `ToastProvider`) with zero external component libraries.
- Implemented the unified application shell and navigation across `/` (Library browser), `/highlights`, `/canvas-notes`, `/settings`, `/privacy`, and `/terms`.
- Built the Calibre-class library table with real-time search (`/` shortcut), faceted filters (type, status, tags), multi-column sorts, column visibility customization, saved views, and keyboard navigation.
- Built the item detail peek pane with 8 functional tabs: Overview, Thoughts, Notes, Metadata, Media (with lightbox preview), Links, Highlights, and Canvas.
- Implemented manual metadata editing with optimistic concurrency detection, validation, conflict detection, reload actions, and safe local persistence.
- Verified data truthfulness with all 91 authentic items rendered from canonical SQLite without fake ratings, placeholder books, or mock reviews.
- Captured 24 baseline screenshots and 82 final certification screenshots stored externally under `READ_WATCH_DATA_ROOT/visual-review/phase-03/`.
- Refreshed Graphify (390 nodes, 564 edges, 22 communities, 0 import cycles) and completed Ponytail audit with zero new dependencies.

## 2026-09-08 - Phase 02 library manager foundation

- Added the Read & Watch-owned SQLite schema, deterministic migration, canonical runtime store, and file-first recovery pipeline without adding a dependency.
- Preserved all 91 stable records, exact Read/Watch semantics, Notion properties, media, hashes, provenance, and the verified personal-book source binding.
- Added backend operations for manual metadata, properties, people/authors, Read series, tags, status, rating, search, sorting, filtering, saved views, relationships, duplicate detection, and format inventory.
- Migrated Thoughts and Notes to canonical SQLite persistence while retaining atomic Markdown recovery mirrors and bounded history.
- Proved dry-run/apply fingerprint equality, interruption recovery, resumable rerun, export/rebuild equivalence, online backup, restore, tamper detection, and rollback behavior.
- Updated the unchanged application UI, asset build, user-data bridge, and legacy reader bridge to consume SQLite.
- Refreshed Graphify and completed the Ponytail complexity audit; no Phase 03 UI work or later product phase started.

## 2026-09-08 - Phase 01 architecture and data-model design

- Specified the common Item model with separate Read and Watch extensions and preserved all 91 existing stable IDs.
- Accepted a Read & Watch-owned SQLite runtime with deterministic file-first recovery; no database or migration was created.
- Added schema, transaction, migration, backup, restore, rebuild, document-adapter, ownership, and threat-model contracts.
- Mapped every current catalog, import, provenance, user-added, media, and Notion-property field to a normalized or retained-unknown path.
- Formally deferred the project-level license decision before direct third-party adoption or external distribution.
- Ran Graphify and Ponytail against the architecture and kept speculative frameworks, sync, event sourcing, graph databases, and premature abstractions out of the design.
- No application behavior, reader, UI, upstream dependency, source data, or OCR feature changed.

## 2026-09-08 - One-time governance and planning bootstrap

- Added the canonical master-plan, run-state, phase-index, verification, blocker, architecture, design, technology, licensing, data-safety, and execution-governance system under `docs/project/`.
- Certified the sanitized historical foundation for repository separation and Tasks 1-3 against live local, external-data, and GitHub evidence.
- Classified Readest as the certified legacy fallback and superseded the unfinished legacy Task 4 without marking its work complete.
- Established the unified native reader direction: Read & Watch-owned experience and data, Foliate-JS for reflowable formats, PDF.js for PDF, and late OCR.
- Refreshed Graphify and ran the Ponytail whole-repository complexity audit; committed summaries contain no private library content.
- Added dependency-free master-plan/state validation.
- No reader, library redesign, annotation, canvas, graph, desktop, OCR, AI, or other new product feature was implemented.

## 2026-09-08 - Repository separation

- Moved all personal, backup, runtime, generated, and operational evidence out of the Git repository into a verified sibling local-data root.
- Added a single external data-root resolver used by the application and import utilities.
- Converted the pinned Readest integration from a nested repository into a provenance-documented vendored source tree.
- Added automated repository-hygiene checks and prepared a clean one-commit public history.
- No Task 4, Mermaid, graph, AI, annotation, or recommendation features were started.

## 2026-08-31

- Started Task 1.
- Added the durable resume/checkpoint documents.
- Established software, personal-data, immutable-backup, importer, report, and log boundaries.
- Added placeholder documentation for future Readest and Mermaid forks without cloning or modifying them.
- Created a verified, read-only snapshot of the source collections with complete SHA-256 manifests and a PASS report.
- Added a machine-readable and human-readable audit of the verified Notion packages, including 19 Read records, 71 Watch records, properties, attachments, variants, and duplicate-title risk.
- Added a tested, restartable, provenance-preserving staged importer; its full 90-record preflight passes with complete attachment and link accounting.
- Imported and verified all 90 library items and 74 attachments with zero conflicts.
- Generated compact Read/Watch master indexes plus a 90-item real-data catalog for the UI; full library/index/catalog verification passes.

## 2026-09-01

- Added the local React 19/TypeScript/Vinext/Tailwind browsing application backed by the verified 90-item catalog.
- Added Read and Watch navigation, collection-specific property tables, search, keyboard selection, real preview media, responsive item details, and explicit future Readest/Mermaid placeholders.
- Added a path-constrained local media adapter; production output contains exactly 74 referenced assets totaling 66,994,442 bytes.
- Verified desktop and 390x844 mobile behavior, missing-artwork fallbacks, long-title truncation, empty fields, detail selection, loaded media, and an empty browser console.
- Added a local SVG application icon and verified its production request returns HTTP 200.
- Removed 57 unused generated UI component files and unused helper/dependency layers.
- Upgraded and pinned the React/Vinext/Vite/Cloudflare toolchain; lint, TypeScript, production build, production runtime, and npm audit all pass with zero vulnerabilities.
- Refreshed the Graphify code map to 237 nodes, 254 edges, and 14 communities; multigraph diagnostics report zero missing, dangling, duplicate, or self-loop edges.
- Re-ran the complete source-to-backup-to-library certification. All checks pass, all 8 backup files remain read-only, and all 90 items plus 74 attachments remain verified.
- Completed Task 1 and recorded the final evidence in `reports/UI_VERIFICATION.md` and `reports/TASK_1_FINAL_REPORT.md`.

## 2026-09-01 (Task 2)

- Completed a read-only whole-PC location audit on C: and D:; exactly one
  confirmed project copy exists, with no diverged copies. Recorded the
  evidence in `reports/WHOLE_PC_LOCATION_AUDIT.md`,
  `reports/PROJECT_COPY_COMPARISON.md`, and `reports/PROJECT_LOCATIONS.json`.
- Re-certified Task 1 against the live filesystem (16/16 gates pass).
- Added Task 2 local persistence for My Thoughts and Notes in a separate
  writable `user-data/` area: lazy-created UTF-8 Markdown files keyed by
  stable catalog item IDs, atomic temp+rename saves, bounded `.history/`
  retention, conflict detection, and a compact `user-data/index.json`.
- Added a minimal local write bridge (Vite dev-server middleware + pure Node
  store) with server-side path validation and no new dependencies.
- Wired the editors into the item detail UI with Save, Ctrl+S, save-state
  indicators, unsaved-changes warnings, safe switching, and an Edit/Preview
  toggle that preserves raw Markdown.
- Added 14 automated persistence tests; all pass.
- Verified the UI in headless Chrome (desktop and 390x844 mobile): 24/24
  checks pass with an empty console.
- Re-checked protected evidence after Task 2: source exports, verified
  backup, imported library, manifests, and Task 1 reports are unchanged.
- Completed Task 2 and recorded the evidence in
  `reports/TASK_2_PERSISTENCE_VERIFICATION.md` and
  `reports/TASK_2_FINAL_REPORT.md`. Task 3 (Readest/Mermaid) is not started.

## 2026-09-02 (Task 3 partial)

- Re-certified the protected Task 1/2 baseline and audited all 19 Read items;
  the catalog contains zero local book files and 19 preview images.
- Pinned the official Readest repository at
  `6df90139dc7b72246572ab33b12d485b281ca6e6` on a clean local integration
  branch, with only provenance/change-ledger files added to the fork.
- Built a verified portable Windows/Tauri Readest executable and configured
  transient separate-window open under the project-owned runtime tree.
- Added a dependency-free stable-ID reader bridge that resolves only
  catalog-declared Read media, rejects unsafe or unsupported targets, and
  requires explicit opaque selection when more than one book is available.
- Activated the Read-only `Open in Reader` UI while preserving Watch and future
  Mermaid behavior.
- Added 11 reader tests; the combined suite passes 25/25. Lint, TypeScript,
  production build, desktop/mobile UI, live API, native Readest UI, and seven
  upstream fixture formats pass verification.
- Re-hashed all protected data after implementation; every aggregate exactly
  matches its pre-Task-3 baseline.
- Recorded detailed evidence in `reports/TASK_3_READEST_DIFF.md`,
  `reports/TASK_3_READER_VERIFICATION.md`, and
  `reports/TASK_3_FINAL_REPORT.md`.
- Left Task 3 incomplete at its only blocked gate: no genuine personal book is
  available for the required catalog-to-native-reader end-to-end test. Task 4,
  Mermaid, AI, and reader redesign were not started.

## 2026-09-02 (Task 3 certification)

- Added the explicitly authorized personal PDF as a new user-added twentieth
  Read item with a deterministic content-derived stable ID and provenance that clearly excludes
  Notion import origin.
- Copied the verified source into the normal item `media/` directory; source,
  library-copy, before-reader, and after-reader SHA-256 values all match.
- Extended the existing deterministic catalog/index and verification tooling
  to include separately manifested user-added items without rewriting any of
  the original 19 Read records.
- Verified the genuine 201-page PDF end to end through the parent Read UI and
  upstream-native Readest: cover/title/author, readable pages 10/19/33,
  sequential and contents navigation, close-to-library, and reopening pass.
- Made the existing library footer count derive from the catalog total and
  prevented book formats from being duplicated into the production build.
- Re-ran the 25/25 parent suite, all 14 Task 2 persistence cases, lint,
  TypeScript, production build, read-only library verification, browser
  console, fork, runtime, and protected-data checks; all pass.
- Certified Task 3 complete in
  `reports/TASK_3_REAL_BOOK_VERIFICATION.md`. Task 4, Mermaid, annotations,
  drawings, AI, and reader redesign were not started.
