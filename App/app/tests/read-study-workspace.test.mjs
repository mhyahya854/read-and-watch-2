/**
 * Read study workspace: unified Knowledge Canvas, annotation notes, scope,
 * provenance, migration, recovery, and book isolation.
 *
 * Every test runs against synthetic temporary data through the real stores and
 * the real HTTP middleware. No user data is touched.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createCanvasStore } from '../server/canvas-store.mjs';
import { createAnnotationStore } from '../server/annotation-store.mjs';
import { createKnowledgeStore } from '../server/knowledge-store.mjs';
import { createSearchStore } from '../server/search-store.mjs';
import { createLibraryStore } from '../server/library-store.mjs';
import { writeTestDatabase } from './test-database.mjs';
import { readerPlugin } from '../server/reader-vite-plugin.mjs';
import { knowledgePlugin } from '../server/knowledge-vite-plugin.mjs';
import { convertLegacyGraphToKnowledgeCanvas } from '../server/canvas-knowledge.mjs';
import { normalizeSelectionRects, pdfTextAnchorFromSelection, reflowableTextAnchorFromSelection } from '../lib/annotation/selection-anchor.ts';
import {
  addBlock,
  addRelationship,
  createKnowledgeBlock,
  createRelationship,
  findBlockByAnnotation,
  removeBlock,
  removeRelationship,
  updateBlock,
  updateRelationship,
} from '../lib/canvas/knowledge.ts';
import {
  addAnnotationToKnowledgeCanvas,
  annotationBlockType,
  annotationSourceLabel,
  annotationQuote,
  knowledgeWithPromotedAnnotation,
} from '../lib/canvas/annotation-promotion.ts';
import {
  readerPaneClass,
  readerPaneVisible,
  sidePaneClass,
  sidePaneVisible,
  toggleFullReader,
} from '../lib/reader/layout.ts';
import { validateCanvasDocument, validateCanvasScope } from '../lib/canvas/validation.ts';

const BOOK_A = `read-${'a'.repeat(32)}`;
const BOOK_B = `read-${'b'.repeat(32)}`;

function createFixture(dir) {
  const dbPath = join(dir, 'runtime.sqlite3');
  // The real runtime schema, so the stores' own DDL/migrations run for real.
  writeTestDatabase(dbPath, [
    { id: BOOK_A, collection: 'read', itemPath: 'read/synthetic-alpha', title: 'Synthetic Book Alpha', type: 'book', status: 'unread', summary: '', added: '2026-01-01' },
    { id: BOOK_B, collection: 'read', itemPath: 'read/synthetic-beta', title: 'Synthetic Book Beta', type: 'book', status: 'unread', summary: '', added: '2026-01-01' },
  ]);
  return dbPath;
}

function middlewareHarness(plugin) {
  let handler = null;
  plugin.configureServer({
    middlewares: {
      // Connect supports both use(fn) and use(path, fn).
      use(pathOrFn, maybeFn) {
        handler = typeof pathOrFn === 'function' ? pathOrFn : maybeFn;
      },
    },
  });
  assert.ok(handler);
  return function request(path, { method = 'GET', body } = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
      const req = new Readable({ read() {} });
      req.method = method;
      req.url = path;
      req.headers = {};
      const chunks = [];
      const res = {
        statusCode: 200,
        setHeader() {},
        writeHead(code) { this.statusCode = code; },
        end(data) {
          if (data) chunks.push(Buffer.from(data));
          resolvePromise({ status: this.statusCode, text: Buffer.concat(chunks).toString('utf8') });
        },
      };
      const done = handler(req, res, (err) => {
        if (err) rejectPromise(err);
        else resolvePromise({ status: 404, text: '' });
      });
      if (done?.catch) done.catch(rejectPromise);
      process.nextTick(() => {
        if (body !== undefined) req.push(Buffer.from(JSON.stringify(body)));
        req.push(null);
      });
    });
  };
}

async function json(res) {
  assert.ok(res.text, `expected a JSON body (status ${res.status})`);
  return JSON.parse(res.text);
}

function withStores(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rw-read-study-'));
  const databasePath = createFixture(dir);
  const userDataRoot = join(dir, 'user-data');
  const searchStore = createSearchStore({ databasePath, userDataRoot });
  const canvasStore = createCanvasStore({ databasePath, userDataRoot, searchStore });
  const annotationStore = createAnnotationStore({ databasePath, userDataRoot, searchStore });
  const knowledgeStore = createKnowledgeStore({ databasePath, userDataRoot, searchStore });
  const libraryStore = createLibraryStore({ databasePath, readOnly: true });

  const requestReader = middlewareHarness(
    readerPlugin({
      libraryRoot: join(dir, 'library'),
      libraryDatabasePath: databasePath,
      userDataRoot,
      searchStore,
      canvasStore,
      annotationStore,
    }),
  );
  const requestKnowledge = middlewareHarness(
    knowledgePlugin({ knowledgeStore, canvasStore, libraryDatabasePath: databasePath, userDataRoot }),
  );

  return Promise.resolve(
    fn({
      requestReader,
      requestKnowledge,
      canvasStore,
      annotationStore,
      knowledgeStore,
      searchStore,
      libraryStore,
      databasePath,
      userDataRoot,
      dir,
    }),
  ).finally(async () => {
    for (const store of [knowledgeStore, canvasStore, annotationStore, searchStore, libraryStore]) {
      try {
        store.close();
      } catch {}
    }
    // The reader plugin keeps its own reader store open for the lifetime of the
    // dev server, so retry the temporary-root cleanup instead of failing the test.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        rmSync(dir, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });
}

function makeAnnotation(overrides = {}) {
  return {
    id: 'ann-1',
    itemId: BOOK_A,
    assetId: 'asset-1',
    kind: 'text-mark',
    anchor: {
      kind: 'pdf-text',
      pageNumber: 7,
      rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.03 }],
      quote: 'Synthetic highlighted passage',
      sourceHash: 'hash-a',
    },
    content: { subKind: 'highlight', color: '#f5d76e' },
    sourceHash: 'hash-a',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Canvas scope + unified knowledge document
// ---------------------------------------------------------------------------

test('A book canvas and a location canvas both keep their scope in SQLite and the file mirror', () =>
  withStores(({ canvasStore, userDataRoot }) => {
    const bookCanvas = canvasStore.createCanvas({
      itemId: BOOK_A,
      title: 'Main concepts',
      scope: { kind: 'book', label: 'Whole book' },
    });
    assert.equal(bookCanvas.scope.kind, 'book');

    const location = {
      schemaVersion: 1,
      kind: 'page',
      sourceHash: 'hash-a',
      payload: { pageNumber: 27 },
    };
    const pageCanvas = canvasStore.createCanvas({
      itemId: BOOK_A,
      title: 'Page 27 sketch',
      scope: {
        kind: 'location',
        label: 'Page 27',
        anchor: { sourceHash: 'hash-a', location, locationLabel: 'Page 27' },
      },
    });
    assert.equal(pageCanvas.scope.kind, 'location');
    assert.deepEqual(pageCanvas.scope.anchor.location, location);

    const listed = canvasStore.listCanvases({ itemId: BOOK_A });
    assert.equal(listed.length, 2);
    assert.equal(listed.filter((c) => c.scopeKind === 'book').length, 1);
    assert.equal(listed.filter((c) => c.scopeKind === 'location').length, 1);

    const atLocation = canvasStore.listCanvasesForLocation(BOOK_A, location);
    assert.equal(atLocation.length, 1);
    assert.equal(atLocation[0].id, pageCanvas.canvasId);
    assert.equal(
      canvasStore.listCanvasesForLocation(BOOK_A, { ...location, payload: { pageNumber: 28 } }).length,
      0,
      'a different page must not match',
    );

    // File-first: the same scope travels with the canvas document.
    const mirror = JSON.parse(
      readFileSync(join(userDataRoot, `canvases/${pageCanvas.canvasId}/canvas.json`), 'utf8'),
    );
    assert.equal(mirror.scope.kind, 'location');
    assert.deepEqual(mirror.scope.anchor.location, location);
    assert.deepEqual(mirror.knowledge, { blocks: [], relationships: [] });
  }));

test('Structured blocks and named relationships persist in the canvas document', () =>
  withStores(({ canvasStore, userDataRoot }) => {
    const created = canvasStore.createCanvas({
      itemId: BOOK_A,
      title: 'Knowledge',
      scope: { kind: 'book' },
    });
    const c1 = createKnowledgeBlock({ id: 'b1', type: 'concept', title: 'Cell wall' });
    const c2 = createKnowledgeBlock({ id: 'b2', type: 'evidence', title: 'Figure 3' });
    let knowledge = addBlock({ blocks: [], relationships: [] }, c1);
    knowledge = addBlock(knowledge, c2);
    knowledge = addRelationship(
      knowledge,
      createRelationship({
        id: 'r1',
        sourceBlockId: 'b2',
        targetBlockId: 'b1',
        label: 'supports',
        direction: 'mutual',
      }),
    );
    // A relationship pointing at a missing block is not persisted.
    const withOrphan = addRelationship(
      knowledge,
      createRelationship({ id: 'r2', sourceBlockId: 'b1', targetBlockId: 'nope' }),
    );
    assert.equal(withOrphan.relationships.length, 1);

    const saved = canvasStore.updateCanvas(
      created.canvasId,
      { title: 'Knowledge', scene: created.scene, links: [], knowledge },
      created.revision,
    );
    assert.equal(saved.knowledge.blocks.length, 2);
    assert.equal(saved.knowledge.relationships.length, 1);
    assert.equal(saved.knowledge.relationships[0].label, 'supports');
    assert.equal(saved.knowledge.relationships[0].direction, 'mutual');

    const reloaded = canvasStore.getCanvas(created.canvasId);
    assert.equal(reloaded.knowledge.blocks[0].title, 'Cell wall');
    assert.equal(reloaded.knowledge.relationships[0].targetBlockId, 'b1');

    const mirror = JSON.parse(
      readFileSync(join(userDataRoot, `canvases/${created.canvasId}/canvas.json`), 'utf8'),
    );
    assert.equal(mirror.knowledge.blocks.length, 2);
    assert.equal(mirror.knowledge.relationships[0].label, 'supports');

    // Unicode labels are preserved verbatim.
    const unicode = canvasStore.updateCanvas(
      created.canvasId,
      {
        title: 'Knowledge',
        scene: reloaded.scene,
        links: [],
        knowledge: updateRelationship(reloaded.knowledge, 'r1', { label: 'حليف قديم' }),
      },
      reloaded.revision,
    );
    assert.equal(unicode.knowledge.relationships[0].label, 'حليف قديم');
  }));

test('Legacy canvases without scope metadata migrate to whole-book scope, and old DBs gain the columns', () =>
  withStores(({ canvasStore, databasePath }) => {
    // A canvas created without scope is a book canvas.
    const legacy = canvasStore.createCanvas({ itemId: BOOK_A, title: 'Legacy canvas' });
    assert.equal(legacy.scope.kind, 'book');

    // Simulate a pre-scope database and reopen the store.
    const raw = new DatabaseSync(databasePath);
    raw.exec('CREATE TABLE IF NOT EXISTS canvases_old AS SELECT * FROM canvases');
    raw.exec('DROP TABLE canvases');
    raw.exec(`CREATE TABLE canvases (
      id TEXT PRIMARY KEY, item_id TEXT, title TEXT NOT NULL DEFAULT '',
      document_relative_path TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL DEFAULT 1,
      lifecycle TEXT NOT NULL DEFAULT 'active', created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL, deleted_at_utc TEXT
    )`);
    raw.exec('INSERT INTO canvases SELECT id, item_id, title, document_relative_path, revision, lifecycle, created_at_utc, updated_at_utc, deleted_at_utc FROM canvases_old');
    raw.exec('DROP TABLE canvases_old');
    raw.close();

    const reopened = createCanvasStore({
      databasePath,
      userDataRoot: join(databasePath, '..', 'user-data'),
    });
    const columns = new DatabaseSync(databasePath)
      .prepare("PRAGMA table_info('canvases')")
      .all()
      .map((c) => c.name);
    assert.ok(columns.includes('scope_kind'));
    assert.ok(columns.includes('scope_label'));
    assert.ok(columns.includes('scope_anchor_json'));
    const listed = reopened.listCanvases({ itemId: BOOK_A });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].scopeKind, 'book', 'legacy canvases become book-level');
    assert.equal(listed[0].scopeAnchor, null, 'no location is fabricated for legacy canvases');
    reopened.close();
  }));

test('Canvas scope validation drops a location scope that has no anchor', () => {
  assert.deepEqual(validateCanvasScope(undefined), { kind: 'book' });
  assert.deepEqual(validateCanvasScope({ kind: 'location' }), { kind: 'book' });
  assert.deepEqual(validateCanvasScope({ kind: 'nonsense' }), { kind: 'book' });
  const kept = validateCanvasScope({
    kind: 'location',
    label: 'Page 3',
    anchor: { sourceHash: 'h', location: { schemaVersion: 1, kind: 'page', sourceHash: 'h', payload: { pageNumber: 3 } } },
  });
  assert.equal(kept.kind, 'location');
  assert.equal(kept.label, 'Page 3');
});

test('Canvas document validation keeps knowledge and drops orphan relationships', () => {
  const doc = validateCanvasDocument({
    schemaVersion: 1,
    canvasId: 'canvas-1',
    itemId: BOOK_A,
    title: 'Doc',
    revision: 1,
    lifecycle: 'active',
    createdAt: 'now',
    updatedAt: 'now',
    deletedAt: null,
    scene: { elements: [] },
    links: [],
    assets: [],
    knowledge: {
      blocks: [{ id: 'b1', type: 'concept', title: 'One' }],
      relationships: [
        { id: 'r1', sourceBlockId: 'b1', targetBlockId: 'missing', label: 'x' },
      ],
    },
  });
  assert.equal(doc.knowledge.blocks.length, 1);
  assert.equal(doc.knowledge.relationships.length, 0);
  assert.equal(doc.scope.kind, 'book');
});

// ---------------------------------------------------------------------------
// Ownership isolation
// ---------------------------------------------------------------------------

test('A book cannot read, mutate, or delete another book Knowledge Canvas', () =>
  withStores(async ({ requestReader, requestKnowledge, canvasStore }) => {
    const canvasB = canvasStore.createCanvas({
      itemId: BOOK_B,
      title: 'Beta canvas',
      scope: { kind: 'book' },
    });

    assert.equal(
      (await requestReader(`/api/reader/canvases/${canvasB.canvasId}?itemId=${BOOK_A}`)).status,
      404,
    );
    assert.equal(
      (
        await requestReader(`/api/reader/canvases/${canvasB.canvasId}?itemId=${BOOK_A}`, {
          method: 'PUT',
          body: { title: 'hijacked', expectedRevision: canvasB.revision },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await requestReader(`/api/reader/canvases/${canvasB.canvasId}?itemId=${BOOK_A}`, {
          method: 'DELETE',
          body: { expectedRevision: canvasB.revision },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await requestReader(`/api/reader/canvases/${canvasB.canvasId}/metadata?itemId=${BOOK_A}`, {
          method: 'PUT',
          body: { title: 'hijacked', expectedRevision: canvasB.revision },
        })
      ).status,
      404,
    );

    const listA = await json(await requestReader(`/api/reader/items/${BOOK_A}/canvases`));
    assert.equal(listA.length, 0, 'Book A must not list Book B canvases');
    const listB = await json(await requestReader(`/api/reader/items/${BOOK_B}/canvases`));
    assert.equal(listB.length, 1);

    // Legacy-graph import is item-scoped too.
    assert.equal(
      (await requestKnowledge(`/api/knowledge/legacy-graphs?itemId=${BOOK_A}`)).status,
      200,
    );
  }));

test('Annotations are book-scoped: Book A never sees Book B annotations', () =>
  withStores(async ({ requestReader, annotationStore }) => {
    annotationStore.createAnnotation(makeAnnotation());
    annotationStore.createAnnotation(
      makeAnnotation({
        id: 'ann-2',
        itemId: BOOK_B,
        anchor: { ...makeAnnotation().anchor, quote: 'Beta passage' },
      }),
    );

    const listA = await json(await requestReader(`/api/reader/items/${BOOK_A}/annotations`));
    const listB = await json(await requestReader(`/api/reader/items/${BOOK_B}/annotations`));
    assert.equal(listA.length, 1);
    assert.equal(listA[0].id, 'ann-1');
    assert.equal(listB.length, 1);
    assert.equal(listB[0].id, 'ann-2');

    const summaryA = await json(
      await requestReader(`/api/reader/items/${BOOK_A}/study-summary`),
    );
    assert.equal(summaryA.annotationCount, 1);
    assert.equal(summaryA.annotationCounts.highlight, 1);
  }));

// ---------------------------------------------------------------------------
// Annotation notes
// ---------------------------------------------------------------------------

test('A highlight keeps an attached note through create, edit, reload, and note deletion', () =>
  withStores(async ({ requestReader, annotationStore }) => {
    const created = await json(
      await requestReader(`/api/reader/items/${BOOK_A}/annotations`, {
        method: 'POST',
        body: makeAnnotation({ content: { subKind: 'highlight', note: 'First reading' } }),
      }),
    );
    assert.equal(created.content.note, 'First reading');

    const reloaded = await json(
      await requestReader(`/api/reader/items/${BOOK_A}/annotations/${created.id}`),
    );
    assert.equal(reloaded.content.note, 'First reading');
    assert.equal(reloaded.content.subKind, 'highlight');

    const edited = await json(
      await requestReader(`/api/reader/items/${BOOK_A}/annotations/${created.id}`, {
        method: 'PUT',
        body: {
          content: { ...editedContent(created), note: 'Reconsidered in chapter 4' },
          expectedRevision: created.revision,
        },
      }),
    );
    assert.equal(edited.content.note, 'Reconsidered in chapter 4');

    // Deleting only the note keeps the highlight itself.
    const noteRemoved = await json(
      await requestReader(`/api/reader/items/${BOOK_A}/annotations/${created.id}`, {
        method: 'PUT',
        body: {
          content: { subKind: 'highlight', color: '#f5d76e', note: '' },
          expectedRevision: edited.revision,
        },
      }),
    );
    assert.equal(noteRemoved.content.note, '');
    assert.equal(noteRemoved.content.subKind, 'highlight');
    assert.equal(annotationStore.getAnnotation(created.id).id, created.id);

    const summary = await json(await requestReader(`/api/reader/items/${BOOK_A}/study-summary`));
    assert.equal(summary.annotationCount, 1, 'the highlight must still exist');
    assert.equal(summary.annotationsWithNotes, 0);
  }));

function editedContent(annotation) {
  const { note, ...rest } = annotation.content;
  return rest;
}

test('Underline, strike, and drawing annotations persist with normalized anchors', () =>
  withStores(async ({ requestReader }) => {
    for (const subKind of ['underline', 'strike']) {
      const created = await json(
        await requestReader(`/api/reader/items/${BOOK_A}/annotations`, {
          method: 'POST',
          body: makeAnnotation({
            id: `ann-${subKind}`,
            content: { subKind, color: '#2f6f63' },
          }),
        }),
      );
      assert.equal(created.content.subKind, subKind);
      const reloaded = await json(
        await requestReader(`/api/reader/items/${BOOK_A}/annotations/${created.id}`),
      );
      assert.equal(reloaded.content.subKind, subKind);
      assert.deepEqual(reloaded.anchor.rects, [
        { x: 0.1, y: 0.2, width: 0.4, height: 0.03 },
      ]);
    }

    const drawing = await json(
      await requestReader(`/api/reader/items/${BOOK_A}/annotations`, {
        method: 'POST',
        body: {
          ...makeAnnotation({ id: 'ann-draw', kind: 'drawing' }),
          anchor: {
            kind: 'pdf-drawing',
            pageNumber: 3,
            points: [
              { x: 0.1, y: 0.1 },
              { x: 0.2, y: 0.25 },
            ],
            bounds: { x: 0.1, y: 0.1, width: 0.1, height: 0.15 },
            sourceHash: 'hash-a',
          },
          content: { subKind: 'pen', color: '#b45309', strokeWidth: 0.004, note: 'Circle this' },
        },
      }),
    );
    assert.equal(drawing.anchor.kind, 'pdf-drawing');
    assert.equal(drawing.anchor.points.length, 2);
    assert.equal(drawing.content.note, 'Circle this');
    // Normalized coordinates are zoom independent: the stored values are 0..1.
    for (const point of drawing.anchor.points) {
      assert.ok(point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1);
    }
  }));

test('Deleting one annotation leaves the others intact', () =>
  withStores(async ({ requestReader }) => {
    const a = await json(
      await requestReader(`/api/reader/items/${BOOK_A}/annotations`, {
        method: 'POST',
        body: makeAnnotation({ id: 'keep-me' }),
      }),
    );
    const b = await json(
      await requestReader(`/api/reader/items/${BOOK_A}/annotations`, {
        method: 'POST',
        body: makeAnnotation({ id: 'delete-me' }),
      }),
    );
    await requestReader(`/api/reader/items/${BOOK_A}/annotations/${b.id}`, {
      method: 'DELETE',
      body: { expectedRevision: b.revision },
    });
    const list = await json(await requestReader(`/api/reader/items/${BOOK_A}/annotations`));
    assert.deepEqual(list.map((x) => x.id), [a.id]);
  }));

// ---------------------------------------------------------------------------
// Annotation -> Knowledge Canvas
// ---------------------------------------------------------------------------

test('Promoting an annotation adds a source-linked block exactly once', () =>
  withStores(async ({ requestReader, requestKnowledge, canvasStore }) => {
    const annotation = await json(
      await requestReader(`/api/reader/items/${BOOK_A}/annotations`, {
        method: 'POST',
        body: makeAnnotation({ id: 'ann-promote', content: { subKind: 'highlight', note: 'note' } }),
      }),
    );
    const canvas = canvasStore.createCanvas({
      itemId: BOOK_A,
      title: 'Study canvas',
      scope: { kind: 'book' },
    });

    // Route the client helper's requests through the real reader middleware.
    const fetchImpl = async (url, init) => {
      const response = await requestReader(url, {
        method: init?.method ?? 'GET',
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async () => JSON.parse(response.text || 'null'),
      };
    };

    const first = await addAnnotationToKnowledgeCanvas(canvas.canvasId, annotation, {
      itemId: BOOK_A,
      fetchImpl,
    });
    assert.equal(first.status, 'added', first.message);

    const doc = canvasStore.getCanvas(canvas.canvasId);
    assert.equal(doc.knowledge.blocks.length, 1);
    assert.equal(doc.knowledge.blocks[0].source.annotationId, annotation.id);
    assert.equal(doc.knowledge.blocks[0].source.itemId, BOOK_A);
    assert.ok(doc.knowledge.blocks[0].source.quote.includes('Synthetic highlighted passage'));
    assert.equal(doc.knowledge.blocks[0].source.label, 'p. 7');

    const second = await addAnnotationToKnowledgeCanvas(canvas.canvasId, annotation, {
      itemId: BOOK_A,
      fetchImpl,
    });
    assert.equal(second.status, 'already-present');
    assert.equal(canvasStore.getCanvas(canvas.canvasId).knowledge.blocks.length, 1);

    // Cross-book promotion fails safely and changes nothing.
    const crossBook = await addAnnotationToKnowledgeCanvas(canvas.canvasId, annotation, {
      itemId: BOOK_B,
      fetchImpl,
    });
    assert.equal(crossBook.status, 'failed');
    assert.equal(canvasStore.getCanvas(canvas.canvasId).knowledge.blocks.length, 1);

    // The block is searchable and carries its owning book.
    const search = await json(await requestKnowledge('/api/knowledge/summary'));
    assert.ok(Array.isArray(search.graphs));
  }));

test('Promotion helpers derive type, label, quote, and duplicate state', () => {
  const base = makeAnnotation({ content: { subKind: 'highlight' } });
  assert.equal(annotationQuote(base), 'Synthetic highlighted passage');
  assert.equal(annotationSourceLabel(base), 'p. 7');
  assert.equal(annotationBlockType(base), 'quote');
  assert.equal(
    annotationBlockType({ ...base, kind: 'comment', content: { body: 'x' } }),
    'evidence',
  );

  const first = knowledgeWithPromotedAnnotation({ blocks: [], relationships: [] }, base, {
    itemId: BOOK_A,
  });
  assert.equal(first.alreadyPresent, false);
  assert.ok(first.blockId);
  const second = knowledgeWithPromotedAnnotation(first.knowledge, base, { itemId: BOOK_A });
  assert.equal(second.alreadyPresent, true);
  assert.equal(second.knowledge.blocks.length, 1);
  assert.equal(findBlockByAnnotation(second.knowledge, base.id)?.id, first.blockId);

  const reflowable = makeAnnotation({
    anchor: { kind: 'reflowable-text', startCfi: 'epubcfi(/6/4!/1)', endCfi: 'epubcfi(/6/4!/1:9)', spineIndex: 2, quote: 'x', sourceHash: 'h' },
  });
  assert.equal(annotationSourceLabel(reflowable), 'Section 3');
});

test('Knowledge helpers keep blocks and relationships consistent', () => {
  const b1 = createKnowledgeBlock({ id: 'b1', title: 'One' });
  const b2 = createKnowledgeBlock({ id: 'b2', title: 'Two' });
  let k = addBlock(addBlock({ blocks: [], relationships: [] }, b1), b2);
  k = addRelationship(k, createRelationship({ id: 'r1', sourceBlockId: 'b1', targetBlockId: 'b2', label: 'causes' }));
  assert.equal(k.relationships.length, 1);
  k = updateRelationship(k, 'r1', { direction: 'mutual' });
  assert.equal(k.relationships[0].direction, 'mutual');
  k = updateBlock(k, 'b1', { title: 'One (revised)' });
  assert.equal(k.blocks[0].title, 'One (revised)');
  // Removing a block removes its attached relationships.
  const afterRemoval = removeBlock(k, 'b2');
  assert.equal(afterRemoval.blocks.length, 1);
  assert.equal(afterRemoval.relationships.length, 0);
  assert.equal(removeRelationship(k, 'r1').relationships.length, 0);
});

// ---------------------------------------------------------------------------
// Legacy graph import
// ---------------------------------------------------------------------------

test('A legacy Read graph imports once into a Knowledge Canvas without changing the original', () =>
  withStores(async ({ requestKnowledge, knowledgeStore, canvasStore }) => {
    const graph = knowledgeStore.createGraph({
      title: 'Legacy Read Graph',
      associatedItemId: BOOK_A,
      nodes: [
        { id: 'n1', label: 'Osmosis', nodeType: 'concept' },
        {
          id: 'n2',
          label: 'Evidence',
          nodeType: 'evidence',
          deepLink: { type: 'annotation', target: 'ann-x', label: 'highlight' },
        },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'n2', targetNodeId: 'n1', label: 'evidence for', bidirectional: true },
      ],
    });
    const revisionBefore = knowledgeStore.getGraph(graph.id).revision;

    const listed = await json(
      await requestKnowledge(`/api/knowledge/legacy-graphs?itemId=${BOOK_A}`),
    );
    assert.equal(listed.length, 1);
    assert.equal(listed[0].nodeCount, 2);
    assert.equal(listed[0].importedCanvasId, null);

    const imported = await json(
      await requestKnowledge(`/api/knowledge/legacy-graphs/${graph.id}/import`, {
        method: 'POST',
        body: { itemId: BOOK_A },
      }),
    );
    assert.equal(imported.blockCount, 2);
    assert.equal(imported.relationshipCount, 1);

    const canvasDoc = canvasStore.getCanvas(imported.canvasId);
    assert.equal(canvasDoc.scope.kind, 'book');
    assert.equal(canvasDoc.knowledge.blocks.length, 2);
    assert.equal(canvasDoc.knowledge.blocks[1].source.annotationId, 'ann-x');
    assert.equal(canvasDoc.knowledge.relationships[0].label, 'evidence for');
    assert.equal(canvasDoc.knowledge.relationships[0].direction, 'mutual');
    assert.deepEqual(canvasDoc.knowledge.importedGraphIds, [graph.id]);

    // The original graph is untouched.
    const after = knowledgeStore.getGraph(graph.id);
    assert.equal(after.revision, revisionBefore);
    assert.equal(after.nodes.length, 2);
    assert.equal(after.edges.length, 1);
    assert.equal(after.lifecycle, 'active');

    // Importing twice is refused and points at the existing canvas.
    const second = await requestKnowledge(`/api/knowledge/legacy-graphs/${graph.id}/import`, {
      method: 'POST',
      body: { itemId: BOOK_A },
    });
    assert.equal(second.status, 409);
    assert.equal((await json(second)).canvasId, imported.canvasId);

    const relisted = await json(
      await requestKnowledge(`/api/knowledge/legacy-graphs?itemId=${BOOK_A}`),
    );
    assert.equal(relisted[0].importedCanvasId, imported.canvasId);
  }));

test('Importing another book legacy graph is refused', () =>
  withStores(async ({ requestKnowledge, knowledgeStore }) => {
    const graphB = knowledgeStore.createGraph({
      title: 'Beta graph',
      associatedItemId: BOOK_B,
      nodes: [{ id: 'n1', label: 'Beta', nodeType: 'concept' }],
      edges: [],
    });
    const res = await requestKnowledge(`/api/knowledge/legacy-graphs/${graphB.id}/import`, {
      method: 'POST',
      body: { itemId: BOOK_A },
    });
    assert.equal(res.status, 404);
  }));

test('Legacy graph conversion is a pure projection', () => {
  const converted = convertLegacyGraphToKnowledgeCanvas(
    {
      id: 'g1',
      title: 'Graph',
      nodes: [{ id: 'n1', label: 'A', nodeType: 'claim' }],
      edges: [],
    },
    { itemId: BOOK_A, now: '2026-01-01T00:00:00.000Z' },
  );
  assert.equal(converted.scope.kind, 'book');
  assert.equal(converted.knowledge.blocks[0].type, 'claim');
  assert.equal(converted.knowledge.blocks[0].source.legacyGraphId, 'g1');
  assert.deepEqual(converted.knowledge.importedGraphIds, ['g1']);
});

// ---------------------------------------------------------------------------
// Recovery, backup/restore, search
// ---------------------------------------------------------------------------

test('Scope and structured knowledge survive a file-first canvas recovery', () =>
  withStores(({ canvasStore, databasePath, userDataRoot }) => {
    const location = { schemaVersion: 1, kind: 'page', sourceHash: 'h', payload: { pageNumber: 12 } };
    const created = canvasStore.createCanvas({
      itemId: BOOK_A,
      title: 'Page 12 canvas',
      scope: { kind: 'location', label: 'Page 12', anchor: { sourceHash: 'h', location } },
    });
    const block = createKnowledgeBlock({ id: 'b1', type: 'definition', title: 'Mitosis' });
    canvasStore.updateCanvas(
      created.canvasId,
      {
        title: created.title,
        scene: created.scene,
        links: [],
        knowledge: addBlock({ blocks: [], relationships: [] }, block),
      },
      created.revision,
    );

    // Wipe the row, keep the file-first mirror, then recover.
    const db = new DatabaseSync(databasePath);
    db.exec('DELETE FROM canvases;');
    db.close();
    const recovered = canvasStore.recoverCanvasFromExternal(created.canvasId);
    assert.equal(recovered.ok, true);

    const meta = canvasStore.getCanvasMetadata(created.canvasId);
    assert.equal(meta.scopeKind, 'location', 'scope survives file-first recovery');
    assert.equal(meta.scopeLabel, 'Page 12');
    const doc = canvasStore.getCanvas(created.canvasId);
    assert.equal(doc.knowledge.blocks[0].title, 'Mitosis');
    assert.ok(existsSync(join(userDataRoot, `canvases/${created.canvasId}/recovery.json`)));
  }));

test('Canvas export/import preserves scope, knowledge, and ownership', () =>
  withStores(({ canvasStore, dir }) => {
    const location = { schemaVersion: 1, kind: 'page', sourceHash: 'h', payload: { pageNumber: 5 } };
    const created = canvasStore.createCanvas({
      itemId: BOOK_A,
      title: 'Portable canvas',
      scope: { kind: 'location', label: 'Page 5', anchor: { sourceHash: 'h', location } },
    });
    const b1 = createKnowledgeBlock({ id: 'b1', title: 'One' });
    const b2 = createKnowledgeBlock({ id: 'b2', title: 'Two' });
    let knowledge = addBlock(addBlock({ blocks: [], relationships: [] }, b1), b2);
    knowledge = addRelationship(
      knowledge,
      createRelationship({ id: 'r1', sourceBlockId: 'b1', targetBlockId: 'b2', label: 'leads to' }),
    );
    canvasStore.updateCanvas(
      created.canvasId,
      { title: created.title, scene: created.scene, links: [], knowledge },
      created.revision,
    );

    const pkg = canvasStore.exportCanvas(created.canvasId);
    assert.equal(pkg.document.scope.kind, 'location');
    assert.equal(pkg.document.knowledge.relationships[0].label, 'leads to');

    // Restore into a second store rooted in the same user-data tree.
    const secondRoot = join(dir, 'restore-user-data');
    mkdirSync(secondRoot, { recursive: true });
    const restored = createCanvasStore({
      databasePath: join(dir, 'restore.sqlite3'),
      userDataRoot: secondRoot,
    });
    // The restore store needs the same items table for the FK; copy it.
    const source = new DatabaseSync(join(dir, 'runtime.sqlite3'));
    const items = source.prepare('SELECT * FROM items').all();
    source.close();
    const target = new DatabaseSync(join(dir, 'restore.sqlite3'));
    target.exec('CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, title TEXT NOT NULL, collection TEXT NOT NULL)');
    const insert = target.prepare('INSERT OR IGNORE INTO items (id, title, collection) VALUES (?, ?, ?)');
    for (const item of items) insert.run(item.id, item.title, item.collection);
    target.close();

    const imported = restored.importCanvas(pkg);
    assert.equal(imported.itemId, BOOK_A, 'restore must not attach the canvas to another book');
    assert.equal(imported.scope.kind, 'location');
    assert.deepEqual(imported.scope.anchor.location, location);
    assert.equal(imported.knowledge.blocks.length, 2);
    assert.equal(imported.knowledge.relationships[0].direction, 'directed');
    restored.close();
  }));

test('Search indexes canvas blocks, relationship labels, and annotation notes with the owning book', () =>
  withStores(async ({ requestReader, canvasStore, searchStore }) => {
    const canvas = canvasStore.createCanvas({
      itemId: BOOK_A,
      title: 'Alpha canvas',
      scope: { kind: 'book' },
    });
    const b1 = createKnowledgeBlock({ id: 'b1', title: 'Chloroplast', body: 'site of photosynthesis' });
    const b2 = createKnowledgeBlock({ id: 'b2', title: 'Thylakoid' });
    let knowledge = addBlock(addBlock({ blocks: [], relationships: [] }, b1), b2);
    knowledge = addRelationship(
      knowledge,
      createRelationship({ id: 'r1', sourceBlockId: 'b1', targetBlockId: 'b2', label: 'contains' }),
    );
    canvasStore.updateCanvas(
      canvas.canvasId,
      { title: canvas.title, scene: canvas.scene, links: [], knowledge },
      canvas.revision,
    );

    await requestReader(`/api/reader/items/${BOOK_A}/annotations`, {
      method: 'POST',
      body: makeAnnotation({ id: 'ann-search', content: { subKind: 'highlight', note: 'mitochondria note' } }),
    });

    const rebuild = searchStore.rebuildIndex();
    assert.equal(rebuild.ok, true);

    const blockHit = searchStore.search({ query: 'Chloroplast' });
    assert.ok(blockHit.results.length >= 1);
    const canvasHit = blockHit.results.find((r) => r.kind === 'canvas');
    assert.ok(canvasHit, 'block title must be searchable on the canvas');
    assert.equal(canvasHit.itemId, BOOK_A);

    const relationshipHit = searchStore.search({ query: 'contains' });
    assert.ok(relationshipHit.results.some((r) => r.kind === 'canvas'));

    const noteHit = searchStore.search({ query: 'mitochondria' });
    const annotationHit = noteHit.results.find((r) => r.kind === 'annotation' || r.kind === 'highlight');
    assert.ok(annotationHit, 'annotation notes must be searchable');
    assert.equal(annotationHit.itemId, BOOK_A);
  }));

// ---------------------------------------------------------------------------
// Selection anchors + reader layout
// ---------------------------------------------------------------------------

test('Selection rectangles normalize against the page and merge per line', () => {
  const page = { left: 100, top: 50, width: 400, height: 800 };
  const rects = normalizeSelectionRects(
    [
      { left: 140, top: 130, width: 80, height: 16 },
      { left: 220, top: 131, width: 40, height: 16 },
      { left: 0, top: 0, width: 0, height: 0 },
      { left: 300, top: 300, width: 60, height: 16 },
    ],
    page,
  );
  assert.equal(rects.length, 2, 'same-line runs merge, zero-area rects drop');
  assert.ok(Math.abs(rects[0].x - 0.1) < 0.001);
  assert.ok(Math.abs(rects[0].width - 0.3) < 0.001, `merged width was ${rects[0].width}`);
  assert.ok(Math.abs(rects[0].height - 0.02) < 0.001);

  const pdf = pdfTextAnchorFromSelection({
    pageNumber: 4,
    sourceHash: 'hash',
    quote: 'quoted',
    rects,
    prefix: 'pre',
    suffix: 'post',
  });
  assert.equal(pdf.kind, 'pdf-text');
  assert.equal(pdf.pageNumber, 4);
  assert.equal(pdf.rects.length, 2);
  assert.equal(pdf.prefix, 'pre');

  const reflowable = reflowableTextAnchorFromSelection({
    sourceHash: 'hash',
    quote: 'quoted',
    spineIndex: 3,
  });
  assert.equal(reflowable.kind, 'reflowable-text');
  assert.equal(reflowable.spineIndex, 3);
  assert.equal(
    reflowable.startCfi,
    undefined,
    'a CFI the engine never provided must not be forged',
  );
  assert.equal(reflowable.fidelity, 'section');
  assert.equal('pageNumber' in reflowable, false, 'no page number is invented for reflowable');

  // A genuine engine CFI is preserved verbatim and labelled as such.
  const withCfi = reflowableTextAnchorFromSelection({
    sourceHash: 'hash',
    quote: 'quoted',
    spineIndex: 3,
    startCfi: '/6/8!/4/2/1:5',
    endCfi: '/6/8!/4/2/1:19',
  });
  assert.equal(withCfi.startCfi, '/6/8!/4/2/1:5');
  assert.equal(withCfi.endCfi, '/6/8!/4/2/1:19');
  assert.equal(withCfi.fidelity, 'cfi');
  assert.equal(withCfi.spineIndex, 3);
});

test('Reader layout states hide the right pane and restore deterministically', () => {
  assert.equal(readerPaneVisible('split'), true);
  assert.equal(readerPaneVisible('full'), true);
  assert.equal(readerPaneVisible('minimized'), false);

  assert.equal(sidePaneVisible('split', true), true);
  assert.equal(sidePaneVisible('split', false), false);
  assert.equal(
    sidePaneVisible('full', true),
    true,
    'the study pane stays mounted in full mode (hidden, so note drafts survive)',
  );
  assert.equal(sidePaneVisible('minimized', true), true);

  assert.ok(readerPaneClass('full', true).includes('flex-1'));
  assert.ok(readerPaneClass('split', true).includes('flex-[1.4]'));
  assert.equal(
    readerPaneClass('minimized', true),
    'hidden',
    'minimizing hides the pane with CSS so the adapter container stays mounted',
  );
  assert.equal(
    sidePaneClass('full'),
    'hidden',
    'full reader hides the study pane without unmounting it',
  );
  assert.ok(sidePaneClass('minimized').includes('flex-1'));
  assert.ok(sidePaneClass('split').includes('border-l'));

  assert.equal(toggleFullReader('split'), 'full');
  assert.equal(toggleFullReader('full'), 'split');
});
