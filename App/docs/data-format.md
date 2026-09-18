# Initial Data Format

The working library uses one natural item folder containing one UTF-8 `item.md`, plus only the media and source files appropriate to that item. Item identity is a stable internal ID, never its directory position.

Structured metadata uses YAML front matter where useful. Exact original titles and source provenance are retained. Unmapped Notion properties remain under an explicit preserved-property field rather than being dropped. Media remains as ordinary files referenced by relative paths; Base64 encoding is not allowed.

## Stable identity

- A Notion item page's 32-character page ID is the provenance identity.
- Internal IDs use `read-<notion-page-id>` or `watch-<notion-page-id>`.
- IDs never depend on CSV order, import order, or directory position.
- The exact title remains in `item.md`, even when the folder name must be sanitized.

## Deterministic folder names

Titles are Unicode-normalized, converted to safe hyphen-separated names, stripped of Windows-invalid/control characters, protected from reserved device names, and length-limited. All names are compared case-insensitively. If two titles produce the same safe name, every member of that collision group receives `--<first-8-page-id>` so the result does not depend on import order.

Example:

```text
The Lord of the Rings: The Fellowship of the Ring
-> The-Lord-of-the-Rings-The-Fellowship-of-the-Ring/
```

The two distinct Watch records titled `Life` will use separate page-ID-suffixed folders.

## Item contents

```text
<item-folder>/
|-- item.md
|-- media/                 # byte-identical linked images/videos/attachments
|-- source/
|   |-- original.md        # byte-identical exported Notion page
|   |-- notion-row.json    # exact CSV row plus row number
|   `-- provenance.json    # package/member/hash mapping
`-- _import.json           # verified importer output manifest
```

`item.md` includes the stable ID, exact title, collection, optional imported category/date, explicit source provenance, all original CSV properties under `notion_properties`, and the sections Overview, My Thoughts, Notes, Relationships, Media, Metadata, and Import Information. An imported image may be exposed as a deterministic preview, but it is not labeled a cover unless the export explicitly identifies it as one.

## Canonical source rule

The importer reads only the verified Markdown + CSV package for each collection and uses its `_all.csv` table exactly once. Parallel HTML/PDF packages and standalone artifacts remain immutable and accounted for by the audit, but do not generate duplicate items.

## Portable selected library root

The durable, portable library is the **selected library folder** itself, not a
runtime directory inside it. A selected root contains exactly three user-facing
top-level folders:

```text
<selected library root>/
|-- Read/                     # canonical Read titles
|-- Watch/                    # canonical Watch titles
|-- Raw/                      # offline intake area (no network access)
`-- App/                      # runtime-only data; NOT part of the portable library
    |-- state/                # read-watch.sqlite3
    |-- user-data/
    |-- search/
    |-- ocr/
    |-- backups/
    `-- exports/
```

`App/` may be discarded at any time. Canonical title content must never be
duplicated into `App/library`; that legacy managed-library location is retained
only for backward compatibility with earlier phases.

Initialization is fail-safe: missing `Read`, `Watch` or `Raw` folders are created
one at a time, existing content is never overwritten, never moved and never
deleted, and a file occupying a required folder path fails with
`REQUIRED_FOLDER_PATH_IS_FILE` instead of being replaced.

## Organized title folders (canonical, current)

Titles are organized by approved category. A canonical title is
`<collection>/<category>/<title folder>/`, and the title folder contains exactly
one Markdown file whose base name equals the folder name:

```text
Read/Books/Deep Work (2016)/Deep Work (2016).md
Watch/Movies/Mean Girls (2004)/Mean Girls (2004).md
```

These filename rules replace the earlier sanitized-hyphenated `item.md` folder
convention, which remains supported for legacy `App/library` items only.

Approved Read categories: `Books`, `Study Materials`, `Manuals & Reference`,
`Documents`, `Other`.

Approved Watch categories: `Anime`, `Movies`, `Series`, `Documentaries`,
`Specials`, `Other`.

Excluded from canonical title enumeration: `Source Imports`, `Administration`,
`Filesystem_Inventory*`, `Raw Export Records`, `Shared Recommendation Evidence`
and audit directories. `Source Imports` is supporting evidence, never a title
category. A shared evidence file is one physical file referenced by several
titles through relative paths; it is never duplicated per title.

