# Read & Watch — Portable Schema Specification

**Schema Version:** 1  
**Phase:** PHASE-12 (Export and Portability)  
**Status:** Canonical Reference  

---

## 1. Architectural Principles

1. **Exports are Representations, Not Canonical Authority:**  
   Canonical data is owned by SQLite and the designated file-first stores under `user-data`. Export packages are point-in-time representations designed for lossless transport, verified interchange, and complete restoration.
2. **Strict Versioning & Fail-Closed Guard:**  
   Every machine-restorable format explicitly declares `format` and integer `schemaVersion`. An importer encountering an unknown future `schemaVersion > 1` must immediately **fail closed** with a descriptive user message directing the user to upgrade Read & Watch.
3. **No Personal Absolute Paths:**  
   Export payloads strictly omit machine-specific root paths (`C:\`, `/Users/`, OneDrive sync roots, temp directories). Sources are reconciled across machines and directories exclusively via stable item IDs and **source SHA-256 digests**.
4. **Deterministic & Inspectable:**  
   Payloads use sorted keys, predictable collection ordering (by ID or document sequence), and canonical ISO-8601 UTC timestamps (`YYYY-MM-DDTHH:mm:ss.sssZ`).
5. **No Derived State in Backups:**  
   Derived search indexes (FTS5 tables) and ephemeral caches are explicitly excluded. After restoration, derived indexes are cleanly rebuilt from primary data.
6. **Source Document Immutability:**  
   Source publications (EPUB, PDF, CBZ, etc.) are strictly read-only. Export and restoration workflows never mutate or overwrite original source books.

---

## 2. Compatibility Guarantee

| Condition | Importer Behavior | Rationale |
|---|---|---|
| `schemaVersion === 1` | Parse, validate, and restore | Baseline specification |
| `schemaVersion > 1` | **Reject immediately** (HTTP 422 / error notice) | Prevents silent data corruption from future schema structures |
| Missing required fields | **Reject immediately** (Validation Error) | Guarantees entity integrity and referential safety |
| Unknown additive fields in v1 | Safely ignore or preserve | Allows forward-compatible non-breaking metadata enhancements |
| Unknown enum values | **Reject entity** | Prevents corrupting state machines or lifecycles |
| SHA-256 mismatch | **Alert user; refuse or mark unverified** | Detects corrupted or tampered export archives |

---

## 3. Stable Format Identifiers

All machine-readable packages declare one of the following format discriminators:

- `read-watch.annotations`: Canonical lossless annotations (and bookmarks) package.
- `read-watch.notes`: Canonical Markdown notes and thoughts package with item provenance.
- `read-watch-canvas-export` (or `read-watch.canvas`): Pinned Phase 10 `.rwcanvas` document and asset bundle.
- `read-watch.library-metadata`: Complete library catalog metadata and relationships.
- `read-watch.backup`: Unified single-file or directory backup bundle uniting all components with a manifest.

---

## 4. Format Specifications

### 4.1 Annotations (`read-watch.annotations`)
Losslessly preserves all Phase 09 annotation kinds:
- **Text marks**: `highlight`, `underline`, `strike` with zoom/rotation-invariant `NormalizedRect` collections or EPUB CFI ranges.
- **Drawings**: Vector strokes, lines, arrows, rectangles, ellipses, and text boxes with control points and bounds.
- **Comments & Excerpts**: Markdown notes, quoted text, context prefixes/suffixes.
- **Bookmarks**: Phase 07 canonical bookmarks with `DocumentLocation`, label, and source SHA-256.
- **Lifecycle**: Soft-deleted annotations are excluded by default; can be included if requested with `includeDeleted: true`.

### 4.2 Notes (`read-watch.notes`)
Transports item notes and thoughts while maintaining full Markdown fidelity:
- Native Markdown text preserved without lossy conversions or escaping.
- Stable item provenance (`itemId`, title hint, source SHA-256).
- Revisions and timestamps for conflict detection during restoration.

### 4.3 Canvas (`read-watch-canvas-export`)
Reuses the verified Phase 10 `.rwcanvas` specification:
- Full Excalidraw scene elements and state.
- Bidirectional deep links connecting scene elements to reading locations and Phase 09 annotation IDs.
- Embedded base64 assets for standalone, self-contained transport.

### 4.4 Library Metadata (`read-watch.library-metadata`)
Transports publication catalog information:
- Collection (`read` / `watch`), status, title, tags, summaries, Notion properties.
- Media descriptors containing clean relative file names, extensions, byte sizes, and source SHA-256 hashes.
- Relationships between publications.

### 4.5 Unified Backup (`read-watch.backup`)
Full application state snapshot (excluding original book binaries):
- **Policy Declaration**:
  `sourceBooksIncluded: false`  
  *"This backup contains Read & Watch data. Original books are not included."*
- **Manifest**: Contains backup ID, creation timestamp, member counts, and section SHA-256 checksums (`librarySha256`, `annotationsSha256`, `notesSha256`, `canvasesSha256`).
- **Data Sections**: Complete `library`, `annotations`, `notes`, and `canvases` records.
- **Exclusions**: FTS5 search tables, runtime caches, logs, temp files.
