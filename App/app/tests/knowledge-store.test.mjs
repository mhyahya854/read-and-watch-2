/**
 * Knowledge Store Test Suite.
 * Phase 13 — Knowledge and Diagram System.
 *
 * Covers:
 *   - P13-T003: Knowledge graph CRUD, stable IDs, storage, conflict handling, recovery
 *   - P13-T004: Mermaid diagram CRUD, file mirrors, soft delete
 *   - P13-T005: Deep-link resolution for all 6 types + unresolved/unknown handling
 *   - P13-T006: File-first crash recovery (rebuildFromFiles)
 *   - Optimistic concurrency (409 on revision mismatch)
 *   - Search invalidation integration
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

import { createKnowledgeStore } from '../server/knowledge-store.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Bootstrap minimal DB tables so FK constraints in knowledge-store pass.
 * Returns the db path and userDataRoot.
 */
function withTempKnowledgeStore(fn) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'rw-knowledge-test-'));
  const dbPath = join(tmpDir, 'test.sqlite3');

  // Bootstrap prerequisite tables
  const setupDb = new DatabaseSync(dbPath);
  setupDb.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      title TEXT,
      collection TEXT,
      item_path TEXT,
      item_type TEXT,
      status TEXT,
      source_order INTEGER,
      source_added TEXT,
      summary TEXT,
      rating REAL,
      revision INTEGER,
      provenance_kind TEXT,
      updated_at_utc TEXT
    );
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      anchor_json TEXT NOT NULL,
      content_json TEXT NOT NULL,
      style_json TEXT,
      source_sha256 TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      lifecycle TEXT NOT NULL DEFAULT 'active',
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      deleted_at_utc TEXT,
      FOREIGN KEY (item_id) REFERENCES items(id)
    );
    CREATE TABLE IF NOT EXISTS canvases (
      id TEXT PRIMARY KEY,
      title TEXT,
      item_id TEXT,
      lifecycle TEXT,
      revision INTEGER,
      created_at_utc TEXT,
      updated_at_utc TEXT,
      deleted_at_utc TEXT
    );
  `);

  // Seed a library item for deep-link resolution tests
  setupDb.prepare(`
    INSERT OR IGNORE INTO items
      (id, title, collection, item_path, item_type, status, source_order, updated_at_utc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'read-book00000000000000000000000001',
    'Design Systems Handbook',
    'read',
    'Read/Design/book.pdf',
    'book',
    'read',
    0,
    new Date().toISOString(),
  );

  // Seed an annotation
  setupDb.prepare(`
    INSERT OR IGNORE INTO annotations
      (id, item_id, asset_id, kind, anchor_json, content_json, source_sha256, revision, lifecycle, created_at_utc, updated_at_utc)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?)
  `).run(
    'ann-highlight-001',
    'read-book00000000000000000000000001',
    'asset-001',
    'text-mark',
    JSON.stringify({ page: 42 }),
    JSON.stringify({ subKind: 'highlight', color: '#FFFF00', quote: 'Crucial design principle' }),
    'sha256-original',
    new Date().toISOString(),
    new Date().toISOString(),
  );

  // Seed a canvas
  setupDb.prepare(`
    INSERT OR IGNORE INTO canvases
      (id, title, item_id, lifecycle, revision, created_at_utc, updated_at_utc)
    VALUES (?, ?, ?, 'active', 1, ?, ?)
  `).run(
    'canvas-standalone-001',
    'Concept Map Alpha',
    null,
    new Date().toISOString(),
    new Date().toISOString(),
  );

  setupDb.close();

  const userDataRoot = join(tmpDir, 'user-data');
  const store = createKnowledgeStore({
    databasePath: dbPath,
    userDataRoot,
    searchStore: null,
  });

  try {
    return fn(store, userDataRoot, tmpDir, dbPath);
  } finally {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Knowledge Graph — CRUD
// ---------------------------------------------------------------------------

test('KnowledgeStore: creates graph with revision=1 and returns full document', () => {
  withTempKnowledgeStore((store) => {
    const graph = store.createGraph({ title: 'Fundamentals of UX' });

    assert.ok(graph.id, 'graph.id must be set');
    assert.equal(graph.schemaVersion, 1);
    assert.equal(graph.title, 'Fundamentals of UX');
    assert.equal(graph.revision, 1);
    assert.equal(graph.lifecycle, 'active');
    assert.ok(Array.isArray(graph.nodes));
    assert.ok(Array.isArray(graph.edges));
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.edges.length, 0);
    assert.ok(graph.createdAt);
    assert.ok(graph.updatedAt);
    assert.equal(graph.deletedAt, null);
  });
});

