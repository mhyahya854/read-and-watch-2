import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { createLibraryStore } from '../server/library-store.mjs';
import { createAnnotationStore } from '../server/annotation-store.mjs';
import { createReaderStore } from '../server/reader-store.mjs';
import { createUserDataStore } from '../server/user-data-store.mjs';
import { createCanvasStore } from '../server/canvas-store.mjs';
import { createSearchStore } from '../server/search-store.mjs';
import { createPortabilityStore } from '../server/portability-store.mjs';
import {
  PORTABLE_FORMATS,
  PORTABILITY_SCHEMA_VERSION,
} from '../lib/portability/types.ts';
import { writeTestDatabase } from './test-database.mjs';
import {
  assertSafePath,
  validateAnnotationsPackage,
  validateBackupPackage,
} from '../lib/portability/validation.ts';

function createTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function setupTestEnvironment() {
  const tempDir = createTempDir('rw-portability-test-');
  const dbPath = join(tempDir, 'test-library.sqlite3');
  const libraryRoot = join(tempDir, 'library');
  const userDataRoot = join(tempDir, 'user-data');

  mkdirSync(libraryRoot, { recursive: true });
  mkdirSync(userDataRoot, { recursive: true });

  const testItemId = 'read-11111111111111111111111111111111';
  writeTestDatabase(dbPath, [
    {
      id: testItemId,
      collection: 'read',
      itemPath: 'test-book',
      title: 'Mastering Portability',
      type: 'book',
      status: 'completed',
      summary: 'Test summary',
      added: '2026-01-01',
      media: [
        {
          name: 'test.pdf',
          path: 'items/test-book/media/test.pdf',
          extension: '.pdf',
        },
      ],
    },
  ]);

  const searchStore = createSearchStore({ databasePath: dbPath, userDataRoot });
  const libraryStore = createLibraryStore({ databasePath: dbPath, searchStore });
  const annotationStore = createAnnotationStore({ databasePath: dbPath, userDataRoot, searchStore });
  const readerStore = createReaderStore({ libraryRoot, libraryDatabasePath: dbPath, userDataRoot, searchStore });
  const userDataStore = createUserDataStore({ userDataRoot, libraryDatabasePath: dbPath, searchStore });
  const canvasStore = createCanvasStore({ databasePath: dbPath, userDataRoot, searchStore });

  const portabilityStore = createPortabilityStore({
    databasePath: dbPath,
    libraryRoot,
    userDataRoot,
    libraryStore,
    annotationStore,
    readerStore,
    userDataStore,
    canvasStore,
    searchStore,
  });

  return {
    tempDir,
    dbPath,
    libraryRoot,
    userDataRoot,
    testItemId,
    searchStore,
    libraryStore,
    annotationStore,
    readerStore,
    userDataStore,
    canvasStore,
    portabilityStore,
    cleanup: () => {
      try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    },
  };
}

test('P12-T001: Portable schemas are versioned and reject unknown future versions', () => {
  assert.equal(PORTABILITY_SCHEMA_VERSION, 1);
  assert.equal(PORTABLE_FORMATS.ANNOTATIONS, 'read-watch.annotations');
  assert.equal(PORTABLE_FORMATS.BACKUP, 'read-watch.backup');

  // Valid schema v1
  const validAnnot = {
    schemaVersion: 1,
    format: 'read-watch.annotations',
    exportedAt: new Date().toISOString(),
    app: { name: 'Read & Watch', version: '0.1.0' },
    scope: 'item',
    annotations: [],
    counts: { textMarks: 0, comments: 0, excerpts: 0, drawings: 0, bookmarks: 0, total: 0 },
  };
  assert.doesNotThrow(() => validateAnnotationsPackage(validAnnot));

  // Future schema version > 1 must fail closed
  const futureAnnot = {
    ...validAnnot,
    schemaVersion: 2,
  };
  assert.throws(() => validateAnnotationsPackage(futureAnnot), {
    message: /Unsupported future schema version: 2/,
  });

  // Rejects invalid format identifier
  const badFormat = {
    ...validAnnot,
    format: 'unknown.custom.format',
  };
  assert.throws(() => validateAnnotationsPackage(badFormat), {
    message: /Expected format read-watch\.annotations/,
  });

  // Path traversal guard
  assert.throws(() => assertSafePath('../escaped/path.json'), {
    message: /Directory traversal forbidden/,
  });
  assert.throws(() => assertSafePath('C:\\Users\\Secret\\File.pdf'), {
    message: /Absolute drive path forbidden/,
  });
  assert.throws(() => assertSafePath('/etc/passwd'), {
    message: /Root-relative path forbidden/,
  });
});

