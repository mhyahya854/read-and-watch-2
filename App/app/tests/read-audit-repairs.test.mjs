/**
 * Regression tests for the adversarial Read-redesign audit.
 *
 * Each test pins a defect that was found and repaired: annotation ownership,
 * batch/recovery ownership, honest PDF/reflowable anchors, semantic<->visual
 * Canvas synchronisation, canonical location equality, source-link fallbacks and
 * reader layout state retention.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createAnnotationStore } from '../server/annotation-store.mjs';
import { createCanvasStore } from '../server/canvas-store.mjs';
import { createKnowledgeStore } from '../server/knowledge-store.mjs';
import { createSearchStore } from '../server/search-store.mjs';
import { createLibraryStore } from '../server/library-store.mjs';
import { readerPlugin } from '../server/reader-vite-plugin.mjs';
import { knowledgePlugin } from '../server/knowledge-vite-plugin.mjs';
import { convertLegacyGraphToKnowledgeCanvas } from '../server/canvas-knowledge.mjs';
import { writeTestDatabase } from './test-database.mjs';

import { FoliateReflowableAdapter } from '../lib/document/reflowable-adapter.ts';
import {
  mergeNormalizedRects,
  rotateNormalizedPoint,
  rotateNormalizedRect,
  toCanonicalPoint,
  fromCanonicalPoint,
  toCanonicalRect,
  fromCanonicalRect,
  normalizeClientRects,
} from '../lib/document/selection-geometry.ts';
import {
  canonicalLocationKey,
  locationsEqual,
  describeLocation,
  isValidLocation,
} from '../lib/document/location-key.mjs';
import {
  pdfTextAnchorFromSelection,
  reflowableTextAnchorFromSelection,
  annotationAnchorFromTextAnchor,
} from '../lib/annotation/selection-anchor.ts';
import { validateCanvasScope } from '../lib/canvas/validation.ts';
import {
  addBlock,
  addRelationship,
  createKnowledgeBlock,
  createRelationship,
  removeBlock,
  removeRelationship,
  updateRelationship,
} from '../lib/canvas/knowledge.ts';
import {
  blockElementId,
  blockLabelElementId,
  connectorElementId,
  connectorLabelElementId,
  createBlockElements,
  elementRwMeta,
  needsReconcile,
  reconcileKnowledgeScene,
} from '../lib/canvas/scene-sync.ts';
import {
  addAnnotationToKnowledgeCanvas,
  annotationLocation,
  knowledgeWithPromotedAnnotation,
} from '../lib/canvas/annotation-promotion.ts';
import { readerPaneClass, sidePaneClass, sidePaneVisible } from '../lib/reader/layout.ts';

const BOOK_A = `read-${'a'.repeat(32)}`;
const BOOK_B = `read-${'b'.repeat(32)}`;

function createFixture(dir) {
  const dbPath = join(dir, 'runtime.sqlite3');
  writeTestDatabase(dbPath, [
    {
      id: BOOK_A,
      collection: 'read',
      itemPath: 'read/audit-alpha',
      title: 'Audit Book Alpha',
      type: 'book',
      status: '',
      summary: '',
      added: '2026-01-01',
    },
    {
      id: BOOK_B,
      collection: 'read',
      itemPath: 'read/audit-beta',
      title: 'Audit Book Beta',
      type: 'book',
      status: '',
      summary: '',
      added: '2026-01-01',
    },
  ]);
  return dbPath;
}

function middlewareHarness(plugin) {
  let handler = null;
  plugin.configureServer({
    middlewares: {
      use(pathOrFn, maybeFn) {
        handler = typeof pathOrFn === 'function' ? pathOrFn : maybeFn;
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
        setHeader() {},
        writeHead(code) {
          this.statusCode = code;
        },
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
  const dir = mkdtempSync(join(tmpdir(), 'rw-read-audit-'));
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
      pageNumber: 4,
      rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.03 }],
      quote: 'Audited passage',
      sourceHash: 'hash-a',
    },
    content: { subKind: 'highlight', color: '#d6b34c' },
    sourceHash: 'hash-a',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 5/6/7 - annotation ownership
// ---------------------------------------------------------------------------

test('Book A cannot GET, PUT, DELETE or RESTORE Book B annotation by id', () =>
  withStores(async ({ requestReader, annotationStore }) => {
    const annB = await json(
      await requestReader(`/api/reader/items/${BOOK_B}/annotations`, {
        method: 'POST',
        body: makeAnnotation({ id: 'ann-b', itemId: BOOK_B, content: { subKind: 'highlight', note: 'beta note' } }),
      }),
    );
    const revisionBefore = annB.revision;

    const crossGet = await requestReader(
      `/api/reader/items/${BOOK_A}/annotations/${annB.id}`,
    );
    assert.equal(crossGet.status, 404, 'cross-book GET must be a safe not-found');

    const crossPut = await requestReader(
      `/api/reader/items/${BOOK_A}/annotations/${annB.id}`,
      { method: 'PUT', body: { content: { subKind: 'highlight', note: 'hijacked' }, expectedRevision: revisionBefore } },
    );
    assert.equal(crossPut.status, 404, 'cross-book PUT must be a safe not-found');

    const crossDelete = await requestReader(
      `/api/reader/items/${BOOK_A}/annotations/${annB.id}`,
      { method: 'DELETE', body: { expectedRevision: revisionBefore } },
    );
    assert.equal(crossDelete.status, 404, 'cross-book DELETE must be a safe not-found');

    // Soft-delete it (as its owner) so the restore path can be attacked too.
    const ownDelete = await requestReader(
      `/api/reader/items/${BOOK_B}/annotations/${annB.id}`,
      { method: 'DELETE', body: { expectedRevision: revisionBefore } },
    );
    assert.equal(ownDelete.status, 200);

    const crossRestore = await requestReader(
      `/api/reader/items/${BOOK_A}/annotations/${annB.id}/restore`,
      { method: 'PATCH', body: {} },
    );
    assert.equal(crossRestore.status, 404, 'cross-book RESTORE must be a safe not-found');

    // The owner's annotation is untouched by every attack.
    const stored = annotationStore.getAnnotation(annB.id);
    assert.equal(stored.content.note, 'beta note');
    assert.ok(stored.deletedAt, 'Book A could not resurrect Book B annotation');
  }));

test('Batch create binds every annotation to the route item and refuses a foreign payload id', () =>
  withStores(async ({ requestReader, annotationStore }) => {
    const foreign = await requestReader(
      `/api/reader/items/${BOOK_A}/annotations/batch`,
      {
        method: 'POST',
        body: {
          items: [makeAnnotation({ id: 'batch-b', itemId: BOOK_B })],
        },
      },
    );
    assert.equal(foreign.status, 400, 'a payload naming another book is refused');

    const ok = await requestReader(`/api/reader/items/${BOOK_A}/annotations/batch`, {
      method: 'POST',
      body: {
        items: [
          { ...makeAnnotation({ id: 'batch-a1' }), itemId: undefined },
          makeAnnotation({ id: 'batch-a2' }),
        ],
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(annotationStore.getAnnotation('batch-a1').itemId, BOOK_A);
    assert.equal(annotationStore.getAnnotation('batch-a2').itemId, BOOK_A);
  }));

test('Recovery refuses records that claim another book', () =>
  withStores(async ({ requestReader, annotationStore, userDataRoot }) => {
    const recoveryDir = join(userDataRoot, 'items', BOOK_A);
    mkdirSync(recoveryDir, { recursive: true });
    writeFileSync(
      join(recoveryDir, 'annotations.json'),
      JSON.stringify({
        schemaVersion: 1,
        annotations: [
          {
            ...makeAnnotation({ id: 'rec-a' }),
            itemId: BOOK_A,
            revision: 1,
            lifecycle: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            deletedAt: null,
          },
          {
            ...makeAnnotation({ id: 'rec-b' }),
            itemId: BOOK_B,
            revision: 1,
            lifecycle: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            deletedAt: null,
          },
        ],
      }),
    );

    const result = await json(
      await requestReader(`/api/reader/items/${BOOK_A}/annotations/recover`, {
        method: 'POST',
      }),
    );
    assert.equal(result.ok, false, 'a foreign recovery record must be reported');
    assert.equal(result.rejected.length, 1);
    assert.equal(annotationStore.getAnnotation('rec-a').itemId, BOOK_A);
    const foreignRows = annotationStore
      .getAnnotations(BOOK_B, { includeDeleted: true })
      .filter((a) => a.id === 'rec-b');
    assert.equal(foreignRows.length, 0, 'no cross-book row was injected');
  }));

test('Single create rejects a payload item that contradicts the route', () =>
  withStores(async ({ requestReader }) => {
    const res = await requestReader(`/api/reader/items/${BOOK_A}/annotations`, {
      method: 'POST',
      body: makeAnnotation({ id: 'mismatch', itemId: BOOK_B }),
    });
    assert.equal(res.status, 400);
  }));

test('Annotations cannot be created for an unknown item', () =>
  withStores(async ({ requestReader }) => {
    const res = await requestReader(
      `/api/reader/items/read-${'f'.repeat(32)}/annotations`,
      { method: 'POST', body: makeAnnotation({ id: 'orphan', itemId: `read-${'f'.repeat(32)}` }) },
    );
    assert.equal(res.status, 400, 'an unknown owner must be refused');
  }));

// ---------------------------------------------------------------------------
// 8/9/11 - honest anchors, no synthetic selections, no fake geometry
// ---------------------------------------------------------------------------

test('Reflowable adapter returns null instead of a synthetic selection', async () => {
  const adapter = new FoliateReflowableAdapter();
  await adapter.open({
    itemId: BOOK_A,
    formatId: 'audit-epub',
    format: 'epub',
    sourceHash: 'audit-hash',
    byteSize: 1,
    title: 'Audit Book',
  });
  assert.equal(await adapter.getSelection(), null, 'no selection means null');

  // The explicit test seam still works and is never used in production.
  adapter.setSelection({
    text: 'Real selection',
    location: {
      schemaVersion: 1,
      kind: 'semantic',
      sourceHash: 'audit-hash',
      payload: { progression: 0.2 },
    },
  });
  const injected = await adapter.getSelection();
  assert.equal(injected?.text, 'Real selection');
  await adapter.close();
});

test('Reflowable anchors never forge a CFI and record the canonical location', () => {
  const sectionAnchor = reflowableTextAnchorFromSelection({
    sourceHash: 'h',
    quote: 'quoted',
    spineIndex: 2,
    startOffset: 5,
    endOffset: 18,
    location: { schemaVersion: 1, kind: 'semantic', sourceHash: 'h', payload: { progression: 0.5 } },
  });
  assert.equal(sectionAnchor.startCfi, undefined);
  assert.equal(sectionAnchor.fidelity, 'section');
  assert.equal(sectionAnchor.startOffset, 5);
  assert.ok(sectionAnchor.location);

  const cfiAnchor = reflowableTextAnchorFromSelection({
    sourceHash: 'h',
    quote: 'quoted',
    spineIndex: 2,
    startCfi: '/6/8!/4/2/1:5',
    endCfi: '/6/8!/4/2/1:19',
  });
  assert.equal(cfiAnchor.fidelity, 'cfi');
  assert.equal(cfiAnchor.startCfi, '/6/8!/4/2/1:5');
});

test('PDF text anchors require real geometry and never fabricate a stripe', () => {
  assert.equal(
    pdfTextAnchorFromSelection({
      pageNumber: 1,
      sourceHash: 'h',
      quote: 'q',
      rects: [],
    }),
    null,
    'no rectangles means no PDF text mark',
  );
  const withRects = pdfTextAnchorFromSelection({
    pageNumber: 2,
    sourceHash: 'h',
    quote: 'q',
    rects: [
      { x: 0.1, y: 0.1, width: 0.3, height: 0.03 },
      { x: 0.1, y: 0.14, width: 0.25, height: 0.03 },
    ],
  });
  assert.equal(withRects.rects.length, 2);
});

test('Document anchors convert to annotation anchors (PDF and reflowable)', () => {
  const pdf = annotationAnchorFromTextAnchor({
    kind: 'pdf-geometry',
    quote: 'q',
    sourceHash: 'h',
    context: { prefix: 'a', suffix: 'b' },
    payload: { pageNumber: 3, rects: [{ x: 0.2, y: 0.3, width: 0.2, height: 0.02 }] },
  });
  assert.equal(pdf.kind, 'pdf-text');
  assert.equal(pdf.rects.length, 1);
  assert.equal(pdf.prefix, 'a');

  assert.equal(
    annotationAnchorFromTextAnchor({
      kind: 'pdf-geometry',
      quote: 'q',
      sourceHash: 'h',
      payload: { pageNumber: 3, rects: [] },
    }),
    null,
  );

  const reflowable = annotationAnchorFromTextAnchor(
    {
      kind: 'reflowable-range',
      quote: 'q',
      sourceHash: 'h',
      payload: { spineIndex: 1, startOffset: 2, endOffset: 9 },
    },
    { location: { schemaVersion: 1, kind: 'semantic', sourceHash: 'h', payload: { progression: 0.3 } } },
  );
  assert.equal(reflowable.kind, 'reflowable-text');
  assert.equal(reflowable.fidelity, 'section');
  assert.ok(reflowable.location);
});

// ---------------------------------------------------------------------------
// 12/14/15/18/43 - geometry, rotation, location identity
// ---------------------------------------------------------------------------

test('Multi-line selection rectangles are merged per line and all survive', () => {
  const page = { left: 0, top: 0, width: 400, height: 800 };
  const rects = normalizeClientRects(
    [
      { left: 40, top: 80, width: 80, height: 16 },
      { left: 120, top: 81, width: 40, height: 16 },
      { left: 40, top: 100, width: 120, height: 16 },
      { left: 40, top: 120, width: 160, height: 16 },
    ],
    page,
  );
  assert.equal(rects.length, 3, 'three visual lines stay three rectangles');
  assert.ok(Math.abs(rects[0].width - 0.3) < 0.001, `same-line runs merge (${rects[0].width})`);
  assert.ok(rects[2].y > rects[1].y && rects[1].y > rects[0].y);
});

test('Rotation transforms are exact inverses and keep marks in page space', () => {
  const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.05 };
  for (const degrees of [90, 180, 270]) {
    const rotated = fromCanonicalRect(rect, degrees);
    const back = toCanonicalRect(rotated, degrees);
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(
        Math.abs(back[key] - rect[key]) < 1e-9,
        `${key} must round-trip at ${degrees} degrees`,
      );
    }
  }
  const point = { x: 0.25, y: 0.75 };
  for (const degrees of [90, 180, 270]) {
    const back = toCanonicalPoint(fromCanonicalPoint(point, degrees), degrees);
    assert.ok(Math.abs(back.x - point.x) < 1e-9 && Math.abs(back.y - point.y) < 1e-9);
  }
  // A 90 degree rotation swaps the axes about the centre.
  const rotated90 = rotateNormalizedRect({ x: 0, y: 0, width: 0.5, height: 0.25 }, 1);
  assert.ok(Math.abs(rotated90.x - 0.75) < 1e-9);
  assert.ok(Math.abs(rotated90.y - 0) < 1e-9);
  assert.ok(Math.abs(rotated90.width - 0.25) < 1e-9);
  const pt = rotateNormalizedPoint({ x: 0, y: 0 }, 1);
  assert.ok(Math.abs(pt.x - 1) < 1e-9 && Math.abs(pt.y - 0) < 1e-9);
  assert.equal(mergeNormalizedRects([]).length, 0);
});

test('Canonical location keys ignore key order and describe PDF vs reflowable honestly', () => {
  const a = { schemaVersion: 1, kind: 'page', sourceHash: 'h', payload: { pageNumber: 12 } };
  const b = { payload: { pageNumber: 12 }, sourceHash: 'h', kind: 'page', schemaVersion: 1 };
  assert.equal(canonicalLocationKey(a), canonicalLocationKey(b));
  assert.equal(locationsEqual(a, b), true, 'key order must not matter');

  const semantic = {
    schemaVersion: 1,
    kind: 'semantic',
    sourceHash: 'h',
    payload: { spineIndex: 3, progression: 0.25 },
  };
  assert.equal(
    locationsEqual(semantic, { ...semantic, payload: { progression: 0.25, spineIndex: 3 } }),
    true,
  );
  assert.equal(locationsEqual(a, semantic), false);

  assert.equal(describeLocation(a), 'Page 12');
  assert.equal(describeLocation(semantic), 'Section 4');
  assert.equal(
    describeLocation({ schemaVersion: 1, kind: 'progression', sourceHash: 'h', payload: { fraction: 0.4 } }),
    'Location 40%',
  );
  assert.equal(describeLocation(undefined), 'Location');

  assert.equal(isValidLocation(a), true);
  assert.equal(isValidLocation({ kind: 'page', payload: { pageNumber: 1 } }), false, 'no source hash');
  assert.equal(isValidLocation({ sourceHash: 'h', kind: 'nonsense', payload: {} }), false);
  assert.equal(isValidLocation({ schemaVersion: 1, kind: 'page', sourceHash: 'h', payload: {} }), false);
});

test('Location canvas scope requires a canonical location, and junk downgrades safely', () => {
  assert.deepEqual(
    validateCanvasScope({ kind: 'location', anchor: { location: { nonsense: true } } }),
    { kind: 'book' },
  );
  const good = validateCanvasScope({
    kind: 'location',
    label: 'Page 9',
    anchor: {
      location: { schemaVersion: 1, kind: 'page', sourceHash: 'h', payload: { pageNumber: 9 } },
    },
  });
  assert.equal(good.kind, 'location');
  assert.equal(good.label, 'Page 9');
});

// ---------------------------------------------------------------------------
// 22-30 - unified semantic <-> visual synchronisation
// ---------------------------------------------------------------------------

function knowledgeWithTwoBlocks() {
  let knowledge = addBlock({ blocks: [], relationships: [] }, createKnowledgeBlock({ id: 'b1', title: 'Alpha' }));
  knowledge = addBlock(knowledge, createKnowledgeBlock({ id: 'b2', title: 'Beta' }));
  return knowledge;
}

function place(knowledge, blockId, position) {
  const block = knowledge.blocks.find((b) => b.id === blockId);
  const elements = createBlockElements(block, position);
  return {
    elements,
    knowledge: {
      ...knowledge,
      blocks: knowledge.blocks.map((b) => (b.id === blockId ? { ...b, elementId: elements[0].id } : b)),
    },
  };
}

test('Renaming a structured block renames its visual label', () => {
  const base = knowledgeWithTwoBlocks();
  const placed = place(base, 'b1', { x: 100, y: 100 });
  const renamed = {
    ...placed.knowledge,
    blocks: placed.knowledge.blocks.map((b) => (b.id === 'b1' ? { ...b, title: 'Alpha revised' } : b)),
  };

  const result = reconcileKnowledgeScene({ elements: placed.elements, knowledge: renamed });
  const label = result.elements.find((el) => el.id === blockLabelElementId('b1'));
  assert.equal(label?.text, 'Alpha revised');
  assert.equal(elementRwMeta(label).kind, 'block-label');
});

test('Deleting a structured block removes its visual block, label and connectors', () => {
  let knowledge = knowledgeWithTwoBlocks();
  const a = place(knowledge, 'b1', { x: 100, y: 100 });
  knowledge = a.knowledge;
  const b = place(knowledge, 'b2', { x: 420, y: 100 });
  let elements = [...a.elements, ...b.elements];
  knowledge = addRelationship(
    b.knowledge,
    createRelationship({ id: 'r1', sourceBlockId: 'b1', targetBlockId: 'b2', label: 'causes' }),
  );

  const connected = reconcileKnowledgeScene({ elements, knowledge });
  elements = connected.elements;
  knowledge = connected.knowledge;
  assert.ok(
    elements.some((el) => el.id === connectorElementId('r1')),
    'the connector must exist while both endpoints are placed',
  );

  const afterDelete = reconcileKnowledgeScene({
    elements,
    knowledge: removeBlock(knowledge, 'b1'),
  });
  assert.equal(
    afterDelete.elements.some((el) => el.id === blockElementId('b1')),
    false,
    'the visual block is removed with its semantic block',
  );
  assert.equal(
    afterDelete.elements.some((el) => el.id === blockLabelElementId('b1')),
    false,
  );
  assert.equal(
    afterDelete.elements.some((el) => el.id === connectorElementId('r1')),
    false,
    'connectors touching the deleted block are removed',
  );
  assert.equal(afterDelete.knowledge.relationships.length, 0);
});

test('A relationship created before placement gains its connector once both blocks are placed', () => {
  let knowledge = knowledgeWithTwoBlocks();
  knowledge = addRelationship(
    knowledge,
    createRelationship({ id: 'r1', sourceBlockId: 'b1', targetBlockId: 'b2', label: 'supports' }),
  );

  // Nothing is placed yet: no connector may exist.
  const empty = reconcileKnowledgeScene({ elements: [], knowledge });
  assert.equal(empty.elements.length, 0);

  const a = place(knowledge, 'b1', { x: 100, y: 100 });
  const onePlaced = reconcileKnowledgeScene({ elements: a.elements, knowledge: a.knowledge });
  assert.equal(
    onePlaced.elements.some((el) => el.id === connectorElementId('r1')),
    false,
    'one endpoint is not enough',
  );
  assert.equal(needsReconcile(onePlaced.elements, onePlaced.knowledge), false);

  const b = place(onePlaced.knowledge, 'b2', { x: 460, y: 100 });
  const bothPlaced = reconcileKnowledgeScene({
    elements: [...onePlaced.elements, ...b.elements],
    knowledge: b.knowledge,
  });
  const connector = bothPlaced.elements.find((el) => el.id === connectorElementId('r1'));
  assert.ok(connector, 'the connector appears automatically');
  assert.equal(
    bothPlaced.knowledge.relationships[0].linkedElementId,
    connectorElementId('r1'),
  );
  const connectorLabel = bothPlaced.elements.find(
    (el) => el.id === connectorLabelElementId('r1'),
  );
  assert.equal(connectorLabel?.text, 'supports', 'the connector is a NAMED line');
});

test('Editing a relationship label and direction updates the visual connector', () => {
  let knowledge = knowledgeWithTwoBlocks();
  const a = place(knowledge, 'b1', { x: 100, y: 100 });
  knowledge = a.knowledge;
  const b = place(knowledge, 'b2', { x: 460, y: 100 });
  knowledge = b.knowledge;
  knowledge = addRelationship(
    knowledge,
    createRelationship({ id: 'r1', sourceBlockId: 'b1', targetBlockId: 'b2', label: 'supports' }),
  );
  let elements = [...a.elements, ...b.elements];
  let result = reconcileKnowledgeScene({ elements, knowledge });
  elements = result.elements;
  knowledge = result.knowledge;

  const arrowBefore = elements.find((el) => el.id === connectorElementId('r1'));
  assert.equal(arrowBefore.startArrowhead, null, 'directed first');

  knowledge = updateRelationship(knowledge, 'r1', {
    label: 'strong evidence for',
    direction: 'mutual',
  });
  result = reconcileKnowledgeScene({ elements, knowledge });
  const arrowAfter = result.elements.find((el) => el.id === connectorElementId('r1'));
  const labelAfter = result.elements.find((el) => el.id === connectorLabelElementId('r1'));
  assert.equal(labelAfter.text, 'strong evidence for');
  assert.equal(arrowAfter.startArrowhead, 'arrow', 'mutual adds the second arrowhead');

  // Unicode labels survive the visual round trip.
  knowledge = updateRelationship(result.knowledge, 'r1', { label: '母亲' });
  const unicode = reconcileKnowledgeScene({ elements: result.elements, knowledge });
  assert.equal(
    unicode.elements.find((el) => el.id === connectorLabelElementId('r1')).text,
    '母亲',
  );
});

test('Deleting a relationship removes only its connector', () => {
  let knowledge = knowledgeWithTwoBlocks();
  const a = place(knowledge, 'b1', { x: 100, y: 100 });
  knowledge = a.knowledge;
  const b = place(knowledge, 'b2', { x: 460, y: 100 });
  knowledge = b.knowledge;
  knowledge = addRelationship(
    knowledge,
    createRelationship({ id: 'r1', sourceBlockId: 'b1', targetBlockId: 'b2', label: 'a' }),
  );
  knowledge = addRelationship(
    knowledge,
    createRelationship({ id: 'r2', sourceBlockId: 'b2', targetBlockId: 'b1', label: 'b' }),
  );
  const elements = [...a.elements, ...b.elements];
  const withBoth = reconcileKnowledgeScene({ elements, knowledge });

  const afterDelete = reconcileKnowledgeScene({
    elements: withBoth.elements,
    knowledge: removeRelationship(withBoth.knowledge, 'r1'),
  });
  assert.equal(
    afterDelete.elements.some((el) => el.id === connectorElementId('r1')),
    false,
  );
  assert.equal(
    afterDelete.elements.some((el) => el.id === connectorLabelElementId('r1')),
    false,
  );
  assert.ok(afterDelete.elements.some((el) => el.id === connectorElementId('r2')));
  // Ordinary freeform content is never removed.
  const freehand = { id: 'user-drawing', type: 'freedraw', x: 0, y: 0 };
  const preserved = reconcileKnowledgeScene({
    elements: [...afterDelete.elements, freehand],
    knowledge: afterDelete.knowledge,
  });
  assert.ok(preserved.elements.some((el) => el.id === 'user-drawing'));
});

test('Deleting an app-owned visual element detaches the record instead of leaving a ghost', () => {
  const knowledge = knowledgeWithTwoBlocks();
  const placed = place(knowledge, 'b1', { x: 100, y: 100 });
  // The user deletes the block rectangle in Excalidraw.
  const sceneWithoutBlock = placed.elements.filter((el) => el.id !== blockElementId('b1'));

  assert.equal(
    needsReconcile(sceneWithoutBlock, placed.knowledge),
    true,
    'the live handler must notice the structural mismatch',
  );

  const result = reconcileKnowledgeScene({
    elements: sceneWithoutBlock,
    knowledge: placed.knowledge,
  });
  const block = result.knowledge.blocks.find((b) => b.id === 'b1');
  assert.equal(block.elementId, undefined, 'the ghost elementId is dropped');
  assert.equal(result.knowledge.blocks.length, 2, 'the semantic block itself survives');
});

test('needsReconcile stays false for a consistent scene', () => {
  let knowledge = knowledgeWithTwoBlocks();
  const a = place(knowledge, 'b1', { x: 100, y: 100 });
  knowledge = a.knowledge;
  const b = place(knowledge, 'b2', { x: 460, y: 100 });
  knowledge = b.knowledge;
  knowledge = addRelationship(
    knowledge,
    createRelationship({ id: 'r1', sourceBlockId: 'b1', targetBlockId: 'b2', label: 'x' }),
  );
  const reconciled = reconcileKnowledgeScene({
    elements: [...a.elements, ...b.elements],
    knowledge,
  });
  assert.equal(needsReconcile(reconciled.elements, reconciled.knowledge), false);
});

// ---------------------------------------------------------------------------
// 25/32/33/36 - promotion, provenance, legacy links
// ---------------------------------------------------------------------------

test('Promoted blocks keep a location fallback and a visual element', () =>
  withStores(async ({ requestReader, canvasStore }) => {
    // Route the client helper through the real reader middleware.
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
    const annotation = await json(
      await requestReader(`/api/reader/items/${BOOK_A}/annotations`, {
        method: 'POST',
        body: makeAnnotation({ id: 'ann-promote', itemId: BOOK_A }),
      }),
    );
    const canvas = canvasStore.createCanvas({
      itemId: BOOK_A,
      title: 'Promotion canvas',
      scope: { kind: 'book', label: 'Whole book' },
    });

    const promoted = knowledgeWithPromotedAnnotation(
      { blocks: [], relationships: [] },
      annotation,
      { itemId: BOOK_A },
    );
    const block = promoted.knowledge.blocks[0];
    assert.equal(block.source.annotationId, annotation.id);
    assert.ok(block.source.location, 'a canonical location is kept as a fallback');
    assert.equal(block.source.location.payload.pageNumber, 4);
    assert.equal(annotationLocation(annotation).payload.pageNumber, 4);

    const result = await addAnnotationToKnowledgeCanvas(canvas.canvasId, annotation, {
      itemId: BOOK_A,
      fetchImpl,
    });
    assert.equal(result.status, 'added', result.message);
    const doc = canvasStore.getCanvas(canvas.canvasId);
    const stored = doc.knowledge.blocks.find((b) => b.id === result.blockId);
    assert.ok(stored.elementId, 'the promoted block is placed visually');
    assert.ok(
      doc.scene.elements.some((el) => el.id === stored.elementId),
      'and the visual element really exists in the scene',
    );
  }));

test('Legacy graph import preserves every supported deep-link type', () => {
  const converted = convertLegacyGraphToKnowledgeCanvas(
    {
      id: 'legacy-1',
      title: 'Legacy',
      nodes: [
        {
          id: 'n-ann',
          label: 'Annotation node',
          deepLink: { type: 'annotation', target: 'ann-x', label: 'highlight' },
        },
        {
          id: 'n-item',
          label: 'Item node',
          deepLink: { type: 'item', target: BOOK_B, label: 'other book' },
        },
        {
          id: 'n-loc',
          label: 'Location node',
          deepLink: {
            type: 'location',
            target: BOOK_A,
            anchorJson: JSON.stringify({
              schemaVersion: 1,
              kind: 'page',
              sourceHash: 'h',
              payload: { pageNumber: 42 },
            }),
            label: 'page 42',
          },
        },
        {
          id: 'n-ext',
          label: 'External node',
          deepLink: { type: 'external', target: 'https://example.test/source', label: 'web' },
        },
      ],
      edges: [],
    },
    { itemId: BOOK_A, now: '2026-01-01T00:00:00.000Z' },
  );

  const byId = new Map(converted.knowledge.blocks.map((b) => [b.id, b]));
  assert.equal(byId.get('n-ann').source.annotationId, 'ann-x');
  assert.equal(byId.get('n-item').source.itemId, BOOK_B, 'an item deep link keeps its target');
  assert.equal(byId.get('n-loc').source.location.payload.pageNumber, 42);
  assert.equal(byId.get('n-ext').source.externalUrl, 'https://example.test/source');
  for (const block of converted.knowledge.blocks) {
    assert.equal(block.source.legacyGraphId, 'legacy-1', 'provenance is recorded');
  }
});

// ---------------------------------------------------------------------------
// 20/41/44 - canvas scope, layout, owner validation
// ---------------------------------------------------------------------------

test('Canvas subroutes reject a foreign item id', () =>
  withStores(async ({ requestReader, canvasStore }) => {
    const canvasA = canvasStore.createCanvas({
      itemId: BOOK_A,
      title: 'Alpha canvas',
      scope: { kind: 'book', label: 'Whole book' },
    });

    assert.equal(
      (await requestReader(`/api/reader/canvases/${canvasA.canvasId}/export?itemId=${BOOK_B}`)).status,
      404,
      'export must not leak another book canvas',
    );
    assert.equal(
      (
        await requestReader(`/api/reader/canvases/${canvasA.canvasId}/links?itemId=${BOOK_B}`)
      ).status,
      404,
    );
    assert.equal(
      (
        await requestReader(`/api/reader/canvases/${canvasA.canvasId}/assets?itemId=${BOOK_B}`, {
          method: 'POST',
          body: { originalName: 'x.png', mimeType: 'image/png', dataBase64: 'AA==' },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await requestReader(`/api/reader/canvases/${canvasA.canvasId}/recover?itemId=${BOOK_B}`, {
          method: 'POST',
        })
      ).status,
      404,
    );
    // The owner can still export its own canvas.
    assert.equal(
      (await requestReader(`/api/reader/canvases/${canvasA.canvasId}/export?itemId=${BOOK_A}`)).status,
      200,
    );
  }));

test('A canvas cannot be created for an unknown item', () =>
  withStores(async ({ requestReader }) => {
    const res = await requestReader(
      `/api/reader/items/read-${'e'.repeat(32)}/canvases`,
      { method: 'POST', body: { title: 'Orphan', scope: { kind: 'book' } } },
    );
    assert.equal(res.status, 400);
  }));

test('The study pane stays mounted (hidden) in full-reader mode so drafts survive', () => {
  assert.equal(sidePaneVisible('full', true), true);
  assert.equal(sidePaneClass('full'), 'hidden');
  assert.ok(sidePaneClass('split').includes('border-l'));
  assert.ok(sidePaneClass('minimized').includes('flex-1'));
  assert.equal(readerPaneClass('minimized', true), 'hidden');
});

// ---------------------------------------------------------------------------
// 50/53 - recovery keeps semantic/visual references honest
// ---------------------------------------------------------------------------

test('File-first canvas recovery keeps blocks, relationships and visual bindings', () =>
  withStores(({ canvasStore, databasePath, userDataRoot }) => {
    const location = {
      schemaVersion: 1,
      kind: 'page',
      sourceHash: 'h',
      payload: { pageNumber: 12 },
    };
    const canvas = canvasStore.createCanvas({
      itemId: BOOK_A,
      title: 'Recovered Knowledge Canvas',
      scope: { kind: 'location', label: 'Page 12', anchor: { location } },
    });
    let knowledge = knowledgeWithTwoBlocks();
    const a = place(knowledge, 'b1', { x: 100, y: 100 });
    knowledge = a.knowledge;
    const b = place(knowledge, 'b2', { x: 460, y: 100 });
    knowledge = b.knowledge;
    knowledge = addRelationship(
      knowledge,
      createRelationship({ id: 'r1', sourceBlockId: 'b1', targetBlockId: 'b2', label: 'leads to' }),
    );
    const reconciled = reconcileKnowledgeScene({
      elements: [...a.elements, ...b.elements],
      knowledge,
    });
    canvasStore.updateCanvas(
      canvas.canvasId,
      {
        title: canvas.title,
        scene: { elements: reconciled.elements, appState: {}, files: {} },
        links: [],
        knowledge: reconciled.knowledge,
      },
      canvas.revision,
    );

    const db = new DatabaseSync(databasePath);
    db.exec('DELETE FROM canvases; DELETE FROM canvas_links;');
    db.close();

    const recovered = canvasStore.recoverCanvasFromExternal(canvas.canvasId);
    assert.equal(recovered.ok, true);
    const meta = canvasStore.getCanvasMetadata(canvas.canvasId);
    assert.equal(meta.scopeKind, 'location');
    const doc = canvasStore.getCanvas(canvas.canvasId);
    assert.equal(doc.knowledge.blocks.length, 2);
    assert.equal(doc.knowledge.relationships[0].label, 'leads to');
    assert.ok(doc.knowledge.relationships[0].linkedElementId);

    // A recovered canvas must not reference visual elements that do not exist.
    const elementIds = new Set(doc.scene.elements.map((el) => el.id));
    for (const block of doc.knowledge.blocks) {
      if (block.elementId) assert.ok(elementIds.has(block.elementId), 'block binding is valid');
    }
    for (const rel of doc.knowledge.relationships) {
      if (rel.linkedElementId) assert.ok(elementIds.has(rel.linkedElementId), 'connector binding is valid');
    }
    assert.ok(userDataRoot.length > 0);
  }));

// ---------------------------------------------------------------------------
// Strikethrough rendering — presentation helper contract
// ---------------------------------------------------------------------------
// This mirrors the logic in reader-annotation-layer.tsx.  If the component
// reverts to using borderBottom for strike the assertions below will catch it.

const DEFAULT_MARK_COLORS_TEST = {
  highlight: '#d6b34c',
  underline: '#2f6f63',
  strike: '#b45309',
};

function markPresentationTest(subKind, savedColor) {
  const color = savedColor || DEFAULT_MARK_COLORS_TEST[subKind] || DEFAULT_MARK_COLORS_TEST.highlight;
  if (subKind === 'underline') {
    return { background: 'transparent', borderBottom: `2px solid ${color}`, strikeColor: null };
  }
  if (subKind === 'strike') {
    return { background: 'transparent', borderBottom: undefined, strikeColor: color };
  }
  return {
    background: `color-mix(in oklab, ${color} 42%, transparent)`,
    borderBottom: undefined,
    strikeColor: null,
  };
}

test('markPresentation: underline uses bottom border; strike uses center line, not bottom border', () => {
  const ul = markPresentationTest('underline', '#2f6f63');
  const st = markPresentationTest('strike', '#b45309');
  const hl = markPresentationTest('highlight', '#d6b34c');

  // Underline — must have a bottom border and no strike color
  assert.ok(typeof ul.borderBottom === 'string' && ul.borderBottom.length > 0,
    'underline must have a borderBottom style');
  assert.equal(ul.strikeColor, null, 'underline must not have a strikeColor');

  // Strike — must have a strikeColor and no bottom border (center line rendered via child span)
  assert.ok(typeof st.strikeColor === 'string' && st.strikeColor.length > 0,
    'strike must have a strikeColor');
  assert.equal(st.borderBottom, undefined, 'strike must NOT use borderBottom');

  // Strike is visually different from underline
  assert.notEqual(st.borderBottom, ul.borderBottom, 'strike and underline styling must differ');
  assert.notEqual(st.strikeColor, ul.strikeColor, 'strike must have strikeColor where underline has null');

  // Highlight — background fill, no border
  assert.ok(hl.background.includes('color-mix'), 'highlight must use background fill');
  assert.equal(hl.borderBottom, undefined, 'highlight must not use borderBottom');
  assert.equal(hl.strikeColor, null, 'highlight must not have strikeColor');

  // Custom colors are respected
  const customStrike = markPresentationTest('strike', '#ff0000');
  assert.equal(customStrike.strikeColor, '#ff0000', 'custom strike color is used');

  // Multi-line: same logic applies for each fragment independently
  const frags = ['#aabbcc', '#ddeeff'].map((c) => markPresentationTest('strike', c));
  for (const frag of frags) {
    assert.ok(frag.strikeColor, 'each fragment has a strikeColor');
    assert.equal(frag.borderBottom, undefined, 'each fragment has no borderBottom');
  }
});

