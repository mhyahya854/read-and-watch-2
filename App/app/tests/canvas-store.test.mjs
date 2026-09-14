/**
 * Canvas Domain & Store Test Suite.
 * Phase 10 — Book-Linked Excalidraw Notes.
 *
 * Covers:
 *   - P10-T001: Pinned package & types
 *   - P10-T002: Canvas schema, stable IDs, storage, history, conflicts, recovery
 *   - P10-T003: Book attachment, multiple canvases per book, rename, soft delete
 *   - P10-T004: Asset storage, hash verification, excerpt structure
 *   - P10-T005: Bidirectional links (canvas -> book, annotation -> canvas)
 *   - P10-T007: Export, import/restore, and offline crash recovery
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

import {
  CANVAS_SCHEMA_VERSION,
  validateCanvasDocument,
  validateCanvasLink,
  validateCanvasAssetMeta,
  sanitizeLinkUrl,
  CanvasHistory,
  CANVAS_HISTORY_CAP,
} from '../lib/canvas/index.ts';

import { createCanvasStore } from '../server/canvas-store.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withTempCanvasStore(fn) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'rw-canvas-test-'));
  const dbPath = join(tmpDir, 'test.sqlite3');

  // Bootstrap minimal items table so FK constraints pass
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
  `);

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
    JSON.stringify({ subKind: 'highlight', color: '#FFFF00' }),
    'sha256-original',
    new Date().toISOString(),
    new Date().toISOString(),
  );

  setupDb.close();

  const userDataRoot = join(tmpDir, 'user-data');
  const store = createCanvasStore({ databasePath: dbPath, userDataRoot });

  try {
    return fn(store, userDataRoot, tmpDir);
  } finally {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// P10-T002: Canvas creation, stable IDs, storage
// ---------------------------------------------------------------------------

test('CanvasStore: creates standalone canvas with revision=1', () => {
  withTempCanvasStore((store, userDataRoot) => {
    const canvas = store.createCanvas({ title: 'My Thoughts' });
    assert.ok(canvas.canvasId);
    assert.equal(canvas.schemaVersion, 1);
    assert.equal(canvas.title, 'My Thoughts');
    assert.equal(canvas.revision, 1);
    assert.equal(canvas.itemId, null);
    assert.equal(canvas.lifecycle, 'active');

    // Document file exists on disk
    const docPath = join(userDataRoot, 'canvases', canvas.canvasId, 'canvas.json');
    assert.ok(existsSync(docPath), 'canvas.json should exist on disk');

    // Recovery snapshot exists
    const recPath = join(userDataRoot, 'canvases', canvas.canvasId, 'recovery.json');
    assert.ok(existsSync(recPath), 'recovery.json should exist on disk');
  });
});

test('CanvasStore: creates book-linked canvas', () => {
  withTempCanvasStore((store) => {
    const canvas = store.createCanvas({
      itemId: 'read-book00000000000000000000000001',
      title: 'Chapter 1 Diagram',
    });
    assert.equal(canvas.itemId, 'read-book00000000000000000000000001');
    assert.equal(canvas.title, 'Chapter 1 Diagram');

    // Query by itemId
    const bookCanvases = store.listCanvases({ itemId: 'read-book00000000000000000000000001' });
    assert.equal(bookCanvases.length, 1);
    assert.equal(bookCanvases[0].id, canvas.canvasId);
  });
});

test('CanvasStore: supports multiple canvases per book (P10-T003)', () => {
  withTempCanvasStore((store) => {
    const bookId = 'read-book00000000000000000000000001';
    const c1 = store.createCanvas({ itemId: bookId, title: 'Canvas A: Architecture' });
    const c2 = store.createCanvas({ itemId: bookId, title: 'Canvas B: Character Map' });
    const c3 = store.createCanvas({ itemId: bookId, title: 'Canvas C: Timeline' });

    assert.notEqual(c1.canvasId, c2.canvasId);
    assert.notEqual(c2.canvasId, c3.canvasId);

    const list = store.listCanvases({ itemId: bookId });
    assert.equal(list.length, 3);
  });
});

// ---------------------------------------------------------------------------
// P10-T002: Optimistic concurrency (revision checks)
// ---------------------------------------------------------------------------

test('CanvasStore: update succeeds when expectedRevision matches', () => {
  withTempCanvasStore((store) => {
    const created = store.createCanvas({ title: 'Initial' });
    const updated = store.updateCanvas(
      created.canvasId,
      {
        title: 'Updated Title',
        scene: { elements: [{ id: 'el-1', type: 'rectangle', x: 10, y: 10 }] },
      },
      1, // expectedRevision
    );

    assert.equal(updated.revision, 2);
    assert.equal(updated.title, 'Updated Title');
    assert.equal(updated.scene.elements.length, 1);
  });
});

test('CanvasStore: update rejects stale revision with 409 conflict', () => {
  withTempCanvasStore((store) => {
    const created = store.createCanvas({ title: 'Initial' });
    // First update moves revision to 2
    store.updateCanvas(created.canvasId, { title: 'First Update' }, 1);

    // Second update with stale revision 1 must throw 409
    assert.throws(
      () => store.updateCanvas(created.canvasId, { title: 'Conflicting Update' }, 1),
      (err) => err.status === 409 || /conflict/i.test(err.message),
    );
  });
});

// ---------------------------------------------------------------------------
// P10-T003: Rename, Soft Delete & Restore
// ---------------------------------------------------------------------------

test('CanvasStore: rename changes title without changing canvas ID', () => {
  withTempCanvasStore((store) => {
    const created = store.createCanvas({ title: 'Original Name' });
    const renamed = store.renameCanvas(created.canvasId, 'Renamed Canvas', 1);

    assert.equal(renamed.id, created.canvasId);
    assert.equal(renamed.title, 'Renamed Canvas');
    assert.equal(renamed.revision, 2);

    const fetched = store.getCanvas(created.canvasId);
    assert.equal(fetched.title, 'Renamed Canvas');
  });
});

test('CanvasStore: soft-delete hides canvas from active list; restore un-deletes', () => {
  withTempCanvasStore((store) => {
    const created = store.createCanvas({ title: 'Disposable' });
    store.deleteCanvas(created.canvasId, 1);

    // Active list should not include it
    const active = store.listCanvases();
    assert.ok(!active.some((c) => c.id === created.canvasId));

    // IncludeDeleted should include it
    const all = store.listCanvases({ includeDeleted: true });
    assert.ok(all.some((c) => c.id === created.canvasId));
    const deletedRow = all.find((c) => c.id === created.canvasId);
    assert.equal(deletedRow.lifecycle, 'soft-deleted');
    assert.ok(deletedRow.deletedAt);

    // Restore
    const restored = store.restoreCanvas(created.canvasId, 2);
    assert.equal(restored.lifecycle, 'active');
    assert.equal(restored.deletedAt, null);

    const activeAfter = store.listCanvases();
    assert.ok(activeAfter.some((c) => c.id === created.canvasId));
  });
});

// ---------------------------------------------------------------------------
// P10-T005: Bidirectional Deep Links
// ---------------------------------------------------------------------------

test('CanvasStore: addCanvasLink records bidirectional link in SQLite', () => {
  withTempCanvasStore((store) => {
    const canvas = store.createCanvas({ title: 'Linked Canvas' });
    const bookId = 'read-book00000000000000000000000001';

    const link = store.addCanvasLink(canvas.canvasId, {
      elementId: 'rect-element-001',
      itemId: bookId,
      annotationId: 'ann-highlight-001',
      anchorJson: JSON.stringify({ pageNumber: 42, quote: 'Crucial principle' }),
      label: 'Crucial principle excerpt',
    });

    assert.ok(link.id);
    assert.equal(link.canvasId, canvas.canvasId);
    assert.equal(link.elementId, 'rect-element-001');
    assert.equal(link.itemId, bookId);
    assert.equal(link.annotationId, 'ann-highlight-001');

    // Query links for this canvas
    const cLinks = store.getCanvasLinks(canvas.canvasId);
    assert.equal(cLinks.length, 1);
    assert.equal(cLinks[0].elementId, 'rect-element-001');

    // Query links for this book item
    const itemLinks = store.getLinksForItem(bookId);
    assert.equal(itemLinks.length, 1);
    assert.equal(itemLinks[0].canvasId, canvas.canvasId);

    // Query links for this annotation
    const annLinks = store.getLinksForAnnotation('ann-highlight-001');
    assert.equal(annLinks.length, 1);
    assert.equal(annLinks[0].canvasId, canvas.canvasId);
  });
});

// ---------------------------------------------------------------------------
// P10-T004: Safe Image Asset Management
// ---------------------------------------------------------------------------

test('CanvasStore: saveCanvasAsset validates MIME and stores with SHA-256', () => {
  withTempCanvasStore((store, userDataRoot) => {
    const canvas = store.createCanvas({ title: 'Diagram' });
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

    const asset = store.saveCanvasAsset(canvas.canvasId, {
      originalName: 'chart.png',
      mimeType: 'image/png',
      buffer: fakePng,
    });

    assert.ok(asset.id);
    assert.equal(asset.mimeType, 'image/png');
    assert.equal(asset.sizeBytes, fakePng.length);
    assert.equal(asset.sha256.length, 64);

    // Asset file exists on disk
    const diskPath = join(userDataRoot, asset.relativePath);
    assert.ok(existsSync(diskPath), 'Asset file should exist on disk');

    // Retrieve asset
    const retrieved = store.getCanvasAsset(canvas.canvasId, asset.id);
    assert.equal(retrieved.meta.id, asset.id);
    assert.deepEqual(retrieved.buffer, fakePng);
  });
});

test('CanvasStore: saveCanvasAsset rejects unsupported file types', () => {
  withTempCanvasStore((store) => {
    const canvas = store.createCanvas({ title: 'Test' });
    const evilHtml = Buffer.from('<script>alert(1)</script>');

    assert.throws(
      () => store.saveCanvasAsset(canvas.canvasId, {
        originalName: 'evil.html',
        mimeType: 'text/html',
        buffer: evilHtml,
      }),
      /unsupported asset/i,
    );
  });
});

// ---------------------------------------------------------------------------
// P10-T007: Export, Restore & Crash Recovery
// ---------------------------------------------------------------------------

test('CanvasStore: exportCanvas creates self-contained portable package', () => {
  withTempCanvasStore((store) => {
    const canvas = store.createCanvas({
      itemId: 'read-book00000000000000000000000001',
      title: 'Export Test',
      scene: { elements: [{ id: 'el-1', type: 'arrow' }] },
    });

    store.addCanvasLink(canvas.canvasId, {
      elementId: 'el-1',
      itemId: 'read-book00000000000000000000000001',
      label: 'Arrow to chapter',
    });

    const exportPkg = store.exportCanvas(canvas.canvasId);
    assert.equal(exportPkg.schemaVersion, 1);
    assert.equal(exportPkg.format, 'read-watch-canvas-export');
    assert.equal(exportPkg.document.title, 'Export Test');
    assert.equal(exportPkg.document.links.length, 1);
  });
});

test('CanvasStore: importCanvas restores exported package deterministically', () => {
  withTempCanvasStore((store) => {
    const original = store.createCanvas({
      title: 'Original Canvas',
      scene: { elements: [{ id: 'node-1', type: 'rectangle' }] },
    });

    const exportPkg = store.exportCanvas(original.canvasId);

    // Import as new copy
    const imported = store.importCanvas(exportPkg, { newId: true });
    assert.notEqual(imported.canvasId, original.canvasId);
    assert.equal(imported.title, 'Original Canvas');
    assert.equal(imported.scene.elements.length, 1);
    assert.equal(imported.revision, 1);
  });
});

test('CanvasStore: recoverCanvasFromExternal restores DB record after database drop', () => {
  withTempCanvasStore((store, userDataRoot, tmpDir) => {
    const created = store.createCanvas({
      itemId: 'read-book00000000000000000000000001',
      title: 'Resilient Canvas',
      scene: { elements: [{ id: 'shape-1', type: 'ellipse' }] },
    });
    const canvasId = created.canvasId;
    store.close();

    // Simulate DB corruption: delete canvases table row
    const dbPath = join(tmpDir, 'test.sqlite3');
    const wipeDb = new DatabaseSync(dbPath);
    wipeDb.exec(`DELETE FROM canvases WHERE id = '${canvasId}'`);
    wipeDb.close();

    // Reopen store
    const store2 = createCanvasStore({ databasePath: dbPath, userDataRoot });
    const missing = store2.listCanvases();
    assert.ok(!missing.some((c) => c.id === canvasId), 'Canvas should be absent from DB');

    // Trigger recovery
    const recResult = store2.recoverCanvasFromExternal(canvasId);
    assert.equal(recResult.ok, true);
    assert.equal(recResult.recovered, true);

    const recovered = store2.getCanvas(canvasId);
    assert.equal(recovered.title, 'Resilient Canvas');
    assert.equal(recovered.scene.elements.length, 1);
    store2.close();
  });
});

// ---------------------------------------------------------------------------
// In-memory Bounded History
// ---------------------------------------------------------------------------

test('CanvasHistory: bounded stack caps at 50 and handles undo/redo', () => {
  const history = new CanvasHistory(CANVAS_HISTORY_CAP);
  const baseDoc = {
    schemaVersion: 1,
    canvasId: 'hist-test',
    itemId: null,
    title: 'Test',
    revision: 1,
    lifecycle: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    scene: { elements: [] },
    links: [],
    assets: [],
  };

  // Push 60 revisions
  for (let i = 1; i <= 60; i++) {
    history.push({ ...baseDoc, revision: i });
  }

  assert.equal(history.size, CANVAS_HISTORY_CAP);
  assert.equal(history.canUndo, true);

  const prev = history.undo();
  assert.equal(prev.revision, 60);
  assert.equal(history.canRedo, true);

  const redone = history.redo();
  assert.equal(redone.revision, 60);
});

// ---------------------------------------------------------------------------
// URL Sanitization
// ---------------------------------------------------------------------------

test('sanitizeLinkUrl: permits safe protocols and blocks dangerous escapes', () => {
  assert.equal(sanitizeLinkUrl('https://example.com'), 'https://example.com');
  assert.equal(sanitizeLinkUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(sanitizeLinkUrl('/reader/read-123'), '/reader/read-123');

  // Block dangerous schemes
  assert.equal(sanitizeLinkUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeLinkUrl('file:///etc/passwd'), null);
  assert.equal(sanitizeLinkUrl('vbscript:msgbox(1)'), null);
  assert.equal(sanitizeLinkUrl('data:text/html;base64,PHNjcmlwdD4='), null);
});