test('P12-T002: Annotation JSON and Markdown exports', () => {
  const env = setupTestEnvironment();
  try {
    // Create an annotation
    const annot = env.annotationStore.createAnnotation({
      itemId: env.testItemId,
      assetId: 'asset-1',
      kind: 'text-mark',
      anchor: {
        kind: 'pdf-text',
        pageNumber: 1,
        rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
        quote: 'The universal portability principle preserves truth.',
        sourceHash: 'deadbeefcafe0000000000000000000000000000000000000000000000000000',
      },
      content: { subKind: 'highlight', color: '#fbbf24' },
      sourceHash: 'deadbeefcafe0000000000000000000000000000000000000000000000000000',
    });

    // Create a bookmark
    env.readerStore.addBookmark(env.testItemId, {
      location: { kind: 'pdf', pageNumber: 1, progression: 0.1 },
      sourceHash: 'deadbeefcafe0000000000000000000000000000000000000000000000000000',
      label: 'Chapter 1: Ground Truth',
    });

    // Export JSON
    const jsonExport = env.portabilityStore.exportAnnotationsJson({ itemId: env.testItemId });
    assert.equal(jsonExport.format, PORTABLE_FORMATS.ANNOTATIONS);
    assert.equal(jsonExport.schemaVersion, 1);
    assert.equal(jsonExport.annotations.length, 1);
    assert.equal(jsonExport.annotations[0].id, annot.id);
    assert.equal(jsonExport.bookmarks.length, 1);
    assert.equal(jsonExport.counts.textMarks, 1);
    assert.equal(jsonExport.counts.bookmarks, 1);
    assert.ok(jsonExport.checksumSha256);

    // Export Markdown
    const mdExport = env.portabilityStore.exportAnnotationsMarkdown({ itemId: env.testItemId });
    assert.ok(mdExport.includes('# Annotations and Reading Notes'));
    assert.ok(mdExport.includes('The universal portability principle preserves truth.'));
    assert.ok(mdExport.includes('Chapter 1: Ground Truth'));
    assert.ok(mdExport.includes('Notice: This Markdown document is a human-readable projection'));
  } finally {
    env.cleanup();
  }
});

test('P12-T003: Notes and Canvas exports with links and provenance', () => {
  const env = setupTestEnvironment();
  try {
    // Save thoughts and notes
    env.userDataStore.save('thoughts', env.testItemId, '# Thoughts on Portability\nZero dependencies.');
    env.userDataStore.save('notes', env.testItemId, '- Keep sources immutable\n- Use standard formats');

    // Export Notes
    const notesPkg = env.portabilityStore.exportNotes({ itemId: env.testItemId });
    assert.equal(notesPkg.format, PORTABLE_FORMATS.NOTES);
    assert.equal(notesPkg.notes.length, 1);
    assert.equal(notesPkg.notes[0].itemId, env.testItemId);
    assert.ok(notesPkg.notes[0].thoughtsMarkdown.includes('# Thoughts on Portability'));
    assert.ok(notesPkg.notes[0].notesMarkdown.includes('Keep sources immutable'));

    // Create a canvas with a deep link
    const canvas = env.canvasStore.createCanvas({
      itemId: env.testItemId,
      title: 'Portability Architecture Diagram',
      scene: { elements: [{ id: 'el-1', type: 'rectangle' }] },
    });
    env.canvasStore.addCanvasLink(canvas.canvasId, {
      elementId: 'el-1',
      itemId: env.testItemId,
      annotationId: null,
      anchorJson: JSON.stringify({ page: 1 }),
      label: 'Core Bridge',
    });

    // Export Canvas
    const canvasPkg = env.portabilityStore.exportCanvasPackage(canvas.canvasId);
    assert.equal(canvasPkg.schemaVersion, 1);
    assert.equal(canvasPkg.document.canvasId, canvas.canvasId);
    assert.equal(canvasPkg.document.title, 'Portability Architecture Diagram');
    assert.equal(canvasPkg.document.links.length, 1);
    assert.equal(canvasPkg.document.links[0].label, 'Core Bridge');
  } finally {
    env.cleanup();
  }
});

