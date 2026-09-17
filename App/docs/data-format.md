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
from `Read/` and `Watch/` alone. Rebuilding the runtime database and search index
from the Markdown records is a later slice; this slice provides only the root
model, initialization, discovery and Raw enumeration.
