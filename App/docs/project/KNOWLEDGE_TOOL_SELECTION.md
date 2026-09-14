# Read & Watch: Knowledge Tool Selection Constitution

**Document ID**: `KNOWLEDGE-SELECTION-V1`  
**Phase**: `PHASE-13`  
**Status**: `CANONICAL`  
**Date**: `2026-09-14`  

---

## 1. Executive Summary & Core Principle

In personal knowledge management and digital reading applications, a common architectural fallacy is **"everything is a graph"**—an anti-pattern where text notes, margin highlights, bookmarks, documents, and tags are flattened into generic nodes connected by generic edges. This homogenization forces high cognitive friction onto linear reading, degrades accessibility, clutters visual hierarchy, and destroys the specialized ergonomics required for reading, annotating, drawing, and diagramming.

**Read & Watch explicitly rejects the universal graph model.**

Instead, Read & Watch implements a **Calibrated 4-Tier Knowledge Tool Architecture**:
1. **Simple Native UI** (Default, linear, lowest friction)
2. **Excalidraw** (Freeform spatial, whiteboard, beside-book sketches)
3. **React Flow (`@xyflow/react`)** (Semantic topology, concept maps, argument structures)
4. **Mermaid** (Text-defined formal diagrams, sequence charts, state machines)

Each tool is deployed **only where its cognitive and structural affordances genuinely matter**. No tool is permitted to colonize or duplicate the domain of another.

---

## 2. The Tool Selection Matrix

| Tool | Primary Cognitive Modality | Canonical Data Format | Rendering Nature | Ideal Use Cases | Prohibited Anti-Patterns |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Simple Native UI** | Linear reading, writing, filtering | SQLite rows + UTF-8 Markdown | Standard HTML5 / React components | Reading books, viewing highlights, searching library, writing linear chapter notes, browsing bookmarks, viewing relationship lists | Never wrap linear notes or book metadata in a 2D canvas node. |
| **Excalidraw** | Freeform spatial thinking & sketching | Read & Watch Canvas JSON (`.rwcanvas`, schema v1) | Interactive 2D HTML5 Canvas (`@excalidraw/excalidraw`) | Visual brainstorms, beside-book margin sketches, freehand drawings, spatial mindboards | Never use for queryable concept taxonomies or formal algorithmic layouts. |
| **React Flow** | Explicit semantic topology & concept mapping | Read & Watch Knowledge Graph (`knowledge_graphs`, `knowledge_nodes`, `knowledge_edges`) | Interactive SVG/DOM node-edge canvas (`@xyflow/react`) | Cross-book concept maps, argument structures, taxonomy hierarchies, entity relationship maps | Never use for freehand drawing, writing primary long-form text notes, or replacing ordinary bookmark lists. |
| **Mermaid** | Text-first formal diagramming & state flow | Raw Mermaid DSL text (`.mermaid` / `mermaid_documents`) | Derived, disposable vector SVG (strict security mode) | Sequence diagrams, state machines, workflow flowcharts, class diagrams, Git graphs | Never use as an interactive drag-and-drop canvas; never parse SVG back to state. |

---

## 3. Detailed Modality Boundaries

### 3.1 Tier 1: Simple Native UI (The Foundation)
- **Governing Axiom**: *Text is the native medium of thought. UI should get out of the way.*
- **Scope**:
  - Linear Markdown notes (`user-data/items/:itemId/notes.md`)
  - Page bookmarks and table of contents
  - Text highlights and margin annotations
  - Full-text search (Phase 11 FTS5 index)
  - Tabular relationship views between books and external works
- **Accessibility**: 100% accessible to screen readers, full keyboard navigation, system typography, dynamic contrast, zero GPU overhead.
- **When NOT to use a visual canvas**: If a user is writing reflections on a chapter, an outline of takeaways, or summarizing key quotes, native Markdown is vastly superior to placing sticky notes on a canvas.

### 3.2 Tier 2: Excalidraw (Freeform Spatial Ideation)
- **Governing Axiom**: *Spatial layout without syntactical constraints.*
- **Scope**:
  - Beside-book visual scratchpad (Phase 10 split-view with reader)
  - Standalone concept canvases (`itemId = null`)
  - Freehand sketches, hand-drawn arrows, wireframes, mood boards
  - Non-semantic spatial groupings where exact link semantics are undefined or playful