test('KnowledgeStore: creates graph with inline nodes and edges', () => {
  withTempKnowledgeStore((store) => {
    const graph = store.createGraph({
      title: 'System Design',
      nodes: [
        { label: 'Client', nodeType: 'concept', position: { x: 0, y: 0 } },
        { label: 'Server', nodeType: 'concept', position: { x: 200, y: 0 } },
      ],
      edges: [],
    });

    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.nodes[0].label, 'Client');
    assert.equal(graph.nodes[1].label, 'Server');
  });
});

test('KnowledgeStore: getGraph returns same document as create', () => {
  withTempKnowledgeStore((store) => {
    const created = store.createGraph({ title: 'Retrieval Test', description: 'Desc' });
    const fetched = store.getGraph(created.id);

    assert.equal(fetched.id, created.id);
    assert.equal(fetched.title, 'Retrieval Test');
    assert.equal(fetched.description, 'Desc');
    assert.equal(fetched.revision, 1);
  });
});

test('KnowledgeStore: getGraphMetadata returns lightweight meta without full doc', () => {
  withTempKnowledgeStore((store) => {
    const created = store.createGraph({
      title: 'Meta Test',
      nodes: [
        { label: 'Node A', position: { x: 0, y: 0 } },
        { label: 'Node B', position: { x: 100, y: 0 } },
      ],
    });
    const meta = store.getGraphMetadata(created.id);

    assert.equal(meta.id, created.id);
    assert.equal(meta.nodeCount, 2);
    assert.equal(meta.edgeCount, 0);
    assert.equal(typeof meta.nodes, 'undefined', 'metadata should not have nodes array');
  });
});

test('KnowledgeStore: listGraphs returns only active graphs by default', () => {
  withTempKnowledgeStore((store) => {
    const g1 = store.createGraph({ title: 'Active Graph A' });
    const g2 = store.createGraph({ title: 'Active Graph B' });

    // Soft-delete one
    store.deleteGraph(g1.id);

    const active = store.listGraphs();
    assert.ok(!active.some((g) => g.id === g1.id), 'soft-deleted should be absent');
    assert.ok(active.some((g) => g.id === g2.id));

    const all = store.listGraphs({ includeDeleted: true });
    assert.ok(all.some((g) => g.id === g1.id), 'includeDeleted should expose it');
  });
});

