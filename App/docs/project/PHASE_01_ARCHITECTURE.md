# Phase 01 Architecture Contract

Status: design authority for Phase 02 implementation

This document translates the verified current system into an implementable target. It does not authorize a migration or product feature.

## Current system inventory

The verified external catalog contains 91 unique stable items: 20 Read and 71 Watch. Ninety records came from the immutable Notion backup and one Read record is user-added. The catalog references 75 media files. All item IDs match `^(read|watch)-[0-9a-f]{32}$`; IDs and item paths are unique.

Current ownership and trust boundaries:

- `library/catalog.json` is generated, read-only application input.
- Imported item folders retain `item.md`, source evidence, exact property data, provenance, and copied attachments.
- `user-data/items/<stable-id>/thoughts.md` and `notes.md` are mutable, file-first user data with atomic saves, bounded history, and optimistic conflict detection.
- The browser sends stable item IDs, never filesystem paths.
- The reader bridge resolves a Read ID and opaque candidate ID against catalog-declared media, validates containment and real paths, then launches the legacy fallback.
- `READ_WATCH_DATA_ROOT` is outside Git and owns all personal, generated, runtime, and recovery data.

One baseline discrepancy is retained, not hidden: the user-added source manifest contains a pre-separation absolute path that no longer exists. The original source was located under the external data root and matches both the recorded and imported-copy SHA-256 and size. Phase 01 does not rewrite the manifest; Phase 02 must normalize this provenance safely during migration.

## Ownership model

> Engines provide capabilities. Read & Watch owns the experience.

Read & Watch is canonical for identity, metadata, storage, notes, progress, annotations, canvases, relationships, search, recovery, and export. Reader, drawing, graph, diagram, OCR, and desktop engines may return capability-specific data, but may not become the canonical store.

The target has one logical library with collection-specific extensions:

```text
Item
  +-- ReadItem
  |     +-- zero or more reading formats
  |     +-- authors / series / languages
  |     +-- reading position / annotations / canvases
  |
  +-- WatchItem
        +-- creators / directors
        +-- watch type / progress

Both retain properties, tags, status, rating, images, provenance,
relationships, notes, attachments, and custom fields.
```

Watch is not represented as a book with nullable book columns. Collection-specific tables enforce that separation while common tables power shared library behavior.

## Stable identity

- Existing stable IDs are preserved byte-for-byte and remain `TEXT` primary keys.
- Imported IDs remain collection prefix plus the 32-character Notion page ID.
- Existing user-added IDs remain collection prefix plus the first 32 lowercase hexadecimal characters of the verified source SHA-256, with collision refusal.
- Display titles, folder names, ordering, paths, and engine identifiers never define identity.
- New identity algorithms require a versioned decision and collision test; Phase 02 must not silently regenerate existing IDs.
- Relationships, notes, formats, annotations, positions, canvases, and provenance reference the stable item ID.

## Domain model

### Common Item

Required common fields are stable ID, collection (`read` or `watch`), title, item type, status, rating, summary, source-added value, created/updated timestamps, optimistic revision, and provenance kind. Tags, custom properties, images, attachments, people/roles, relationships, and notes are child entities.

### Read extension

Read-specific data includes authors, series, series position, languages, logical-book format inventory, source hashes, reading progress and locations, bookmarks, annotations, and book-linked canvases. A logical Read item may have zero or more format files; ambiguity is represented, never guessed.

### Watch extension

Watch-specific data includes media type, creators/directors with roles, genre, watch progress, and retained Notion-derived/custom properties. It does not inherit format, page, CFI, or book-series semantics.

### Custom properties

Custom and imported properties use a namespaced, case-preserving key/value model. The exact source spelling is authoritative, including the current Read keys `Added`, `Added on`, `Book`, and `From`, and Watch keys `Added From`, `Added On`, `Category`, `Place i Was`, `Recommended by`, and `Show`. Values are stored as versioned JSON plus a declared value type. Unknown or future values are retained losslessly as `unknown` rather than coerced or discarded.

