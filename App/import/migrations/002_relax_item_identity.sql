BEGIN IMMEDIATE;

-- Portable title identities are generated once and preserved. The checkpoint-2
-- generator emits read-/watch- plus 8 random bytes (16 lowercase hex chars),
-- while the Phase 02 import schema required exactly 32 hex characters. Identity
-- must not be rewritten to satisfy a database length check, so this migration
-- widens the accepted range while keeping the same prefix and hex-only rules.
CREATE TABLE items_v2 (
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
    (collection = 'read' AND length(id) >= 14 AND substr(id,1,5) = 'read-' AND
     substr(id,6) NOT GLOB '*[^0-9a-f]*') OR
    (collection = 'watch' AND length(id) >= 15 AND substr(id,1,6) = 'watch-' AND
     substr(id,7) NOT GLOB '*[^0-9a-f]*')
  )
) STRICT;

INSERT INTO items_v2
SELECT id, collection, source_order, item_path, title, item_type, status,
       rating, summary, source_added, provenance_kind, revision,
       created_at_utc, updated_at_utc
FROM items;

DROP TABLE items;
ALTER TABLE items_v2 RENAME TO items;

CREATE INDEX items_collection_status_title ON items(collection, status, title COLLATE NOCASE);

INSERT INTO schema_migrations(version, name, checksum, applied_at_utc)
VALUES (2, 'relax_item_identity', '__CHECKSUM__', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

PRAGMA user_version = 2;

COMMIT;