Discovery and validation live in `app/server/portable-library.mjs`. It is the
single filesystem-discovery implementation for the organized library; do not add
a second scanner. It reports structured diagnostics (`ROOT_NOT_FOUND`,
`REQUIRED_FOLDER_PATH_IS_FILE`, `TITLE_MARKDOWN_MISSING`,
`MULTIPLE_TITLE_MARKDOWN`, `TITLE_MARKDOWN_NAME_MISMATCH`, `INVALID_UTF8`,
`PATH_ESCAPE`, `SYMLINK_ESCAPE`, `CASE_COLLISION`, `UNSUPPORTED_PATH`,
`IO_ERROR`) rather than raw filesystem errors.

## Long paths

Paths are stat-ed and read through the Windows extended-length form so a real
260-character path is never silently reported with blank size or metadata. An
unreadable file becomes an explicit error; the platform's long-path registry
setting is not modified by the application.

## Raw (offline intake)

`Raw/` is an intake and staging area that may hold arbitrary nested content. The
current foundation exposes cheap recursive enumeration only: relative paths,
byte size and extension. It performs no hashing on startup, no OCR, no
classification and no network access of any kind.

## Portable rebuild

Because the filesystem is the portable source of truth, a fresh installation must
be able to select an existing library folder and rebuild usable runtime state
from `Read/` and `Watch/` alone. The rebuild path is implemented by
`app/server/portable-rebuild.mjs` and the maintenance command:

```text
node scripts/rebuild-portable-library.mjs --root "<library root>"            # dry run
node scripts/rebuild-portable-library.mjs --root "<library root>" --apply --rebuild-search
```

The rebuild reuses the existing discovery and parser, validates stable identity,
derives the physical category and path, and applies all valid titles in one
SQLite transaction. A duplicate stable id fails closed. A single malformed
required identity is isolated as a diagnostic and the run is reported `partial`.
Items that are not present in the portable set are never bulk-deleted, and
notes/annotations/canvases/knowledge objects keep their existing stores.
Idempotence is enforced by a per-title content hash, so an unchanged second
rebuild changes nothing.

The runtime schema is migration v2. Migration `002_relax_item_identity.sql`
keeps the portable `read-`/`watch-` identity but accepts 8-64 lowercase hex
characters, because existing portable ids are generated as 16 hex characters and
identity must not be rewritten to satisfy a database length check.

Search remains derived. `search_index_records` and FTS5 are rebuilt through the
existing search store after a successful library rebuild; deleting them loses no
canonical title data.

### Field ownership and app write-back

The durable portable Markdown owns the title record and the user/app personal
state. SQLite owns optimized runtime/query/conflict state and is rebuildable.
Search is derived. Notes, thoughts, bookmarks, annotations, canvases and
knowledge objects keep their existing canonical stores.

App-managed personal fields are written back through
`app/server/portable-writeback.mjs`:

```text
status, favorite, personal_rating, rewatch_count,
date_added, date_started, date_completed, tags,
progress_percent, current_page, current_chapter, progress
```

Title, type, authors/creators, series/volume and the Overview/My Description
prose section are also written back for portable titles. A missing value stays
missing; it never becomes `false`, `0` or a fabricated date. Unknown YAML keys
and unknown body sections survive.

Write-back is filesystem-first and compensating:

1. validate and detect an external Markdown edit by the stored SHA-256
2. refuse a same-field external conflict with a structured 409
3. merge non-conflicting external edits into the new Markdown
4. stage a temporary file and create bounded recovery evidence
5. open the SQLite transaction, atomically replace Markdown, then commit
6. roll back on replace failure; restore Markdown on commit failure, or retain a
   divergence journal under `App/state/` if compensation also fails

A failed filesystem write never reports success.

### Startup recovery

`app/server/portable-recovery.mjs` runs before the desktop service starts
listening and before the Vite development stores are created. Normal healthy
startup inspects only the runtime database schema and portable item count, then
returns `HEALTHY` without scanning the portable root, rebuilding SQLite, or
rebuilding FTS.

Automatic reconstruction runs only when the runtime database file is missing,
the runtime library schema is missing, the portable projection is empty while
the selected root has usable titles, or a supported older runtime schema needs
the forward migration. It reuses `planPortableRebuild` and
`rebuildPortableLibrary`, and applies only when the plan is unambiguous: no
duplicate stable ids, no malformed required identities, and no discovery
conflicts. Search is rebuilt through the existing FTS store.