## Compatibility map

| Current field or record | Target | Rule |
| --- | --- | --- |
| Catalog `schemaVersion` | import snapshot metadata | Preserve source version; do not confuse with database schema version. |
| `generatedFromImportUtc` | import/migration run | Preserve exact timestamp and provenance. |
| Catalog counts | derived query and migration assertion | Never canonical mutable values. |
| `id` | `items.id` | Preserve exactly; primary identity. |
| `collection` | `items.collection` plus extension row | Enforce Read/Watch extension consistency. |
| `title` | `items.title` | Preserve exact text; never identity. |
| `itemPath` | provenance/source artifact reference | Preserve as logical relative path; validate containment. |
| `type`, `status`, `added`, `summary` | typed common columns plus source property | Preserve original value even when normalized value is empty. |
| `tags` | tags and item-tags | Empty remains an explicit empty set. |
| `cover`, `preview` | item assets with roles | Null remains null; do not infer covers. |
| `notionProperties` | namespaced item properties | Preserve exact key, case, value, and source namespace. |
| `media` | item assets / Read formats | Preserve name, relative path, extension, bytes/hash where known. |
| `relationshipIds` | relationships | Preserve known links; unresolved IDs become retained review records. |
| Imported `item.md` | immutable import artifact | Retain byte-for-byte; it is not rewritten by migration. |
| Imported provenance JSON | provenance source and raw payload | Preserve all fields and hashes. |
| User-added manifest fields | provenance plus item/format fields | Preserve flags, source type, author, format, pages, hashes, paths, and timestamps. |
| Thoughts/Notes Markdown | notes with file-first export | Preserve body bytes, kind, stable item ID, revision evidence, and history. |
| User-data index | derived index | Rebuildable; never canonical note content. |
| Reader candidate ID | runtime-derived token | Recompute from item ID and media path; never persist as canonical identity. |

Additional import evidence maps as follows:

- Import-plan root fields (`schema_version`, importer version, generated time, input, collections, summary, preflight status, and review items) become migration-run/source-snapshot evidence and are retained in the raw run payload.
- Import-plan item fields (`csv_member`, row number, folder name, link targets, page/database IDs and members, package/page hashes, page properties, unresolved links, and relations) become provenance, relationship, or retained-review records; the complete item payload is retained as JSON.
- Attachment fields (`filename`, source member, output path, extension, byte size, and SHA-256) become `item_assets` plus provenance payload.
- User-added source fields (`filename`, original path, extension, byte size, last-write time, and SHA-256) become historical/current source-location evidence plus the source hash. A path is never trusted without root, size, and hash validation.
- Backup/import/library checkpoints remain operational evidence linked to a migration run. They are not copied into item metadata and are never interpreted as user content.

Fields that cannot be normalized safely are stored in the source payload and `item_properties` retained-unknown namespace. Phase 02 fails parity if any source key or record lacks a target or retained-unknown record.

## Canonical user-owned records

- Notes have stable IDs, item ID, kind (`thoughts`, `notes`, or future explicit kind), Markdown body, revision, timestamps, and file-export path.
- Reading positions are per item, format asset, adapter kind, versioned location envelope, source SHA-256, revision, and timestamp.
- Annotations have stable IDs, kind, versioned anchor envelope, source hash, content/style payload, lifecycle timestamps, and revision.
- Canvases have stable IDs, optional item ID, title, Read & Watch-owned document path, revision, and timestamps. Canvas links connect element IDs to an item, annotation, or versioned document anchor.
- Relationships have stable IDs, source item, target item or retained external target, relationship type, direction, provenance, and timestamps.

Exact annotation and canvas payloads remain deliberately compact in Phase 01; Phase 09 and Phase 10 finalize their format-specific details. Phase 02 only needs storage that preserves opaque versioned payloads without claiming unsupported behavior.