test('KnowledgeStore: saveGraphDocument replaces nodes/edges atomically and bumps revision', () => {
  withTempKnowledgeStore((store) => {
    const created = store.createGraph({
      title: 'Evolving Graph',
      nodes: [{ label: 'Old Node', position: { x: 0, y: 0 } }],
    });
    assert.equal(created.nodes.length, 1);

    const updated = store.saveGraphDocument(created.id, {
      title: 'Evolved Graph',
      nodes: [
        { label: 'New Node A', nodeType: 'concept', position: { x: 10, y: 10 } },
        { label: 'New Node B', nodeType: 'question', position: { x: 200, y: 10 } },
      ],
      edges: [],
      expectedRevision: 1,
    });

    assert.equal(updated.revision, 2);
    assert.equal(updated.title, 'Evolved Graph');
    assert.equal(updated.nodes.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Optimistic Concurrency — Graphs
// ---------------------------------------------------------------------------

test('KnowledgeStore: saveGraphDocument throws 409 on revision mismatch', () => {
  withTempKnowledgeStore((store) => {
    const created = store.createGraph({ title: 'Conflict Graph' });

    // First update moves revision to 2
    store.saveGraphDocument(created.id, { title: 'Update 1', nodes: [], edges: [], expectedRevision: 1 });

    // Retry with stale revision 1 must throw 409
    assert.throws(
      () => store.saveGraphDocument(created.id, { title: 'Conflicting', nodes: [], edges: [], expectedRevision: 1 }),
      (err) => err.status === 409 || /conflict/i.test(err.message),
    );
  });
});

// ---------------------------------------------------------------------------
// Soft-delete and hard-delete — Graphs
// ---------------------------------------------------------------------------

test('KnowledgeStore: soft-delete graph marks lifecycle and deletedAt', () => {
  withTempKnowledgeStore((store) => {
    const created = store.createGraph({ title: 'Doomed Graph' });
    const result = store.deleteGraph(created.id);

    assert.equal(result.ok, true);
    assert.equal(result.id, created.id);

    const meta = store.getGraphMetadata(created.id);
    assert.equal(meta.lifecycle, 'soft-deleted');
    assert.ok(meta.deletedAt);
  });
});

test('KnowledgeStore: hard-delete graph removes row from DB', () => {
  withTempKnowledgeStore((store) => {
    const created = store.createGraph({ title: 'Gone Graph' });
    store.deleteGraph(created.id, { hard: true });

    assert.throws(
      () => store.getGraphMetadata(created.id),
      /not found/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Knowledge Graph — File Mirror
// ---------------------------------------------------------------------------

test('KnowledgeStore: createGraph writes mirror JSON to user-data/knowledge/graphs/', () => {
  withTempKnowledgeStore((store, userDataRoot) => {
    const graph = store.createGraph({ title: 'Mirror Test' });
    const mirrorPath = join(userDataRoot, 'knowledge', 'graphs', `${graph.id}.json`);

    assert.ok(existsSync(mirrorPath), 'Mirror JSON should exist on disk');

    const raw = JSON.parse(readFileSync(mirrorPath, 'utf8'));
    assert.equal(raw.id, graph.id);
    assert.equal(raw.title, 'Mirror Test');
    assert.equal(raw.schemaVersion, 1);
  });
});

// ---------------------------------------------------------------------------
// Mermaid Diagrams — CRUD
// ---------------------------------------------------------------------------

test('KnowledgeStore: createDiagram returns diagram with revision=1', () => {
  withTempKnowledgeStore((store) => {
    const diag = store.createDiagram({
      title: 'Auth Flow',
      diagramType: 'sequenceDiagram',
      sourceText: 'sequenceDiagram\n  Alice ->> Bob: Hello',
    });

    assert.ok(diag.id);
    assert.equal(diag.schemaVersion, 1);
    assert.equal(diag.title, 'Auth Flow');
    assert.equal(diag.diagramType, 'sequenceDiagram');
    assert.equal(diag.revision, 1);
    assert.equal(diag.lifecycle, 'active');
    assert.equal(diag.deletedAt, null);
  });
});

test('KnowledgeStore: getDiagram retrieves created diagram', () => {
  withTempKnowledgeStore((store) => {
    const created = store.createDiagram({ title: 'Fetch Me', sourceText: 'graph TD\n  A --> B' });
    const fetched = store.getDiagram(created.id);

    assert.equal(fetched.id, created.id);
    assert.equal(fetched.title, 'Fetch Me');
    assert.equal(fetched.sourceText, 'graph TD\n  A --> B');
  });
});

test('KnowledgeStore: updateDiagram bumps revision and updates source', () => {
  withTempKnowledgeStore((store) => {
    const created = store.createDiagram({
      title: 'Updatable',
      sourceText: 'graph TD\n  Start --> End',
    });

    const updated = store.updateDiagram(created.id, {
      title: 'Updated',
      sourceText: 'graph LR\n  A --> B --> C',
      expectedRevision: 1,
    });

    assert.equal(updated.revision, 2);
    assert.equal(updated.title, 'Updated');
    assert.equal(updated.sourceText, 'graph LR\n  A --> B --> C');
  });
});

test('KnowledgeStore: updateDiagram throws 409 on stale revision', () => {
  withTempKnowledgeStore((store) => {
    const created = store.createDiagram({ title: 'Stale', sourceText: 'graph TD\n  A --> B' });
    store.updateDiagram(created.id, { title: 'First', expectedRevision: 1 });

    assert.throws(
      () => store.updateDiagram(created.id, { title: 'Conflict', expectedRevision: 1 }),
      (err) => err.status === 409 || /conflict/i.test(err.message),
    );
  });
});

test('KnowledgeStore: soft-delete diagram hides it from listDiagrams', () => {
  withTempKnowledgeStore((store) => {
    const d1 = store.createDiagram({ title: 'Keeper', sourceText: 'graph TD\n  A --> B' });
    const d2 = store.createDiagram({ title: 'Doomed', sourceText: 'graph TD\n  X --> Y' });

    store.deleteDiagram(d2.id);

    const active = store.listDiagrams();
    assert.ok(active.some((d) => d.id === d1.id));
    assert.ok(!active.some((d) => d.id === d2.id));

    const all = store.listDiagrams({ includeDeleted: true });
    assert.ok(all.some((d) => d.id === d2.id));
  });
});

test('KnowledgeStore: hard-delete diagram removes row', () => {
  withTempKnowledgeStore((store) => {
    const created = store.createDiagram({ title: 'Hard Gone', sourceText: 'graph TD\n  A --> B' });
    store.deleteDiagram(created.id, { hard: true });

    assert.throws(
      () => store.getDiagram(created.id),
      /not found/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Mermaid Diagram — File Mirrors
// ---------------------------------------------------------------------------

test('KnowledgeStore: createDiagram writes JSON + .mermaid mirrors to disk', () => {
  withTempKnowledgeStore((store, userDataRoot) => {
    const diag = store.createDiagram({
      title: 'File Mirror Diag',
      sourceText: 'graph TD\n  A --> B',
    });

    const jsonPath = join(userDataRoot, 'knowledge', 'diagrams', `${diag.id}.json`);
    const mermaidPath = join(userDataRoot, 'knowledge', 'diagrams', `${diag.id}.mermaid`);

    assert.ok(existsSync(jsonPath), 'JSON mirror must exist');
    assert.ok(existsSync(mermaidPath), '.mermaid source mirror must exist');

    const rawJson = JSON.parse(readFileSync(jsonPath, 'utf8'));
    assert.equal(rawJson.id, diag.id);

    const rawMermaid = readFileSync(mermaidPath, 'utf8');
    assert.equal(rawMermaid, 'graph TD\n  A --> B');
  });
});

// ---------------------------------------------------------------------------
// Deep-Link Resolution — all 6 types
// ---------------------------------------------------------------------------

test('KnowledgeStore resolveDeepLink: item → resolves to library item URL', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink({
      type: 'item',
      target: 'read-book00000000000000000000000001',
    });

    assert.equal(result.resolved, true);
    assert.equal(result.type, 'item');
    assert.ok(result.url.includes('read-book00000000000000000000000001'));
    assert.ok(result.title.length > 0);
  });
});

test('KnowledgeStore resolveDeepLink: item → unresolved when item missing', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink({
      type: 'item',
      target: 'nonexistent-item-id',
    });

    assert.equal(result.resolved, false);
    assert.ok(result.reason, 'Should have a calm reason string');
  });
});

test('KnowledgeStore resolveDeepLink: location → resolves with anchor param', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink({
      type: 'location',
      target: 'read-book00000000000000000000000001',
      anchorJson: JSON.stringify({ page: 42 }),
      label: 'Chapter 3',
    });

    assert.equal(result.resolved, true);
    assert.ok(result.url.includes('loc='));
    assert.equal(result.subtitle, 'Chapter 3');
  });
});

test('KnowledgeStore resolveDeepLink: annotation → resolves with quote preview', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink({
      type: 'annotation',
      target: 'ann-highlight-001',
    });

    assert.equal(result.resolved, true);
    assert.ok(result.url.includes('ann-highlight-001'));
    assert.ok(result.subtitle.length > 0, 'Should show quote preview or "Highlight"');
  });
});

test('KnowledgeStore resolveDeepLink: annotation → unresolved for missing annotation', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink({
      type: 'annotation',
      target: 'nonexistent-annotation',
    });

    assert.equal(result.resolved, false);
    assert.ok(result.reason);
  });
});

