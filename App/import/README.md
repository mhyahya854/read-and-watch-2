# Import Pipeline

The import pipeline is source code; all of its data lives under the configured
external `READ_WATCH_DATA_ROOT`. It copies source exports to
`App/backup/notion-original-snapshot/` there, inspects that backup, stages under
`App/import/`, and atomically promotes verified items into `App/library/`.

Import code must be deterministic, non-destructive, idempotent, restartable, logged, checkpointed, and provenance-preserving. It must never silently overwrite a conflict or discard unknown source data.
