# Data Safety Constitution

Status: FIXED

## Protected classes

1. Original Notion exports
2. Verified immutable backup
3. Original source books and media
4. Imported evidence and provenance
5. User-authored notes, annotations, canvases, corrections, and relationships
6. Runtime state, generated library data, OCR output, and private reports
7. Recovery bundles and migration evidence

Protected/private classes live under `READ_WATCH_DATA_ROOT` and are not Git content.

## Immutable-source rules

- Read original exports, backup data, and source books only.
- Never edit, rename, move, delete, reorganize, deduplicate, convert in place, or overwrite them.
- Imports read from the verified backup and copy into controlled destinations.
- Derived exports use new paths and preserve source hashes and provenance.
- A failed source/backup verification blocks transformation, import, migration, reader-retirement, and release gates.

## Import and migration rules

- Deterministic inputs and destinations
- Stable identity independent of display title or ordering
- Idempotent reruns
- Restartable checkpoints
- Atomic promotion or transactions
- No-overwrite and conflict refusal
- Complete logs and provenance
- Count, bytes, relative-path, size, and SHA-256 verification
- Unknown properties/files retained and routed to review
- No silent lossy conversion

## Mutable-data rules

- Read & Watch owns canonical notes, annotations, positions, bookmarks, drawings, canvases, OCR corrections, and relationships.
- Use atomic writes or transactions, bounded recovery history, conflict detection, backups, and explicit schema versions.
- Detect source-book hash mismatch before resolving persisted anchors.
- Third-party cloud storage is never required for canonical persistence.

## Path and process safety

- Client input never grants arbitrary filesystem authority.
- Validate stable IDs, relative paths, containment, file type, existence, and expected format server-side or in the native bridge.
- Reject traversal, absolute input paths, symlink/junction escapes where relevant, malformed documents, and ambiguous candidates.
- Desktop process launching uses trusted resolved paths and explicit arguments.

## Git/public boundary

Never commit personal exports, backups, books, PDFs, EPUBs, media, private notes, canvases, OCR output, private screenshots, generated library data, runtime state, recovery bundles, secrets, credentials, machine-specific absolute paths, or operational reports. Commit only sanitized technical summaries under `docs/project/reports/`.

## Uncertainty

Unknown means UNKNOWN. Keep data, preserve evidence, record the uncertainty, and request human review where needed. Never turn absence of evidence into PASS.
