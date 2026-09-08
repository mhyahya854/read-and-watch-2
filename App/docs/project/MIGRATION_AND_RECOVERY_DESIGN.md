# Migration and Recovery Design

Status: Phase 01 design; no migration performed

## Authority and safety

The immutable Notion backup, imported evidence, original books, and existing mutable user data are read-only migration inputs. Phase 02 writes only to new staging/database/export paths under `READ_WATCH_DATA_ROOT`. It never edits source records, source books, or the verified backup.

## Source fingerprint

A migration source fingerprint contains:

- Git commit and importer/schema versions
- catalog schema version, record counts, unique stable IDs, and catalog SHA-256
- import-plan, user-added-manifest, provenance, and verification checkpoint digests
- per-item source artifact, media, and user-data relative path, byte size, and SHA-256
- exact source property-key inventory and retained-unknown count

The public phase report contains counts and statuses only. Full paths and hashes remain in the external operational report.

## Deterministic migration protocol

1. Verify Git/local state, immutable backup, library, user-added source/copy evidence, and no in-repository data root.
2. Freeze a source fingerprint and refuse to proceed if the source changes during the run.
3. Create a new uniquely named dry-run database under an external staging directory.
4. Apply checksummed schema migrations to the empty database.
5. Import each item by stable ID in deterministic ID order, one transaction per item.
6. Preserve every current field, exact Notion property key/value, provenance payload, asset, note, and retained unknown.
7. Record item checkpoint status and source digest. A matching passed checkpoint may be reused; a mismatch is a conflict.
8. Run parity gates: 91 item IDs, 20 Read, 71 Watch, 90 Notion-derived, one user-added, 75 media references, exact property bags, note bytes, paths, hashes, extension-row consistency, foreign keys, and no unaccounted fields.
9. Export the dry-run database to the file-first recovery format and rebuild a second database from that export.
10. Compare the original dry-run and rebuilt databases by canonical row serialization and semantic counts.
11. Run `PRAGMA quick_check`, `PRAGMA foreign_key_check`, and representative application queries.
12. Produce a sanitized report and stop on any mismatch. No live promotion is implicit.

An apply run repeats from the same frozen inputs. It never promotes the earlier dry-run file. Promotion requires a fresh backup, identical source fingerprint, all gates, and an explicit phase task.

## File-first recovery format

Each complete snapshot is immutable and self-contained except for source books, which are referenced by verified relative path and hash:

```text
exports/<snapshot-id>/
  manifest.json
  items/<stable-id>.json
  notes/<stable-id>/thoughts.md
  notes/<stable-id>/notes.md
  annotations/<stable-id>.jsonl
  canvases/<canvas-id>.json
  canvas-files/<canvas-id>.excalidraw
  files.json
  checksums.sha256
```

- `manifest.json` declares schema version, snapshot ID, creation time, source database fingerprint, record counts, and all component files.
- Item JSON includes common, collection-specific, properties, people, tags, assets, provenance, relationships, and retained-unknown payloads.
- Notes remain UTF-8 Markdown with metadata in item JSON.
- Annotation JSONL and canvas JSON are versioned and deterministically ordered.
- `files.json` records logical asset paths, roles, byte sizes, hashes, and provenance without embedding books.
- `checksums.sha256` covers every snapshot file; the manifest is written last.
- A snapshot directory is never mutated after completion. A small `latest.json` pointer is atomically replaced only after full verification.

The export format is the complete rebuild substrate. It is not writable concurrently with SQLite and does not create dual-master ambiguity.

## Database backup

- Use SQLite's online backup API or `VACUUM INTO` to a new external file.
- Verify `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, file size, SHA-256, schema version, and source database fingerprint.
- Write a sidecar manifest containing these values and the matching file-first snapshot ID.
- Never back up by copying only a live WAL-mode main database file.
- Retention is bounded by an explicit policy in Phase 02; deletion is not automatic until verified restore coverage exists.

## Restore protocol

1. Select a verified database backup plus matching file-first snapshot.
2. Restore to a new path, never over the active database.
3. Verify hashes, integrity, foreign keys, schema version, counts, stable IDs, source bindings, and representative queries.
4. Compare against snapshot manifest and export contents.
5. Close application connections and retain the current database as a rollback artifact.
6. Atomically switch a small active-database pointer or rename within the same volume.
7. Reopen, run smoke checks, and record the restore run.
8. On failure, switch back to the retained database; never modify source books or imports.

## Disaster rebuild

Create an empty database at the snapshot schema version, import deterministic files in stable order, verify every checksum and retained-unknown payload, rebuild derived indexes, then run the same parity and application-query gates. Missing referenced books are reported as unavailable assets; their records and provenance remain. A hash mismatch blocks anchor/progress resolution and enters review.

## Idempotency and interruption

- Run IDs and source fingerprints are immutable.
- Re-running a passed item with identical source digest is a no-op verification.
- Existing target rows with different values are conflicts, never overwritten.
- A failed item transaction leaves no partial item rows.
- Interrupted exports are incomplete because the manifest is absent; they are not eligible for restore.
- Temporary databases and snapshots remain for review until a later bounded cleanup task.
- Promotion is one explicit operation after all checks, not a side effect of import.

## Representative walkthroughs

### A. Current catalog dry run

Input: the verified 91-item catalog, import/provenance records, 75 media references, and current Thoughts/Notes.

Expected: exact stable-ID and property parity, 20 Read extension rows, 71 Watch extension rows, one user-added provenance record, no source writes, no unaccounted source field, and a rebuild-equivalent database.

Result in Phase 01: design walkthrough PASS. No database was created.

### B. Interrupted migration

Inject failure after an item begins but before commit. Expected: that item's rows are absent, earlier passed checkpoints remain valid, rerun verifies them and resumes at the failed ID, and source fingerprints remain unchanged.

Result in Phase 01: transaction design walkthrough PASS. Phase 02 must implement the executable fault test.

### C. Restore and rollback

Restore a verified backup to a new path, compare it with the file-first snapshot, switch the active pointer, then inject an application smoke-test failure. Expected: rollback selects the retained pre-restore database and records the failed restore without touching sources.

Result in Phase 01: recovery design walkthrough PASS. Phase 02 must implement the executable restore test.

### D. Stale provenance path

Input: a source path recorded before repository separation, with the same source now found under the external data root and matching recorded/imported-copy hash and size.

Expected: dry run records the stale path as historical evidence, resolves the current location only through verified hash/size and approved root, and requires a reviewed normalized provenance update. It never rewrites the source or guesses by filename alone.

Result in Phase 01: retained discrepancy is fully specified and nonblocking for design. Phase 02 must test and resolve it before live migration.

## Completion gates for Phase 02 migration

- All stable IDs, source fields, properties, files, notes, and unknowns accounted for
- Source fingerprint unchanged from preflight through promotion
- Dry-run and rebuild databases semantically identical
- Transaction interruption, idempotent rerun, backup, restore, and rollback tests pass
- Existing application behavior passes against the migration candidate
- Protected source hashes and file counts unchanged
- Graphify, Ponytail, hygiene, governance, commit, push, and GitHub verification pass

Until those gates pass, the generated JSON/file-first system remains active and the candidate SQLite database is disposable.