test('P12-T004: Library metadata and unified backup creation', () => {
  const env = setupTestEnvironment();
  try {
    const metaPkg = env.portabilityStore.exportLibraryMetadata();
    assert.equal(metaPkg.format, PORTABLE_FORMATS.LIBRARY_METADATA);
    assert.equal(metaPkg.items.length, 1);
    assert.equal(metaPkg.items[0].id, env.testItemId);
    assert.equal(metaPkg.items[0].media[0].name, 'test.pdf');
    assert.ok(metaPkg.checksumSha256);

    // Create full backup bundle
    const backup = env.portabilityStore.createBackupBundle();
    assert.equal(backup.format, PORTABLE_FORMATS.BACKUP);
    assert.equal(backup.schemaVersion, 1);
    assert.equal(backup.policy.sourceBooksIncluded, false);
    assert.ok(backup.policy.description.includes('Original publication files'));
    assert.ok(backup.manifest.checksums.librarySha256);
    assert.ok(backup.manifest.checksums.annotationsSha256);
    assert.ok(backup.manifest.checksums.notesSha256);
    assert.ok(backup.manifest.checksums.canvasesSha256);

    // Validates cleanly
    assert.doesNotThrow(() => validateBackupPackage(backup));
  } finally {
    env.cleanup();
  }
});

test('P12-T005 & P12-G002: Safe annotated PDF derivative export and source immutability', async () => {
  const env = setupTestEnvironment();
  try {
    // 1. Create a genuine, minimal valid PDF source file
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText('Read & Watch Canonical Source Test Document', {
      x: 50,
      y: 750,
      size: 14,
      font: helvetica,
    });
    const pdfBytes = await pdfDoc.save();

    const mediaDir = join(env.libraryRoot, 'items', 'test-book', 'media');
    mkdirSync(mediaDir, { recursive: true });
    const sourcePdfPath = join(mediaDir, 'test.pdf');
    writeFileSync(sourcePdfPath, Buffer.from(pdfBytes));

    const sourceStatPre = statSync(sourcePdfPath);
    const sourceShaPre = createHash('sha256').update(readFileSync(sourcePdfPath)).digest('hex');
    const sourceMtimePre = sourceStatPre.mtimeMs;

    // 2. Add an annotation matching the source PDF hash
    env.annotationStore.createAnnotation({
      itemId: env.testItemId,
      assetId: 'asset-1',
      kind: 'text-mark',
      anchor: {
        kind: 'pdf-text',
        pageNumber: 1,
        rects: [{ x: 0.1, y: 0.1, width: 0.5, height: 0.05 }],
        quote: 'Read & Watch Canonical Source Test Document',
        sourceHash: sourceShaPre,
      },
      content: { subKind: 'highlight', color: '#fbbf24' },
      sourceHash: sourceShaPre,
    });

    // Add a comment annotation
    env.annotationStore.createAnnotation({
      itemId: env.testItemId,
      assetId: 'asset-1',
      kind: 'comment',
      anchor: {
        kind: 'pdf-text',
        pageNumber: 1,
        rects: [{ x: 0.1, y: 0.1, width: 0.5, height: 0.05 }],
        quote: 'Read & Watch Canonical Source Test Document',
        sourceHash: sourceShaPre,
      },
      content: { body: 'Crucial verification point for derivative integrity.' },
      sourceHash: sourceShaPre,
    });

    // 3. Export annotated PDF derivative
    const targetDerivativePath = join(env.tempDir, 'output-annotated.pdf');
    const result = await env.portabilityStore.exportAnnotatedPdf({
      itemId: env.testItemId,
      targetPath: targetDerivativePath,
      includeCommentsSummaryPage: true,
    });

    assert.equal(result.ok, true);
    assert.ok(existsSync(targetDerivativePath));
    assert.equal(result.annotationsExported, 2);

    // 4. Independent Open Test: Load derivative independently
    const derivativeBytes = readFileSync(targetDerivativePath);
    const derivativeDoc = await PDFDocument.load(derivativeBytes);
    // Original was 1 page + 1 summary page = 2 pages
    assert.equal(derivativeDoc.getPageCount(), 2);
    assert.equal(derivativeDoc.getCreator(), 'Read & Watch');

    // 5. Refusal Guard: Attempting to overwrite source must fail
    await assert.rejects(
      () => env.portabilityStore.exportAnnotatedPdf({
        itemId: env.testItemId,
        targetPath: sourcePdfPath,
      }),
      { message: /Refusing to overwrite original source PDF/ },
    );

    // 6. Source Immutability Gate: verify original PDF is 100% byte-identical
    const sourceStatPost = statSync(sourcePdfPath);
    const sourceShaPost = createHash('sha256').update(readFileSync(sourcePdfPath)).digest('hex');
    assert.equal(sourceShaPost, sourceShaPre, 'Source SHA-256 must remain identical');
    assert.equal(sourceStatPost.size, sourceStatPre.size, 'Source file size must remain identical');
    assert.equal(sourceStatPost.mtimeMs, sourceMtimePre, 'Source mtime must remain identical');
  } finally {
    env.cleanup();
  }
});