test('KnowledgeStore resolveDeepLink: notes → resolves to reader notes tab', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink({
      type: 'notes',
      target: 'read-book00000000000000000000000001',
    });

    assert.equal(result.resolved, true);
    assert.ok(result.url.includes('tab=notes'));
  });
});

test('KnowledgeStore resolveDeepLink: canvas → resolves to canvas URL', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink({
      type: 'canvas',
      target: 'canvas-standalone-001',
    });

    assert.equal(result.resolved, true);
    assert.equal(result.title, 'Concept Map Alpha');
    assert.ok(result.url.includes('canvas-standalone-001'));
  });
});

test('KnowledgeStore resolveDeepLink: canvas → unresolved for deleted/missing canvas', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink({
      type: 'canvas',
      target: 'canvas-does-not-exist',
    });

    assert.equal(result.resolved, false);
    assert.ok(result.reason);
  });
});

test('KnowledgeStore resolveDeepLink: external → resolves with original URL', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink({
      type: 'external',
      target: 'https://example.com/paper',
      label: 'Key paper',
    });

    assert.equal(result.resolved, true);
    assert.equal(result.url, 'https://example.com/paper');
    assert.equal(result.title, 'Key paper');
  });
});

test('KnowledgeStore resolveDeepLink: external without https prefix is corrected', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink({
      type: 'external',
      target: 'example.com/doc',
    });

    assert.equal(result.resolved, true);
    assert.ok(result.url.startsWith('https://'));
  });
});

