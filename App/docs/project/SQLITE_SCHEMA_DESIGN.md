# SQLite Schema Design

Status: Phase 01 design; implementation begins in Phase 02

SQLite is the canonical runtime store for normalized Read & Watch data. Deterministic file exports are the recovery substrate, not a second writable master.

## Database location and mode

- Logical location: `READ_WATCH_DATA_ROOT/App/state/read-watch.sqlite3`.
- Database, WAL/SHM files, backups, migration databases, and exports remain outside Git.
- Enable foreign keys on every connection.
- Use WAL for normal local runtime concurrency, but never treat a copied live main file as a valid backup.
- Use UTF-8 text, UTC ISO-8601 timestamps, and full lowercase SHA-256 values.
- Store booleans as constrained integers and structured extension values as validated JSON text.

## Core tables

The Phase 02 migration may adjust names only through a recorded decision; it must preserve these ownership and constraint semantics.

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL CHECK(length(checksum) = 64),
  applied_at_utc TEXT NOT NULL
) STRICT;

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL CHECK(collection IN ('read','watch')),
  title TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  rating REAL,
  summary TEXT NOT NULL DEFAULT '',
  source_added TEXT NOT NULL DEFAULT '',
  provenance_kind TEXT NOT NULL CHECK(provenance_kind IN ('notion','personal_book','manual','unknown')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  CHECK(
    (collection = 'read' AND length(id) = 37 AND substr(id,1,5) = 'read-' AND
     substr(id,6) <> '' AND substr(id,6) NOT GLOB '*[^0-9a-f]*') OR
    (collection = 'watch' AND length(id) = 38 AND substr(id,1,6) = 'watch-' AND
     substr(id,7) <> '' AND substr(id,7) NOT GLOB '*[^0-9a-f]*')
  )
) STRICT;

CREATE TABLE read_items (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  page_count INTEGER CHECK(page_count IS NULL OR page_count >= 0)
) STRICT;

CREATE TABLE watch_items (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  watch_progress_json TEXT CHECK(watch_progress_json IS NULL OR json_valid(watch_progress_json))
) STRICT;
```

Phase 02 enforces exactly one matching extension row per item in migration and write transactions. SQLite cannot express that cross-table totality with a simple `CHECK`; focused tests and transaction helpers are required.

## Properties, people, series, tags

```sql
CREATE TABLE item_properties (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL,
  property_key TEXT NOT NULL COLLATE BINARY,
  value_type TEXT NOT NULL CHECK(value_type IN ('string','number','boolean','date','json','null','unknown')),
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  source_order INTEGER,
  PRIMARY KEY(item_id, namespace, property_key)
) STRICT;

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  sort_name TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE TABLE item_people (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  role TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(item_id, person_id, role)
) STRICT;

CREATE TABLE series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_name TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE TABLE read_series (
  item_id TEXT PRIMARY KEY REFERENCES read_items(item_id) ON DELETE CASCADE,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE RESTRICT,
  position TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
) STRICT;

CREATE TABLE item_tags (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(item_id, tag_id)
) STRICT;
```

Languages and identifiers use `item_properties` initially. Dedicated tables are added only when concrete queries or constraints justify them.

## Provenance and files

```sql
CREATE TABLE provenance_sources (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_identity TEXT NOT NULL,
  source_relative_path TEXT,
  source_sha256 TEXT CHECK(source_sha256 IS NULL OR length(source_sha256) = 64),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  imported_at_utc TEXT,
  UNIQUE(item_id, source_type, source_identity)
) STRICT;

