# Watch title knowledge workspace

Durable architecture note for the per-title Watch knowledge workspace, the
`associatedItemId` ownership model, and the transitional behaviour of the global
legacy knowledge surfaces.

## Scope

The Watch knowledge workspace exists **only** for `collection = 'watch'` titles.
Read titles keep their existing Overview / Thoughts / Notes / Metadata / Media /
Links / Highlights / Canvas tabs until the dedicated Read phase. Read is not
given a workspace tab, and Read content is never migrated by this feature.

Every Watch title owns an independent set of knowledge artifacts:

| Artifact  | Store                                    | Table / file mirror                                |
| --------- | ---------------------------------------- | -------------------------------------------------- |
| Graph     | `server/knowledge-store.mjs`             | `knowledge_graphs` + `user-data/knowledge/graphs/` |
| Diagram   | `server/knowledge-store.mjs`             | `mermaid_documents` + `user-data/knowledge/diagrams/` |
| Canvas    | `server/canvas-store.mjs`                | `canvases` + `user-data/canvases/<id>/`            |
| Highlights| `server/annotation-store.mjs`            | `annotations` + `user-data/items/<id>/`            |

Graph vs Canvas responsibility is unchanged: the graph is the structured
relationship model (blocks, typed/typed-by-user relationships, direction), the
canvas is free-form visual drawing, and the diagram is text-defined Mermaid.

## Ownership: `associatedItemId`

- `knowledge_graphs.associated_item_id` and
  `mermaid_documents.associated_item_id` are nullable foreign keys to
  `items(id)` with `ON DELETE SET NULL`.
- `null` means **legacy/unassigned**. Legacy artifacts belong to no title and are
  reachable only through the unscoped legacy routes.
- An item-scoped request (`?itemId=<id>`) is authorized only when the record's
  owner is exactly that item. Anything else returns `404`, including
  legacy/unassigned records: a legacy artifact must never silently become
  "Watch B's" artifact because B was named in the call.
- Ownership is **immutable for ordinary saves**. `saveGraphDocument` and
  `updateDiagram` reject an ownership change with `409` unless the caller passes
  the explicit `{ allowOwnershipChange: true }` option, which is used only by the
  backup/restore association path.

The same guard applies to canvases via `canvasStore.assertCanvasOwnership`. Read
flows and standalone canvases pass no `itemId`, so their behaviour is unchanged.

## Title isolation in the UI

- `ItemDetail` renders `WatchWorkspace` with `key={item.id}`, so switching
  Watch A -> Watch B remounts the workspace and no graph id, graph document,
  canvas, diagram, highlight list, or "added to graph" flag can survive.
- `resolveActiveGraphId` (in `lib/knowledge/watch-workspace-state.ts`) drops an
  active graph id that is not part of the currently loaded title's list, which
  also covers a graph being deleted.
- `ConceptGraphCanvas` is keyed by graph id and reports unsaved edits through
  `onDirtyChange`; switching graphs or titles while dirty asks for confirmation
  instead of discarding work silently.

## Relationships

- Labels are arbitrary UTF-8 text. Presets are conveniences only; the inspector
  is a free-text field, and the model stores `label` separately from
  `relationshipType`.
- Direction is explicit: `sourceNodeId -> targetNodeId` plus the
  `bidirectional` flag renders a mutual (double-headed) relationship.
- Multi-edge visibility is produced by `lib/knowledge/edge-routing.ts`. Each
  relationship between the same unordered pair of blocks gets a deterministic
  anchor pair (four combinations of the block's named handles) and, past four
  relationships, an alternating bezier curvature. Routing is a pure function of
  the edge list, so it is identical after reload.
- Deleting one relationship never deletes its parallel twin; deleting a block
  removes its attached relationships.

## File-first durability

- Every graph/diagram read refreshes a JSON mirror under the data root. Soft
  deletion writes the **full** document (including nodes/edges) with
  `lifecycle: soft-deleted` and `deletedAt`, so the mirror is never degraded to
  metadata-only.
- `rebuildFromFiles` restores ownership, soft-delete state, nodes, edges, and
  diagrams from those mirrors. Ownership is restored only when the owning item
  still exists; otherwise the record returns as legacy/unassigned instead of
  being dropped or attached to another title.
- Corrupt-runtime staged recovery reconstructs knowledge from the same mirrors,
  and the staged fixture asserts that `associatedItemId` survives.
- Backup/restore carries ownership through the `knowledge` package section.
  Restore re-applies the backed-up owner explicitly (the one sanctioned
  ownership-change path) and validates it against the locally known items.

## Global legacy views (transitional)

`/api/knowledge/summary`, the Knowledge hub, and the global Canvas Notes list are
legacy surfaces. In this transitional state they **exclude Watch-title-owned
artifacts** while still listing legacy/unassigned records and Read-associated
records, so nothing is lost and Read behaviour is unchanged. Global search
remains global, but every knowledge hit carries its owning title
(`item_id` / `book_title`) so a Watch graph points at its own title.

## No inference

Nothing in this workspace infers knowledge automatically. Blocks, relationship
labels, directions, diagrams, canvases, and evidence promotion are all explicit
user actions; "Add to Graph" is the only automated projection, and it copies the
selected highlight into the title's own graph with a deep link.