test('KnowledgeStore resolveDeepLink: unknown type returns calm unresolved', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink({
      type: 'teleport',
      target: 'somewhere',
    });

    assert.equal(result.resolved, false);
    assert.ok(result.reason.includes('Unknown link type'));
  });
});

test('KnowledgeStore resolveDeepLink: missing target returns calm unresolved', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink({ type: 'item', target: null });
    assert.equal(result.resolved, false);
    assert.ok(result.reason, 'Should have a reason');
  });
});

test('KnowledgeStore resolveDeepLink: null linkRef returns calm unresolved', () => {
  withTempKnowledgeStore((store) => {
    const result = store.resolveDeepLink(null);
    assert.equal(result.resolved, false);
    assert.ok(result.reason, 'Should have a reason');
  });
});

// ---------------------------------------------------------------------------
// File-First Crash Recovery (rebuildFromFiles)
// ---------------------------------------------------------------------------

test('KnowledgeStore: rebuildFromFiles restores graph after DB row deletion', () => {
  withTempKnowledgeStore((store, userDataRoot, tmpDir, dbPath) => {
    const graph = store.createGraph({
      title: 'Resilient Graph',
      nodes: [{ label: 'Root', nodeType: 'concept', position: { x: 0, y: 0 } }],
    });
    const graphId = graph.id;
    store.close();

    // Simulate DB corruption: remove the knowledge_graphs row
    const wipeDb = new DatabaseSync(dbPath);
    wipeDb.exec(`DELETE FROM knowledge_graphs WHERE id = '${graphId}'`);
    wipeDb.close();

    // Reopen store — row is gone
    const store2 = createKnowledgeStore({ databasePath: dbPath, userDataRoot });

    assert.throws(
      () => store2.getGraphMetadata(graphId),
      /not found/i,
      'Should not find row before recovery',
    );

    // Trigger recovery
    const result = store2.rebuildFromFiles();
    assert.ok(result.restoredGraphs >= 1, 'Should restore at least one graph');

    // Now readable
    const recovered = store2.getGraph(graphId);
    assert.equal(recovered.title, 'Resilient Graph');
    assert.equal(recovered.nodes.length, 1);
    assert.equal(recovered.nodes[0].label, 'Root');

    store2.close();
  });
});

test('KnowledgeStore: rebuildFromFiles restores diagram after DB row deletion', () => {
  withTempKnowledgeStore((store, userDataRoot, tmpDir, dbPath) => {
    const diag = store.createDiagram({
      title: 'Resilient Diagram',
      sourceText: 'graph TD\n  A --> B',
    });
    const diagId = diag.id;
    store.close();

    // Simulate DB corruption
    const wipeDb = new DatabaseSync(dbPath);
    wipeDb.exec(`DELETE FROM mermaid_documents WHERE id = '${diagId}'`);
    wipeDb.close();

    const store2 = createKnowledgeStore({ databasePath: dbPath, userDataRoot });

    assert.throws(
      () => store2.getDiagram(diagId),
      /not found/i,
    );

    const result = store2.rebuildFromFiles();
    assert.ok(result.restoredDiagrams >= 1);

    const recovered = store2.getDiagram(diagId);
    assert.equal(recovered.title, 'Resilient Diagram');
    assert.equal(recovered.sourceText, 'graph TD\n  A --> B');

    store2.close();
  });
});

test('KnowledgeStore: rebuildFromFiles skips already-existing records (no duplicates)', () => {
  withTempKnowledgeStore((store, userDataRoot) => {
    store.createGraph({ title: 'Already Present' });
    store.createDiagram({ title: 'Also Present', sourceText: 'graph TD\n  A-->B' });

    // Call rebuild without dropping anything
    const result = store.rebuildFromFiles();

    assert.equal(result.restoredGraphs, 0, 'Should not re-insert existing rows');
    assert.equal(result.restoredDiagrams, 0, 'Should not re-insert existing rows');
  });
});

