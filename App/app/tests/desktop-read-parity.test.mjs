/**
 * Vite / Electron parity for the Read study routes.
 *
 * The packaged desktop service must enforce the same book-ownership rules as the
 * Vite middleware. Everything runs against a synthetic temporary data root.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createDesktopService } from '../electron/desktop-service.mjs';
import { rebuildPortableLibrary } from '../server/portable-rebuild.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BOOK_A = { id: `read-${'1'.repeat(32)}`, title: 'Desktop Parity Alpha' };
const BOOK_B = { id: `read-${'2'.repeat(32)}`, title: 'Desktop Parity Beta' };

function titleMarkdown({ id, title, size }) {
  return `---
schema_version: 1
id: "${id}"
collection: "Read"
title: "${title}"
status: "unread"
files:
  - name: "sample.pdf"
    path: "Files/sample.pdf"
    format: "PDF"
    size: ${size}
---

# ${title}

## Overview

Synthetic parity fixture.
`;
}

async function buildRoot() {
  const root = mkdtempSync(join(tmpdir(), 'rw-desktop-parity-'));
  const pdf = Buffer.from('%PDF-1.4 synthetic parity fixture\n');
  for (const book of [BOOK_A, BOOK_B]) {
    const dir = join(root, 'Read', 'Books', `${book.title} (2026)`);
    mkdirSync(join(dir, 'Files'), { recursive: true });
    writeFileSync(
      join(dir, `${book.title} (2026).md`),
      titleMarkdown({ id: book.id, title: book.title, size: pdf.length }),
    );
    writeFileSync(join(dir, 'Files', 'sample.pdf'), pdf);
  }
  await rebuildPortableLibrary({
    root,
    databasePath: join(root, 'App', 'state', 'read-watch.sqlite3'),
    apply: true,
  });
  return root;
}

async function withService(fn) {
  const root = await buildRoot();
  const service = createDesktopService({ appRoot, dataRootOverride: root });
  const instance = await service.start(0, '127.0.0.1');
  try {
    return await fn(instance.origin);
  } finally {
    await instance.close?.();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        rmSync(root, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
  }
}

function request(origin, path, { method = 'GET', body } = {}) {
  return fetch(`${origin}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const annotationPayload = {
  id: 'desktop-ann-b',
  assetId: 'asset-1',
  kind: 'text-mark',
  anchor: {
    kind: 'pdf-text',
    pageNumber: 1,
    rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.03 }],
    quote: 'Desktop parity passage',
    sourceHash: 'desktop-hash',
  },
  content: { subKind: 'highlight', note: 'beta note' },
  sourceHash: 'desktop-hash',
};

test('Desktop service enforces annotation ownership exactly like Vite', async () => {
  await withService(async (origin) => {
    const created = await request(origin, `/api/reader/items/${BOOK_B.id}/annotations`, {
      method: 'POST',
      body: annotationPayload,
    });
    assert.equal(created.status, 201);
    const annotation = await created.json();

    const crossGet = await request(
      origin,
      `/api/reader/items/${BOOK_A.id}/annotations/${annotation.id}`,
    );
    assert.equal(crossGet.status, 404);

    const crossPut = await request(
      origin,
      `/api/reader/items/${BOOK_A.id}/annotations/${annotation.id}`,
      {
        method: 'PUT',
        body: { content: { subKind: 'highlight', note: 'hijack' }, expectedRevision: annotation.revision },
      },
    );
    assert.equal(crossPut.status, 404);

    const crossDelete = await request(
      origin,
      `/api/reader/items/${BOOK_A.id}/annotations/${annotation.id}`,
      { method: 'DELETE', body: { expectedRevision: annotation.revision } },
    );
    assert.equal(crossDelete.status, 404);

    const ownDelete = await request(
      origin,
      `/api/reader/items/${BOOK_B.id}/annotations/${annotation.id}`,
      { method: 'DELETE', body: { expectedRevision: annotation.revision } },
    );
    assert.equal(ownDelete.status, 200);

    const crossRestore = await request(
      origin,
      `/api/reader/items/${BOOK_A.id}/annotations/${annotation.id}/restore`,
      { method: 'PATCH', body: {} },
    );
    assert.equal(crossRestore.status, 404);

    // The owner's record is unchanged by every attack.
    const ownerView = await request(
      origin,
      `/api/reader/items/${BOOK_B.id}/annotations/${annotation.id}`,
    );
    assert.equal(ownerView.status, 200);
    const ownerAnnotation = await ownerView.json();
    assert.equal(ownerAnnotation.content.note, 'beta note');
    assert.ok(ownerAnnotation.deletedAt, 'Book A could not resurrect Book B annotation');
  });
});

test('Desktop service refuses a batch payload that names another book', async () => {
  await withService(async (origin) => {
    const res = await request(origin, `/api/reader/items/${BOOK_A.id}/annotations/batch`, {
      method: 'POST',
      body: {
        items: [{ ...annotationPayload, id: 'batch-b', itemId: BOOK_B.id }],
      },
    });
    assert.equal(res.status, 400);
  });
});

test('Desktop service scopes canvas access to the owning book', async () => {
  await withService(async (origin) => {
    const created = await request(origin, `/api/reader/items/${BOOK_A.id}/canvases`, {
      method: 'POST',
      body: { title: 'Alpha canvas', scope: { kind: 'book', label: 'Whole book' } },
    });
    assert.equal(created.status, 201);
    const canvas = await created.json();

    const crossGet = await request(
      origin,
      `/api/canvases/${canvas.canvasId}?itemId=${BOOK_B.id}`,
    );
    assert.equal(crossGet.status, 404);
    const crossDelete = await request(
      origin,
      `/api/canvases/${canvas.canvasId}?itemId=${BOOK_B.id}`,
      { method: 'DELETE', body: { expectedRevision: canvas.revision } },
    );
    assert.equal(crossDelete.status, 404);

    const ownerGet = await request(
      origin,
      `/api/canvases/${canvas.canvasId}?itemId=${BOOK_A.id}`,
    );
    assert.equal(ownerGet.status, 200);

    // Study summary is item-scoped and reports the owner's counts.
    const summary = await request(origin, `/api/reader/items/${BOOK_A.id}/study-summary`);
    assert.equal(summary.status, 200);
    const summaryBody = await summary.json();
    assert.equal(summaryBody.bookCanvases, 1);
    assert.equal(summaryBody.canvasCount, 1);
  });
});