The write-back journal is reconciled by comparing the current Markdown SHA-256,
the journal `previousSha256`/`stagedSha256`, and the runtime portable
`markdown_sha256`. Stale journals are archived under
`App/backups/recovery-journals/`. Deterministic filesystem-plus-database
disagreements rebuild runtime state from the current durable Markdown, verify
the result, and only then archive and clear the active journal. An unexpected
Markdown hash, an ambiguous divergence, malformed JSON, an unknown journal code,
a path escape, an invalid stable id, or an unsupported runtime schema enters
`RECOVERY_REQUIRED` and preserves the journal.

While recovery is unresolved, a bounded
`App/state/portable-recovery-required.json` marker or an active journal blocks
portable title metadata write-back with `PORTABLE_RECOVERY_REQUIRED` (HTTP 503).
Reading and browsing remain available when the runtime database itself can be
opened. The marker is cleared only after a verified `HEALTHY` or `RECOVERED`
inspection.

`GET /api/library/recovery` returns the sanitized recovery state and
`POST /api/library/recovery/retry` reruns the same inspection. The library page
shows a calm recovery notice only when human recovery is required. Missing
recommendation-evidence references remain warning-level diagnostics and do not
turn into recovery failures.

### Corrupt runtime database recovery

If startup establishes that `App/state/read-watch.sqlite3` is genuinely
unusable, the runtime database family (`read-watch.sqlite3`, `-wal`, `-shm`,
`-journal`) is copied byte-for-byte to
`App/backups/corrupt-runtime/<timestamp>/` and verified by size and SHA-256
before any quarantine or replacement. The capture directory keeps a private
`manifest.json` and is bounded to the newest five captures; the newest or only
capture is never deleted.

A replacement is built at
`App/state/read-watch.sqlite3.recovery-<timestamp>.staging`, never directly at
the canonical path. The staged database is rebuilt from portable Markdown first,
then reconstructed from file-first recovery inputs: annotations JSON, canvas
documents plus asset files, knowledge graph JSON, Mermaid diagram JSON, notes
and thoughts Markdown. Bookmarks and reading state are already file-first;
settings and reader settings remain file-first and untouched. Search is rebuilt
from the staged canonical runtime state through the existing FTS store.

The staged database must pass `PRAGMA quick_check`,
`PRAGMA integrity_check`, foreign-key validation, supported `user_version`,
expected-table checks, portable ID/path uniqueness and an application-level
catalog/reader/search smoke test before activation. Only then is the original
runtime family quarantined inside the verified capture and the staged database
atomically renamed into the canonical path. Activation failure restores the
original family where possible and returns
`CORRUPT_RUNTIME_ACTIVATION_FAILED`; the forensic capture remains.

A readable database with a newer unsupported `user_version` remains
`RUNTIME_SCHEMA_UNSUPPORTED` and is never quarantined or replaced. A non-empty
legacy `App/library/catalog.json` blocks automatic recovery because the legacy
importer is not part of this path.

`saved_views` and `relationships` are the only runtime classes without a
file-first recovery source. They are best-effort salvaged when the corrupt
database is still readable. If that is not possible, recovery is reported as
explicit `PARTIAL` recovery with the limitation disclosed, and the forensic
capture is preserved. Malformed annotation, canvas or knowledge recovery files,
duplicate portable IDs, malformed required identities, backup verification
failure, staged integrity/FK failure, search rebuild failure or activation
failure all fail closed instead of claiming complete recovery.

### File-first library state

Saved views and relationships are library-level user state, not title-level
Markdown metadata. Their durable record is one compact file:

```text
App/user-data/library-state.json
```

```json
{
  "schemaVersion": 1,
  "savedViews": [
    {
      "id": "...",
      "name": "...",
      "definition": {},
      "revision": 1,
      "createdAtUtc": "...",
      "updatedAtUtc": "..."
    }
  ],
  "relationships": [
    {
      "id": "...",
      "sourceItemId": "read-... or watch-...",
      "targetItemId": "read-... or watch-... or null",
      "targetExternal": null,
      "relationshipType": "...",
      "direction": "directed | undirected",
      "position": 0,
      "provenance": {},
      "createdAtUtc": "..."
    }
  ]
}
```

The file is the durable reconstructable record. SQLite `saved_views` and
`relationships` are runtime projections. Exactly one of `targetItemId` and
`targetExternal` is present for a relationship. Valid external targets are
accepted; internal targets must exist. Writes are staged, validated and
atomically replaced, then projected into SQLite with a post-write parity check.
A failed DB transaction restores the previous file or uses the existing
recovery-required marker if compensation also fails. A hard crash after file
replacement but before DB completion leaves the file winning on the next
startup.

