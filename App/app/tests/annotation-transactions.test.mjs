/**
 * Phase 09 — Annotation Transactions, Concurrency, Recovery, and Undo/Redo.
 * Tests P09-T004.
 *
 * Covers:
 *   - CREATE with atomic BEGIN IMMEDIATE
 *   - Optimistic concurrency (revision mismatch → 409)
 *   - Soft delete with revision guard
 *   - Restore (un-delete)
 *   - Source hash mismatch detection
 *   - External file-first recovery
 *   - Bounded undo/redo history (cap 50)
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { AnnotationHistory, ANNOTATION_HISTORY_CAP } from '../lib/annotation/index.ts';
import { createAnnotationStore } from '../server/annotation-store.mjs';
import { resolveDataPaths } from '../server/data-paths.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');

function makeAnnotationPayload(overrides = {}) {
  return {
    itemId: 'read-testitem00000000000000000000001',
    assetId: 'cand-test-001',
    kind: 'text-mark',
    anchor: {
      kind: 'pdf-text',
      pageNumber: 1,
      rects: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.05 }],
      quote: 'Test annotation quote',
      sourceHash: 'sha256-fake-hash-001',
    },
    content: { subKind: 'highlight', color: '#FFFF00' },
    sourceHash: 'sha256-fake-hash-001',
    ...overrides,
  };
}

function withTempStore(fn) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'rw-ann-test-'));
  // Create a minimal SQLite DB with the items table so FK succeeds
  const dbPath = join(tmpDir, 'test.sqlite3');
  const bootstrapDb = new DatabaseSync(dbPath);
  bootstrapDb.exec(`
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
    )
  `);
  // Insert a fake item so FK is satisfied
  bootstrapDb.prepare(
    'INSERT OR IGNORE INTO items (id, title, collection, item_path, item_type, status, source_order, updated_at_utc) VALUES (?,?,?,?,?,?,?,?)'
  ).run('read-testitem00000000000000000000001', 'Test Book', 'read', 'Read/Book/test.pdf', 'book', 'read', 0, new Date().toISOString());
  bootstrapDb.close();

  const userDataRoot = join(tmpDir, 'user-data');
  const store = createAnnotationStore({ databasePath: dbPath, userDataRoot });
  try {
    return fn(store, userDataRoot, tmpDir);
  } finally {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// P09-T004 — Create and retrieve
// ---------------------------------------------------------------------------

test('Annotation store: creates annotation with revision=1', () => {
  withTempStore((store) => {
    const created = store.createAnnotation(makeAnnotationPayload());
    assert.equal(created.revision, 1);
    assert.equal(created.lifecycle, 'active');
    assert.equal(created.deletedAt, null);
    assert.equal(created.kind, 'text-mark');
    assert.ok(created.id);
  });
});

test('Annotation store: getAnnotations returns created annotations', () => {
  withTempStore((store) => {
    store.createAnnotation(makeAnnotationPayload({ id: 'uuid-001' }));
    store.createAnnotation(makeAnnotationPayload({ id: 'uuid-002' }));
    const list = store.getAnnotations('read-testitem00000000000000000000001');
    assert.equal(list.length, 2);
    assert.ok(list.some((a) => a.id === 'uuid-001'));
    assert.ok(list.some((a) => a.id === 'uuid-002'));
  });
});

// ---------------------------------------------------------------------------
// P09-T004 — Optimistic concurrency
// ---------------------------------------------------------------------------

test('Annotation store: update succeeds with correct expectedRevision', () => {
  withTempStore((store) => {
    const created = store.createAnnotation(makeAnnotationPayload());
    const updated = store.updateAnnotation(
      created.id,
      { content: { subKind: 'underline' } },
      1, // expectedRevision matches created.revision
    );
    assert.equal(updated.revision, 2);
    assert.equal(updated.content.subKind, 'underline');
  });
});

test('Annotation store: update fails with stale expectedRevision (409 conflict)', () => {
  withTempStore((store) => {
    const created = store.createAnnotation(makeAnnotationPayload());
    // First update succeeds
    store.updateAnnotation(created.id, { content: { subKind: 'underline' } }, 1);
    // Second update with stale revision should fail
    assert.throws(
      () => store.updateAnnotation(created.id, { content: { subKind: 'strike' } }, 1),
      (err) => err.status === 409 || /conflict/i.test(err.message),
    );
  });
});

// ---------------------------------------------------------------------------
// P09-T004 — Soft delete
// ---------------------------------------------------------------------------

test('Annotation store: soft-delete sets deletedAt and lifecycle', () => {
  withTempStore((store) => {
    const created = store.createAnnotation(makeAnnotationPayload());
    const result = store.deleteAnnotation(created.id, 1);
    assert.equal(result.ok, true);

    // Active list no longer returns it
    const list = store.getAnnotations('read-testitem00000000000000000000001');
    assert.equal(list.length, 0);

    // IncludeDeleted returns it
    const withDeleted = store.getAnnotations('read-testitem00000000000000000000001', { includeDeleted: true });
    assert.equal(withDeleted.length, 1);
    assert.ok(withDeleted[0].deletedAt);
    assert.equal(withDeleted[0].lifecycle, 'soft-deleted');
  });
});

test('Annotation store: soft-delete fails with wrong revision', () => {
  withTempStore((store) => {
    const created = store.createAnnotation(makeAnnotationPayload());
    assert.throws(
      () => store.deleteAnnotation(created.id, 99),
      (err) => err.status === 409 || /conflict/i.test(err.message),
    );
  });
});

// ---------------------------------------------------------------------------
// P09-T004 — Restore (un-delete)
// ---------------------------------------------------------------------------

test('Annotation store: restore resurrects soft-deleted annotation', () => {
  withTempStore((store) => {
    const created = store.createAnnotation(makeAnnotationPayload());
    store.deleteAnnotation(created.id, 1);
    const restored = store.restoreAnnotation(created.id);
    assert.equal(restored.lifecycle, 'active');
    assert.equal(restored.deletedAt, null);

    const list = store.getAnnotations('read-testitem00000000000000000000001');
    assert.equal(list.length, 1);
  });
});

// ---------------------------------------------------------------------------
// P09-T004 — Source hash mismatch
// ---------------------------------------------------------------------------

test('Annotation store: checkSourceHashMismatches detects changed source', () => {
  withTempStore((store) => {
    store.createAnnotation(makeAnnotationPayload({ sourceHash: 'original-hash' }));
    const mismatches = store.checkSourceHashMismatches(
      'read-testitem00000000000000000000001',
      'new-different-hash',
    );
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].expectedHash, 'original-hash');
    assert.equal(mismatches[0].actualHash, 'new-different-hash');
  });
});

test('Annotation store: checkSourceHashMismatches returns empty when hash matches', () => {
  withTempStore((store) => {
    store.createAnnotation(makeAnnotationPayload({ sourceHash: 'stable-hash' }));
    const mismatches = store.checkSourceHashMismatches(
      'read-testitem00000000000000000000001',
      'stable-hash',
    );
    assert.equal(mismatches.length, 0);
  });
});

// ---------------------------------------------------------------------------
// P09-T004 — External file-first recovery
// ---------------------------------------------------------------------------

test('Annotation store: exportRecoveryFile creates annotations.json', () => {
  withTempStore((store, userDataRoot) => {
    store.createAnnotation(makeAnnotationPayload({ id: 'recovery-test-id' }));
    const recoveryPath = join(userDataRoot, 'items', 'read-testitem00000000000000000000001', 'annotations.json');
    assert.ok(existsSync(recoveryPath), 'Recovery file should exist after create');
    const data = JSON.parse(readFileSync(recoveryPath, 'utf8'));
    assert.equal(data.schemaVersion, 1);
    assert.ok(Array.isArray(data.annotations));
    assert.ok(data.annotations.some((a) => a.id === 'recovery-test-id'));
  });
});

test('Annotation store: recoverFromExternalFile restores after DB loss', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'rw-recovery-'));
  try {
    // Phase 1: create normal store and add annotation
    const dbPath = join(tmpDir, 'test.sqlite3');
    const userDataRoot = join(tmpDir, 'user-data');

    {
      const setupDb = new DatabaseSync(dbPath);
      setupDb.exec(`CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, title TEXT, collection TEXT, item_path TEXT, item_type TEXT, status TEXT, source_order INTEGER, source_added TEXT, summary TEXT, rating REAL, revision INTEGER, provenance_kind TEXT, updated_at_utc TEXT)`);
      setupDb.prepare('INSERT OR IGNORE INTO items (id, title, collection, item_path, item_type, status, source_order, updated_at_utc) VALUES (?,?,?,?,?,?,?,?)').run('read-testitem00000000000000000000001', 'Test Book', 'read', 'Read/Book/test.pdf', 'book', 'read', 0, new Date().toISOString());
      setupDb.close();
    }

    const store1 = createAnnotationStore({ databasePath: dbPath, userDataRoot });
    store1.createAnnotation(makeAnnotationPayload({ id: 'recover-test-001' }));
    store1.close();

    // Phase 2: delete the annotations table (simulate DB corruption)
    {
      const wipeDb = new DatabaseSync(dbPath);
      wipeDb.exec('DROP TABLE IF EXISTS annotations');
      // Re-create schema so the store can initialize
      wipeDb.close();
    }

    // Phase 3: open fresh store and verify table was re-created then recover
    const store2 = createAnnotationStore({ databasePath: dbPath, userDataRoot });
    // Table was re-created by DDL, but data is gone
    const before = store2.getAnnotations('read-testitem00000000000000000000001');
    assert.equal(before.length, 0, 'Should be empty after DB table drop');

    const result = store2.recoverFromExternalFile('read-testitem00000000000000000000001');
    assert.equal(result.ok, true);
    assert.ok(result.recovered >= 1, `Expected at least 1 recovered, got ${result.recovered}`);

    const after = store2.getAnnotations('read-testitem00000000000000000000001');
    assert.ok(after.some((a) => a.id === 'recover-test-001'), 'Recovered annotation should be present');
    store2.close();
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// P09-T004 — Bounded undo/redo history
// ---------------------------------------------------------------------------

test('AnnotationHistory: tracks push/undo/redo correctly', () => {
  const history = new AnnotationHistory();

  const fakeAnn = { id: 'fake-id', kind: 'text-mark', revision: 1 };
  history.push({ op: 'create', annotation: fakeAnn });
  assert.equal(history.size, 1);
  assert.equal(history.canUndo, true);
  assert.equal(history.canRedo, false);

  const undoneEntry = history.undo();
  assert.ok(undoneEntry);
  assert.equal(undoneEntry.op, 'create');
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);

  const redoneEntry = history.redo();
  assert.ok(redoneEntry);
  assert.equal(redoneEntry.op, 'create');
  assert.equal(history.canRedo, false);
});

test('AnnotationHistory: new push clears redo stack', () => {
  const history = new AnnotationHistory();
  const fakeAnn = { id: 'fake-id-2', kind: 'text-mark', revision: 1 };
  history.push({ op: 'create', annotation: fakeAnn });
  history.undo();
  assert.equal(history.canRedo, true);
  // Push new entry — redo should clear
  history.push({ op: 'create', annotation: { ...fakeAnn, id: 'fake-id-3' } });
  assert.equal(history.canRedo, false);
});

test(`AnnotationHistory: caps at ${ANNOTATION_HISTORY_CAP} entries`, () => {
  const history = new AnnotationHistory();
  for (let i = 0; i < ANNOTATION_HISTORY_CAP + 20; i++) {
    history.push({ op: 'create', annotation: { id: `ann-${i}`, kind: 'text-mark', revision: 1 } });
  }
  assert.equal(history.size, ANNOTATION_HISTORY_CAP);
});

test('AnnotationHistory: clear resets all state', () => {
  const history = new AnnotationHistory();
  history.push({ op: 'create', annotation: { id: 'x', kind: 'text-mark', revision: 1 } });
  history.clear();
  assert.equal(history.size, 0);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
});

// ---------------------------------------------------------------------------
// P09-T004 — Batch create
// ---------------------------------------------------------------------------

test('Annotation store: batchCreateAnnotations inserts multiple rows atomically', () => {
  withTempStore((store) => {
    const items = [
      makeAnnotationPayload({ id: 'batch-001' }),
      makeAnnotationPayload({ id: 'batch-002', content: { subKind: 'underline' } }),
      makeAnnotationPayload({ id: 'batch-003', content: { subKind: 'strike' } }),
    ];
    const result = store.batchCreateAnnotations(items);
    assert.equal(result.ok, true);
    assert.equal(result.count, 3);
    assert.equal(result.ids.length, 3);

    const list = store.getAnnotations('read-testitem00000000000000000000001');
    assert.equal(list.length, 3);
  });
});
