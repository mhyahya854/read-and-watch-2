/**
 * Watch title knowledge-workspace isolation and correctness.
 *
 * These tests drive the REAL API middleware (the same vite plugin the dev
 * server uses) and the REAL stores on synthetic temporary databases. Nothing
 * here touches the user's selected data root.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createKnowledgeStore } from '../server/knowledge-store.mjs';
import { createCanvasStore } from '../server/canvas-store.mjs';
import { createLibraryStore } from '../server/library-store.mjs';
import { createSearchStore } from '../server/search-store.mjs';
import { createAnnotationStore } from '../server/annotation-store.mjs';
import { createReaderStore } from '../server/reader-store.mjs';
import { createUserDataStore } from '../server/user-data-store.mjs';
import { createPortabilityStore } from '../server/portability-store.mjs';
import { knowledgePlugin } from '../server/knowledge-vite-plugin.mjs';
import { writeTestDatabase } from './test-database.mjs';
import { computeEdgeRouting } from '../lib/knowledge/edge-routing.ts';
import {
  collectPromotedAnnotationIds,
  isHighlightPromoted,
  mergePromotedAnnotationIds,
  resolveActiveGraphId,
} from '../lib/knowledge/watch-workspace-state.ts';
import {
  closeDetail,
  escapeShell,
  initialShellState,
  libraryListVisible,
  selectItem,
  titlePanelVisible,
  toggleMaximize,
  toggleSidebar,
} from '../lib/shell/shell-state.ts';

// Runtime item ids are constrained to `watch-<32 hex>` / `read-<32 hex>`.
const WATCH_A = `watch-${'a'.repeat(32)}`;
const WATCH_B = `watch-${'b'.repeat(32)}`;
const READ_X = `read-${'c'.repeat(32)}`;

function createFixtureDb(dir) {
  const dbPath = join(dir, 'runtime.sqlite3');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      collection TEXT NOT NULL
    );
  `);
  const insert = db.prepare('INSERT INTO items (id, title, collection) VALUES (?, ?, ?)');
  insert.run(WATCH_A, 'Synthetic Watch Alpha', 'watch');
  insert.run(WATCH_B, 'Synthetic Watch Beta', 'watch');
  insert.run(READ_X, 'Synthetic Read Gamma', 'read');
  db.close();
  return dbPath;
}

/**
 * Run a vite plugin's connect middleware directly. This executes the plugin's
 * own routing logic rather than a re-implementation of it.
 */
function middlewareHarness(plugin) {
  let handler = null;
  plugin.configureServer({
    middlewares: {
      use(fn) {
        handler = fn;
      },
    },
  });
  assert.ok(handler, 'plugin must register a middleware');

  return function request(path, { method = 'GET', body } = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
      const req = new Readable({ read() {} });
      req.method = method;
      req.url = path;
      req.headers = {};
      const chunks = [];
      const res = {
        statusCode: 200,
        headers: {},
        writeHead(code, headers) {
          this.statusCode = code;
          if (headers) Object.assign(this.headers, headers);
        },
        end(data) {
          if (data) chunks.push(Buffer.from(data));
          resolvePromise({
            status: this.statusCode,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        },
      };

      const done = handler(req, res, (err) => {
        if (err) rejectPromise(err);
        else resolvePromise({ status: 404, text: '' });
      });
      if (done && typeof done.catch === 'function') done.catch(rejectPromise);

      process.nextTick(() => {
        if (body !== undefined) req.push(Buffer.from(JSON.stringify(body)));
        req.push(null);
      });
    });
  };
}

async function json(res) {
  assert.ok(res.text, `expected a JSON body, got status ${res.status}`);
  return JSON.parse(res.text);
}