test('KnowledgeStore: rebuildFromFiles handles corrupted JSON files gracefully', () => {
  withTempKnowledgeStore((store, userDataRoot) => {
    const graphsDir = join(userDataRoot, 'knowledge', 'graphs');
    mkdirSync(graphsDir, { recursive: true });

    // Write a corrupt JSON file
    writeFileSync(join(graphsDir, 'corrupt-file.json'), 'NOT_VALID_JSON{{{');

    // Should not throw
    let result;
    assert.doesNotThrow(() => {
      result = store.rebuildFromFiles();
    });
    assert.equal(result.restoredGraphs, 0);
  });
});

// ---------------------------------------------------------------------------
// Search Invalidation Integration
// ---------------------------------------------------------------------------

test('KnowledgeStore: search invalidation callback is called on create/update/delete', () => {
  withTempKnowledgeStore((store, userDataRoot, tmpDir, dbPath) => {
    let callCount = 0;
    const mockSearchStore = { rebuildIndex: () => { callCount++; } };

    // Create a new store instance with mock search store
    const storeWithSearch = createKnowledgeStore({
      databasePath: dbPath,
      userDataRoot,
      searchStore: mockSearchStore,
    });

    storeWithSearch.createGraph({ title: 'Graph A' });        // +1
    const diag = storeWithSearch.createDiagram({ title: 'Diag A', sourceText: 'graph TD\n  A-->B' }); // +1
    storeWithSearch.updateDiagram(diag.id, { title: 'Diag B', expectedRevision: 1 }); // +1
    storeWithSearch.deleteDiagram(diag.id);                   // +1

    storeWithSearch.close();

    assert.ok(callCount >= 4, `Expected ≥4 search invalidations, got ${callCount}`);
  });
});

// ---------------------------------------------------------------------------
// Tag filtering
// ---------------------------------------------------------------------------

test('KnowledgeStore: listGraphs filters by tag', () => {
  withTempKnowledgeStore((store) => {
    store.createGraph({ title: 'Tagged A', tags: ['ux', 'design'] });
    store.createGraph({ title: 'Tagged B', tags: ['systems'] });
    store.createGraph({ title: 'Untagged' });

    const uxGraphs = store.listGraphs({ tag: 'ux' });
    assert.equal(uxGraphs.length, 1);
    assert.equal(uxGraphs[0].title, 'Tagged A');

    const sysGraphs = store.listGraphs({ tag: 'systems' });
    assert.equal(sysGraphs.length, 1);
    assert.equal(sysGraphs[0].title, 'Tagged B');
  });
});

test('KnowledgeStore: listDiagrams filters by associatedItemId', () => {
  withTempKnowledgeStore((store) => {
    const bookId = 'read-book00000000000000000000000001';
    store.createDiagram({ title: 'Book Diag', sourceText: 'graph TD\n  A-->B', associatedItemId: bookId });
    store.createDiagram({ title: 'Standalone Diag', sourceText: 'graph TD\n  X-->Y' });

    const bookDiagrams = store.listDiagrams({ associatedItemId: bookId });
    assert.equal(bookDiagrams.length, 1);
    assert.equal(bookDiagrams[0].title, 'Book Diag');

    const all = store.listDiagrams();
    assert.equal(all.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Error handling — invalid inputs
// ---------------------------------------------------------------------------

test('KnowledgeStore: getGraph throws 404 for unknown graphId', () => {
  withTempKnowledgeStore((store) => {
    assert.throws(
      () => store.getGraph('does-not-exist'),
      (err) => err.status === 404 || /not found/i.test(err.message),
    );
  });
});

test('KnowledgeStore: getDiagram throws 404 for unknown diagramId', () => {
  withTempKnowledgeStore((store) => {
    assert.throws(
      () => store.getDiagram('does-not-exist'),
      (err) => err.status === 404 || /not found/i.test(err.message),
    );
  });
});

test('KnowledgeStore: deleteGraph throws 404 for unknown graphId', () => {
  withTempKnowledgeStore((store) => {
    assert.throws(
      () => store.deleteGraph('nonexistent-graph'),
      (err) => err.status === 404 || /not found/i.test(err.message),
    );
  });
});
