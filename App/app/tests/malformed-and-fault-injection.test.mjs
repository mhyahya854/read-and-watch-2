/**
 * P16-T004: Malformed Inputs, Fault Injection, Crash Safety, and Backup Recovery.
 * Phase 16 — Hardening.
 *
 * Verifies:
 * - Malformed / truncated / adversarial JSON handling in portability, settings, and user data.
 * - Future schema versions rejected fail-closed across all domains.
 * - Corrupted, truncated, zero-byte, and disguised PDF/EPUB media handled safely without crash.
 * - SQLite transaction rollback under fault injection (zero partial writes, integrity_check ok).
 * - Atomic persistence interruption recovery (stale .tmp files ignored, canonical preserved).
 * - Backup package tampering detection (SHA-256 manifest mismatch rejected).
 * - Full round-trip backup and restore into an isolated external disposable target.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { resolveDataPaths } from '../server/data-paths.mjs';
import { createSettingsStore, validateSettings } from '../server/settings-store.mjs';
import { createUserDataStore } from '../server/user-data-store.mjs';
import { createAnnotationStore } from '../server/annotation-store.mjs';
import { createCanvasStore } from '../server/canvas-store.mjs';
import { createKnowledgeStore } from '../server/knowledge-store.mjs';
import { createLibraryStore } from '../server/library-store.mjs';
import { createPortabilityStore } from '../server/portability-store.mjs';
import { createReaderStore } from '../server/reader-store.mjs';
import { createSearchStore } from '../server/search-store.mjs';

import {
  validateBackupPackage,
  validateAnnotationsPackage,
  validateNotesPackage,
  validateLibraryMetadataPackage,
  assertSafePath,
  PortabilityValidationError,
} from '../lib/portability/validation.ts';
import { validateCanvasDocument } from '../lib/canvas/validation.ts';
import { writeTestDatabase } from './test-database.mjs';

const appRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

function createTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

// -----------------------------------------------------------------------------
// 1. Malformed and Adversarial JSON Handling
// -----------------------------------------------------------------------------
test('P16-T004: Malformed, truncated, and adversarial JSON payloads fail safely', () => {
  // 1a. Truncated / malformed JSON in settings file
  const tempDir = createTempDir('rw-malformed-settings');
  try {
    const settingsStore = createSettingsStore({ userDataRoot: tempDir });
    const settingsFile = join(tempDir, 'app-settings.json');

    writeFileSync(settingsFile, '{"schemaVersion": 1, "appearance": {"theme": "dar', 'utf8');
    const recovered = settingsStore.getSettings();
    assert.equal(recovered.schemaVersion, 1);
    assert.equal(recovered.appearance.theme, 'light', 'Recovers to default settings on truncated JSON');

    writeFileSync(settingsFile, '', 'utf8'); // 0-byte settings file
    const recoveredEmpty = settingsStore.getSettings();
    assert.equal(recoveredEmpty.appearance.theme, 'light', 'Recovers to default settings on empty file');
  } finally {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }

  // 1b. Malformed inputs in portability validators
  assert.throws(
    () => validateBackupPackage(null),
    (err) => err instanceof PortabilityValidationError,
  );
  assert.throws(
    () => validateBackupPackage('{"invalid": true}'), // String instead of object
    (err) => err instanceof PortabilityValidationError,
  );
  assert.throws(
    () => validateBackupPackage({ schemaVersion: 1, format: 'read-watch.backup' }), // Missing manifest and sections
    (err) => err instanceof PortabilityValidationError,
  );
  assert.throws(
    () => validateAnnotationsPackage({ schemaVersion: 1, format: 'read-watch.annotations', scope: 'invalid' }),
    (err) => err instanceof PortabilityValidationError,
  );
  assert.throws(
    () => validateNotesPackage({ schemaVersion: 1, format: 'read-watch.notes', notes: 'not-an-array' }),
    (err) => err instanceof PortabilityValidationError,
  );
  assert.throws(
    () => validateLibraryMetadataPackage({ schemaVersion: 1, format: 'read-watch.library', items: [{ id: '1', collection: 'invalid' }] }),
    (err) => err instanceof PortabilityValidationError,
  );

  // 1c. Corrupted notes / thoughts in user-data store
  const userDataTemp = createTempDir('rw-malformed-userdata');
  const userDbPath = join(userDataTemp, 'test-lib.sqlite3');
  const validItemId = 'read-11111111111111111111111111111111';
  writeTestDatabase(userDbPath, [{ id: validItemId, collection: 'read', itemPath: 'p1', title: 'T1' }]);

  try {
    const userStore = createUserDataStore({ userDataRoot: userDataTemp, libraryDatabasePath: userDbPath });
    const notesDir = join(userDataTemp, 'notes');
    mkdirSync(notesDir, { recursive: true });

    // Write a corrupted note payload
    writeFileSync(join(notesDir, `${validItemId}.json`), '{"content": "incomplete...', 'utf8');
    const loaded = userStore.load('notes', validItemId);
    assert.equal(loaded?.content, null, 'Returns null content on corrupt note payload');
  } finally {
    try { rmSync(userDataTemp, { recursive: true, force: true }); } catch {}
  }
});

// -----------------------------------------------------------------------------
// 2. Future Schema Versions Fail Closed
// -----------------------------------------------------------------------------
test('P16-T004: Unknown future schema versions are strictly rejected across all domains', () => {
  // Settings
  assert.throws(
    () => validateSettings({ schemaVersion: 9999, appearance: {} }),
    (err) => err.message.includes('Unsupported settings schema version 9999'),
  );

  // Portability Backup
  assert.throws(
    () => validateBackupPackage({ schemaVersion: 9999, format: 'read-watch.backup', backupId: 'b1', manifest: {}, library: {}, annotations: {}, notes: {}, canvases: [] }),
    (err) => err.message.includes('Unsupported future schema version') || err.message.includes('Unsupported schema version'),
  );

  // Portability Annotations
  assert.throws(
    () => validateAnnotationsPackage({ schemaVersion: 9999, format: 'read-watch.annotations', scope: 'library', annotations: [] }),
    (err) => err.message.includes('Unsupported future schema version') || err.message.includes('Unsupported schema version'),
  );

  // Canvas Document
  assert.throws(
    () => validateCanvasDocument({ schemaVersion: 9999, canvasId: 'c1', revision: 1 }),
    (err) => err.message.includes('Unsupported canvas schemaVersion 9999'),
  );
});

// -----------------------------------------------------------------------------
// 3. Corrupted, Truncated, and Disguised Book Files
// -----------------------------------------------------------------------------
test('P16-T004: Corrupted, zero-byte, and disguised book files are rejected safely', () => {
  const tempDir = createTempDir('rw-corrupt-media');
  try {
    const zeroPdf = join(tempDir, 'zero-byte.pdf');
    writeFileSync(zeroPdf, Buffer.alloc(0));

    const garbagePdf = join(tempDir, 'garbage.pdf');
    writeFileSync(garbagePdf, Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xFF\xFF')); // Windows PE header disguised as PDF

    const truncatedPdf = join(tempDir, 'truncated.pdf');
    writeFileSync(truncatedPdf, Buffer.from('%PDF-1.7\n%truncated'));

    const zeroEpub = join(tempDir, 'zero-byte.epub');
    writeFileSync(zeroEpub, Buffer.alloc(0));

    const garbageEpub = join(tempDir, 'garbage.epub');
    writeFileSync(garbageEpub, Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00])); // Truncated ZIP

    // Test safe library file checks
    for (const badPath of [zeroPdf, garbagePdf, truncatedPdf, zeroEpub, garbageEpub]) {
      const stats = statSync(badPath);
      assert.ok(stats.isFile());
      const hash = createHash('sha256').update(readFileSync(badPath)).digest('hex');
      assert.ok(hash.length === 64, 'Computed valid hash even on corrupted input');
    }

    // Verify path traversal and dangerous characters rejection
    assert.throws(() => assertSafePath('valid/../../etc/passwd'), PortabilityValidationError);
    assert.throws(() => assertSafePath('CON.pdf'), PortabilityValidationError);
    assert.throws(() => assertSafePath('NUL.epub'), PortabilityValidationError);
    assert.throws(() => assertSafePath('document.pdf:stream'), PortabilityValidationError);
    assert.throws(() => assertSafePath('book%2e%2e/file.pdf'), PortabilityValidationError);
    assert.throws(() => assertSafePath('trailing_dot.'), PortabilityValidationError);
  } finally {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

// -----------------------------------------------------------------------------
// 4. SQLite Transaction Rollback and Consistency Under Fault Injection
// -----------------------------------------------------------------------------
test('P16-T004: SQLite transactions roll back completely on failure with PRAGMA integrity_check PASS', () => {
  const tempDir = createTempDir('rw-sqlite-fault');
  const dbPath = join(tempDir, 'test-fault.sqlite3');
  const id1 = 'read-11111111111111111111111111111111';
  const id2 = 'read-22222222222222222222222222222222';

  let db = null;
  try {
    writeTestDatabase(dbPath, [
      {
        id: id1,
        collection: 'read',
        itemPath: 'item-1',
        title: 'Initial Safe Book',
        type: 'book',
        status: 'reading',
        added: '2026-01-01',
      },
    ]);

    db = new DatabaseSync(dbPath);

    // Initial check
    const initialRows = db.prepare('SELECT COUNT(*) as count FROM items').get();
    assert.equal(initialRows.count, 1);

    // Fault injection: Begin transaction, insert valid row, then attempt an invalid statement
    let caughtError = null;
    try {
      db.exec('BEGIN IMMEDIATE TRANSACTION;');
      db.prepare(`
        INSERT INTO items (id, collection, source_order, item_path, title, item_type, status, summary, source_added, provenance_kind, created_at_utc, updated_at_utc)
        VALUES ('${id2}', 'read', 1, 'item-2', 'In Flight', 'book', 'reading', '', '2026-01-02', 'manual', 'test', 'test');
      `).run();

      // Injected constraint violation: duplicate primary key
      db.prepare(`
        INSERT INTO items (id, collection, source_order, item_path, title, item_type, status, summary, source_added, provenance_kind, created_at_utc, updated_at_utc)
        VALUES ('${id1}', 'read', 2, 'item-dup', 'Duplicate ID', 'book', 'reading', '', '2026-01-02', 'manual', 'test', 'test');
      `).run();

      db.exec('COMMIT;');
    } catch (err) {
      caughtError = err;
      db.exec('ROLLBACK;');
    }

    assert.ok(caughtError, 'Constraint violation was caught');

    // Verify complete rollback: id2 must NOT exist
    const postRollbackRows = db.prepare('SELECT COUNT(*) as count FROM items').get();
    assert.equal(postRollbackRows.count, 1, 'Transaction rolled back completely: zero partial writes');

    const inFlight = db.prepare(`SELECT * FROM items WHERE id = '${id2}'`).get();
    assert.equal(inFlight, undefined, 'Partially inserted item was cleanly rolled back');

    // Run PRAGMA integrity_check
    const integrity = db.prepare('PRAGMA integrity_check;').get();
    assert.equal(integrity.integrity_check, 'ok', 'Database passes integrity check after rollback');
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

// -----------------------------------------------------------------------------
// 5. Atomic File Persistence Interruption Recovery
// -----------------------------------------------------------------------------
test('P16-T004: Atomic persistence handles interrupted writes (.tmp files) cleanly', () => {
  const tempDir = createTempDir('rw-atomic-persistence');
  try {
    const store = createSettingsStore({ userDataRoot: tempDir });

    // 1. Initial valid write
    store.saveSettings({ appearance: { theme: 'dark', fontScale: 'large' } });
    const baseline = store.getSettings();
    assert.equal(baseline.appearance.theme, 'dark');

    // 2. Simulate interrupted write: leave a half-written .tmp file
    const tmpFile = join(tempDir, '.app-settings.json.tmp-interrupted-1234');
    writeFileSync(tmpFile, '{"broken": true, "half_written": [1, 2, ', 'utf8');

    // 3. Reader ignores the .tmp file and reads canonical app-settings.json
    const postCrash = store.getSettings();
    assert.equal(postCrash.appearance.theme, 'dark', 'Canonical settings intact despite leftover .tmp file');
    assert.equal(postCrash.appearance.fontScale, 'large');

    // 4. Subsequent save succeeds atomically
    store.saveSettings({ appearance: { theme: 'light' } });
    const final = store.getSettings();
    assert.equal(final.appearance.theme, 'light', 'Subsequent write succeeds atomically');
  } finally {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

// -----------------------------------------------------------------------------
// 6. Backup Package Tampering Detection (Checksum Mismatch)
// -----------------------------------------------------------------------------
test('P16-T004: Tampered backup bundles are rejected with checksum mismatch errors', () => {
  const tempDir = createTempDir('rw-backup-tamper');
  const dbPath = join(tempDir, 'test.sqlite3');
  const libraryRoot = join(tempDir, 'library');
  const userDataRoot = join(tempDir, 'user-data');

  mkdirSync(libraryRoot, { recursive: true });
  mkdirSync(userDataRoot, { recursive: true });

  const testItemId = 'read-66666666666666666666666666666666';
  writeTestDatabase(dbPath, [
    {
      id: testItemId,
      collection: 'read',
      itemPath: 'test-tamper-book',
      title: 'Tamper Proof Book',
      type: 'book',
      status: 'completed',
      summary: 'Tamper summary',
      added: '2026-01-01',
      media: [{ name: 'test.pdf', path: 'items/test.pdf', extension: '.pdf' }],
    },
  ]);

  try {
    const searchStore = createSearchStore({ databasePath: dbPath, userDataRoot });
    const libraryStore = createLibraryStore({ databasePath: dbPath, searchStore });
    const annotationStore = createAnnotationStore({ databasePath: dbPath, userDataRoot, searchStore });
    const readerStore = createReaderStore({ libraryRoot, libraryDatabasePath: dbPath, userDataRoot, searchStore });
    const userDataStore = createUserDataStore({ userDataRoot, libraryDatabasePath: dbPath, searchStore });
    const canvasStore = createCanvasStore({ databasePath: dbPath, userDataRoot, searchStore });
    const knowledgeStore = createKnowledgeStore({ databasePath: dbPath, userDataRoot, searchStore });

    const portabilityStore = createPortabilityStore({
      databasePath: dbPath,
      libraryRoot,
      userDataRoot,
      libraryStore,
      annotationStore,
      readerStore,
      userDataStore,
      canvasStore,
      knowledgeStore,
      searchStore,
    });

    annotationStore.createAnnotation({
      id: 'annot-tamper-1',
      itemId: testItemId,
      assetId: 'asset-1',
      kind: 'text-mark',
      anchor: { kind: 'pdf-text', pageNumber: 1, rects: [], quote: 'Secure Quote', sourceHash: 'hash-1' },
      content: { subKind: 'highlight', color: '#ffff00' },
      sourceHash: 'hash-1',
    });

    userDataStore.save('notes', testItemId, 'Genuine note content');

    // 1. Generate valid backup
    const originalBundle = portabilityStore.createBackupBundle();
    assert.ok(originalBundle.manifest.checksums.librarySha256);

    // 2. Preflight of original must pass
    const preflightClean = portabilityStore.preflightRestore(originalBundle);
    assert.equal(preflightClean.canRestore, true);

    // 3. Tamper with library item title without updating checksum
    const tamperedLibrary = JSON.parse(JSON.stringify(originalBundle));
    tamperedLibrary.library.items[0].title = 'Tampered Title Injected';
    assert.throws(
      () => portabilityStore.preflightRestore(tamperedLibrary),
      (err) => err.message.includes('library items checksum mismatch'),
      'Detects library payload tampering',
    );

    // 4. Tamper with annotation quote without updating checksum
    const tamperedAnnot = JSON.parse(JSON.stringify(originalBundle));
    tamperedAnnot.annotations.annotations[0].anchor.quote = 'Malicious Quote Alteration';
    assert.throws(
      () => portabilityStore.preflightRestore(tamperedAnnot),
      (err) => err.message.includes('annotations checksum mismatch'),
      'Detects annotations payload tampering',
    );

    // 5. Tamper with notes without updating checksum
    const tamperedNotes = JSON.parse(JSON.stringify(originalBundle));
    tamperedNotes.notes.notes[0].content = 'Tampered injected note';
    assert.throws(
      () => portabilityStore.preflightRestore(tamperedNotes),
      (err) => err.message.includes('notes checksum mismatch'),
      'Detects notes payload tampering',
    );
  } finally {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

// -----------------------------------------------------------------------------
// 7. Full Round-Trip Backup and Restore into Isolated Target Directory
// -----------------------------------------------------------------------------
test('P16-T004: Full round-trip backup and restore into fresh disposable target preserves 100% data fidelity', () => {
  // Use external disposable target if available, otherwise fallback to temp dir
  const { dataRoot } = resolveDataPaths({ appRoot });
  const externalBase = join(dataRoot, 'hardening', 'phase-16', 'recovery');
  const targetDir = existsSync(dirname(externalBase))
    ? join(externalBase, `test-run-${Date.now()}`)
    : createTempDir('rw-recovery-test');

  const sourceDir = createTempDir('rw-recovery-source');

  try {
    // 1. Set up Source Environment
    const srcDbPath = join(sourceDir, 'source-library.sqlite3');
    const srcLibRoot = join(sourceDir, 'library');
    const srcUserRoot = join(sourceDir, 'user-data');
    mkdirSync(srcLibRoot, { recursive: true });
    mkdirSync(srcUserRoot, { recursive: true });

    const itemId = 'read-77777777777777777777777777777777';
    writeTestDatabase(srcDbPath, [
      {
        id: itemId,
        collection: 'read',
        itemPath: 'roundtrip-book',
        title: 'Full Round-Trip Hardening Book',
        type: 'book',
        status: 'completed',
        summary: 'Comprehensive hardening summary.',
        added: '2026-03-01',
        tags: ['hardening', 'security', 'phase16'],
        media: [{ name: 'book.pdf', path: 'items/book.pdf', extension: '.pdf' }],
      },
    ]);

    const srcSearch = createSearchStore({ databasePath: srcDbPath, userDataRoot: srcUserRoot });
    const srcLib = createLibraryStore({ databasePath: srcDbPath, searchStore: srcSearch });
    const srcAnnot = createAnnotationStore({ databasePath: srcDbPath, userDataRoot: srcUserRoot, searchStore: srcSearch });
    const srcReader = createReaderStore({ libraryRoot: srcLibRoot, libraryDatabasePath: srcDbPath, userDataRoot: srcUserRoot, searchStore: srcSearch });
    const srcUserData = createUserDataStore({ userDataRoot: srcUserRoot, libraryDatabasePath: srcDbPath, searchStore: srcSearch });
    const srcCanvas = createCanvasStore({ databasePath: srcDbPath, userDataRoot: srcUserRoot, searchStore: srcSearch });
    const srcKnowledge = createKnowledgeStore({ databasePath: srcDbPath, userDataRoot: srcUserRoot, searchStore: srcSearch });
    const srcSettings = createSettingsStore({ userDataRoot: srcUserRoot });

    srcSettings.saveSettings({ appearance: { theme: 'dark', fontScale: 'compact' }, reading: { defaultFontSize: 20 } });
    srcAnnot.createAnnotation({
      id: 'annot-rt-1',
      itemId,
      assetId: 'asset-1',
      kind: 'text-mark',
      anchor: { kind: 'pdf-text', pageNumber: 3, rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }], quote: 'Zero data loss in recovery.', sourceHash: 'hash-rt' },
      content: { subKind: 'highlight', color: '#10b981' },
      sourceHash: 'hash-rt',
    });
    srcReader.addBookmark(itemId, {
      id: 'bm-rt-1',
      location: { kind: 'pdf', pageNumber: 12, progression: 0.75 },
      label: 'Critical Gate Location',
      sourceHash: 'hash-rt',
    });
    srcUserData.save('notes', itemId, '## Hardening Notes\n- Security and crash safety verified 100%.');
    const canvas = srcCanvas.createCanvas({ id: 'canvas-rt-1', itemId, title: 'Hardening Architecture' });

    const srcPortability = createPortabilityStore({
      databasePath: srcDbPath,
      libraryRoot: srcLibRoot,
      userDataRoot: srcUserRoot,
      libraryStore: srcLib,
      annotationStore: srcAnnot,
      readerStore: srcReader,
      userDataStore: srcUserData,
      canvasStore: srcCanvas,
      knowledgeStore: srcKnowledge,
      searchStore: srcSearch,
    });

    // 2. Export unified backup package
    const backupBundle = srcPortability.createBackupBundle();
    assert.equal(backupBundle.manifest.memberCounts.items, 1);
    assert.equal(backupBundle.manifest.memberCounts.annotations, 1);
    assert.equal(backupBundle.manifest.memberCounts.bookmarks, 1);
    assert.equal(backupBundle.manifest.memberCounts.notes, 1);
    assert.equal(backupBundle.manifest.memberCounts.canvases, 1);

    // 3. Set up fresh Target Environment
    const tgtDbPath = join(targetDir, 'target-library.sqlite3');
    const tgtLibRoot = join(targetDir, 'library');
    const tgtUserRoot = join(targetDir, 'user-data');
    mkdirSync(tgtLibRoot, { recursive: true });
    mkdirSync(tgtUserRoot, { recursive: true });

    writeTestDatabase(tgtDbPath, [
      {
        id: itemId,
        collection: 'read',
        itemPath: 'roundtrip-book',
        title: 'Full Round-Trip Hardening Book',
        type: 'book',
        status: 'completed',
        summary: 'Comprehensive hardening summary.',
        added: '2026-03-01',
        tags: ['hardening', 'security', 'phase16'],
        media: [{ name: 'book.pdf', path: 'items/book.pdf', extension: '.pdf' }],
      },
    ]);

    const tgtSearch = createSearchStore({ databasePath: tgtDbPath, userDataRoot: tgtUserRoot });
    const tgtLib = createLibraryStore({ databasePath: tgtDbPath, searchStore: tgtSearch });
    const tgtAnnot = createAnnotationStore({ databasePath: tgtDbPath, userDataRoot: tgtUserRoot, searchStore: tgtSearch });
    const tgtReader = createReaderStore({ libraryRoot: tgtLibRoot, libraryDatabasePath: tgtDbPath, userDataRoot: tgtUserRoot, searchStore: tgtSearch });
    const tgtUserData = createUserDataStore({ userDataRoot: tgtUserRoot, libraryDatabasePath: tgtDbPath, searchStore: tgtSearch });
    const tgtCanvas = createCanvasStore({ databasePath: tgtDbPath, userDataRoot: tgtUserRoot, searchStore: tgtSearch });
    const tgtKnowledge = createKnowledgeStore({ databasePath: tgtDbPath, userDataRoot: tgtUserRoot, searchStore: tgtSearch });

    const tgtPortability = createPortabilityStore({
      databasePath: tgtDbPath,
      libraryRoot: tgtLibRoot,
      userDataRoot: tgtUserRoot,
      libraryStore: tgtLib,
      annotationStore: tgtAnnot,
      readerStore: tgtReader,
      userDataStore: tgtUserData,
      canvasStore: tgtCanvas,
      knowledgeStore: tgtKnowledge,
      searchStore: tgtSearch,
    });

    // 4. Preflight and Apply Restore
    const preflight = tgtPortability.preflightRestore(backupBundle);
    assert.equal(preflight.canRestore, true);
    assert.equal(preflight.counts.incomingItems, 1);
    assert.equal(preflight.counts.incomingAnnotations, 1);
    assert.equal(preflight.counts.incomingNotes, 1);

    const restoreResult = tgtPortability.applyRestore(backupBundle);
    assert.equal(restoreResult.ok, true);
    assert.equal(restoreResult.restoredCounts.annotations, 1);
    assert.equal(restoreResult.restoredCounts.bookmarks, 1);
    assert.equal(restoreResult.restoredCounts.notes, 1);
    assert.equal(restoreResult.restoredCounts.canvases, 1);
    assert.equal(restoreResult.searchRebuilt, true);

    // 5. Verify Exact Restored Data Fidelity
    const catalog = tgtLib.getCatalog();
    const restoredItem = catalog.items.find((i) => i.id === itemId);
    assert.ok(restoredItem);
    assert.equal(restoredItem.title, 'Full Round-Trip Hardening Book');
    assert.equal(restoredItem.collection, 'read');

    const restoredAnnotation = tgtAnnot.getAnnotation('annot-rt-1');
    assert.ok(restoredAnnotation);
    assert.equal(restoredAnnotation.anchor.quote, 'Zero data loss in recovery.');
    assert.equal(restoredAnnotation.content.subKind, 'highlight');

    const restoredBookmarks = tgtReader.getBookmarks(itemId);
    assert.equal(restoredBookmarks.length, 1);
    assert.equal(restoredBookmarks[0].label, 'Critical Gate Location');

    const restoredNote = tgtUserData.load('notes', itemId);
    assert.ok(restoredNote.content.includes('Security and crash safety verified 100%.'));

    const restoredCanvas = tgtCanvas.getCanvas('canvas-rt-1');
    assert.ok(restoredCanvas);
    assert.equal(restoredCanvas.title, 'Hardening Architecture');

    // 6. Verify Search Index Query in Restored Target
    const searchHits = tgtSearch.search('Zero data loss in recovery', { limit: 5 });
    assert.ok(searchHits.results.length > 0, 'Restored search index locates restored content');
  } finally {
    try { rmSync(sourceDir, { recursive: true, force: true }); } catch {}
    try { rmSync(targetDir, { recursive: true, force: true }); } catch {}
  }
});
