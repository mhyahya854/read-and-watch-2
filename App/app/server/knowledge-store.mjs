/**
 * Knowledge Store — Server-side Canonical Knowledge and Diagram Persistence.
 * Phase 13 — Knowledge and Diagram System.
 *
 * Architecture:
 *   - SQLite (read-watch.sqlite3) is canonical for knowledge graphs, nodes, edges,
 *     and Mermaid documents.
 *   - External file-first storage (user-data/knowledge/graphs/:id.json and
 *     user-data/knowledge/diagrams/:id.json) provides crash recovery.
 *   - Optimistic concurrency control via expectedRevision.
 *   - Deep-link resolution for library items, document locations, annotations,
 *     notes, and canvases.
 *   - Zero external cloud services, 100% offline, zero source book writes.
 */

import {
  mkdirSync,
  renameSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// SQL DDL
// ---------------------------------------------------------------------------

const DDL_KNOWLEDGE = `
CREATE TABLE IF NOT EXISTS knowledge_graphs (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  tags_json      TEXT NOT NULL DEFAULT '[]',
  revision       INTEGER NOT NULL DEFAULT 1,
  lifecycle      TEXT NOT NULL DEFAULT 'active',
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  deleted_at_utc TEXT
);
CREATE INDEX IF NOT EXISTS idx_knowledge_graphs_active ON knowledge_graphs(deleted_at_utc);

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id                    TEXT PRIMARY KEY,
  graph_id              TEXT NOT NULL,
  label                 TEXT NOT NULL,
  node_type             TEXT NOT NULL DEFAULT 'concept',
  notes                 TEXT NOT NULL DEFAULT '',
  position_x            REAL NOT NULL DEFAULT 0,
  position_y            REAL NOT NULL DEFAULT 0,
  width                 REAL,
  height                REAL,
  color                 TEXT,
  deep_link_type        TEXT,
  deep_link_target      TEXT,
  deep_link_anchor_json TEXT,
  deep_link_label       TEXT,
  created_at_utc        TEXT NOT NULL,
  updated_at_utc        TEXT NOT NULL,
  deleted_at_utc        TEXT,
  FOREIGN KEY (graph_id) REFERENCES knowledge_graphs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_graph ON knowledge_nodes(graph_id, deleted_at_utc);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_link ON knowledge_nodes(deep_link_type, deep_link_target);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id                TEXT PRIMARY KEY,
  graph_id          TEXT NOT NULL,
  source_node_id    TEXT NOT NULL,
  target_node_id    TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'relates-to',
  label             TEXT NOT NULL DEFAULT '',
  bidirectional     INTEGER NOT NULL DEFAULT 0,
  created_at_utc    TEXT NOT NULL,
  updated_at_utc    TEXT NOT NULL,
  deleted_at_utc    TEXT,
  FOREIGN KEY (graph_id) REFERENCES knowledge_graphs(id) ON DELETE CASCADE,
  FOREIGN KEY (source_node_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_node_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_graph ON knowledge_edges(graph_id, deleted_at_utc);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_nodes ON knowledge_edges(source_node_id, target_node_id);

CREATE TABLE IF NOT EXISTS mermaid_documents (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  diagram_type        TEXT NOT NULL DEFAULT 'flowchart',
  source_text         TEXT NOT NULL,
  tags_json           TEXT NOT NULL DEFAULT '[]',
  associated_item_id  TEXT,
  revision            INTEGER NOT NULL DEFAULT 1,
  lifecycle           TEXT NOT NULL DEFAULT 'active',
  created_at_utc      TEXT NOT NULL,
  updated_at_utc      TEXT NOT NULL,
  deleted_at_utc      TEXT,
  FOREIGN KEY (associated_item_id) REFERENCES items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_mermaid_active ON mermaid_documents(deleted_at_utc);
CREATE INDEX IF NOT EXISTS idx_mermaid_item ON mermaid_documents(associated_item_id);
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeAtomic(target, content) {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = join(
    dirname(target),
    `.${basename(target)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  );
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function nowUtc() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createKnowledgeStore({
  databasePath,
  userDataRoot,
  searchStore = null,
  libraryDatabase = null,
}) {
  const db =
    libraryDatabase ||
    new DatabaseSync(databasePath, { readOnly: false, allowExtension: false });

  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(DDL_KNOWLEDGE);

  // Search invalidation helper
  function notifySearchInvalidation() {
    if (searchStore && typeof searchStore.rebuildIndex === 'function') {
      try {
        searchStore.rebuildIndex();
      } catch {}
    }
  }

  // File paths
  const graphsDir = join(userDataRoot, 'knowledge', 'graphs');
  const diagramsDir = join(userDataRoot, 'knowledge', 'diagrams');
  mkdirSync(graphsDir, { recursive: true });
  mkdirSync(diagramsDir, { recursive: true });

  function graphFilePath(id) {
    return join(graphsDir, `${id}.json`);
  }

  function diagramFilePath(id) {
    return join(diagramsDir, `${id}.json`);
  }

  function diagramMermaidPath(id) {
    return join(diagramsDir, `${id}.mermaid`);
  }

  // Row converters
  function rowToGraphMetadata(row) {
    const nodeCountRow = db
      .prepare('SELECT COUNT(*) as count FROM knowledge_nodes WHERE graph_id = ? AND deleted_at_utc IS NULL')
      .get(row.id);
    const edgeCountRow = db
      .prepare('SELECT COUNT(*) as count FROM knowledge_edges WHERE graph_id = ? AND deleted_at_utc IS NULL')
      .get(row.id);

    return {
      schemaVersion: 1,
      id: row.id,
      title: row.title,
      description: row.description || '',
      tags: JSON.parse(row.tags_json || '[]'),
      revision: row.revision,
      lifecycle: row.lifecycle,
      nodeCount: nodeCountRow?.count || 0,
      edgeCount: edgeCountRow?.count || 0,
      createdAt: row.created_at_utc,
      updatedAt: row.updated_at_utc,
      deletedAt: row.deleted_at_utc ?? null,
    };
  }

  function rowToNode(row) {
    let deepLink = null;
    if (row.deep_link_type && row.deep_link_target) {
      deepLink = {
        type: row.deep_link_type,
        target: row.deep_link_target,
        anchorJson: row.deep_link_anchor_json ?? null,
        label: row.deep_link_label ?? null,
      };
    }

    return {
      id: row.id,
      graphId: row.graph_id,
      label: row.label,
      nodeType: row.node_type || 'concept',
      notes: row.notes || '',
      position: { x: Number(row.position_x) || 0, y: Number(row.position_y) || 0 },
      width: row.width != null ? Number(row.width) : undefined,
      height: row.height != null ? Number(row.height) : undefined,
      color: row.color || undefined,
      deepLink,
      createdAt: row.created_at_utc,
      updatedAt: row.updated_at_utc,
      deletedAt: row.deleted_at_utc ?? null,
    };
  }

  function rowToEdge(row) {
    return {
      id: row.id,
      graphId: row.graph_id,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      relationshipType: row.relationship_type || 'relates-to',
      label: row.label || '',
      bidirectional: Boolean(row.bidirectional),
      createdAt: row.created_at_utc,
      updatedAt: row.updated_at_utc,
      deletedAt: row.deleted_at_utc ?? null,
    };
  }

  function rowToDiagram(row) {
    return {
      schemaVersion: 1,
      id: row.id,
      title: row.title,
      description: row.description || '',
      diagramType: row.diagram_type || 'flowchart',
      sourceText: row.source_text || '',
      tags: JSON.parse(row.tags_json || '[]'),
      associatedItemId: row.associated_item_id ?? null,
      revision: row.revision,
      lifecycle: row.lifecycle,
      createdAt: row.created_at_utc,
      updatedAt: row.updated_at_utc,
      deletedAt: row.deleted_at_utc ?? null,
    };
  }

  // File persistence helpers
  function saveGraphFile(doc) {
    const file = graphFilePath(doc.id);
    writeAtomic(file, JSON.stringify(doc, null, 2));
  }

  function saveDiagramFile(doc) {
    const file = diagramFilePath(doc.id);
    writeAtomic(file, JSON.stringify(doc, null, 2));
    // Also save plain .mermaid source file for human readability
    const mermaidFile = diagramMermaidPath(doc.id);
    writeAtomic(mermaidFile, doc.sourceText || '');
  }

  // -------------------------------------------------------------------------
  // Knowledge Graph API
  // -------------------------------------------------------------------------

  function listGraphs({ includeDeleted = false, tag = null } = {}) {
    let sql = 'SELECT * FROM knowledge_graphs WHERE 1=1';
    const params = [];
    if (!includeDeleted) {
      sql += ' AND deleted_at_utc IS NULL';
    }
    sql += ' ORDER BY updated_at_utc DESC';

    const rows = db.prepare(sql).all(...params);
    let results = rows.map(rowToGraphMetadata);
    if (tag) {
      results = results.filter((g) => g.tags.includes(tag));
    }
    return results;
  }

  function getGraphMetadata(graphId) {
    if (!graphId || typeof graphId !== 'string') fail('Invalid graphId');
    const row = db.prepare('SELECT * FROM knowledge_graphs WHERE id = ?').get(graphId);
    if (!row) fail('Knowledge graph not found', 404);
    return rowToGraphMetadata(row);
  }

  function getGraph(graphId) {
    const meta = getGraphMetadata(graphId);
    const nodeRows = db
      .prepare('SELECT * FROM knowledge_nodes WHERE graph_id = ? AND deleted_at_utc IS NULL ORDER BY created_at_utc ASC')
      .all(graphId);
    const edgeRows = db
      .prepare('SELECT * FROM knowledge_edges WHERE graph_id = ? AND deleted_at_utc IS NULL ORDER BY created_at_utc ASC')
      .all(graphId);

    const doc = {
      schemaVersion: 1,
      id: meta.id,
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      revision: meta.revision,
      lifecycle: meta.lifecycle,
      nodes: nodeRows.map(rowToNode),
      edges: edgeRows.map(rowToEdge),
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      deletedAt: meta.deletedAt,
    };

    // Ensure external file mirror is current
    try {
      saveGraphFile(doc);
    } catch {}

    return doc;
  }

  function createGraph({
    id,
    title = 'Untitled Concept Graph',
    description = '',
    tags = [],
    nodes = [],
    edges = [],
  } = {}) {
    const graphId = id || randomUUID();
    const created = nowUtc();

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `INSERT INTO knowledge_graphs (id, title, description, tags_json, revision, lifecycle, created_at_utc, updated_at_utc)
         VALUES (?, ?, ?, ?, 1, 'active', ?, ?)`
      ).run(graphId, title, description, JSON.stringify(tags), created, created);

      const insertNode = db.prepare(
        `INSERT INTO knowledge_nodes (id, graph_id, label, node_type, notes, position_x, position_y, width, height, color, deep_link_type, deep_link_target, deep_link_anchor_json, deep_link_label, created_at_utc, updated_at_utc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const n of nodes) {
        const nodeId = n.id || randomUUID();
        insertNode.run(
          nodeId,
          graphId,
          n.label || 'Node',
          n.nodeType || 'concept',
          n.notes || '',
          n.position?.x ?? 0,
          n.position?.y ?? 0,
          n.width ?? null,
          n.height ?? null,
          n.color ?? null,
          n.deepLink?.type ?? null,
          n.deepLink?.target ?? null,
          n.deepLink?.anchorJson ?? null,
          n.deepLink?.label ?? null,
          created,
          created
        );
      }

      const insertEdge = db.prepare(
        `INSERT INTO knowledge_edges (id, graph_id, source_node_id, target_node_id, relationship_type, label, bidirectional, created_at_utc, updated_at_utc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const e of edges) {
        const edgeId = e.id || randomUUID();
        insertEdge.run(
          edgeId,
          graphId,
          e.sourceNodeId,
          e.targetNodeId,
          e.relationshipType || 'relates-to',
          e.label || '',
          e.bidirectional ? 1 : 0,
          created,
          created
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const doc = getGraph(graphId);
    saveGraphFile(doc);
    notifySearchInvalidation();

    return doc;
  }

  function saveGraphDocument(
    graphId,
    { title, description, tags, nodes = [], edges = [], expectedRevision } = {}
  ) {
    if (!graphId) fail('Invalid graphId');
    const existing = db.prepare('SELECT * FROM knowledge_graphs WHERE id = ?').get(graphId);
    if (!existing) fail('Knowledge graph not found', 404);

    if (expectedRevision !== undefined && existing.revision !== expectedRevision) {
      fail(
        `Conflict: graph revision mismatch (expected ${expectedRevision}, current ${existing.revision})`,
        409
      );
    }

    const updated = nowUtc();
    const newRevision = existing.revision + 1;

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `UPDATE knowledge_graphs
         SET title = ?, description = ?, tags_json = ?, revision = ?, updated_at_utc = ?
         WHERE id = ?`
      ).run(
        title !== undefined ? title : existing.title,
        description !== undefined ? description : existing.description,
        tags !== undefined ? JSON.stringify(tags) : existing.tags_json,
        newRevision,
        updated,
        graphId
      );

      // Reconcile nodes: purge and re-insert
      db.prepare('DELETE FROM knowledge_nodes WHERE graph_id = ?').run(graphId);
      const insertNode = db.prepare(
        `INSERT INTO knowledge_nodes (id, graph_id, label, node_type, notes, position_x, position_y, width, height, color, deep_link_type, deep_link_target, deep_link_anchor_json, deep_link_label, created_at_utc, updated_at_utc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const n of nodes) {
        const nodeId = n.id || randomUUID();
        const nCreated = n.createdAt || updated;
        insertNode.run(
          nodeId,
          graphId,
          n.label || 'Node',
          n.nodeType || 'concept',
          n.notes || '',
          n.position?.x ?? 0,
          n.position?.y ?? 0,
          n.width ?? null,
          n.height ?? null,
          n.color ?? null,
          n.deepLink?.type ?? null,
          n.deepLink?.target ?? null,
          n.deepLink?.anchorJson ?? null,
          n.deepLink?.label ?? null,
          nCreated,
          updated
        );
      }

      // Reconcile edges: purge and re-insert
      db.prepare('DELETE FROM knowledge_edges WHERE graph_id = ?').run(graphId);
      const insertEdge = db.prepare(
        `INSERT INTO knowledge_edges (id, graph_id, source_node_id, target_node_id, relationship_type, label, bidirectional, created_at_utc, updated_at_utc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const e of edges) {
        const edgeId = e.id || randomUUID();
        const eCreated = e.createdAt || updated;
        insertEdge.run(
          edgeId,
          graphId,
          e.sourceNodeId,
          e.targetNodeId,
          e.relationshipType || 'relates-to',
          e.label || '',
          e.bidirectional ? 1 : 0,
          eCreated,
          updated
        );
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const doc = getGraph(graphId);
    saveGraphFile(doc);
    notifySearchInvalidation();

    return doc;
  }

  function deleteGraph(graphId, { hard = false } = {}) {
    const existing = db.prepare('SELECT * FROM knowledge_graphs WHERE id = ?').get(graphId);
    if (!existing) fail('Knowledge graph not found', 404);

    if (hard) {
      db.prepare('DELETE FROM knowledge_graphs WHERE id = ?').run(graphId);
      try {
        unlinkSync(graphFilePath(graphId));
      } catch {}
    } else {
      const now = nowUtc();
      db.prepare(
        `UPDATE knowledge_graphs
         SET deleted_at_utc = ?, lifecycle = 'soft-deleted', updated_at_utc = ?
         WHERE id = ?`
      ).run(now, now, graphId);
      const doc = getGraphMetadata(graphId);
      saveGraphFile(doc);
    }

    notifySearchInvalidation();
    return { ok: true, id: graphId };
  }

  // -------------------------------------------------------------------------
  // Mermaid Document API
  // -------------------------------------------------------------------------

  function listDiagrams({ includeDeleted = false, associatedItemId = null, tag = null } = {}) {
    let sql = 'SELECT * FROM mermaid_documents WHERE 1=1';
    const params = [];

    if (associatedItemId) {
      sql += ' AND associated_item_id = ?';
      params.push(associatedItemId);
    }
    if (!includeDeleted) {
      sql += ' AND deleted_at_utc IS NULL';
    }
    sql += ' ORDER BY updated_at_utc DESC';

    const rows = db.prepare(sql).all(...params);
    let results = rows.map(rowToDiagram);
    if (tag) {
      results = results.filter((d) => d.tags.includes(tag));
    }
    return results;
  }

  function getDiagram(diagramId) {
    if (!diagramId || typeof diagramId !== 'string') fail('Invalid diagramId');
    const row = db.prepare('SELECT * FROM mermaid_documents WHERE id = ?').get(diagramId);
    if (!row) fail('Mermaid diagram not found', 404);
    const doc = rowToDiagram(row);

    // Save mirror if missing
    try {
      saveDiagramFile(doc);
    } catch {}

    return doc;
  }

  function createDiagram({
    id,
    title = 'Untitled Diagram',
    description = '',
    diagramType = 'flowchart',
    sourceText = 'graph TD\n    Start --> Stop',
    tags = [],
    associatedItemId = null,
  } = {}) {
    const diagramId = id || randomUUID();
    const created = nowUtc();

    db.prepare(
      `INSERT INTO mermaid_documents (id, title, description, diagram_type, source_text, tags_json, associated_item_id, revision, lifecycle, created_at_utc, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?)`
    ).run(
      diagramId,
      title,
      description,
      diagramType,
      sourceText,
      JSON.stringify(tags),
      associatedItemId,
      created,
      created
    );

    const doc = getDiagram(diagramId);
    saveDiagramFile(doc);
    notifySearchInvalidation();

    return doc;
  }

  function updateDiagram(
    diagramId,
    {
      title,
      description,
      diagramType,
      sourceText,
      tags,
      associatedItemId,
      expectedRevision,
    } = {}
  ) {
    const existing = db.prepare('SELECT * FROM mermaid_documents WHERE id = ?').get(diagramId);
    if (!existing) fail('Mermaid diagram not found', 404);

    if (expectedRevision !== undefined && existing.revision !== expectedRevision) {
      fail(
        `Conflict: diagram revision mismatch (expected ${expectedRevision}, current ${existing.revision})`,
        409
      );
    }

    const updated = nowUtc();
    const newRevision = existing.revision + 1;

    db.prepare(
      `UPDATE mermaid_documents
       SET title = ?, description = ?, diagram_type = ?, source_text = ?, tags_json = ?, associated_item_id = ?, revision = ?, updated_at_utc = ?
       WHERE id = ?`
    ).run(
      title !== undefined ? title : existing.title,
      description !== undefined ? description : existing.description,
      diagramType !== undefined ? diagramType : existing.diagram_type,
      sourceText !== undefined ? sourceText : existing.source_text,
      tags !== undefined ? JSON.stringify(tags) : existing.tags_json,
      associatedItemId !== undefined ? associatedItemId : existing.associated_item_id,
      newRevision,
      updated,
      diagramId
    );

    const doc = getDiagram(diagramId);
    saveDiagramFile(doc);
    notifySearchInvalidation();

    return doc;
  }

  function deleteDiagram(diagramId, { hard = false } = {}) {
    const existing = db.prepare('SELECT * FROM mermaid_documents WHERE id = ?').get(diagramId);
    if (!existing) fail('Mermaid diagram not found', 404);

    if (hard) {
      db.prepare('DELETE FROM mermaid_documents WHERE id = ?').run(diagramId);
      try {
        unlinkSync(diagramFilePath(diagramId));
        unlinkSync(diagramMermaidPath(diagramId));
      } catch {}
    } else {
      const now = nowUtc();
      db.prepare(
        `UPDATE mermaid_documents
         SET deleted_at_utc = ?, lifecycle = 'soft-deleted', updated_at_utc = ?
         WHERE id = ?`
      ).run(now, now, diagramId);
      const doc = getDiagram(diagramId);
      saveDiagramFile(doc);
    }

    notifySearchInvalidation();
    return { ok: true, id: diagramId };
  }

  // -------------------------------------------------------------------------
  // Deep Link Resolution (P13-T005)
  // -------------------------------------------------------------------------

  function resolveDeepLink(linkRef) {
    if (!linkRef || !linkRef.type || !linkRef.target) {
      return {
        resolved: false,
        type: linkRef?.type || 'item',
        target: linkRef?.target || '',
        reason: 'Missing target reference',
      };
    }

    const { type, target, anchorJson, label } = linkRef;

    try {
      switch (type) {
        case 'item': {
          const item = db.prepare('SELECT id, title, item_type FROM items WHERE id = ?').get(target);
          if (!item) {
            return {
              resolved: false,
              type,
              target,
              reason: 'Referenced publication not found in library',
            };
          }
          return {
            resolved: true,
            type,
            target,
            title: item.title,
            subtitle: `Library ${item.item_type}`,
            url: `/library/${encodeURIComponent(item.id)}`,
          };
        }

        case 'location': {
          const item = db.prepare('SELECT id, title FROM items WHERE id = ?').get(target);
          if (!item) {
            return {
              resolved: false,
              type,
              target,
              reason: 'Referenced book not found for location link',
            };
          }
          const locParam = anchorJson ? `?loc=${encodeURIComponent(anchorJson)}` : '';
          return {
            resolved: true,
            type,
            target,
            title: item.title,
            subtitle: label || 'Document Location',
            url: `/reader/${encodeURIComponent(item.id)}${locParam}`,
          };
        }

        case 'annotation': {
          const annot = db
            .prepare(
              'SELECT a.id, a.item_id, a.kind, a.content_json, a.anchor_json, i.title as book_title FROM annotations a LEFT JOIN items i ON a.item_id = i.id WHERE a.id = ? AND a.deleted_at_utc IS NULL'
            )
            .get(target);

          if (!annot) {
            return {
              resolved: false,
              type,
              target,
              reason: 'Referenced annotation not found or deleted',
            };
          }

          let quote = '';
          try {
            const content = JSON.parse(annot.content_json || '{}');
            quote = content.quote || content.text || '';
          } catch {}

          return {
            resolved: true,
            type,
            target,
            title: annot.book_title || 'Annotation',
            subtitle: quote ? `"${quote.slice(0, 80)}..."` : 'Highlight',
            url: `/reader/${encodeURIComponent(annot.item_id)}?annotationId=${encodeURIComponent(target)}`,
          };
        }

        case 'notes': {
          const item = db.prepare('SELECT id, title FROM items WHERE id = ?').get(target);
          if (!item) {
            return {
              resolved: false,
              type,
              target,
              reason: 'Referenced book not found for notes',
            };
          }
          return {
            resolved: true,
            type,
            target,
            title: `${item.title} Notes`,
            subtitle: 'Study Notes',
            url: `/reader/${encodeURIComponent(item.id)}?tab=notes`,
          };
        }

        case 'canvas': {
          const canvas = db
            .prepare('SELECT id, title, item_id FROM canvases WHERE id = ? AND deleted_at_utc IS NULL')
            .get(target);

          if (!canvas) {
            return {
              resolved: false,
              type,
              target,
              reason: 'Referenced canvas not found or deleted',
            };
          }

          return {
            resolved: true,
            type,
            target,
            title: canvas.title || 'Canvas Note',
            subtitle: canvas.item_id ? 'Book Canvas' : 'Standalone Concept Canvas',
            url: `/canvas-notes/${encodeURIComponent(canvas.id)}`,
          };
        }

        case 'external': {
          return {
            resolved: true,
            type,
            target,
            title: label || target,
            subtitle: 'External reference',
            url: target.startsWith('http') ? target : `https://${target}`,
          };
        }

        default:
          return {
            resolved: false,
            type,
            target,
            reason: `Unknown link type: ${type}`,
          };
      }
    } catch (err) {
      return {
        resolved: false,
        type,
        target,
        reason: `Error resolving link: ${err.message}`,
      };
    }
  }

  // -------------------------------------------------------------------------
  // File-First Recovery Rebuild
  // -------------------------------------------------------------------------

  function rebuildFromFiles() {
    let restoredGraphs = 0;
    let restoredDiagrams = 0;

    // 1. Recover graphs
    try {
      const graphFiles = readdirSync(graphsDir).filter((f) => f.endsWith('.json'));
      for (const file of graphFiles) {
        try {
          const fullPath = join(graphsDir, file);
          const raw = JSON.parse(readFileSync(fullPath, 'utf8'));
          if (raw && raw.id && raw.title) {
            const exists = db.prepare('SELECT id FROM knowledge_graphs WHERE id = ?').get(raw.id);
            if (!exists) {
              db.exec('BEGIN IMMEDIATE');
              db.prepare(
                `INSERT INTO knowledge_graphs (id, title, description, tags_json, revision, lifecycle, created_at_utc, updated_at_utc)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              ).run(
                raw.id,
                raw.title,
                raw.description || '',
                JSON.stringify(raw.tags || []),
                raw.revision || 1,
                raw.lifecycle || 'active',
                raw.createdAt || nowUtc(),
                raw.updatedAt || nowUtc()
              );

              if (Array.isArray(raw.nodes)) {
                const insertNode = db.prepare(
                  `INSERT INTO knowledge_nodes (id, graph_id, label, node_type, notes, position_x, position_y, width, height, color, deep_link_type, deep_link_target, deep_link_anchor_json, deep_link_label, created_at_utc, updated_at_utc)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                );
                for (const n of raw.nodes) {
                  insertNode.run(
                    n.id || randomUUID(),
                    raw.id,
                    n.label || 'Node',
                    n.nodeType || 'concept',
                    n.notes || '',
                    n.position?.x ?? 0,
                    n.position?.y ?? 0,
                    n.width ?? null,
                    n.height ?? null,
                    n.color ?? null,
                    n.deepLink?.type ?? null,
                    n.deepLink?.target ?? null,
                    n.deepLink?.anchorJson ?? null,
                    n.deepLink?.label ?? null,
                    n.createdAt || nowUtc(),
                    n.updatedAt || nowUtc()
                  );
                }
              }

              if (Array.isArray(raw.edges)) {
                const insertEdge = db.prepare(
                  `INSERT INTO knowledge_edges (id, graph_id, source_node_id, target_node_id, relationship_type, label, bidirectional, created_at_utc, updated_at_utc)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                );
                for (const e of raw.edges) {
                  insertEdge.run(
                    e.id || randomUUID(),
                    raw.id,
                    e.sourceNodeId,
                    e.targetNodeId,
                    e.relationshipType || 'relates-to',
                    e.label || '',
                    e.bidirectional ? 1 : 0,
                    e.createdAt || nowUtc(),
                    e.updatedAt || nowUtc()
                  );
                }
              }
              db.exec('COMMIT');
              restoredGraphs++;
            }
          }
        } catch (fileErr) {
          try {
            db.exec('ROLLBACK');
          } catch {}
          console.warn('Failed to recover graph file:', file, fileErr.message);
        }
      }
    } catch {}

    // 2. Recover diagrams
    try {
      const diagramFiles = readdirSync(diagramsDir).filter((f) => f.endsWith('.json'));
      for (const file of diagramFiles) {
        try {
          const fullPath = join(diagramsDir, file);
          const raw = JSON.parse(readFileSync(fullPath, 'utf8'));
          if (raw && raw.id && raw.title) {
            const exists = db.prepare('SELECT id FROM mermaid_documents WHERE id = ?').get(raw.id);
            if (!exists) {
              db.prepare(
                `INSERT INTO mermaid_documents (id, title, description, diagram_type, source_text, tags_json, associated_item_id, revision, lifecycle, created_at_utc, updated_at_utc)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ).run(
                raw.id,
                raw.title,
                raw.description || '',
                raw.diagramType || 'flowchart',
                raw.sourceText || '',
                JSON.stringify(raw.tags || []),
                raw.associatedItemId || null,
                raw.revision || 1,
                raw.lifecycle || 'active',
                raw.createdAt || nowUtc(),
                raw.updatedAt || nowUtc()
              );
              restoredDiagrams++;
            }
          }
        } catch (diagErr) {
          console.warn('Failed to recover diagram file:', file, diagErr.message);
        }
      }
    } catch {}

    return { restoredGraphs, restoredDiagrams };
  }

  function close() {
    // Only close if we created db
    if (!libraryDatabase) {
      try {
        db.close();
      } catch {}
    }
  }

  return {
    listGraphs,
    getGraphMetadata,
    getGraph,
    createGraph,
    saveGraphDocument,
    deleteGraph,
    listDiagrams,
    getDiagram,
    createDiagram,
    updateDiagram,
    deleteDiagram,
    resolveDeepLink,
    rebuildFromFiles,
    close,
  };
}