Startup reconciliation migrates an absent mirror once, returns `HEALTHY` when
file and DB match without rewriting the file, and projects the durable file into
SQLite when the runtime tables are empty or stale. Malformed state or missing
internal references enter `RECOVERY_REQUIRED` and preserve the file. Corrupt
runtime recovery uses this file after portable title reconstruction, so an
initialized installation can recover saved views and relationships even when
the corrupt SQLite database is completely unreadable. Pre-mirror installations
retain the best-effort salvage compatibility and explicit `PARTIAL` result.

## Portable title schema (v1)

Every canonical title Markdown file carries a `schema_version` and a stable
identity in its YAML frontmatter. The schema is defined and validated by
`app/server/portable-metadata.mjs`; a single parser serves both collections and
the Read/Watch differences are thin field profiles, not parallel parsers.

Required identity fields:

```yaml
---
schema_version: 1
id: "read-0123456789abcdef"     # read-<hex> or watch-<hex>
collection: "Read"               # Read | Watch
title: "Deep Work"
---
```

`category` is not stored: it is the approved physical category folder. `year`
and `type` may be absent.

Shared optional fields: `title`, `original_title`, `year`, `type`, `status`,
`favorite`, `personal_rating`, `date_added`, `date_started`, `date_completed`,
`tags`, `recommendations`, `last_metadata_update`.

Read profile: `authors`, `editors`, `publisher`, `edition`, `isbn`, `languages`,
`subjects`, `page_count`, `progress_percent`, `current_page`, `current_chapter`,
`series`, `volume`, `files`, `cover`.

Watch profile: `countries`, `languages`, `runtime`, `age_rating`, `director`,
`creators`, `writers`, `main_cast`, `rewatch_count`, `progress`, `media`,
`poster`, `external_ids`.

Asset-role keys recorded by the red-team corrections — `notion_entry_image`,
`source_asset_full_resolution`, `entry_image`, `recommendation_evidence`,
`shared_evidence`, `social_clip` — are part of the contract so they are never
mistaken for unknown keys.

### Preservation rules

Unknown YAML keys and unknown body sections survive a round trip verbatim. A
malformed optional field is isolated: it produces a field diagnostic while the
rest of the title still loads. A missing personal value stays missing — it is
never defaulted to `false` or `0`.

### Stable identity

Identity never depends on the title, the year, the folder name, the absolute
path or scan order. Where a title has no immutable source identity, a generated
identifier is derived once, written into the Markdown immediately and preserved
thereafter. `category` changes and title/folder renames must not change it.

Tools:

```text
node scripts/assign-portable-identity.mjs --root "<library root>"            # dry run
node scripts/assign-portable-identity.mjs --root "<library root>" --apply    # write
```

The tool refuses to write when any title has an error-level diagnostic, verifies
a per-file rollback bundle before mutating anything, writes each file through a
temporary file plus atomic rename, re-validates the generated file before
replacing the original, and is idempotent. Private dry-run/manifest/report output
lives under `<root>/App/migration/portable-metadata/<timestamp>/` and is never
committed.

### Field diagnostics

Diagnostics carry a code (`REQUIRED_FIELD_MISSING`, `INVALID_FIELD_TYPE`,
`INVALID_RATING_RANGE`, `INVALID_DATE`, `INVALID_LIST`, `INVALID_ENUM`,
`DUPLICATE_YAML_KEY`, `INVALID_YAML`, `NO_FRONTMATTER`,
`UNSUPPORTED_SCHEMA_VERSION`, `INVALID_STABLE_ID`, `BROKEN_RELATIVE_PATH`,
`ABSOLUTE_ASSET_PATH`, `PATH_ESCAPE`), the relative file path, the YAML key and
line where known, the expected shape, the actual value, a severity, a
recoverability hint and a plain-language message.

Asset references must stay inside the library root. `..` is judged from the
title's own folder, so shared-evidence references such as
`../../Source Imports/Shared Recommendation Evidence/<file>` are valid.

### Relationship to runtime SQLite

The title Markdown is the durable portable record. SQLite remains the optimized
runtime store for queries, search, revisions and conflict detection, and it must
be rebuildable from the filesystem. Rebuilding the database and search index from
the Markdown records is a later authorized slice, not part of this one.