test('P12-T007 & P12-G001/P12-G003: Restore preflight, conflict handling, and full round trip', () => {
  const envA = setupTestEnvironment();
  const envB = setupTestEnvironment(); // Clean second environment for round-trip

  try {
    // 1. Populate Env A with rich canonical data
    envA.annotationStore.createAnnotation({
      id: 'annot-roundtrip-1',
      itemId: envA.testItemId,
      assetId: 'asset-1',
      kind: 'text-mark',
      anchor: {
        kind: 'pdf-text',
        pageNumber: 1,
        rects: [{ x: 0.15, y: 0.25, width: 0.4, height: 0.04 }],
        quote: 'Round trip fidelity is guaranteed.',
        sourceHash: 'sha-roundtrip-test',
      },
      content: { subKind: 'underline', color: '#2563eb' },
      sourceHash: 'sha-roundtrip-test',
    });

    envA.readerStore.addBookmark(envA.testItemId, {
      id: 'bm-roundtrip-1',
      location: { kind: 'pdf', pageNumber: 5, progression: 0.5 },
      sourceHash: 'sha-roundtrip-test',
      label: 'Important Milestone',
    });

    envA.userDataStore.save('notes', envA.testItemId, '### Meeting Notes\n- All round trips verified.');

    const canvasA = envA.canvasStore.createCanvas({
      id: 'canvas-roundtrip-1',
      itemId: envA.testItemId,
      title: 'Canvas Roundtrip',
      scene: { elements: [{ id: 'elem-1', type: 'ellipse' }] },
    });
    envA.canvasStore.addCanvasLink(canvasA.canvasId, {
      elementId: 'elem-1',
      itemId: envA.testItemId,
      annotationId: 'annot-roundtrip-1',
      anchorJson: null,
      label: 'Linked Annotation',
    });

    // 2. Create full backup package from Env A
    const backupBundle = envA.portabilityStore.createBackupBundle();

    // 3. Preflight check on Env B
    const preflight = envB.portabilityStore.preflightRestore(backupBundle);
    assert.equal(preflight.canRestore, true);
    assert.equal(preflight.counts.incomingAnnotations, 1);
    assert.equal(preflight.counts.incomingBookmarks, 1);
    assert.equal(preflight.counts.incomingNotes, 1);
    assert.equal(preflight.counts.incomingCanvases, 1);

    // 4. Apply restore to clean Env B
    const restoreResult = envB.portabilityStore.applyRestore(backupBundle);
    assert.equal(restoreResult.ok, true);
    assert.equal(restoreResult.restoredCounts.annotations, 1);
    assert.equal(restoreResult.restoredCounts.bookmarks, 1);
    assert.equal(restoreResult.restoredCounts.notes, 1);
    assert.equal(restoreResult.restoredCounts.canvases, 1);
    assert.equal(restoreResult.searchRebuilt, true);

    // 5. Verify semantic equality in Env B
    const restoredAnnot = envB.annotationStore.getAnnotation('annot-roundtrip-1');
    assert.ok(restoredAnnot);
    assert.equal(restoredAnnot.anchor.quote, 'Round trip fidelity is guaranteed.');
    assert.equal(restoredAnnot.content.subKind, 'underline');

    const restoredBms = envB.readerStore.getBookmarks(envB.testItemId);
    assert.equal(restoredBms.length, 1);
    assert.equal(restoredBms[0].label, 'Important Milestone');

    const restoredNotes = envB.userDataStore.load('notes', envB.testItemId);
    assert.ok(restoredNotes.content.includes('All round trips verified.'));

    const restoredCanvas = envB.canvasStore.getCanvas('canvas-roundtrip-1');
    assert.ok(restoredCanvas);
    assert.equal(restoredCanvas.title, 'Canvas Roundtrip');
    assert.equal(restoredCanvas.links.length, 1);
    assert.equal(restoredCanvas.links[0].label, 'Linked Annotation');

    // 6. Verify rebuilt search index in Env B can locate restored notes
    const searchResults = envB.searchStore.search('round trips verified', { limit: 10 });
    assert.ok(searchResults.results.some((r) => r.title.includes('Mastering Portability') || r.snippet.includes('round trips verified')));

    // 7. Test Conflict: Second restore with identical data should skip
    const preflight2 = envB.portabilityStore.preflightRestore(backupBundle);
    assert.ok(preflight2.conflicts.some((c) => c.kind === 'IDENTICAL'));
    const restoreResult2 = envB.portabilityStore.applyRestore(backupBundle, { conflictResolution: 'skip' });
    assert.equal(restoreResult2.skippedCounts.annotations, 1);
    assert.equal(restoreResult2.restoredCounts.annotations, 0);
  } finally {
    envA.cleanup();
    envB.cleanup();
  }
});

