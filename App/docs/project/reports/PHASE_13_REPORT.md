# Phase 13 Report — Knowledge and Diagram System

**Phase ID:** `PHASE-13`  
**Phase Title:** Knowledge and Diagram System  
**Status:** `COMPLETE`  
**Completion Date:** 2026-09-14  
**Content Commit:** `f8d0177` — Build Phase 13 knowledge and diagram system  
**Closure Commit:** `9a3e851` — Close Phase 13 knowledge and diagram system  
**Primary Verification Artifacts:**
- Unit & Integration Test Suites: `tests/knowledge-store.test.mjs` (213 total test cases passing across suite)
- Audits: `App/docs/project/reports/PHASE_13_GRAPHIFY_AUDIT.md`, `App/docs/project/reports/PHASE_13_PONYTAIL_AUDIT.md`
- Tool Selection Constitution: `App/docs/project/KNOWLEDGE_TOOL_SELECTION.md`

---

## Executive Summary

Phase 13 delivers a calibrated, selective knowledge and diagram system for *Read & Watch*. Rather than implementing a "universal graph system", this phase applies a strict tool-selection constitution to deploy exactly four tiers of knowledge tooling where each actually matters:

1. **Simple native UI** — default for notes, summaries, bullet points (unchanged from prior phases)
2. **Excalidraw** — freeform spatial concept canvases, book-linked (deployed in Phase 10, extended in Phase 13)
3. **React Flow (`@xyflow/react@12.11.6`)** — structured semantic concept graphs with typed nodes, typed edges, and deep links to books/annotations/notes/canvases
4. **Mermaid (`mermaid@12.0.0`)** — code-authored, text-defined technical diagrams (sequence, state, flowchart, etc.)

All canonical data is owned by SQLite. React Flow and Mermaid are strictly client-side rendering projections. All knowledge entities are crash-recoverable, search-indexed, exportable, and restorable via the Phase 12 portability system.

---

## Tasks Delivered

### P13-T001 — Tool Selection Constitution ✅

- **`docs/project/KNOWLEDGE_TOOL_SELECTION.md`**: A 4-tier tool selection guide documenting exact use cases, anti-cases, and boundaries for each tool.
- Defines decision criteria preventing tool overlap or scope creep.
- Added to DECISIONS.md as D-049, decision 1.

### P13-T002 — Standalone Concept Canvases ✅

- Confirmed `@excalidraw/excalidraw@0.18.1` already pinned and deployed in Phase 10.
- Added `standaloneOnly` filter to `canvas-store.mjs` `listCanvases()` for the Knowledge Hub summary.
- Knowledge Hub exposes a dedicated "Canvases" tab listing standalone concept canvases.

### P13-T003 — React Flow Semantic Topology ✅

- **`@xyflow/react@12.11.6`** pinned in `package.json` (MIT, compatible with React 19.2.8).
- **`server/knowledge-store.mjs`**: Full SQLite DDL for `knowledge_graphs`, `knowledge_nodes`, `knowledge_edges` tables. Optimistic concurrency (`expectedRevision`), soft-delete, file-first atomic mirrors.
- **`server/knowledge-vite-plugin.mjs`**: HTTP API plugin exposing `/api/knowledge/graphs` CRUD routes.
- **`components/knowledge/concept-node.tsx`**: Custom React Flow node with type styling (concept, thesis, evidence, source, person, event, question), deep link badge integration, and edit button.
- **`components/knowledge/concept-graph-canvas.tsx`**: Full interactive canvas with accessible table/outline fallback view, node inspector drawer (label, type, notes, deep link), optimistic concurrency save (HTTP 409 conflict banner), and export to `.rwgraph`.
- **`app/knowledge/graphs/[id]/page.tsx`**: Route `/knowledge/graphs/:id`.

### P13-T004 — Mermaid Text-Defined Diagrams ✅

- **`mermaid@12.0.0`** pinned in `package.json` (MIT).
- Always initialized with `securityLevel: 'strict'` — no script injection possible.
- **`server/knowledge-store.mjs`**: `mermaid_documents` table with source text, diagram type, tags, associated item FK.
- **`components/knowledge/mermaid-editor.tsx`**: Split editor/preview pane, 10 diagram type templates, calm inline syntax error banner, export to `.rwmermaid` and plain `.mermaid` source file.
- **`app/knowledge/diagrams/[id]/page.tsx`**: Route `/knowledge/diagrams/:id`.

### P13-T005 — Read & Watch-Owned Relationships and Deep Links ✅

- **`server/knowledge-store.mjs` `resolveDeepLink()`**: Server-side deep link resolution for all 6 link types:
  - `item` → library book URL (`/library/:id`)
  - `location` → reader position URL with anchor param (`/reader/:id?loc=...`)
  - `annotation` → annotation highlight URL with quote preview (`/reader/:id?annotationId=...`)
  - `notes` → reader notes tab (`/reader/:id?tab=notes`)
  - `canvas` → Excalidraw canvas URL (`/canvas-notes/:id`)
  - `external` → external web URL (prefixed with `https://` if missing)
