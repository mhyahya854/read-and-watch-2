# Read study workspace and unified Knowledge Canvas

Durable architecture note for the per-book Read study experience, its unified
Knowledge Canvas, annotation notes, scope model, and legacy compatibility.

## Read and Watch are separate experiences

Watch titles keep their structured per-title knowledge graph. **Read does not get
that graph.** For Read, the canvas and the knowledge graph are the SAME feature:
one **Knowledge Canvas** that mixes freeform drawing with structured knowledge.

A Read title must never create a second, parallel knowledge_graph row as its
workspace. There is no Read knowledge graph table, no second React Flow system,
and no duplicated Graph/Canvas tabs.

## The unified Knowledge Canvas

The existing canvas document (Phase 10) was extended rather than replaced. One
document now carries both halves:

| Part | Contents |
| --- | --- |
| `scene` | Excalidraw elements, files, appState, viewport |
| `knowledge.blocks` | structured blocks (`id`, `elementId`, `type`, `title`, `body`, `source`) |
| `knowledge.relationships` | named lines (`sourceBlockId`, `targetBlockId`, `label`, `direction`, `linkedElementId`) |
| `knowledge.importedGraphIds` | provenance when the canvas came from a legacy graph |
| `scope` | `book` or `location` plus the location anchor |
| `links` / `assets` | existing annotation deep links and image assets |

Freeform and structured content live in the same document, on the same surface.
A structured block gets a real Excalidraw element ("Place on canvas") and a
relationship gets a real connector between those elements. A user-drawn arrow is
just an Excalidraw element: it is never silently promoted into a semantic
relationship.

Relationship labels are arbitrary UTF-8 text. Presets are conveniences only.
Direction is explicit (`directed` / `mutual`), and deleting a block removes the
relationships attached to it.

## Canvas scope

Every Read Knowledge Canvas has exactly one scope:

- **book** — whole-book study (multiple per title allowed)
- **location** — bound to one exact source location

Location scope stores the canonical reader `DocumentLocation` plus the source
hash and a human label. For PDFs that resolves to a page; for reflowable books it
resolves to the CFI/section the engine reports. There is no scroll-percentage
anchor and no fabricated page number for reflowable documents.

Legacy canvases written before scope existed have no scope metadata. They migrate
to **book** scope, and no location is invented for them. The SQLite columns
(`scope_kind`, `scope_label`, `scope_anchor_json`) are added by an idempotent
migration; existing rows stay valid.

## Annotations and annotation notes

Read reuses the Phase 09 annotation store. No second annotation database exists.

- kinds: text-mark (highlight / underline / strike), comment, excerpt, drawing
- PDF anchors: page number + normalized page-relative rects (text) or normalized
  stroke points/bounds (drawing) + source hash
- reflowable anchors: CFI range when the engine provides one, otherwise a
  section-level anchor with spine index, offsets, quote and context

**Every annotation can carry a note.** The note lives inside the annotation's own
`content_json` (`content.note`, `content.noteUpdatedAt`) — no new table, no
separate notes document. Deleting only the note leaves the mark itself intact.

## Annotation ownership (book isolation)

Every annotation route is item-scoped and the owner is enforced in the store, not
only in the route:

- `getAnnotation` / `updateAnnotation` / `deleteAnnotation` / `restoreAnnotation`
  accept the route's `itemId` and return **404 for any record owned by another
  book**, exactly as if the id did not exist.
- Single create rejects a payload whose `itemId` contradicts the route item.
- Batch create binds every annotation to the route item and refuses a payload
  that names a different book.
- Recovery reads `user-data/items/<itemId>/annotations.json` and refuses (and
  reports) any record claiming a different owner, instead of injecting it.
- Creation validates that the owning item actually exists.

The Vite middleware and the Electron desktop service implement the same
semantics; both call the same store entry points, and a parity test exercises the
desktop service over HTTP against a synthetic data root.

## Inline painting, honestly

- PDF text marks and freehand markup are stored in **canonical, unrotated,
  page-relative** coordinates (0..1) and painted by transforming them into the
  current render space. They therefore stay attached to the same page region
  through reload, zoom, rotation and resize, and a full 360° rotation returns the
  rendered geometry exactly to its original form.
- The overlay is positioned in its own offset-parent's coordinate space (not raw
  viewport coordinates), so it stays aligned in split, full, minimized, sidebar-
  open and sidebar-closed states. The browser harness asserts this numerically.
- A mark is only created when the engine can actually resolve the selection
  geometry. There is no full-width "stripe" fallback: if the rectangles cannot be
  resolved the action reports that the selection could not be anchored and
  creates nothing.
- Mark colour is per annotation and is used by the renderer; the study pane
  offers a small colour row for new marks and for recolouring the selected one.
- Reflowable documents have no stable page geometry. Their marks are created,
  stored, listed and jump-to-source navigable, but they are **not** painted as
  page overlays, because that would require fabricating geometry that reflow
  invalidates. Freehand drawing on reflowable text is deliberately not offered;
  the page/location Knowledge Canvas is the supported drawing surface there.
- The reader never fabricates a selection: with nothing selected, a mark action
  reports "select text first" and creates nothing. Zoom and rotation re-render
  the page through `DocumentAdapter.refresh()`.

## Reflowable anchors: real CFIs only

