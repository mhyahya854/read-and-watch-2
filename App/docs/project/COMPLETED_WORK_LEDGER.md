# Completed Work Ledger

This ledger is a sanitized index. Detailed evidence remains under the external data root.

| ID | Work | Status | Certified evidence |
| --- | --- | --- | --- |
| HIST-REPO | Repository separation and clean public history | CERTIFIED | External migration report; live local/GitHub reconciliation; hygiene PASS |
| HIST-T1 | Task 1 foundation and deterministic Notion import | CERTIFIED | Task 1 final report; live backup/library verification |
| HIST-T2 | Local persistent My Thoughts and Notes | CERTIFIED | Task 2 reports; 14 persistence tests within the 28-test parent suite |
| HIST-T3 | Legacy Readest integration and real-book gate | CERTIFIED | Task 3 architecture, resolver, reader, real-book, and final reports; live regression suite |
| HIST-GRAPH | Prior application graph | SUPERSEDED BY BOOTSTRAP REFRESH | External Graphify history retained; current audit is in the bootstrap report |
| LEGACY-T4 | Old Readest-centric annotations plan | SUPERSEDED - NOT COMPLETE | Historical unchecked checklist retained in `TASKS.md`; do not execute |
| PHASE-13 | Knowledge and Diagram System | CERTIFIED | 213/213 tests pass; knowledge-store.test.mjs; PHASE_13_REPORT.md; Graphify + Ponytail audits; lint/tsc/hygiene PASS |

## Repository separation certification

- Personal, backup, runtime, generated, and operational content was exported from Git and verified before relocation.
- The external data root and repository boundary are enforced by shared path resolution, ignore rules, hygiene checks, and tests.
- The public repository was rebuilt from clean history.
- Forbidden paths and personal LFS objects are absent.
- Recovery bundles were retained outside Git.
- Fresh-clone application and vendored-source verification passed in the migration evidence.
- Vendored Readest source is provenance-pinned with no nested Git metadata.

## Task 1 certification

- Immutable source and verified-backup workflow established.
- Canonical export audit found 19 Read and 71 Watch records.
- Deterministic, idempotent, staged, provenance-preserving importer completed 90 records and 74 attachments with no conflicts.
- Generated library indexes/catalog and the initial React/TypeScript UI were verified.
- Source/library integrity and UI/build gates passed.

## Task 2 certification

- Whole-PC location audit found one canonical project copy at the time of audit and no divergent copy.
- Stable catalog IDs are the only accepted write authority.
- Thoughts and Notes use separate UTF-8 files, lazy creation, atomic replacement, bounded recovery history, conflict detection, and a compact index.
- Server-side path traversal and invalid-ID defenses are tested.
- UI save/reload/switching behavior and regressions passed.

## Task 3 certification

- All original Read records were audited without treating preview images or Notion exports as books.
- Official Readest source and license are recorded and vendored at the certified pin.
- The parent app resolves only stable Read IDs and server-issued candidate IDs; browser-supplied paths are rejected.
- A real user-added PDF record was copied without source mutation and verified end to end.
- Current Readest source/runtime remains a separate certified fallback.

## Supersession

Legacy Task 4 remains historically accurate but incomplete. It is superseded because future annotations, readers, storage, canvases, and exports belong to the Read & Watch-owned architecture in `MASTER_PLAN.md`.

## Phase 13 certification

- Calibrated 4-tier tool selection constitution enforced: simple UI < Excalidraw < React Flow < Mermaid.
- `@xyflow/react@12.11.6` and `mermaid@12.0.0` exact-pinned (MIT); both scoped to single components.
- `server/knowledge-store.mjs`: SQLite DDL for `knowledge_graphs`, `knowledge_nodes`, `knowledge_edges`, `mermaid_documents`. Optimistic concurrency, soft-delete, file-first atomic mirrors.
- Deep link resolution for 6 link types (item, location, annotation, notes, canvas, external) — server-side, calm on unresolved.
- Crash recovery (`rebuildFromFiles`) restores graphs and diagrams from external file mirrors.
- Knowledge integrated into Phase 12 portability: backup bundles, conflict detection, restore, individual export routes.
- Search integration: FTS5 index covers knowledge graph titles/nodes and Mermaid diagram source text.
- 213/213 tests pass; lint 0 errors; TypeScript 0 errors; hygiene PASS.
- Phase 13 stop condition respected: no desktop packaging started.