- Unresolved links return `{ resolved: false, reason: "..." }` — calm, never crashes.
- **`components/knowledge/deep-link-badge.tsx`**: Client-side deep link badge calling `POST /api/knowledge/resolve-link`.
- **`POST /api/knowledge/resolve-link`**: HTTP endpoint in `knowledge-vite-plugin.mjs`.

### P13-T006 — Export, Persistence, Accessibility, Recovery ✅

- **File-first mirrors**: `user-data/knowledge/graphs/:id.json`, `user-data/knowledge/diagrams/:id.json`, `user-data/knowledge/diagrams/:id.mermaid`.
- **`rebuildFromFiles()`**: Recovers all graphs and diagrams from external file mirrors after SQLite corruption.
- **Portability integration**: Knowledge graphs and diagrams included in `.rwbackup` bundles via `server/portability-store.mjs`. Individual export routes: `/api/portability/knowledge/graphs/:id`, `/api/portability/knowledge/diagrams/:id`.
- **Search integration**: `server/search-store.mjs` `rebuildIndex()` steps 6 & 7 index knowledge_graphs (title, description, node labels) and mermaid_documents (title, source text). Graceful `try/catch` for schema-version compatibility.
- **Accessible fallback**: ConceptGraphCanvas provides a complete table/outline view when canvas cannot render.

---

## Verification Gates

### P13-G001 — Each Tool Has a Justified Use Case and No Duplicated Ownership ✅

- **Excalidraw**: Freeform spatial canvas, book-linked, pixel-perfect layout. No structured semantics.
- **React Flow**: Typed nodes/edges, semantic relationships, deep links. No freeform drawing.
- **Mermaid**: Text-defined diagram authoring (sequence, state, ERD, etc.). No interactive manipulation.
- **Simple UI**: Default for everything not requiring a dedicated tool.
- Verified in `PHASE_13_GRAPHIFY_AUDIT.md` and `PHASE_13_PONYTAIL_AUDIT.md`.

### P13-G002 — Semantic Graph Integrity and Deep-Link Tests Pass ✅

- `tests/knowledge-store.test.mjs`: 30+ test cases covering:
  - Graph CRUD and revision tracking
  - Diagram CRUD and file mirrors
  - All 6 deep link types (resolved and unresolved)
  - Crash recovery (`rebuildFromFiles`)
  - Optimistic concurrency (409 conflict detection)
  - Search invalidation integration
  - Tag filtering
  - Error handling for invalid inputs
- 213/213 tests pass across full test suite.

### P13-G003 — Ordinary Notes and Annotations Remain Simple and Independent ✅

- No changes to `server/annotation-store.mjs`, `server/reader-store.mjs`, or `server/user-data-store.mjs`.
- The knowledge system is additive: new routes, new tables, new components in `components/knowledge/`.
- Existing reader, notes, annotation, and study browser functionality is completely unchanged.

### P13-G004 — Common Gates, Graphify, Ponytail, Commit, Push, GitHub Verification ✅

- Lint: 0 warnings, 0 errors (`npm run lint`)
- TypeScript: 0 errors (`npx tsc --noEmit`)
- Tests: 213/213 pass (`npm test`)
- Hygiene: PASS, 262 tracked paths (`npm run hygiene`)
- Governance: PASS, 21 phases, 231 task/gate IDs (`python scripts/validate_project_state.py`)
- Graphify audit: `docs/project/reports/PHASE_13_GRAPHIFY_AUDIT.md`
- Ponytail audit: `docs/project/reports/PHASE_13_PONYTAIL_AUDIT.md`

---

## New Files Created

| File | Purpose |
|---|---|
| `app/server/knowledge-store.mjs` | Canonical knowledge graph and diagram persistence |
| `app/server/knowledge-vite-plugin.mjs` | HTTP API plugin for /api/knowledge/* routes |
| `app/lib/knowledge/types.ts` | TypeScript types for all knowledge entities |
| `app/lib/knowledge/index.ts` | Barrel re-export |
| `app/components/knowledge/concept-node.tsx` | React Flow custom node renderer |
| `app/components/knowledge/concept-graph-canvas.tsx` | Full interactive concept graph canvas |
| `app/components/knowledge/mermaid-editor.tsx` | Mermaid split editor/preview |
| `app/components/knowledge/knowledge-hub.tsx` | 4-tab knowledge dashboard |
| `app/components/knowledge/deep-link-badge.tsx` | Deep link resolution badge |
| `app/components/knowledge/index.ts` | Barrel re-export |
| `app/app/knowledge/page.tsx` | Route /knowledge |
| `app/app/knowledge/graphs/[id]/page.tsx` | Route /knowledge/graphs/:id |
| `app/app/knowledge/diagrams/[id]/page.tsx` | Route /knowledge/diagrams/:id |
| `app/tests/knowledge-store.test.mjs` | Full knowledge store test suite |
| `docs/project/KNOWLEDGE_TOOL_SELECTION.md` | Tool selection constitution |
| `docs/project/reports/PHASE_13_GRAPHIFY_AUDIT.md` | Graphify architectural audit |
| `docs/project/reports/PHASE_13_PONYTAIL_AUDIT.md` | Ponytail over-engineering audit |

---

## Stop Condition

Phase 13 is complete. Per MASTER_PLAN.md stop condition: **Do not begin desktop packaging.**
