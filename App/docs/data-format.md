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
