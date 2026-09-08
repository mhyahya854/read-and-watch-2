BEGIN IMMEDIATE;

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL CHECK(length(checksum) = 64),
  applied_at_utc TEXT NOT NULL
) STRICT;

CREATE TABLE library_meta (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK(json_valid(value_json))
) STRICT;

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL CHECK(collection IN ('read','watch')),
  source_order INTEGER NOT NULL UNIQUE CHECK(source_order >= 0),
  item_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  rating REAL CHECK(rating IS NULL OR (rating >= 0 AND rating <= 5)),
  summary TEXT NOT NULL DEFAULT '',
  source_added TEXT NOT NULL DEFAULT '',
  provenance_kind TEXT NOT NULL CHECK(provenance_kind IN ('notion','personal_book','manual','unknown')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  CHECK(
    (collection = 'read' AND length(id) = 37 AND substr(id,1,5) = 'read-' AND
     substr(id,6) NOT GLOB '*[^0-9a-f]*') OR
    (collection = 'watch' AND length(id) = 38 AND substr(id,1,6) = 'watch-' AND
     substr(id,7) NOT GLOB '*[^0-9a-f]*')
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

CREATE TRIGGER read_items_collection
BEFORE INSERT ON read_items
WHEN (SELECT collection FROM items WHERE id = NEW.item_id) <> 'read'
BEGIN SELECT RAISE(ABORT, 'read extension requires read item'); END;

CREATE TRIGGER watch_items_collection
BEFORE INSERT ON watch_items
WHEN (SELECT collection FROM items WHERE id = NEW.item_id) <> 'watch'
BEGIN SELECT RAISE(ABORT, 'watch extension requires watch item'); END;

CREATE TABLE item_properties (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL,
  property_key TEXT NOT NULL COLLATE BINARY,
  value_type TEXT NOT NULL CHECK(value_type IN ('string','number','boolean','date','json','null','unknown')),
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  source_order INTEGER NOT NULL DEFAULT 0,
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
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(item_id, tag_id)
) STRICT;

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
  relative_path TEXT NOT NULL,
  display_name TEXT NOT NULL,
  media_type TEXT,
  format TEXT,
  extension TEXT NOT NULL DEFAULT '',
  byte_size INTEGER CHECK(byte_size IS NULL OR byte_size >= 0),
  sha256 TEXT CHECK(sha256 IS NULL OR length(sha256) = 64),
  source_sha256 TEXT CHECK(source_sha256 IS NULL OR length(source_sha256) = 64),
  source_order INTEGER,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  UNIQUE(item_id, relative_path)
) STRICT;

CREATE TABLE asset_roles (
  asset_id TEXT NOT NULL REFERENCES item_assets(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('catalog_media','reading_format','cover','preview','attachment','image','other')),
  PRIMARY KEY(asset_id, role)
) STRICT;

CREATE UNIQUE INDEX one_primary_reading_format
ON item_assets(item_id) WHERE is_primary = 1;

CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  target_item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
  target_external_json TEXT CHECK(target_external_json IS NULL OR json_valid(target_external_json)),
  relationship_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('directed','undirected')),
  position INTEGER NOT NULL DEFAULT 0,
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  created_at_utc TEXT NOT NULL,
  CHECK((target_item_id IS NULL) <> (target_external_json IS NULL))
) STRICT;

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

CREATE TABLE saved_views (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
) STRICT;

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
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256) = 64),
  status TEXT NOT NULL CHECK(status IN ('pending','passed','failed','retained_unknown')),
  error_code TEXT,
  PRIMARY KEY(run_id, item_id)
) STRICT;

CREATE INDEX items_collection_status_title ON items(collection, status, title COLLATE NOCASE);
CREATE INDEX item_properties_lookup ON item_properties(namespace, property_key, item_id);
CREATE INDEX item_people_lookup ON item_people(person_id, role, item_id);
CREATE INDEX item_tags_lookup ON item_tags(tag_id, item_id);
CREATE INDEX item_assets_lookup ON item_assets(item_id, format, source_order);
CREATE INDEX provenance_lookup ON provenance_sources(item_id, source_type);
CREATE INDEX relationships_source ON relationships(source_item_id, relationship_type, position);
CREATE INDEX relationships_target ON relationships(target_item_id);

INSERT INTO schema_migrations(version, name, checksum, applied_at_utc)
VALUES (1, 'initial', '__CHECKSUM__', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
PRAGMA user_version = 1;

COMMIT;