function withApi(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rw-watch-isolation-'));
  const databasePath = createFixtureDb(dir);
  const userDataRoot = join(dir, 'user-data');
  const knowledgeStore = createKnowledgeStore({ databasePath, userDataRoot });
  const canvasStore = createCanvasStore({ databasePath, userDataRoot });
  const request = middlewareHarness(
    knowledgePlugin({
      knowledgeStore,
      canvasStore,
      libraryDatabasePath: databasePath,
      userDataRoot,
    }),
  );

  return Promise.resolve(
    fn({ request, knowledgeStore, canvasStore, databasePath, userDataRoot }),
  ).finally(() => {
    try {
      knowledgeStore.close();
    } catch {}
    try {
      canvasStore.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  });
}

// ---------------------------------------------------------------------------
// API ownership isolation
// ---------------------------------------------------------------------------

test('Watch A graph is not readable, writable, or deletable as Watch B (API level)', () =>
  withApi(async ({ request }) => {
    const created = await json(
      await request('/api/knowledge/graphs', {
        method: 'POST',
        body: { title: 'Alpha Graph', associatedItemId: WATCH_A, nodes: [], edges: [] },
      }),
    );
    assert.equal(created.associatedItemId, WATCH_A);

    const crossGet = await request(
      `/api/knowledge/graphs/${created.id}?itemId=${WATCH_B}`,
    );
    assert.equal(crossGet.status, 404, 'cross-title GET must fail safely');

    const crossPut = await request(
      `/api/knowledge/graphs/${created.id}?itemId=${WATCH_B}`,
      { method: 'PUT', body: { title: 'hijacked', nodes: [], edges: [] } },
    );
    assert.equal(crossPut.status, 404, 'cross-title PUT must fail safely');

    const crossDelete = await request(
      `/api/knowledge/graphs/${created.id}?itemId=${WATCH_B}`,
      { method: 'DELETE' },
    );
    assert.equal(crossDelete.status, 404, 'cross-title DELETE must fail safely');

    const ownerRead = await json(
      await request(`/api/knowledge/graphs/${created.id}?itemId=${WATCH_A}`),
    );
    assert.equal(ownerRead.title, 'Alpha Graph', 'owner data must be untouched');
  }));

test('A legacy unassigned graph never becomes a title graph through an item-scoped request', () =>
  withApi(async ({ request, knowledgeStore }) => {
    const legacy = await json(
      await request('/api/knowledge/graphs', {
        method: 'POST',
        body: { title: 'Legacy Global Graph', nodes: [], edges: [] },
      }),
    );
    assert.equal(legacy.associatedItemId, null);

    const scopedGet = await request(
      `/api/knowledge/graphs/${legacy.id}?itemId=${WATCH_B}`,
    );
    assert.equal(scopedGet.status, 404, 'legacy graph must not be adoptable by itemId');

    const legacyGet = await request(`/api/knowledge/graphs/${legacy.id}`);
    assert.equal(legacyGet.status, 200, 'legacy route stays available');

    const scopedPut = await request(
      `/api/knowledge/graphs/${legacy.id}?itemId=${WATCH_B}`,
      { method: 'PUT', body: { title: 'adopted', nodes: [], edges: [] } },
    );
    assert.equal(scopedPut.status, 404);

    assert.equal(
      knowledgeStore.getGraph(legacy.id).associatedItemId,
      null,
      'legacy graph must remain unassigned',
    );
  }));

test('An ordinary save cannot silently reassign ownership to another title', () =>
  withApi(async ({ request }) => {
    const created = await json(
      await request('/api/knowledge/graphs', {
        method: 'POST',
        body: { title: 'Alpha Graph', associatedItemId: WATCH_A, nodes: [], edges: [] },
      }),
    );

    const reassign = await request(`/api/knowledge/graphs/${created.id}`, {
      method: 'PUT',
      body: {
        title: 'Alpha Graph',
        associatedItemId: WATCH_B,
        nodes: [],
        edges: [],
        expectedRevision: created.revision,
      },
    });
    assert.equal(reassign.status, 409, 'ownership change must be refused');

    const after = await json(
      await request(`/api/knowledge/graphs/${created.id}?itemId=${WATCH_A}`),
    );
    assert.equal(after.associatedItemId, WATCH_A, 'ownership must be unchanged');
  }));

test('Watch A diagram is isolated from Watch B for GET, PUT, and DELETE', () =>
  withApi(async ({ request }) => {
    const diagram = await json(
      await request('/api/knowledge/diagrams', {
        method: 'POST',
        body: {
          title: 'Alpha Diagram',
          associatedItemId: WATCH_A,
          sourceText: 'graph TD\n A-->B',
        },
      }),
    );
    assert.equal(diagram.associatedItemId, WATCH_A);

    assert.equal(
      (await request(`/api/knowledge/diagrams/${diagram.id}?itemId=${WATCH_B}`)).status,
      404,
    );
    assert.equal(
      (
        await request(`/api/knowledge/diagrams/${diagram.id}?itemId=${WATCH_B}`, {
          method: 'PUT',
          body: { title: 'hijacked' },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(`/api/knowledge/diagrams/${diagram.id}?itemId=${WATCH_B}`, {
          method: 'DELETE',
        })
      ).status,
      404,
    );
    assert.equal(
      (await request(`/api/knowledge/diagrams/${diagram.id}?itemId=${WATCH_A}`)).status,
      200,
    );

    const listForB = await json(
      await request(`/api/knowledge/diagrams?itemId=${WATCH_B}`),
    );
    assert.equal(listForB.length, 0, 'Watch B must not list Watch A diagrams');
  }));

test('Canvas ownership guard blocks cross-title open, mutate, and delete', () =>
  withApi(async ({ canvasStore }) => {
    const canvas = canvasStore.createCanvas({
      itemId: WATCH_A,
      title: 'Alpha Board',
    });

    assert.throws(
      () => canvasStore.assertCanvasOwnership(canvas.canvasId, WATCH_B),
      /not found/i,
      'Watch B must not open a Watch A canvas',
    );
    canvasStore.assertCanvasOwnership(canvas.canvasId, WATCH_A);
    canvasStore.assertCanvasOwnership(canvas.canvasId, null);

    const legacy = canvasStore.createCanvas({ title: 'Legacy Standalone Board' });
    assert.throws(
      () => canvasStore.assertCanvasOwnership(legacy.canvasId, WATCH_B),
      /not found/i,
      'a standalone canvas must not be adoptable through an item-scoped route',
    );

    const scoped = canvasStore.listCanvases({ itemId: WATCH_A });
    assert.deepEqual(scoped.map((c) => c.canvasId ?? c.id), [canvas.canvasId]);
  }));

// ---------------------------------------------------------------------------
// Global legacy views stay usable without leaking title-owned Watch content
// ---------------------------------------------------------------------------

test('Global knowledge summary excludes Watch-owned artifacts and keeps legacy and Read content', () =>
  withApi(async ({ request }) => {
    await request('/api/knowledge/graphs', {
      method: 'POST',
      body: { title: 'Alpha Graph', associatedItemId: WATCH_A, nodes: [], edges: [] },
    });
    await request('/api/knowledge/graphs', {
      method: 'POST',
      body: { title: 'Read Graph', associatedItemId: READ_X, nodes: [], edges: [] },
    });
    await request('/api/knowledge/graphs', {
      method: 'POST',
      body: { title: 'Legacy Graph', nodes: [], edges: [] },
    });
    await request('/api/knowledge/diagrams', {
      method: 'POST',
      body: { title: 'Alpha Diagram', associatedItemId: WATCH_A },
    });
    await request('/api/knowledge/diagrams', {
      method: 'POST',
      body: { title: 'Legacy Diagram' },
    });

    const summary = await json(await request('/api/knowledge/summary'));
    const graphTitles = summary.graphs.map((g) => g.title).sort();
    const diagramTitles = summary.diagrams.map((d) => d.title).sort();

    assert.deepEqual(graphTitles, ['Legacy Graph', 'Read Graph']);
    assert.deepEqual(diagramTitles, ['Legacy Diagram']);
  }));

// ---------------------------------------------------------------------------
// Graph correctness: persistence of every editable relationship property
// ---------------------------------------------------------------------------

test('Custom labels, direction, and bidirectional flags persist across save and reload', () =>
  withApi(async ({ request }) => {
    const created = await json(
      await request('/api/knowledge/graphs', {
        method: 'POST',
        body: {
          title: 'Alpha Graph',
          associatedItemId: WATCH_A,
          nodes: [
            { id: 'n1', label: 'One', nodeType: 'character', position: { x: 0, y: 0 } },
            { id: 'n2', label: 'Two', nodeType: 'character', position: { x: 300, y: 0 } },
          ],
          edges: [],
        },
      }),
    );

    const labels = ['母亲', 'حليف قديم', 'پرانا دوست'];
    const saved = await json(
      await request(`/api/knowledge/graphs/${created.id}`, {
        method: 'PUT',
        body: {
          title: 'Alpha Graph',
          nodes: [
            { id: 'n1', label: 'One', nodeType: 'character', position: { x: 40, y: 60 } },
            { id: 'n2', label: 'Two', nodeType: 'character', position: { x: 300, y: 0 } },
          ],
          edges: [
            {
              id: 'e1',
              sourceNodeId: 'n1',
              targetNodeId: 'n2',
              relationshipType: 'custom',
              label: labels[0],
              bidirectional: false,
            },
            {
              id: 'e2',
              sourceNodeId: 'n1',
              targetNodeId: 'n2',
              relationshipType: 'custom',
              label: labels[1],
              bidirectional: true,
            },
            {
              id: 'e3',
              sourceNodeId: 'n2',
              targetNodeId: 'n1',
              relationshipType: 'custom',
              label: labels[2],
              bidirectional: false,
            },
          ],
          expectedRevision: created.revision,
        },
      }),
    );

    const reloaded = await json(
      await request(`/api/knowledge/graphs/${created.id}?itemId=${WATCH_A}`),
    );
    assert.equal(reloaded.revision, saved.revision);
    assert.deepEqual(
      reloaded.edges.map((e) => e.label).sort(),
      [...labels].sort(),
      'arbitrary Unicode relationship labels must round-trip',
    );
    const mutual = reloaded.edges.find((e) => e.label === labels[1]);
    assert.equal(mutual.bidirectional, true);
    assert.equal(mutual.sourceNodeId, 'n1');
    assert.equal(mutual.targetNodeId, 'n2');
    const reverse = reloaded.edges.find((e) => e.label === labels[2]);
    assert.equal(reverse.sourceNodeId, 'n2');
    assert.equal(reverse.targetNodeId, 'n1');
    const moved = reloaded.nodes.find((n) => n.id === 'n1');
    assert.deepEqual(moved.position, { x: 40, y: 60 }, 'node move must persist');
  }));

test('Deleting one relationship preserves its parallel twin and deleting a block removes attached edges', () =>
  withApi(async ({ request }) => {
    const created = await json(
      await request('/api/knowledge/graphs', {
        method: 'POST',
        body: {
          title: 'Alpha Graph',
          associatedItemId: WATCH_A,
          nodes: [
            { id: 'n1', label: 'One', nodeType: 'character' },
            { id: 'n2', label: 'Two', nodeType: 'character' },
            { id: 'n3', label: 'Three', nodeType: 'character' },
          ],
          edges: [],
        },
      }),
    );

    const baseDoc = {
      title: 'Alpha Graph',
      nodes: [
        { id: 'n1', label: 'One', nodeType: 'character' },
        { id: 'n2', label: 'Two', nodeType: 'character' },
        { id: 'n3', label: 'Three', nodeType: 'character' },
      ],
      expectedRevision: created.revision,
    };

    const saved = await json(
      await request(`/api/knowledge/graphs/${created.id}`, {
        method: 'PUT',
        body: {
          ...baseDoc,
          edges: [
            { id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2', label: 'friend of' },
            { id: 'e2', sourceNodeId: 'n1', targetNodeId: 'n2', label: 'works with' },
            { id: 'e3', sourceNodeId: 'n2', targetNodeId: 'n3', label: 'loves' },
          ],
        },
      }),
    );

    const afterDeleteEdge = await json(
      await request(`/api/knowledge/graphs/${created.id}`, {
        method: 'PUT',
        body: {
          ...baseDoc,
          expectedRevision: saved.revision,
          edges: saved.edges.filter((e) => e.id !== 'e2'),
        },
      }),
    );
    assert.deepEqual(
      afterDeleteEdge.edges.map((e) => e.id).sort(),
      ['e1', 'e3'],
      'deleting one parallel relationship must not delete the other',
    );

    const afterDeleteNode = await json(
      await request(`/api/knowledge/graphs/${created.id}`, {
        method: 'PUT',
        body: {
          title: 'Alpha Graph',
          nodes: baseDoc.nodes.filter((n) => n.id !== 'n2'),
          edges: afterDeleteEdge.edges.filter(
            (e) => e.sourceNodeId !== 'n2' && e.targetNodeId !== 'n2',
          ),
          expectedRevision: afterDeleteEdge.revision,
        },
      }),
    );
    assert.equal(afterDeleteNode.edges.length, 0, 'block deletion removes attached edges');
  }));

// ---------------------------------------------------------------------------
// File-first recovery keeps ownership
// ---------------------------------------------------------------------------

test('rebuildFromFiles restores ownership and soft-delete state from the file mirror', () =>
  withApi(async ({ knowledgeStore, databasePath }) => {
    const graph = knowledgeStore.createGraph({
      title: 'Alpha Graph',
      associatedItemId: WATCH_A,
      nodes: [{ id: 'n1', label: 'One', nodeType: 'character' }],
      edges: [],
    });
    const deleted = knowledgeStore.createGraph({
      title: 'Removed Graph',
      associatedItemId: WATCH_A,
      nodes: [{ id: 'd1', label: 'Gone', nodeType: 'character' }],
      edges: [],
    });
    knowledgeStore.deleteGraph(deleted.id);

    const db = new DatabaseSync(databasePath);
    db.exec(
      'DELETE FROM knowledge_edges; DELETE FROM knowledge_nodes; DELETE FROM knowledge_graphs;',
    );
    db.close();

    const result = knowledgeStore.rebuildFromFiles();
    assert.equal(result.restoredGraphs, 2, 'both mirror files must be restored');

    const restored = knowledgeStore.getGraph(graph.id);
    assert.equal(restored.associatedItemId, WATCH_A, 'ownership survives file-first rebuild');
    assert.equal(restored.nodes.length, 1, 'mirror must keep the block payload');

    const restoredDeleted = knowledgeStore.getGraph(deleted.id);
    assert.equal(restoredDeleted.lifecycle, 'soft-deleted', 'soft delete must survive rebuild');
    assert.equal(
      knowledgeStore.listGraphs({ associatedItemId: WATCH_A }).length,
      1,
      'soft-deleted graphs must not reappear as active',
    );
  }));

// ---------------------------------------------------------------------------
// Edge routing and shell state: real production modules
// ---------------------------------------------------------------------------

function createPortableEnvironment() {
  const dir = mkdtempSync(join(tmpdir(), 'rw-watch-backup-'));
  const databasePath = join(dir, 'library.sqlite3');
  const libraryRoot = join(dir, 'library');
  const userDataRoot = join(dir, 'user-data');
  mkdirSync(libraryRoot, { recursive: true });
  mkdirSync(userDataRoot, { recursive: true });
  writeTestDatabase(databasePath, [
    {
      id: WATCH_A,
      collection: 'watch',
      itemPath: 'watch/synthetic-alpha',
      title: 'Synthetic Watch Alpha',
      type: 'anime',
      status: 'watched',
      summary: '',
      added: '2026-01-01',
      media: [],
    },
    {
      id: WATCH_B,
      collection: 'watch',
      itemPath: 'watch/synthetic-beta',
      title: 'Synthetic Watch Beta',
      type: 'movie',
      status: 'watched',
      summary: '',
      added: '2026-01-01',
      media: [],
    },
  ]);

  const searchStore = createSearchStore({ databasePath, userDataRoot });
  const libraryStore = createLibraryStore({ databasePath, searchStore });
  const annotationStore = createAnnotationStore({ databasePath, userDataRoot, searchStore });
  const readerStore = createReaderStore({
    libraryRoot,
    libraryDatabasePath: databasePath,
    userDataRoot,
    searchStore,
  });
  const userDataStore = createUserDataStore({ userDataRoot, libraryDatabasePath: databasePath, searchStore });
  const canvasStore = createCanvasStore({ databasePath, userDataRoot, searchStore });
  const knowledgeStore = createKnowledgeStore({ databasePath, userDataRoot, searchStore });
  const portabilityStore = createPortabilityStore({
    databasePath,
    libraryRoot,
    userDataRoot,
    libraryStore,
    annotationStore,
    readerStore,
    userDataStore,
    canvasStore,
    searchStore,
    knowledgeStore,
  });

  return {
    dir,
    knowledgeStore,
    portabilityStore,
    searchStore,
    libraryStore,
    annotationStore,
    readerStore,
    userDataStore,
    canvasStore,
    cleanup: () => {
      for (const store of [
        knowledgeStore,
        canvasStore,
        searchStore,
        libraryStore,
        annotationStore,
        readerStore,
        userDataStore,
      ]) {
        try {
          store.close();
        } catch {}
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('Backup and restore preserve Watch title ownership for graphs and diagrams', () => {
  const source = createPortableEnvironment();
  const target = createPortableEnvironment();
  try {
    const graph = source.knowledgeStore.createGraph({
      title: 'Alpha Graph',
      associatedItemId: WATCH_A,
      nodes: [{ id: 'n1', label: 'One', nodeType: 'character' }],
      edges: [],
    });
    source.knowledgeStore.createDiagram({
      title: 'Alpha Diagram',
      associatedItemId: WATCH_A,
      sourceText: 'graph TD\n A-->B',
    });
    source.knowledgeStore.createGraph({ title: 'Legacy Graph', nodes: [], edges: [] });

    const backup = source.portabilityStore.createBackupBundle();
    assert.equal(backup.manifest.memberCounts.knowledgeGraphs, 2);
    assert.equal(backup.manifest.memberCounts.mermaidDocuments, 1);

    const preflight = target.portabilityStore.preflightRestore(backup);
    assert.equal(preflight.canRestore, true);
    const restored = target.portabilityStore.applyRestore(backup, {
      conflictResolution: 'overwrite',
    });
    assert.equal(restored.restoredCounts.knowledgeGraphs, 2);
    assert.equal(restored.restoredCounts.mermaidDocuments, 1);

    const restoredGraph = target.knowledgeStore.getGraph(graph.id);
    assert.equal(
      restoredGraph.associatedItemId,
      WATCH_A,
      'restore must keep the same ownership value',
    );
    assert.equal(restoredGraph.nodes.length, 1, 'restore must keep the block payload');

    const restoredDiagram = target.knowledgeStore.listDiagrams({ associatedItemId: WATCH_A });
    assert.equal(restoredDiagram.length, 1);

    assert.equal(
      target.knowledgeStore.listGraphs({ associatedItemId: WATCH_B }).length,
      0,
      'restored graphs must not be reassigned to another title',
    );
    assert.equal(
      target.knowledgeStore.listGraphs({ standaloneOnly: true }).length,
      1,
      'legacy unassigned graphs restore as unassigned',
    );
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('Global search rebuild indexes Watch knowledge once, tagged with its owning title', () => {
  const env = createPortableEnvironment();
  try {
    env.knowledgeStore.createGraph({
      title: 'Alpha Graph',
      associatedItemId: WATCH_A,
      nodes: [{ id: 'n1', label: 'Alpha Anchor', nodeType: 'character', notes: 'alpha note' }],
      edges: [],
    });
    env.knowledgeStore.createGraph({
      title: 'Legacy Graph',
      nodes: [{ id: 'n2', label: 'Legacy Anchor', nodeType: 'concept' }],
      edges: [],
    });

    const rebuild = env.searchStore.rebuildIndex();
    assert.equal(rebuild.ok, true);
    assert.equal(rebuild.counts.graphs, 2);

    const hits = env.searchStore.search({ query: 'Alpha Graph', typeFilter: 'all', limit: 20 });
    const graphHits = hits.results.filter((r) => r.kind === 'knowledge');
    assert.equal(graphHits.length, 1, 'a graph must be indexed exactly once');
    assert.equal(graphHits[0].itemId, WATCH_A, 'the search hit must carry its owning title');
    assert.equal(graphHits[0].bookTitle, 'Synthetic Watch Alpha');

    // Rebuilding again must not duplicate rows.
    const second = env.searchStore.rebuildIndex();
    assert.equal(second.counts.graphs, 2);
    const afterRebuild = env.searchStore
      .search({ query: 'Alpha Graph', typeFilter: 'all', limit: 20 })
      .results.filter((r) => r.kind === 'knowledge');
    assert.equal(afterRebuild.length, 1, 'repeat rebuilds must not duplicate index rows');
  } finally {
    env.cleanup();
  }
});

test('Edge routing gives parallel and opposite-direction relationships distinct geometry', () => {
  const routing = computeEdgeRouting([
    { id: 'e1', sourceNodeId: 'a', targetNodeId: 'b' },
    { id: 'e2', sourceNodeId: 'a', targetNodeId: 'b' },
    { id: 'e3', sourceNodeId: 'b', targetNodeId: 'a' },
    { id: 'e4', sourceNodeId: 'b', targetNodeId: 'c' },
  ]);

  const e1 = routing.get('e1');
  const e2 = routing.get('e2');
  const e3 = routing.get('e3');
  const e4 = routing.get('e4');

  assert.notDeepEqual(
    { s: e1.sourceHandle, t: e1.targetHandle },
    { s: e2.sourceHandle, t: e2.targetHandle },
    'two same-direction relationships must use different anchors',
  );
  assert.notDeepEqual(
    { s: e1.sourceHandle, t: e1.targetHandle },
    { s: e3.sourceHandle, t: e3.targetHandle },
    'opposite-direction relationships must not share identical anchors',
  );
  assert.ok(e4, 'unrelated relationships still receive routing geometry');
  const pairSignatures = [e1, e2, e3].map(
    (g) => `${g.sourceHandle}|${g.targetHandle}|${g.curvature}`,
  );
  assert.equal(
    new Set(pairSignatures).size,
    3,
    'all three relationships between the same two blocks must be distinguishable',
  );

  // Routing is stable regardless of the order edges arrive in.
  const reordered = computeEdgeRouting([
    { id: 'e3', sourceNodeId: 'b', targetNodeId: 'a' },
    { id: 'e2', sourceNodeId: 'a', targetNodeId: 'b' },
    { id: 'e1', sourceNodeId: 'a', targetNodeId: 'b' },
  ]);
  assert.deepEqual(reordered.get('e1'), e1);
  assert.deepEqual(reordered.get('e2'), e2);
  assert.deepEqual(reordered.get('e3'), e3);

  // Beyond four relationships the curvature offsets must stay unique.
  const many = computeEdgeRouting(
    Array.from({ length: 7 }, (_, i) => ({
      id: `m${i}`,
      sourceNodeId: 'a',
      targetNodeId: 'b',
    })),
  );
  const signatures = [...many.values()].map(
    (g) => `${g.sourceHandle}|${g.targetHandle}|${g.curvature}`,
  );
  assert.equal(new Set(signatures).size, 7, 'every relationship must be separable');
});

test('Shared shell state model drives sidebar, title panel, and escape transitions', () => {
  let shell = initialShellState();
  assert.equal(shell.sidebar, 'expanded');
  assert.equal(shell.detail, 'split');

  shell = toggleSidebar(shell);
  assert.equal(shell.sidebar, 'collapsed');
  shell = toggleSidebar(shell);
  assert.equal(shell.sidebar, 'expanded');

  shell = toggleMaximize(shell);
  assert.equal(shell.detail, 'maximized');
  assert.equal(libraryListVisible(shell, true), false, 'list hidden while maximized');
  assert.equal(titlePanelVisible(shell, true), true);

  shell = escapeShell(shell, { hasSelection: true });
  assert.equal(shell.detail, 'split', 'escape restores split from maximized');
  assert.equal(libraryListVisible(shell, true), true);

  shell = escapeShell(shell, { hasSelection: true });
  assert.equal(shell.detail, 'closed', 'escape closes the split panel');
  assert.equal(titlePanelVisible(shell, true), false);

  shell = escapeShell(shell, { hasSelection: true });
  assert.equal(shell.detail, 'closed', 'escape on a closed panel is a no-op');

  shell = selectItem(shell);
  assert.equal(shell.detail, 'split', 'selecting a row re-opens the panel');

  shell = closeDetail(shell);
  assert.equal(shell.detail, 'closed');
  assert.equal(titlePanelVisible(shell, false), false, 'no panel without a selection');
});

test('Watch A -> Watch B -> Watch A never keeps the previous title graph active', () => {
  const graphA = [{ id: 'graph-a1' }, { id: 'graph-a2' }];
  const graphB = [{ id: 'graph-b1' }];

  // Title A is open on its second graph.
  let active = resolveActiveGraphId(null, graphA);
  assert.equal(active, 'graph-a1');
  active = resolveActiveGraphId('graph-a2', graphA);
  assert.equal(active, 'graph-a2');

  // Switching to title B must drop A's id even though it was active.
  active = resolveActiveGraphId('graph-a2', graphB);
  assert.equal(active, 'graph-b1', 'Watch B must not inherit Watch A graph id');

  // B -> A and A -> B again is deterministic.
  active = resolveActiveGraphId('graph-b1', graphA);
  assert.equal(active, 'graph-a1');
  active = resolveActiveGraphId('graph-a1', graphB);
  assert.equal(active, 'graph-b1');

  // A title with no graphs clears the active id entirely.
  assert.equal(resolveActiveGraphId('graph-a1', []), null);
  assert.equal(resolveActiveGraphId(null, []), null);
});

test('Highlight promotion detects duplicates and never loses previously promoted ids', () => {
  const graphWithEvidence = [
    { deepLink: { type: 'annotation', target: 'highlight-1' } },
    { deepLink: { type: 'item', target: 'library-item' } },
  ];
  assert.equal(isHighlightPromoted(graphWithEvidence, 'highlight-1'), true);
  assert.equal(isHighlightPromoted(graphWithEvidence, 'highlight-2'), false);
  assert.equal(isHighlightPromoted([{ deepLink: null }], 'highlight-1'), false);

  const collected = collectPromotedAnnotationIds(graphWithEvidence);
  assert.deepEqual(Object.keys(collected), ['highlight-1']);

  const merged = mergePromotedAnnotationIds(
    { 'highlight-9': true },
    { 'highlight-1': true, 'highlight-9': true },
  );
  assert.deepEqual(Object.keys(merged).sort(), ['highlight-1', 'highlight-9']);
  // Nothing new to merge returns the same object (no render churn).
  assert.equal(mergePromotedAnnotationIds(merged, { 'highlight-1': true }), merged);
});
