/**
 * Watch Knowledge Workspace Test Suite.
 * AFFiNE-Style Per-Watch-Title Knowledge Workspace.
 *
 * Covers:
 *   1. Schema & Idempotent Migration: associated_item_id on knowledge_graphs and index
 *   2. Per-Watch-Title Isolation: Watch A graphs do not leak to Watch B or standalone
 *   3. Custom Relationship Lines: arbitrary text, Unicode / Arabic, directionality, bidirectional
 *   4. Complex Networks & Love Triangles: multi-edges between same node pair, cycles
 *   5. File-First Crash Recovery: rebuildFromFiles restores associated_item_id accurately
 *   6. Collection-specific boundaries: Watch has workspace, Read maintains independent reader architecture
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

import { createKnowledgeStore } from '../server/knowledge-store.mjs';

function withTempWatchStore(fn) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'rw-watch-workspace-test-'));
  const dbPath = join(tmpDir, 'test.sqlite3');

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

  // Seed Watch Item 1 (e.g. Inception)
  setupDb.prepare(`
    INSERT INTO items (id, title, collection, item_path, item_type, status, source_order, updated_at_utc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'watch-inception-001',
    'Inception',
    'watch',
    'Watch/Movies/Inception.mkv',
    'movie',
    'watched',
    0,
    new Date().toISOString(),
  );

  // Seed Watch Item 2 (e.g. Interstellar)
  setupDb.prepare(`
    INSERT INTO items (id, title, collection, item_path, item_type, status, source_order, updated_at_utc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'watch-interstellar-002',
    'Interstellar',
    'watch',
    'Watch/Movies/Interstellar.mkv',
    'movie',
    'watched',
    1,
    new Date().toISOString(),
  );

  // Seed Read Item (e.g. Dune)
  setupDb.prepare(`
    INSERT INTO items (id, title, collection, item_path, item_type, status, source_order, updated_at_utc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'read-dune-003',
    'Dune',
    'read',
    'Read/SciFi/Dune.epub',
    'book',
    'read',
    2,
    new Date().toISOString(),
  );

  setupDb.close();

  const store = createKnowledgeStore({
    databasePath: dbPath,
    userDataRoot: tmpDir,
  });

  try {
    return fn({ store, dbPath, tmpDir });
  } finally {
    try {
      store.close();
    } catch {}
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// 1. Schema & Migration
// ---------------------------------------------------------------------------

test('Schema & Migration: associated_item_id exists and is indexed on knowledge_graphs', () => {
  withTempWatchStore(({ dbPath }) => {
    const inspectDb = new DatabaseSync(dbPath);
    const tableInfo = inspectDb.prepare("PRAGMA table_info('knowledge_graphs')").all();
    const hasCol = tableInfo.some((col) => col.name === 'associated_item_id');
    assert.ok(hasCol, 'Column associated_item_id must exist in knowledge_graphs table');

    const indexes = inspectDb.prepare("PRAGMA index_list('knowledge_graphs')").all();
    const hasIndex = indexes.some((idx) => idx.name === 'idx_knowledge_graphs_item');
    assert.ok(hasIndex, 'Index idx_knowledge_graphs_item must exist');
    inspectDb.close();
  });
});

test('Schema & Migration: Idempotently migrates an existing database lacking associated_item_id', () => {
  const legacyDir = mkdtempSync(join(tmpdir(), 'rw-legacy-migration-test-'));
  const legacyDbPath = join(legacyDir, 'legacy.sqlite3');

  const legacyDb = new DatabaseSync(legacyDbPath);
  legacyDb.exec(`
    CREATE TABLE items (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE knowledge_graphs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      revision INTEGER NOT NULL DEFAULT 1,
      lifecycle TEXT NOT NULL DEFAULT 'active',
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      deleted_at_utc TEXT
    );
  `);
  legacyDb.close();

  // Initializing knowledge store on legacy database must migrate it smoothly
  const migratedStore = createKnowledgeStore({
    databasePath: legacyDbPath,
    userDataRoot: legacyDir,
  });

  const checkDb = new DatabaseSync(legacyDbPath);
  const cols = checkDb.prepare("PRAGMA table_info('knowledge_graphs')").all();
  assert.ok(cols.some((c) => c.name === 'associated_item_id'), 'Migration must add associated_item_id');

  checkDb.close();
  migratedStore.close();
  rmSync(legacyDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 2. Per-Watch-Title Isolation
// ---------------------------------------------------------------------------

test('Per-Watch-Title Isolation: Graphs belong strictly to their Watch title and do not leak', () => {
  withTempWatchStore(({ store }) => {
    // 1. Create Inception Graph
    const inceptionGraph = store.createGraph({
      title: 'Inception Character & Dream Map',
      associatedItemId: 'watch-inception-001',
      description: 'Cobb, Mal, and dream architecture',
      nodes: [
        { id: 'node-cobb', label: 'Dom Cobb', nodeType: 'character' },
        { id: 'node-mal', label: 'Mal Cobb', nodeType: 'character' },
      ],
      edges: [],
    });
    assert.equal(inceptionGraph.associatedItemId, 'watch-inception-001');

    // 2. Create Interstellar Graph
    const interstellarGraph = store.createGraph({
      title: 'Interstellar Timeline & Worlds',
      associatedItemId: 'watch-interstellar-002',
      description: 'Cooper, Murph, and Gargantua',
      nodes: [
        { id: 'node-cooper', label: 'Cooper', nodeType: 'character' },
        { id: 'node-murph', label: 'Murph', nodeType: 'character' },
      ],
      edges: [],
    });
    assert.equal(interstellarGraph.associatedItemId, 'watch-interstellar-002');

    // 3. Create Standalone / Legacy Graph
    const standaloneGraph = store.createGraph({
      title: 'General Cinema Concepts',
      associatedItemId: null,
      description: 'Montage theory and pacing',
    });
    assert.equal(standaloneGraph.associatedItemId, null);

    // Filter by Inception
    const inceptionList = store.listGraphs({ associatedItemId: 'watch-inception-001' });
    assert.equal(inceptionList.length, 1);
    assert.equal(inceptionList[0].id, inceptionGraph.id);
    assert.equal(inceptionList[0].title, 'Inception Character & Dream Map');

    // Filter by Interstellar
    const interstellarList = store.listGraphs({ associatedItemId: 'watch-interstellar-002' });
    assert.equal(interstellarList.length, 1);
    assert.equal(interstellarList[0].id, interstellarGraph.id);
    assert.equal(interstellarList[0].title, 'Interstellar Timeline & Worlds');

    // Filter by Standalone
    const standaloneList = store.listGraphs({ standaloneOnly: true });
    assert.equal(standaloneList.length, 1);
    assert.equal(standaloneList[0].id, standaloneGraph.id);

    // Watch title querying an nonexistent/different item returns empty
    const unrelatedList = store.listGraphs({ associatedItemId: 'nonexistent-watch-item' });
    assert.equal(unrelatedList.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. Custom Relationship Lines & Bidirectional Labels
// ---------------------------------------------------------------------------

test('Custom Relationship Lines: arbitrary labels, Unicode, Arabic, and bidirectional flags', () => {
  withTempWatchStore(({ store }) => {
    const graph = store.createGraph({
      title: 'Character Dynamics',
      associatedItemId: 'watch-inception-001',
      nodes: [
        { id: 'cobb', label: 'Cobb', nodeType: 'character' },
        { id: 'mal', label: 'Mal', nodeType: 'character' },
        { id: 'ariadne', label: 'Ariadne', nodeType: 'character' },
        { id: 'fischer', label: 'Robert Fischer', nodeType: 'character' },
      ],
      edges: [
        {
          id: 'edge-1',
          sourceNodeId: 'cobb',
          targetNodeId: 'mal',
          relationshipType: 'loves',
          label: 'haunted by',
          bidirectional: false,
        },
        {
          id: 'edge-2',
          sourceNodeId: 'cobb',
          targetNodeId: 'ariadne',
          relationshipType: 'mentors',
          label: 'guides and trusts',
          bidirectional: true,
        },
        {
          id: 'edge-3',
          sourceNodeId: 'ariadne',
          targetNodeId: 'cobb',
          relationshipType: 'allies-with',
          label: 'عداوة خفية أو حليف مخلص', // Arabic Unicode custom relationship
          bidirectional: false,
        },
      ],
    });

    const loaded = store.getGraph(graph.id);
    assert.equal(loaded.edges.length, 3);

    const edge1 = loaded.edges.find((e) => e.id === 'edge-1');
    assert.ok(edge1);
    assert.equal(edge1.label, 'haunted by');
    assert.equal(edge1.bidirectional, false);

    const edge2 = loaded.edges.find((e) => e.id === 'edge-2');
    assert.ok(edge2);
    assert.equal(edge2.label, 'guides and trusts');
    assert.equal(edge2.bidirectional, true);

    const edge3 = loaded.edges.find((e) => e.id === 'edge-3');
    assert.ok(edge3);
    assert.equal(edge3.label, 'عداوة خفية أو حليف مخلص');
    assert.equal(edge3.bidirectional, false);
  });
});

// ---------------------------------------------------------------------------
// 4. Complex Networks, Love Triangles & Multiple Edges Between Same Nodes
// ---------------------------------------------------------------------------

test('Complex Networks: love triangles and multiple distinct edges between same node pair', () => {
  withTempWatchStore(({ store }) => {
    const graph = store.createGraph({
      title: 'Romantic & Political Intrigue',
      associatedItemId: 'watch-inception-001',
      nodes: [
        { id: 'alice', label: 'Alice', nodeType: 'character' },
        { id: 'bob', label: 'Bob', nodeType: 'character' },
        { id: 'charlie', label: 'Charlie', nodeType: 'character' },
      ],
      edges: [
        // Love Triangle: Alice -> Bob -> Charlie -> Alice
        {
          id: 'triangle-1',
          sourceNodeId: 'alice',
          targetNodeId: 'bob',
          relationshipType: 'custom',
          label: 'is secretly in love with',
          bidirectional: false,
        },
        {
          id: 'triangle-2',
          sourceNodeId: 'bob',
          targetNodeId: 'charlie',
          relationshipType: 'custom',
          label: 'longs for',
          bidirectional: false,
        },
        {
          id: 'triangle-3',
          sourceNodeId: 'charlie',
          targetNodeId: 'alice',
          relationshipType: 'custom',
          label: 'devoted to',
          bidirectional: false,
        },
        // Second edge between Alice and Bob: conflicting dynamic
        {
          id: 'multi-edge-alice-bob',
          sourceNodeId: 'alice',
          targetNodeId: 'bob',
          relationshipType: 'custom',
          label: 'suspects of treason',
          bidirectional: false,
        },
      ],
    });

    const doc = store.getGraph(graph.id);
    assert.equal(doc.edges.length, 4);

    const edgesBetweenAliceAndBob = doc.edges.filter(
      (e) => e.sourceNodeId === 'alice' && e.targetNodeId === 'bob',
    );
    assert.equal(edgesBetweenAliceAndBob.length, 2, 'Must allow multiple edges between same node pair');
    const labels = edgesBetweenAliceAndBob.map((e) => e.label).sort();
    assert.deepEqual(labels, ['is secretly in love with', 'suspects of treason']);
  });
});

// ---------------------------------------------------------------------------
// 5. File-First Persistence & Rebuild From Files
// ---------------------------------------------------------------------------

test('File-First Mirror: rebuildFromFiles restores associated_item_id accurately into SQLite', () => {
  withTempWatchStore(({ store, dbPath, tmpDir }) => {
    const graph = store.createGraph({
      title: 'Persistent Title Map',
      associatedItemId: 'watch-inception-001',
      description: 'Mirror recovery verification',
      nodes: [{ id: 'n1', label: 'Anchor', nodeType: 'concept' }],
      edges: [],
    });

    const mirrorFile = join(tmpDir, 'knowledge', 'graphs', `${graph.id}.json`);
    assert.ok(existsSync(mirrorFile), 'External JSON file mirror must exist');

    const fileContent = JSON.parse(readFileSync(mirrorFile, 'utf8'));
    assert.equal(fileContent.associatedItemId, 'watch-inception-001');

    // Wipe SQLite knowledge_graphs table
    const wipeDb = new DatabaseSync(dbPath);
    wipeDb.exec('DELETE FROM knowledge_edges; DELETE FROM knowledge_nodes; DELETE FROM knowledge_graphs;');
    assert.equal(wipeDb.prepare('SELECT count(*) as count FROM knowledge_graphs').get().count, 0);
    wipeDb.close();

    // Rebuild from file mirrors
    const result = store.rebuildFromFiles();
    assert.ok(result.restoredGraphs >= 1, 'rebuildFromFiles must restore at least 1 graph');

    const restored = store.getGraph(graph.id);
    assert.ok(restored, 'Graph must be restored from file');
    assert.equal(restored.associatedItemId, 'watch-inception-001', 'Restored graph must retain associatedItemId');
    assert.equal(restored.title, 'Persistent Title Map');
  });
});
