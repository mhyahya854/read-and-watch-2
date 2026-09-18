# Read & Watch — Backup and Restore Workflow

**Phase:** PHASE-12 (Export and Portability)  
**Task:** P12-T004  
**Status:** Approved Workflow Documentation  

---

## 1. Scope & Policy

### Included in Backup:
- **Library Catalog Metadata:** Item records, collections (`read` / `watch`), titles, summaries, tags, custom fields, Notion properties, and publication relationships.
- **Annotations & Highlights:** All active text marks (highlights, underlines, strikes), comments, excerpts, and drawing vectors.
- **Bookmarks:** All named location bookmarks with progression, page, and CFI references.
- **Notes & Thoughts:** All Markdown notes and thoughts files associated with library items.
- **Canvases & Assets:** All Excalidraw diagrams, embedded image assets (base64 encoded), and bidirectional deep links.
- **Saved Views & Relationships:** Optional v1 `libraryState` section with
  stable saved-view definitions/revisions/timestamps and full relationship
  records, including external targets, direction, position and provenance.

### Explicitly Excluded:
- **Original Publication Binaries:** Original EPUB and PDF book files are NOT included in the user-data backup. The backup manifest explicitly records:  
  `sourceBooksIncluded: false`  
  *"This backup contains Read & Watch data. Original books are not included."*
- **Derived Search Index:** The SQLite FTS5 search index is 100% derived and is rebuilt automatically after restoration.
- **Temporary & Runtime Data:** Caches, server logs, build artifacts, and visual review snapshots.

---

## 2. Backup Creation Workflow

1. User or automated schedule triggers `/api/portability/backup`.
2. The server gathers records from:
   - `libraryStore`
   - `annotationStore`
   - `readerStore` (bookmarks)
   - `userDataStore` (notes & thoughts)
   - `canvasStore` (canvases, links, embedded assets)
3. Computes individual SHA-256 digests for each data section (`librarySha256`, `libraryStateSha256`, `annotationsSha256`, `notesSha256`, `canvasesSha256`).
4. Generates a unique `backupId` and UTC ISO-8601 timestamp.
5. Writes the bundle atomically via temporary file (`.rwbackup.tmp-...`) to ensure atomicity.
6. Returns or downloads the `.rwbackup` JSON package.

---

## 3. Restore Workflow

### Step 1: Preflight & Validation
- Parses incoming `.rwbackup` package.
- Validates `schemaVersion === 1`. Fails closed if `schemaVersion > 1`.
- Verifies SHA-256 integrity checksums for each member.
- Inspects existing local database and file storage to classify conflicts:
  - `IDENTICAL`: Existing record matches incoming record exactly (skipped).
  - `CONFLICT_DIVERGENT`: Existing record has different revision or content.
  - `SOURCE_MISMATCH`: Restoring an annotation for a book whose local file hash differs.
  - `SOURCE_MISSING`: Restoring data for a book not yet in the local library.
- Returns a preflight report to the UI showing total counts, conflicts, and warnings.
- Saved views and relationships are preflighted by stable ID and case-insensitive
  saved-view name.

### Step 2: Atomic Application
- Wraps database operations in SQL transactions (`BEGIN IMMEDIATE ... COMMIT`).
- Staged file writes for notes and canvas documents/assets.
- Restores annotations, bookmarks, notes, canvases, and metadata.
- Restores saved views and relationships from the optional `libraryState`
  section using stable IDs; repeated restore is idempotent and relationships
  with missing referenced items produce warnings instead of fabricated targets.

### Step 3: Search Index Rebuild
- Clears the derived FTS5 tables (`search_index_fts`, `search_index_records`, `search_index_meta`).
- Re-indexes all newly restored entities from primary storage.
- Search becomes instantly operational across all restored material.
