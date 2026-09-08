# Import Pipeline

The import pipeline is source code; all of its data lives under the configured
external `READ_WATCH_DATA_ROOT`. It copies source exports to
`App/backup/notion-original-snapshot/` there, inspects that backup, stages under
`App/import/`, and atomically promotes verified items into `App/library/`.

Import code must be deterministic, non-destructive, idempotent, restartable, logged, checkpointed, and provenance-preserving. It must never silently overwrite a conflict or discard unknown source data.

## Library database

Phase 02 makes `state/read-watch.sqlite3` under the external data root the canonical runtime store. The checked-in migration and command-line tool use Python's standard-library SQLite support and never place a database in Git.

```text
python import/scripts/library_database.py candidate --mode dry_run --output <external-new-database>
python import/scripts/library_database.py export <external-database> <external-new-snapshot-directory>
python import/scripts/library_database.py rebuild <external-snapshot-directory> <external-new-database>
python import/scripts/library_database.py backup <external-database> <external-new-backup> <external-snapshot-directory>
python import/scripts/library_database.py promote <verified-external-candidate>
```

Every output path must be new. Candidate creation refuses overwrite, source fingerprints cover the catalog, referenced library files, user notes, and migration evidence, and promotion retains the previous active database as a rollback artifact.