`ReflowableTextAnchor.startCfi`/`endCfi` are present **only** when the engine
genuinely reported a CFI. Otherwise the anchor is section-level and carries
`fidelity: 'section'` plus the spine index, offsets when available, the quote and
context, and the canonical reader location. A CFI is never manufactured, and
`fidelity: 'cfi'` without a CFI is rejected by validation. Existing anchors with
real CFIs keep working unchanged, and historical anchors are never rewritten.

## Reader layout states

The reader has three states, driven by `lib/reader/layout.ts`:

1. **split** — reader beside the book's study pane (default study mode)
2. **full** — the reader only; the study pane is hidden
3. **minimized** — the reader is hidden and the study pane takes the workspace

The reader pane is always MOUNTED; minimized hides it with CSS. The document
adapter renders into a container owned by that pane, so unmounting it would
destroy the live source position. Layout changes therefore never lose the book,
page/CFI, zoom, annotations, or the open canvas.

## Book isolation

`Book B` can never read, mutate, rename, delete, or list `Book A`'s canvases,
annotations, or study summary: the reader, knowledge, and canvas routes are all
item-scoped, annotation ownership is enforced in the annotation store, and canvas
access additionally verifies the owning `item_id` (`assertCanvasOwnership`) on
every item-sensitive subroute (open, update, rename, delete, restore, links,
assets, export, recovery). The study pane, the reader toolbar counts, and the
library Study panel only ever read the current item.

## Location identity and labelling

- Canvas location scope stores a **canonical** `DocumentLocation`; a location
  scope without a valid one is not accepted for new canvases (junk input is
  downgraded to book scope only by the documented legacy-validation path).
- Two locations are compared with one canonical key
  (`lib/document/location-key.mjs`), so key order or harmless metadata can never
  hide a page/location canvas from the reader. Client and server use the same
  module.
- Labels are honest: fixed-layout documents use `Page N`; reflowable documents
  use the current location/section description instead of an invented page
  number. A page/location canvas cannot be created while the reader has no
  current location.

## Legacy compatibility (no destructive migration)

- **Legacy Read canvases** (no scope metadata) appear as book-level canvases.
- **Legacy Read knowledge graphs** are left untouched. The Study pane lists them
  and offers *Import into Knowledge Canvas*, which projects nodes into blocks and
  edges into relationships (labels, direction, bidirectional flags and deep links
  preserved) and records the legacy graph id as provenance. The import creates a
  new canvas, never modifies the original, and refuses to import the same graph
  twice (`409` with the existing canvas id).
- **Legacy global routes** `/highlights`, `/knowledge` and `/canvas-notes` still
  exist for compatibility, deep links, migration and recovery. They are no longer
  primary navigation: the primary sidebar carries Read, Watch and Settings only,
  and both collections now reach their study surfaces from their own titles.

## File-first durability, export and search

- The whole canvas document (scene + scope + knowledge + links + assets) is
  written to `canvas.json`, mirrored to `recovery.json`, and snapshotted into the
  bounded history — structured knowledge is never SQLite-only.
- `recoverCanvasFromExternal` and the corrupt-runtime reconstruction restore the
  scope columns and the structured knowledge from that file.
- Canvas export/import packages carry the same document, so backup/restore keeps
  scope, blocks, relationships and ownership, and can never attach Canvas A to
  Book B.
- Search indexes annotation notes, canvas block titles/bodies and relationship
  labels, and every hit carries its owning book (`item_id` / `book_title`).
- Annotation JSON/Markdown export already included `content.note`; notes now
  exist for marks and drawings too.

## Unified semantic <-> visual Canvas invariants

`lib/canvas/scene-sync.ts` is the single reconciliation helper and owns these
invariants. Only elements carrying Read & Watch `customData.rw` metadata
participate; ordinary user drawings are never touched or reinterpreted.

1. A placed block has a real rectangle and a bound title label.
2. Renaming a block renames its visual label; editing type/notes is metadata only.
3. A relationship whose two blocks are both placed has a real **named**
   connector: the label lives on the arrow, and arrowheads follow the direction
   (mutual adds a start arrowhead).
4. A relationship created before its blocks are placed gains its connector
   automatically once both endpoints exist. The same healing runs once when a
   canvas is loaded, so older documents are repaired too.
5. Deleting a block removes its visual block, its label, every relationship
   touching it, and their connectors. Deleting a relationship removes only its
   connector.
6. Deleting an app-owned visual element detaches the semantic record
   (`elementId` is dropped) instead of leaving a ghost reference, and the
   semantic block survives so the user can re-place it.
7. The live scene-change handler only runs the full reconciliation when a
   structural mismatch exists (`needsReconcile`), so it never fights a drag.

## Source navigation

Blocks created from annotations keep `itemId`, `annotationId`, a human label, the
quote, and the canonical location. Navigation falls back in a documented order:
exact annotation -> stored location -> the book. A source link therefore still
works after the annotation is deleted or temporarily unavailable. The reader
understands one query contract (`?annotationId=`, `?location=`, `?canvasId=`),
and legacy graph deep links of every supported type (annotation, item, location,
external) are preserved on import rather than discarded.

## Source immutability

No Read feature writes to the PDF/EPUB source file. Annotations, drawings, notes
and Knowledge Canvases live under the Read & Watch user-data root.