test('P12-T004 extension: saved views and relationships round-trip through backup', () => {
  const envA = setupTestEnvironment();
  const envB = setupTestEnvironment();
  try {
    envA.libraryStore.saveView('Recovered View', {
      collection: 'read',
      status: 'reading',
    });
    envA.libraryStore.restoreLibraryState({
      schemaVersion: 1,
      savedViews: [],
      relationships: [{
        id: 'relationship-roundtrip-1',
        sourceItemId: envA.testItemId,
        targetItemId: null,
        targetExternal: { kind: 'url', value: 'https://example.test/source' },
        relationshipType: 'cites',
        direction: 'undirected',
        position: 3,
        provenance: { source: 'backup-test' },
        createdAtUtc: '2026-01-01T00:00:00.000Z',
      }],
    }, { conflictResolution: 'overwrite' });

    const backup = envA.portabilityStore.createBackupBundle();
    assert.equal(backup.libraryState.savedViews.length, 1);
    assert.equal(backup.libraryState.relationships.length, 1);
    assert.equal(backup.manifest.memberCounts.savedViews, 1);
    assert.equal(backup.manifest.memberCounts.relationships, 1);
    assert.ok(backup.manifest.checksums.libraryStateSha256);
    assert.doesNotThrow(() => validateBackupPackage(backup));

    const preflight = envB.portabilityStore.preflightRestore(backup);
    assert.equal(preflight.counts.incomingSavedViews, 1);
    assert.equal(preflight.counts.incomingRelationships, 1);
    const restored = envB.portabilityStore.applyRestore(backup);
    assert.equal(restored.restoredCounts.savedViews, 1);
    assert.equal(restored.restoredCounts.relationships, 1);
    assert.equal(envB.libraryStore.listViews().length, 1);
    assert.equal(envB.libraryStore.listRelationships().length, 1);
    assert.equal(envB.libraryStore.listRelationships()[0].targetExternal.value, 'https://example.test/source');

    const second = envB.portabilityStore.applyRestore(backup, { conflictResolution: 'skip' });
    assert.equal(second.skippedCounts.savedViews, 1);
    assert.equal(second.skippedCounts.relationships, 1);
    assert.equal(envB.libraryStore.listViews().length, 1);
    assert.equal(envB.libraryStore.listRelationships().length, 1);

    const oldBackup = JSON.parse(JSON.stringify(backup));
    delete oldBackup.libraryState;
    delete oldBackup.manifest.checksums.libraryStateSha256;
    assert.doesNotThrow(() => validateBackupPackage(oldBackup));
  } finally {
    envA.cleanup();
    envB.cleanup();
  }
});