## DocumentAdapter contract

The adapter is a capability boundary, not a product framework. Phase 04 may implement one minimal interface once both PDF and reflowable consumers are real.

```ts
type DocumentCapability =
  | 'toc' | 'search' | 'selection' | 'textAnchor'
  | 'pagination' | 'continuousScroll' | 'zoom' | 'rotation'
  | 'typography' | 'fixedLayout' | 'links';

type DocumentLocation = {
  schemaVersion: 1;
  adapter: 'pdf' | 'reflowable';
  sourceSha256: string;
  value: unknown;
};

interface DocumentAdapter {
  open(source: ReadonlyDocumentSource, signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
  getMetadata(): Promise<DocumentMetadata>;
  getTOC(): Promise<TocEntry[]>;
  getCurrentLocation(): Promise<DocumentLocation>;
  goTo(location: DocumentLocation, signal?: AbortSignal): Promise<void>;
  search(query: string, signal?: AbortSignal): AsyncIterable<SearchResult>;
  getSelection(): Promise<DocumentSelection | null>;
  createTextAnchor(selection: DocumentSelection): Promise<TextAnchor>;
  resolveTextAnchor(anchor: TextAnchor): Promise<ResolvedAnchor>;
  getCapabilities(): ReadonlySet<DocumentCapability>;
}
```

Lifecycle states are `closed`, `opening`, `open`, `closing`, and `failed`. Calls outside supported states fail explicitly. Operations accept cancellation where work can outlive a UI action. Errors are classified as invalid source, unsupported format/capability, malformed document, source changed, cancelled, engine failure, and unavailable resource. Engine-native locations stay inside the versioned `value`; UI and storage consume the common envelope.

## Trust and threat model

| Threat | Required control |
| --- | --- |
| Client-supplied path or traversal | Client sends stable/opaque IDs only; server/native bridge resolves, validates relative syntax, containment, real path, type, and existence. |
| Symlink/junction escape | Compare canonical real paths against approved roots immediately before read/launch. |
| Source mutation | Open sources read-only; all derivatives use new paths; compare protected hashes before/after affected operations. |
| Partial migration or write | SQLite transactions, per-item checkpoints, temporary targets, conflict refusal, and restartable logs. |
| Lost update | Optimistic revisions; stale writers receive conflict data, never silent overwrite. |
| Database corruption | Verified SQLite backup plus deterministic file-first snapshot and rebuild path. |
| Engine ownership inversion | Adapters return capabilities/results; engine storage is disabled or treated as disposable cache. |
| Malformed or hostile document | Constrained parser boundary, cancellation, size/resource limits, CSP/sandbox where applicable, and explicit errors. |
| Hash mismatch | Bind formats, positions, and anchors to full SHA-256; stop resolution and require review. |
| Unknown property/data | Store raw payload and retained-unknown property; never drop or guess. |
| Public Git leakage | Database, exports, books, private paths, reports, and runtime remain external; hygiene gate runs before commit/push. |

## Licensing decision

The repository still has no project-level license. This is formally deferred, not treated as permission. Before direct new third-party code adoption, public distribution, or external reuse, the user must choose the Read & Watch license and any copyleft interaction must receive appropriate review. Existing vendored Readest notices and AGPL provenance remain intact. Phase 01 adopts no new package or source.

## Implementation slices

Phase 02 should proceed in these narrow slices:

1. Add versioned schema migrations and an isolated test database.
2. Import catalog/provenance into a dry-run database with exact parity assertions.
3. Add minimal data access functions and transaction tests; no generic repository framework.
4. Implement file-first export, verified backup, restore, and rebuild.
5. Run a real-catalog dry run, resolve retained discrepancies, then perform an explicitly gated migration.
6. Switch library reads only after parity, rollback, and protected-state checks pass.

No event sourcing, sync protocol, graph database, plugin framework, metadata-provider framework, separate Read/Watch databases, or engine registry is justified now.
