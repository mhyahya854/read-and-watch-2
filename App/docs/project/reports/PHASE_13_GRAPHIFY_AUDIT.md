# Phase 13 Graphify Audit — Knowledge and Diagram System

**Date:** 2026-09-14  
**Phase:** PHASE-13  
**Auditor:** Antigravity automated audit

---

## Summary

| Metric | Value | Status |
|---|---|---|
| Canonical Ownership vs React Flow Scope | **100%** (SQLite owns all data; RF is transient projection) | PASS |
| Source Document Writes from Knowledge System | **0** (zero reads or writes to EPUB/PDF sources) | PASS |
| Overlapping Knowledge Engines | **0** (Excalidraw, React Flow, Mermaid each own distinct tier) | PASS |
| Graph State Leakage into Search Index | **0%** (Search is derived from knowledge tables only; no UI state) | PASS |
| Import Cycles Introduced | **0** | PASS |
| Deep Link Resolution to External Services | **0%** (All resolution is local SQLite lookup only) | PASS |
| Mermaid Security Violations | **0** (`securityLevel: 'strict'` enforced at init) | PASS |

---

## Module Dependency Graph — Knowledge Architecture

```
lib/knowledge/types.ts
  └── (pure TypeScript types: KnowledgeNode, KnowledgeEdge, KnowledgeGraphDocument,
        MermaidDocument, DeepLinkRef, DeepLinkResolution, KnowledgeIndexSummary)

lib/knowledge/index.ts
  └── lib/knowledge/types.ts (barrel re-export)

server/knowledge-store.mjs
  └── node:sqlite (DatabaseSync — canonical persistence)
  └── node:fs, node:path, node:crypto (file-first atomic mirrors, UUID generation)
  └── zero imports from lib/knowledge (types are JS-only at runtime; validation is TS build-only)
  └── strictly downstream; no circular dependencies

server/knowledge-vite-plugin.mjs
  └── server/knowledge-store.mjs
  └── server/data-paths.mjs
  └── server/search-store.mjs (createSearchStore — for invalidation)
  └── server/canvas-store.mjs (for standaloneOnly summary)
  └── mounts HTTP routes under /api/knowledge/*

server/search-store.mjs
  └── reads knowledge_graphs, knowledge_nodes, mermaid_documents (graceful try/catch)
  └── DERIVED: FTS5 tables rebuilt from canonical store; no write-back

server/portability-store.mjs
  └── server/knowledge-store.mjs (via createKnowledgeStore parameter)
  └── knowledge included in backup bundles and restore preflight
  └── zero circular import

server/portability-vite-plugin.mjs
  └── server/knowledge-store.mjs (createKnowledgeStore for export routes)
  └── routes: /api/portability/knowledge/graphs/:id, /api/portability/knowledge/diagrams/:id

components/knowledge/concept-node.tsx
  └── lib/knowledge/types.ts
  └── @xyflow/react (ConceptNodeData props only; no canonical data mutations)

components/knowledge/concept-graph-canvas.tsx
  └── @xyflow/react (transient client-side projection)
  └── lib/knowledge/types.ts
  └── components/knowledge/concept-node.tsx
  └── components/knowledge/deep-link-badge.tsx
  └── HTTP: POST /api/knowledge/graphs/:id (save back to canonical)

components/knowledge/mermaid-editor.tsx
  └── mermaid (text → SVG; SVG is disposable, source text is canonical)
  └── lib/knowledge/types.ts
  └── HTTP: PUT /api/knowledge/diagrams/:id

components/knowledge/knowledge-hub.tsx
  └── components/knowledge/concept-graph-canvas.tsx
  └── components/knowledge/mermaid-editor.tsx
  └── components/canvas/CanvasList (standaloneOnly)
  └── HTTP: GET /api/knowledge/summary

components/knowledge/deep-link-badge.tsx
  └── HTTP: POST /api/knowledge/resolve-link
  └── lib/knowledge/types.ts

app/knowledge/page.tsx
  └── components/knowledge/knowledge-hub.tsx

app/knowledge/graphs/[id]/page.tsx
  └── components/knowledge/concept-graph-canvas.tsx

app/knowledge/diagrams/[id]/page.tsx
  └── components/knowledge/mermaid-editor.tsx
```

---

## Graph Invariant Checks

1. **React Flow as Transient Projection Only**:
   - `@xyflow/react` receives a derived `Node[]` array projected from `KnowledgeNode[]` in `useMemo`.
   - When the user saves, the canonical `KnowledgeGraphDocument` is reconstructed from React Flow state and sent to the server.
   - React Flow has no access to the SQLite database; it never becomes canonical data.

2. **No Tool Overlap**:
   - Excalidraw (`@excalidraw/excalidraw`): freeform spatial canvas notes, no semantic typing.
   - React Flow (`@xyflow/react`): structured typed concept graphs with typed edges and deep links.
   - Mermaid (`mermaid`): text-defined, code-reviewed diagram authoring (flowchart, sequence, state, etc.).
   - All three tools serve distinct use cases; none duplicate each other's ownership.

3. **Deep Link Resolution Isolation**:
   - All link resolution is server-side via `POST /api/knowledge/resolve-link`.
   - The resolver queries `items`, `annotations`, and `canvases` tables — all local SQLite reads.
   - No external HTTP calls; no CDN lookups; no analytics telemetry.

4. **Search Index Derivation**:
   - `rebuildIndex()` in `search-store.mjs` queries `knowledge_graphs`, `knowledge_nodes`, and `mermaid_documents` tables.
   - It uses `try/catch` around knowledge table queries so older databases without these tables (schema versions before Phase 13) degrade gracefully.
   - The FTS5 search tables are derived and disposable; canonical data is in the typed knowledge tables only.

5. **Zero Import Cycles**:
   - `lib/knowledge/types.ts` has no imports from `server/` or `components/`.
   - `server/knowledge-store.mjs` has no imports from `lib/` or `components/`.
   - `knowledge-vite-plugin.mjs` is a terminal node (imports stores, exports routes; nothing imports from it).

---

## Conclusion

Phase 13 strictly maintains the project's unidirectional data architecture. React Flow and Mermaid are contained to their client-side rendering roles. All canonical knowledge data flows through SQLite → file-first mirror → knowledge-store → HTTP API → client. No overlap with the source document immutability boundary. No circular imports.
