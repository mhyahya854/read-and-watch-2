/**
 * Vite / Electron parity for the Read study routes.
 *
 * The packaged desktop service must enforce the same book-ownership rules as the
 * Vite middleware. Everything runs against a synthetic temporary data root.
 *
 * Phase 17 repair: updated to exercise the REAL production routes:
 *   /api/reader/canvases/:id   (not the legacy /api/canvases/:id)
 *
 * Covers:
 *  A. Annotation ownership (unchanged, already passing)
 *  B. Canvas ownership via /api/reader/canvases/:id — full matrix
 *  C. Legacy /api/annotations/:id hardening — cross-book rejection
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

// ============================================================
// PRODUCTION CANVAS ROUTES: /api/reader/canvases/:id
// ============================================================

test('Desktop service scopes canvas access via the real /api/reader/canvases/:id route', async () => {
  await withService(async (origin) => {
    // A. Create canvas for Book A via item-scoped route
    const createRes = await request(origin, `/api/reader/items/${BOOK_A.id}/canvases`, {
      method: 'POST',
      body: { title: 'Alpha canvas', scope: { kind: 'book', label: 'Whole book' } },
    });
    assert.equal(createRes.status, 201, 'A. create canvas');
    const canvas = await createRes.json();
    const canvasId = canvas.canvasId;
    assert.ok(canvasId, 'A. canvas has id');

    // B. Owner GET via production route succeeds
    const ownerGet = await request(origin, `/api/reader/canvases/${canvasId}?itemId=${BOOK_A.id}`);
    assert.equal(ownerGet.status, 200, 'B. owner GET /api/reader/canvases/:id');
    const ownerDoc = await ownerGet.json();
    assert.equal(ownerDoc.title, 'Alpha canvas', 'B. canvas title');

    // C. Foreign GET returns 404
    const crossGet = await request(origin, `/api/reader/canvases/${canvasId}?itemId=${BOOK_B.id}`);
    assert.equal(crossGet.status, 404, 'C. foreign GET /api/reader/canvases/:id');

    // D. Owner PUT succeeds
    const ownerPut = await request(origin, `/api/reader/canvases/${canvasId}?itemId=${BOOK_A.id}`, {
      method: 'PUT',
      body: {
        title: 'Alpha canvas (updated)',
        scene: canvas.scene,
        links: [],
        knowledge: canvas.knowledge,
        expectedRevision: canvas.revision,
      },
    });
    assert.equal(ownerPut.status, 200, 'D. owner PUT');
    const updatedCanvas = await ownerPut.json();
    assert.equal(updatedCanvas.title, 'Alpha canvas (updated)', 'D. updated title');

    // E. Foreign PUT returns 404
    const crossPut = await request(origin, `/api/reader/canvases/${canvasId}?itemId=${BOOK_B.id}`, {
      method: 'PUT',
      body: { title: 'hijacked', scene: {}, links: [], expectedRevision: updatedCanvas.revision },
    });
    assert.equal(crossPut.status, 404, 'E. foreign PUT');

    // G. Metadata rename — owner succeeds
    const metaRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}/metadata?itemId=${BOOK_A.id}`,
      {
        method: 'PUT',
        body: { title: 'Alpha canvas (renamed)', expectedRevision: updatedCanvas.revision },
      },
    );
    assert.equal(metaRes.status, 200, 'G. metadata rename owner');
    const renamedMeta = await metaRes.json();

    // G. Metadata rename — foreign 404
    const crossMeta = await request(
      origin,
      `/api/reader/canvases/${canvasId}/metadata?itemId=${BOOK_B.id}`,
      {
        method: 'PUT',
        body: { title: 'hijack name', expectedRevision: renamedMeta.revision },
      },
    );
    assert.equal(crossMeta.status, 404, 'G. foreign metadata rename');

    // H. Links — owner add succeeds
    const addLinkRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}/links?itemId=${BOOK_A.id}`,
      {
        method: 'POST',
        body: { elementId: 'elem-1', itemId: BOOK_A.id, label: 'test link' },
      },
    );
    assert.equal(addLinkRes.status, 201, 'H. add link owner');
    const link = await addLinkRes.json();

    // H. Links — foreign GET 404
    const crossLinks = await request(
      origin,
      `/api/reader/canvases/${canvasId}/links?itemId=${BOOK_B.id}`,
    );
    assert.equal(crossLinks.status, 404, 'H. foreign links GET');

    // H. Links — owner GET succeeds
    const ownerLinks = await request(
      origin,
      `/api/reader/canvases/${canvasId}/links?itemId=${BOOK_A.id}`,
    );
    assert.equal(ownerLinks.status, 200, 'H. owner links GET');
    const linksList = await ownerLinks.json();
    assert.equal(linksList.length, 1, 'H. one link present');

    // H. Delete link — owner succeeds
    const delLinkRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}/links/${link.id}?itemId=${BOOK_A.id}`,
      { method: 'DELETE' },
    );
    assert.equal(delLinkRes.status, 200, 'H. delete link owner');

    // I. Asset upload — owner succeeds
    // 1x1 transparent PNG
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const assetRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}/assets?itemId=${BOOK_A.id}`,
      {
        method: 'POST',
        body: { dataBase64: pngBase64, originalName: 'test.png', mimeType: 'image/png' },
      },
    );
    assert.equal(assetRes.status, 201, 'I. asset upload owner');
    const asset = await assetRes.json();
    assert.ok(asset.id, 'I. asset has id');

    // I. Asset upload — foreign 404
    const crossAssetUpload = await request(
      origin,
      `/api/reader/canvases/${canvasId}/assets?itemId=${BOOK_B.id}`,
      {
        method: 'POST',
        body: { dataBase64: pngBase64, originalName: 'hijack.png', mimeType: 'image/png' },
      },
    );
    assert.equal(crossAssetUpload.status, 404, 'I. foreign asset upload');

    // J. Asset retrieval — owner succeeds
    const assetGetRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}/assets/${asset.id}?itemId=${BOOK_A.id}`,
    );
    assert.equal(assetGetRes.status, 200, 'J. asset retrieval owner');
    const assetBuf = await assetGetRes.arrayBuffer();
    assert.ok(assetBuf.byteLength > 0, 'J. asset bytes present');

    // J. Asset retrieval — foreign 404
    const crossAssetGet = await request(
      origin,
      `/api/reader/canvases/${canvasId}/assets/${asset.id}?itemId=${BOOK_B.id}`,
    );
    assert.equal(crossAssetGet.status, 404, 'J. foreign asset retrieval');

    // K. Export — owner succeeds
    const exportRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}/export?itemId=${BOOK_A.id}`,
    );
    assert.equal(exportRes.status, 200, 'K. export owner');
    const exportPkg = await exportRes.json();
    assert.equal(exportPkg.format, 'read-watch-canvas-export', 'K. export format');
    assert.ok(exportPkg.document, 'K. export has document');

    // K. Export — foreign 404
    const crossExport = await request(
      origin,
      `/api/reader/canvases/${canvasId}/export?itemId=${BOOK_B.id}`,
    );
    assert.equal(crossExport.status, 404, 'K. foreign export');

    // F. Foreign DELETE returns 404 (test before owner delete)
    const crossDelete = await request(
      origin,
      `/api/reader/canvases/${canvasId}?itemId=${BOOK_B.id}`,
      { method: 'DELETE', body: { expectedRevision: renamedMeta.revision } },
    );
    assert.equal(crossDelete.status, 404, 'F. foreign DELETE');

    // L. Restore/recover — test soft delete then restore
    const deleteRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}?itemId=${BOOK_A.id}`,
      { method: 'DELETE', body: { expectedRevision: renamedMeta.revision } },
    );
    assert.equal(deleteRes.status, 200, 'L. delete for restore test');

    // L. Restore — foreign 404
    const crossRestore = await request(
      origin,
      `/api/reader/canvases/${canvasId}/restore?itemId=${BOOK_B.id}`,
      { method: 'PATCH', body: {} },
    );
    assert.equal(crossRestore.status, 404, 'L. foreign restore');

    // L. Restore — owner succeeds
    const restoreRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}/restore?itemId=${BOOK_A.id}`,
      { method: 'PATCH', body: {} },
    );
    assert.equal(restoreRes.status, 200, 'L. owner restore');

    // Study summary is item-scoped and reports the owner's counts.
    const summary = await request(origin, `/api/reader/items/${BOOK_A.id}/study-summary`);
    assert.equal(summary.status, 200);
    const summaryBody = await summary.json();
    assert.equal(summaryBody.bookCanvases, 1, 'study summary bookCanvases count');
    assert.equal(summaryBody.canvasCount, 1, 'study summary canvasCount');
  });
});

test('Desktop service: packaged Read canvas full smoke (create→open→save→reopen→rename→link→asset→export→restore)', async () => {
  await withService(async (origin) => {
    // 1. Create Book A canvas
    const createRes = await request(origin, `/api/reader/items/${BOOK_A.id}/canvases`, {
      method: 'POST',
      body: {
        title: 'Smoke Canvas',
        scope: { kind: 'book' },
        knowledge: { blocks: [], relationships: [] },
      },
    });
    assert.equal(createRes.status, 201, 'smoke: create');
    const { canvasId, revision: rev1 } = await createRes.json();

    // 2. Open via production route
    const openRes = await request(origin, `/api/reader/canvases/${canvasId}?itemId=${BOOK_A.id}`);
    assert.equal(openRes.status, 200, 'smoke: open');
    const openDoc = await openRes.json();
    assert.equal(openDoc.title, 'Smoke Canvas', 'smoke: open title');

    // 3. Save scene + structured knowledge block
    const saveRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}?itemId=${BOOK_A.id}`,
      {
        method: 'PUT',
        body: {
          title: 'Smoke Canvas',
          scene: { elements: [{ id: 'el1', type: 'text', text: 'Hello' }], appState: {}, files: {} },
          links: [],
          knowledge: {
            blocks: [{ id: 'b1', type: 'concept', title: 'Osmosis', tags: [], notes: '' }],
            relationships: [],
          },
          expectedRevision: rev1,
        },
      },
    );
    assert.equal(saveRes.status, 200, 'smoke: save scene+knowledge');
    const { revision: rev2 } = await saveRes.json();

    // 4. Reopen and verify persisted data
    const reopenRes = await request(origin, `/api/reader/canvases/${canvasId}?itemId=${BOOK_A.id}`);
    assert.equal(reopenRes.status, 200, 'smoke: reopen');
    const reopenDoc = await reopenRes.json();
    assert.equal(reopenDoc.knowledge.blocks.length, 1, 'smoke: knowledge block persisted');
    assert.equal(reopenDoc.knowledge.blocks[0].title, 'Osmosis', 'smoke: block title');

    // 5. Rename
    const renameRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}/metadata?itemId=${BOOK_A.id}`,
      { method: 'PUT', body: { title: 'Smoke Canvas (renamed)', expectedRevision: rev2 } },
    );
    assert.equal(renameRes.status, 200, 'smoke: rename');
    const renamedMeta = await renameRes.json();

    // 6. Add link
    const linkRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}/links?itemId=${BOOK_A.id}`,
      { method: 'POST', body: { elementId: 'el1', itemId: BOOK_A.id, label: 'Ref' } },
    );
    assert.equal(linkRes.status, 201, 'smoke: add link');

    // 7. Upload tiny synthetic image
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const uploadRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}/assets?itemId=${BOOK_A.id}`,
      { method: 'POST', body: { dataBase64: pngBase64, originalName: 'smoke.png', mimeType: 'image/png' } },
    );
    assert.equal(uploadRes.status, 201, 'smoke: asset upload');
    const uploadedAsset = await uploadRes.json();

    // 8. Retrieve image
    const retrieveRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}/assets/${uploadedAsset.id}?itemId=${BOOK_A.id}`,
    );
    assert.equal(retrieveRes.status, 200, 'smoke: asset retrieve');

    // 9. Export
    const exportRes = await request(
      origin,
      `/api/reader/canvases/${canvasId}/export?itemId=${BOOK_A.id}`,
    );
    assert.equal(exportRes.status, 200, 'smoke: export');
    const pkg = await exportRes.json();
    assert.equal(pkg.format, 'read-watch-canvas-export', 'smoke: export format');

    // 10. Book B gets 404 for all protected operations
    const bookBOps = [
      request(origin, `/api/reader/canvases/${canvasId}?itemId=${BOOK_B.id}`),
      request(origin, `/api/reader/canvases/${canvasId}?itemId=${BOOK_B.id}`, { method: 'PUT', body: { expectedRevision: renamedMeta.revision, scene: {}, links: [] } }),
      request(origin, `/api/reader/canvases/${canvasId}/metadata?itemId=${BOOK_B.id}`, { method: 'PUT', body: { title: 'hijack', expectedRevision: renamedMeta.revision } }),
      request(origin, `/api/reader/canvases/${canvasId}/links?itemId=${BOOK_B.id}`),
      request(origin, `/api/reader/canvases/${canvasId}/assets/${uploadedAsset.id}?itemId=${BOOK_B.id}`),
      request(origin, `/api/reader/canvases/${canvasId}/export?itemId=${BOOK_B.id}`),
    ];
    const bookBResults = await Promise.all(bookBOps);
    for (const res of bookBResults) {
      assert.equal(res.status, 404, `smoke: Book B must get 404, got ${res.status} for ${res.url}`);
    }
  });
});

// ============================================================
// LEGACY /api/annotations HARDENING REGRESSION
// ============================================================

test('Desktop service: legacy /api/annotations/:id requires itemId and rejects cross-book access', async () => {
  await withService(async (origin) => {
    // Create annotation under Book B via the safe item-scoped route
    const createRes = await request(origin, `/api/reader/items/${BOOK_B.id}/annotations`, {
      method: 'POST',
      body: annotationPayload,
    });
    assert.equal(createRes.status, 201);
    const ann = await createRes.json();

    // Without itemId — must be rejected with 400
    const noItemId = await request(origin, `/api/annotations/${ann.id}`);
    assert.equal(noItemId.status, 400, 'legacy GET without itemId must return 400');

    // With wrong itemId (Book A trying to read Book B annotation) — must be 404
    const wrongItem = await request(origin, `/api/annotations/${ann.id}?itemId=${BOOK_A.id}`);
    assert.equal(wrongItem.status, 404, 'legacy GET with wrong itemId must return 404');

    // With correct itemId — must succeed
    const rightItem = await request(origin, `/api/annotations/${ann.id}?itemId=${BOOK_B.id}`);
    assert.equal(rightItem.status, 200, 'legacy GET with correct itemId must succeed');

    // PUT without itemId — must be 400
    const noItemPut = await request(origin, `/api/annotations/${ann.id}`, {
      method: 'PUT',
      body: { content: { subKind: 'highlight', note: 'attack' }, expectedRevision: ann.revision },
    });
    assert.equal(noItemPut.status, 400, 'legacy PUT without itemId must return 400');

    // PUT with wrong itemId — must be 404
    const crossPut = await request(origin, `/api/annotations/${ann.id}?itemId=${BOOK_A.id}`, {
      method: 'PUT',
      body: { content: { subKind: 'highlight', note: 'attack' }, expectedRevision: ann.revision },
    });
    assert.equal(crossPut.status, 404, 'legacy PUT with wrong itemId must return 404');

    // DELETE without itemId — must be 400
    const noItemDel = await request(origin, `/api/annotations/${ann.id}`, {
      method: 'DELETE',
      body: { expectedRevision: ann.revision },
    });
    assert.equal(noItemDel.status, 400, 'legacy DELETE without itemId must return 400');

    // DELETE with wrong itemId — must be 404
    const crossDel = await request(origin, `/api/annotations/${ann.id}?itemId=${BOOK_A.id}`, {
      method: 'DELETE',
      body: { expectedRevision: ann.revision },
    });
    assert.equal(crossDel.status, 404, 'legacy DELETE with wrong itemId must return 404');

    // Verify Book B's annotation is untouched after all attacks
    const verify = await request(origin, `/api/reader/items/${BOOK_B.id}/annotations/${ann.id}`);
    assert.equal(verify.status, 200);
    const verifyAnn = await verify.json();
    assert.equal(verifyAnn.content.note, 'beta note', 'annotation content unchanged after attacks');
  });
});