- **Ownership**:
  - Read & Watch owns canvas metadata, revision history, bidirectional book anchors, and persistence (`user-data/canvases/:id/`).
  - `@excalidraw/excalidraw` is strictly a client-side drawing component running 100% offline with zero CDN dependencies.
- **Boundary**: Excalidraw files are spatial scenes, not directed semantic graphs. Elements do not represent typed ontology entities.

### 3.3 Tier 3: React Flow (Semantic Topology & Concept Maps)
- **Governing Axiom**: *Explicit relationships between typed ideas and source evidence.*
- **Scope**:
  - Concept maps: "Concept A" `[supports / refutes / derives from]` "Concept B"
  - Cross-book synthesis: Connecting an argument in Book 1 to an empirical finding in Book 2
  - Argumentation graphs: Premises leading to conclusions with linked quotation evidence
  - Thematic taxonomy trees: Hierarchical subject categorization
- **Ownership & Projection Architecture**:
  - Read & Watch owns the canonical schema in SQLite (`knowledge_graphs`, `knowledge_nodes`, `knowledge_edges`) and external atomic JSON recovery files (`user-data/knowledge/graphs/:id.json`).
  - `@xyflow/react` is **strictly a visual projection**. React Flow state is transient and derived.
  - Nodes and edges possess stable UUIDs, timestamps, user labels, semantic types, and deep links into source publications, annotations, notes, or canvases.
  - **Accessible Alternative View**: Every semantic graph must provide a switchable tabular/list view allowing full keyboard exploration of nodes and relationships without requiring 2D spatial canvas manipulation.

### 3.4 Tier 4: Mermaid (Text-Defined Formal Diagrams)
- **Governing Axiom**: *Code as diagram: deterministic, diffable, reproducible.*
- **Scope**:
  - Chronological sequence diagrams (e.g., historical timelines, protocol exchanges)
  - Finite state machines and lifecycle transitions
  - Algorithmic logic flowcharts
  - Entity-Relationship schemas and class hierarchies
- **Ownership & Security Architecture**:
  - Canonical truth is user-authored Mermaid DSL text stored in SQLite (`mermaid_documents`) and `.mermaid` text files in `user-data/knowledge/diagrams/`.
  - Rendered SVG is completely disposable and derived at runtime on the client.
  - **Strict Security Enforcement**: Rendered strictly with `securityLevel: 'strict'`. HTML tags inside node labels are sanitized. `javascript:` execution, inline script injection, and external network fetch are strictly blocked.
  - **Error Resilience**: Invalid Mermaid syntax renders an honest, calm inline syntax error banner with line indicator, leaving the text editor fully operational.

---

## 4. Deep Linking & Provenance Constitution

A graph node without provenance is an isolated island. In Read & Watch, knowledge nodes may establish verifiable deep links to:
1. **Library Publication**: `rw://item/:itemId`
2. **Document Location**: `rw://item/:itemId?loc=:locationAnchor` (PDF page/rect or Reflowable CFI)
3. **Annotation / Highlight**: `rw://annotation/:annotationId`
4. **Markdown Notes**: `rw://notes/:itemId`
5. **Canvas**: `rw://canvas/:canvasId`

### Unresolved Link Handling
If a referenced book, annotation, or canvas is deleted or unavailable:
- **No silent failures or crashes.**
- The node displays a distinct, calm indicator: `[Unresolved Source Link: Item Not Found]`.
- The user can inspect the historical target reference, retain the concept node, or re-link it to a new source.

---

## 5. Storage and Portability Boundaries

1. **Zero Graph Database**:
   - Graph databases (Neo4j, Memgraph, etc.) introduce unacceptable runtime overhead, foreign process requirements, and operational brittleness for a local-first desktop application.
   - All relational semantics are cleanly modeled in standard SQLite tables with indexed foreign keys.
2. **File-First Recovery Mirror**:
   - Every semantic graph and Mermaid document is mirrored to `user-data/knowledge/` in human-readable, versioned JSON/text format.
   - If SQLite is reset or corrupted, the database reconstructs 100% of knowledge graphs and diagrams from `user-data/knowledge/`.
3. **Portability Bundle (`.rwbackup`)**:
   - Phase 12 backup bundles include knowledge graphs (`knowledge_graphs.json`) and diagrams (`mermaid_documents.json`) in the unified archive, supporting lossless round-trip restore.
   - Disposable rendering caches (SVGs, DOM layouts) are never exported.
4. **Source Publication Immutability**:
   - No knowledge graph or diagram operation touches, modifies, or re-encodes source EPUB/PDF book files.
