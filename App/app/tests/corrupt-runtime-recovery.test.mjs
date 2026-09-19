/**
 * Synthetic corrupt-runtime disaster tests. No real library data is touched.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createAnnotationStore } from '../server/annotation-store.mjs';
import { createCanvasStore } from '../server/canvas-store.mjs';
import { createKnowledgeStore } from '../server/knowledge-store.mjs';
import { createLibraryStore } from '../server/library-store.mjs';
import { createReaderStore } from '../server/reader-store.mjs';
import { createSearchStore } from '../server/search-store.mjs';
import { rebuildPortableLibrary } from '../server/portable-rebuild.mjs';
import {
  PORTABLE_RECOVERY_CODES,
  PORTABLE_RECOVERY_STATUS,
  runPortableStartupRecovery,
} from '../server/portable-recovery.mjs';
import { recoverCorruptRuntime } from '../server/corrupt-runtime-recovery.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function titleMarkdown({ id, collection, title, extra = '' }) {
  return `---
schema_version: 1
id: "${id}"
collection: "${collection}"
title: "${title}"
status: "${collection === 'Read' ? 'unread' : 'to_watch'}"
${extra}---

# ${title}

## ${collection === 'Read' ? 'Overview' : 'My Description'}

Body.
`;
}

async function fullFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rw-corrupt-runtime-'));
  const readDir = join(root, 'Read', 'Books', 'Read Book (2020)');
  const watchDir = join(root, 'Watch', 'Movies', 'Watch Movie (2001)');
  mkdirSync(join(readDir, 'Files'), { recursive: true });
  mkdirSync(watchDir, { recursive: true });
  const pdf = Buffer.from('SYNTHETIC PDF BYTES');
  writeFileSync(join(readDir, 'Files', 'book.pdf'), pdf);
  writeFileSync(join(readDir, 'Read Book (2020).md'), titleMarkdown({
    id: 'read-0123456789abcdef',
    collection: 'Read',
    title: 'Read Book',
    extra: `files:
  - name: "book.pdf"
    path: "Files/book.pdf"
    format: "PDF"
    size: ${pdf.length}
`,
  }));
  writeFileSync(join(watchDir, 'Watch Movie (2001).md'), titleMarkdown({
    id: 'watch-fedcba9876543210',
    collection: 'Watch',
    title: 'Watch Movie',
    extra: 'type: "movie"\n',
  }));

  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  const userDataRoot = join(root, 'App', 'user-data');
  await rebuildPortableLibrary({ root, databasePath, apply: true });

  const readId = 'read-0123456789abcdef';
  const watchId = 'watch-fedcba9876543210';
  const database = new DatabaseSync(databasePath);
  const assetId = database
    .prepare(
      "SELECT id FROM item_assets WHERE item_id=? AND relative_path LIKE '%book.pdf'",
    )
    .get(readId).id;
  database.close();

  const annotationStore = createAnnotationStore({ databasePath, userDataRoot });
  const annotation = annotationStore.createAnnotation({
    itemId: readId,
    assetId,
    kind: 'highlight',
    anchor: { pageNumber: 1, rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
    content: { text: 'Highlighted text' },
    sourceHash: sha256(pdf),
  });
  annotationStore.close();

  const canvasStore = createCanvasStore({ databasePath, userDataRoot });
  const canvas = canvasStore.createCanvas({
    id: 'canvas-1',
    itemId: readId,
    title: 'Recovered Canvas',
  });
  canvasStore.addCanvasLink('canvas-1', {
    elementId: 'element-1',
    itemId: readId,
    annotationId: annotation.id,
    label: 'linked highlight',
  });
  canvasStore.saveCanvasAsset('canvas-1', {
    originalName: 'image.png',
    mimeType: 'image/png',
    buffer: Buffer.from('SYNTHETIC PNG BYTES'),
  });
  canvasStore.close();

  const knowledgeStore = createKnowledgeStore({ databasePath, userDataRoot });
  knowledgeStore.createGraph({
    id: 'graph-1',
    title: 'Recovered Graph',
    associatedItemId: watchId,
    nodes: [{ id: 'node-1', label: 'Node One' }],
    edges: [],
  });
  knowledgeStore.createDiagram({
    id: 'diagram-1',
    title: 'Recovered Diagram',
    associatedItemId: watchId,
    diagramType: 'flowchart',
    sourceText: 'graph TD\n  A --> B',
  });
  knowledgeStore.close();

  mkdirSync(join(userDataRoot, 'items', readId), { recursive: true });
  writeFileSync(join(userDataRoot, 'items', readId, 'notes.md'), 'Recovered note body.\n');
  writeFileSync(join(userDataRoot, 'items', readId, 'thoughts.md'), 'Recovered thought body.\n');
  writeFileSync(
    join(userDataRoot, 'items', readId, 'bookmarks.json'),
    JSON.stringify([{ id: 'bm-1', itemId: readId, label: 'Bookmark', pageNumber: 2 }]),
  );
  writeFileSync(
    join(userDataRoot, 'items', readId, 'reading-state.json'),
    JSON.stringify({ pageNumber: 4, progression: 0.2 }),
  );
  writeFileSync(
    join(userDataRoot, 'app-settings.json'),
    JSON.stringify({ schemaVersion: 1, theme: 'dark' }),
  );
  writeFileSync(
    join(userDataRoot, 'reader-settings.json'),
    JSON.stringify({ schemaVersion: 1, fontSize: 19 }),
  );

  const libraryStore = createLibraryStore({
    databasePath,
    portableRoot: root,
    portableBackupRoot: join(root, 'App', 'backups'),
  });
  libraryStore.saveView('Recovered View', { collection: 'read', status: 'unread' });
  libraryStore.addRelationship(readId, watchId, 'related_to', 1);
  libraryStore.close();

  const markdownHash = sha256(readFileSync(join(readDir, 'Read Book (2020).md')));
  const pdfHash = sha256(readFileSync(join(readDir, 'Files', 'book.pdf')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    databasePath,
    userDataRoot,
    readId,
    watchId,
    annotationId: annotation.id,
    canvasId: 'canvas-1',
    graphId: 'graph-1',
    diagramId: 'diagram-1',
    markdownHash,
    pdfHash,
  };
}

function corruptBytes(databasePath, { keepSidecars = false } = {}) {
  if (!keepSidecars) {
    rmSync(`${databasePath}-wal`, { force: true });
    rmSync(`${databasePath}-shm`, { force: true });
    rmSync(`${databasePath}-journal`, { force: true });
  }
  writeFileSync(databasePath, Buffer.from('NOT A SQLITE DATABASE '.repeat(200)));
}

function truncateDatabase(databasePath) {
  rmSync(`${databasePath}-wal`, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-journal`, { force: true });
  const bytes = readFileSync(databasePath);
  writeFileSync(databasePath, bytes.subarray(0, Math.max(1, Math.floor(bytes.length / 3))));
}

test('full synthetic disaster recovery reconstructs portable and file-first user state', async (t) => {
  const fx = await fullFixture(t);
  corruptBytes(fx.databasePath);

  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });

  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_CORRUPT_RUNTIME);
  assert.equal(result.counts.portableItemsRecovered, 2);
  assert.equal(result.counts.annotationsRecovered, 1);
  assert.equal(result.counts.canvasesRecovered, 1);
  assert.equal(result.counts.canvasAssetsRecovered, 1);
  assert.equal(result.counts.knowledgeGraphsRecovered, 1);
  assert.equal(result.counts.mermaidDocumentsRecovered, 1);
  assert.equal(result.counts.notesRecoveredOrFileBacked, 2);
  assert.equal(result.partial, false);
  assert.equal(result.counts.savedViewsRecovered, 1);
  assert.equal(result.counts.relationshipsRecovered, 1);

  const libraryStore = createLibraryStore({ databasePath: fx.databasePath, readOnly: true });
  const catalog = libraryStore.getUiCatalog();
  assert.equal(catalog.items.length, 2);
  assert.ok(catalog.items.some((item) => item.id === fx.readId));
  assert.ok(catalog.items.some((item) => item.id === fx.watchId));
  assert.equal(libraryStore.loadNote('notes', fx.readId).content, 'Recovered note body.\n');
  assert.equal(libraryStore.loadNote('thoughts', fx.readId).content, 'Recovered thought body.\n');
  assert.equal(libraryStore.listViews().length, 1);
  assert.equal(libraryStore.listRelationships().length, 1);
  libraryStore.close();

  const annotationStore = createAnnotationStore({
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(annotationStore.getAnnotations(fx.readId).length, 1);
  annotationStore.close();

  const canvasStore = createCanvasStore({
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  const canvas = canvasStore.getCanvas(fx.canvasId);
  assert.equal(canvas.links.length, 1);
  assert.equal(canvas.assets.length, 1);
  canvasStore.close();

  const knowledgeStore = createKnowledgeStore({
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(knowledgeStore.getGraph(fx.graphId).title, 'Recovered Graph');
  assert.equal(knowledgeStore.getDiagram(fx.diagramId).title, 'Recovered Diagram');
  assert.equal(
    knowledgeStore.getGraph(fx.graphId).associatedItemId,
    fx.watchId,
    'title ownership must survive a corrupt-runtime staged recovery',
  );
  assert.equal(
    knowledgeStore.getDiagram(fx.diagramId).associatedItemId,
    fx.watchId,
    'diagram ownership must survive a corrupt-runtime staged recovery',
  );
  assert.equal(
    knowledgeStore.listGraphs({ associatedItemId: fx.readId }).length,
    0,
    'recovered graphs must not be reassigned to another title',
  );
  knowledgeStore.close();

  const readerStore = createReaderStore({
    libraryRoot: join(fx.root, 'App', 'library'),
    portableRoot: fx.root,
    libraryDatabasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(readerStore.getBookmarks(fx.readId).length, 1);
  assert.equal(readerStore.getReadingState(fx.readId).pageNumber, 4);

  const searchStore = createSearchStore({
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(searchStore.getStatus().counts.items, 2);
  searchStore.close();

  assert.equal(sha256(readFileSync(join(fx.root, 'Read', 'Books', 'Read Book (2020)', 'Read Book (2020).md'))), fx.markdownHash);
  assert.equal(sha256(readFileSync(join(fx.root, 'Read', 'Books', 'Read Book (2020)', 'Files', 'book.pdf'))), fx.pdfHash);
  assert.equal(
    readFileSync(join(fx.userDataRoot, 'app-settings.json'), 'utf8'),
    JSON.stringify({ schemaVersion: 1, theme: 'dark' }),
  );
  assert.equal(existsSync(join(fx.root, 'App', 'backups', 'corrupt-runtime')), true);
});

test('a pre-mirror corrupt database keeps honest partial compatibility', async (t) => {
  const fx = await fullFixture(t);
  rmSync(join(fx.userDataRoot, 'library-state.json'), { force: true });
  corruptBytes(fx.databasePath);
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_CORRUPT_RUNTIME);
  assert.equal(result.partial, true);
  assert.ok(result.limitations.some((item) => item.includes('saved_views')));
  assert.ok(result.limitations.some((item) => item.includes('relationships')));
});

test('truncated SQLite database follows the same recovery path', async (t) => {
  const fx = await fullFixture(t);
  truncateDatabase(fx.databasePath);
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_CORRUPT_RUNTIME);
  assert.equal(result.counts.items, 2);
});

test('SQLite family sidecars are preserved in the forensic backup', async (t) => {
  const fx = await fullFixture(t);
  writeFileSync(`${fx.databasePath}-wal`, 'SYNTHETIC WAL');
  writeFileSync(`${fx.databasePath}-shm`, 'SYNTHETIC SHM');
  corruptBytes(fx.databasePath, { keepSidecars: true });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_CORRUPT_RUNTIME);
  const backupRoot = join(fx.root, 'App', 'backups', 'corrupt-runtime');
  const capture = readdirSync(backupRoot)[0];
  const manifest = JSON.parse(readFileSync(join(backupRoot, capture, 'manifest.json'), 'utf8'));
  assert.ok(manifest.files.some((file) => file.name.endsWith('-wal')));
  assert.ok(manifest.files.some((file) => file.name.endsWith('-shm')));
});

test('an unwritable backup destination leaves the corrupt database untouched', async (t) => {
  const fx = await fullFixture(t);
  corruptBytes(fx.databasePath);
  const before = sha256(readFileSync(fx.databasePath));
  const blocker = join(fx.root, 'App', 'backups');
  rmSync(blocker, { recursive: true, force: true });
  writeFileSync(blocker, 'blocked');
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.CORRUPT_RUNTIME_BACKUP_FAILED);
  assert.equal(sha256(readFileSync(fx.databasePath)), before);
});

test('a backup hash mismatch refuses activation', async (t) => {
  const fx = await fullFixture(t);
  corruptBytes(fx.databasePath);
  const before = sha256(readFileSync(fx.databasePath));
  const result = await recoverCorruptRuntime({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
    hooks: {
      beforeBackupVerify: ({ backup }) => {
        writeFileSync(backup, 'TAMPERED BACKUP');
      },
    },
  });
  assert.equal(result.code, 'CORRUPT_RUNTIME_BACKUP_FAILED');
  assert.equal(sha256(readFileSync(fx.databasePath)), before);
});

test('duplicate portable ids refuse staged recovery and preserve the corrupt database', async (t) => {
  const fx = await fullFixture(t);
  const duplicate = join(fx.root, 'Read', 'Books', 'Duplicate (2021)');
  mkdirSync(duplicate, { recursive: true });
  writeFileSync(join(duplicate, 'Duplicate (2021).md'), titleMarkdown({
    id: fx.readId,
    collection: 'Read',
    title: 'Duplicate',
  }));
  corruptBytes(fx.databasePath);
  const before = sha256(readFileSync(fx.databasePath));
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.CORRUPT_RUNTIME_STAGING_FAILED);
  assert.equal(sha256(readFileSync(fx.databasePath)), before);
});

test('malformed file-first recovery files refuse silent success', async (t) => {
  for (const relatives of [
    [['items', 'read-0123456789abcdef', 'annotations.json']],
    [
      ['canvases', 'canvas-1', 'canvas.json'],
      ['canvases', 'canvas-1', 'recovery.json'],
    ],
    [['knowledge', 'graphs', 'graph-1.json']],
  ]) {
    const fx = await fullFixture(t);
    for (const relative of relatives) {
      writeFileSync(join(fx.userDataRoot, ...relative), '{ malformed');
    }
    corruptBytes(fx.databasePath);
    const result = await runPortableStartupRecovery({
      root: fx.root,
      databasePath: fx.databasePath,
      userDataRoot: fx.userDataRoot,
    });
    assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
    assert.equal(result.code, PORTABLE_RECOVERY_CODES.CORRUPT_RUNTIME_USER_STATE_INCOMPLETE);
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('newer readable schema is not treated as corruption', async (t) => {
  const fx = await fullFixture(t);
  const database = new DatabaseSync(fx.databasePath);
  database.exec('PRAGMA user_version = 999');
  database.close();
  const before = sha256(readFileSync(fx.databasePath));
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RUNTIME_SCHEMA_UNSUPPORTED);
  assert.equal(sha256(readFileSync(fx.databasePath)), before);
  assert.equal(existsSync(join(fx.root, 'App', 'backups', 'corrupt-runtime')), false);
});

test('healthy database keeps the fast path and creates no corrupt backup', async (t) => {
  const fx = await fullFixture(t);
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.HEALTHY);
  assert.equal(result.metrics.portableRootScanned, false);
  assert.equal(existsSync(join(fx.root, 'App', 'backups', 'corrupt-runtime')), false);
});

test('staged integrity, foreign key, search and activation failures do not activate', async (t) => {
  const cases = [
    ['integrity', {
      beforeIntegrityCheck: ({ stagingPath }) => {
        const database = new DatabaseSync(stagingPath);
        database.exec('DROP TABLE annotations');
        database.close();
      },
    }, 'CORRUPT_RUNTIME_INTEGRITY_FAILED'],
    ['foreign-key', {
      beforeIntegrityCheck: ({ stagingPath }) => {
        const database = new DatabaseSync(stagingPath);
        database.exec('PRAGMA foreign_keys = OFF');
        database
          .prepare("INSERT INTO item_assets(id,item_id,relative_path,display_name,extension) VALUES('bad','missing','missing','missing','')")
          .run();
        database.close();
      },
    }, 'CORRUPT_RUNTIME_INTEGRITY_FAILED'],
    ['search', {
      beforeSearchRebuild: () => {
        throw new Error('synthetic search failure');
      },
    }, 'CORRUPT_RUNTIME_STAGING_FAILED'],
    ['activation', {
      beforeActivation: () => {
        throw new Error('synthetic activation failure');
      },
    }, 'CORRUPT_RUNTIME_ACTIVATION_FAILED'],
  ];
  for (const [name, hooks, expected] of cases) {
    const fx = await fullFixture(t);
    corruptBytes(fx.databasePath);
    const result = await recoverCorruptRuntime({
      root: fx.root,
      databasePath: fx.databasePath,
      userDataRoot: fx.userDataRoot,
      hooks,
    });
    assert.equal(result.code, expected, name);
    assert.equal(existsSync(join(fx.root, 'App', 'backups', 'corrupt-runtime')), true, name);
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('a successful corrupt recovery leaves the next startup HEALTHY', async (t) => {
  const fx = await fullFixture(t);
  corruptBytes(fx.databasePath);
  const first = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(first.code, PORTABLE_RECOVERY_CODES.RECOVERED_CORRUPT_RUNTIME);
  const second = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(second.status, PORTABLE_RECOVERY_STATUS.HEALTHY);
  assert.equal(second.metrics.portableRootScanned, false);
});