CREATE TABLE item_assets (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  provenance_id TEXT REFERENCES provenance_sources(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK(role IN ('reading_format','cover','preview','attachment','image','other')),
  relative_path TEXT NOT NULL,
  display_name TEXT NOT NULL,
  media_type TEXT,
  format TEXT,
  byte_size INTEGER CHECK(byte_size IS NULL OR byte_size >= 0),
  sha256 TEXT CHECK(sha256 IS NULL OR length(sha256) = 64),
  source_sha256 TEXT CHECK(source_sha256 IS NULL OR length(source_sha256) = 64),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  UNIQUE(item_id, relative_path)
) STRICT;
```

`relative_path` is logical and must pass the same path/real-path containment checks as the current reader bridge. A partial unique index permits at most one primary reading format per item while allowing no primary when selection is genuinely ambiguous.

## User-owned mutable data

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('thoughts','notes')),
  body_markdown TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  UNIQUE(item_id, kind)
) STRICT;

CREATE TABLE reading_positions (
  item_id TEXT NOT NULL REFERENCES read_items(item_id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES item_assets(id) ON DELETE CASCADE,
  adapter_kind TEXT NOT NULL CHECK(adapter_kind IN ('pdf','reflowable','legacy')),
  location_json TEXT NOT NULL CHECK(json_valid(location_json)),
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256) = 64),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at_utc TEXT NOT NULL,
  PRIMARY KEY(item_id, asset_id)
) STRICT;

CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES read_items(item_id) ON DELETE CASCADE,
  asset_id TEXT REFERENCES item_assets(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL,
  anchor_json TEXT NOT NULL CHECK(json_valid(anchor_json)),
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256) = 64),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  deleted_at_utc TEXT
) STRICT;

CREATE TABLE canvases (
  id TEXT PRIMARY KEY,
  item_id TEXT REFERENCES read_items(item_id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  document_relative_path TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
) STRICT;

CREATE TABLE canvas_links (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES read_items(item_id) ON DELETE CASCADE,
  annotation_id TEXT REFERENCES annotations(id) ON DELETE SET NULL,
  anchor_json TEXT CHECK(anchor_json IS NULL OR json_valid(anchor_json)),
  UNIQUE(canvas_id, element_id, item_id, annotation_id)
) STRICT;

CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  target_item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
  target_external_json TEXT CHECK(target_external_json IS NULL OR json_valid(target_external_json)),
  relationship_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('directed','undirected')),
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  created_at_utc TEXT NOT NULL,
  CHECK((target_item_id IS NULL) <> (target_external_json IS NULL))
) STRICT;
```

Annotation and canvas content remain versioned opaque JSON/documents until their later phases. This avoids premature subtype tables while preserving canonical ownership.

## Migration and operational tables

```sql
CREATE TABLE migration_runs (
  id TEXT PRIMARY KEY,
  source_fingerprint TEXT NOT NULL,
  target_schema_version INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('dry_run','apply','restore','rebuild')),
  status TEXT NOT NULL CHECK(status IN ('running','passed','failed','promoted','rolled_back')),
  started_at_utc TEXT NOT NULL,
  finished_at_utc TEXT,
  report_relative_path TEXT NOT NULL
) STRICT;

CREATE TABLE migration_items (
  run_id TEXT NOT NULL REFERENCES migration_runs(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','passed','failed','retained_unknown')),
  error_code TEXT,
  PRIMARY KEY(run_id, item_id)
) STRICT;
```

## Indexes and derived search

Required indexes:

- `items(collection, status, title COLLATE NOCASE)`
- `item_properties(namespace, property_key)` and `item_properties(item_id)`
- `item_people(person_id, role)`
- `item_tags(tag_id, item_id)`
- `item_assets(item_id, role, format)` plus unique primary-format index
- `provenance_sources(item_id, source_type)`
- `annotations(item_id, kind, updated_at_utc)`
- `relationships(source_item_id, relationship_type)` and `relationships(target_item_id)`

FTS5 is a rebuildable derived index over item title, summary, selected properties, and later annotation/note text. It is not part of the first migration transaction if exact parity can be proved without it.

## Transaction boundaries

- Metadata edit: `BEGIN IMMEDIATE`; verify expected item revision; update item and child rows; increment revision; commit.
- Note edit: verify expected note revision; update one note; commit; then write the deterministic recovery export. Export failure marks recovery state stale but does not falsify the committed edit.
- Migration: one item and all child records per transaction, with a run checkpoint. Promotion occurs only after all parity checks pass.
- Annotation/canvas write: one logical user action per transaction, including links and revision change.
- Delete: soft delete where later recovery requirements demand it; never cascade to source files. Database cascades remove only database-owned child rows.
- Engine calls and filesystem parsing never run inside a long database write transaction.

## Schema versions

Use both `PRAGMA user_version` for fast compatibility checks and checksummed `schema_migrations` rows for auditability. Migrations are forward-only in production, run against a verified backup, and fail closed on unknown versions or checksum mismatch. Rollback restores a pre-migration database to a new path; it does not attempt speculative reverse SQL against personal data.
