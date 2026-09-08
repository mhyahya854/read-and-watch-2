import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { createReaderStore } from '../server/reader-store.mjs';

const READ_ID = 'read-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SECOND_READ_ID = 'read-cccccccccccccccccccccccccccccccc';
const WATCH_ID = 'watch-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function writeRelative(root, relativePath, content = 'book bytes') {
  const target = join(root, ...relativePath.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

function makeItem({
  id = READ_ID,
  collection = 'read',
  itemPath = 'Read/Test-Book/item.md',
  media = [],
} = {}) {
  return { id, collection, itemPath, media };
}

function setup(t, { items, files = {}, launchReader } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rw-reader-'));
  const libraryRoot = join(root, 'library');
  const catalogPath = join(libraryRoot, 'catalog.json');
  const readerExecutable = join(root, 'runtime', 'readest.exe');
  mkdirSync(libraryRoot, { recursive: true });
  writeFileSync(
    catalogPath,
    JSON.stringify({
      schemaVersion: 1,
      items: items ?? [
        makeItem({
          media: [
            {
              name: 'test.epub',
              path: 'Read/Test-Book/media/test.epub',
              extension: '.epub',
            },
          ],
        }),
        makeItem({
          id: WATCH_ID,
          collection: 'watch',
          itemPath: 'Watch/Test/item.md',
        }),
      ],
    }),
  );
  for (const [relativePath, content] of Object.entries(files)) {
    writeRelative(libraryRoot, relativePath, content);
  }
  writeRelative(root, 'runtime/readest.exe', 'reader executable');
  const launches = [];
  const store = createReaderStore({
    libraryRoot,
    catalogPath,
    readerExecutable,
    launchReader:
      launchReader ??
      ((executable, source) => {
        launches.push({ executable, source });
      }),
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { store, launches, libraryRoot, readerExecutable };
}

test('valid Read item resolves one supported local book', (t) => {
  const { store } = setup(t, {
    files: { 'Read/Test-Book/media/test.epub': 'epub bytes' },
  });
  const status = store.getStatus(READ_ID);
  assert.equal(status.state, 'available');
  assert.equal(status.readerReady, true);
  assert.equal(status.candidates.length, 1);
  assert.deepEqual(
    { name: status.candidates[0].name, format: status.candidates[0].format },
    { name: 'test.epub', format: 'EPUB' },
  );
  assert.equal('path' in status.candidates[0], false);
});

test('Watch items are rejected', (t) => {
  const { store } = setup(t);
  assert.throws(() => store.getStatus(WATCH_ID), /Read items only/);
});

test('nonexistent item is rejected', (t) => {
  const { store } = setup(t);
  assert.throws(() => store.getStatus(SECOND_READ_ID), /Unknown item ID/);
});

test('malformed and path-like IDs are rejected', (t) => {
  const { store } = setup(t);
  for (const itemId of [
    'read-short',
    'READ-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '../../read-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'read-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/../book',
    'C:\\book.epub',
    null,
  ]) {
    assert.throws(() => store.getStatus(itemId), /Invalid item ID/);
  }
});

test('catalog traversal and absolute media paths are rejected', (t) => {
  for (const unsafePath of [
    'Read/Test-Book/media/../../outside.epub',
    '../outside.epub',
    'C:\\outside.epub',
    '/outside.epub',
  ]) {
    const { store } = setup(t, {
      items: [
        makeItem({
          media: [
            { name: 'outside.epub', path: unsafePath, extension: '.epub' },
          ],
        }),
      ],
    });
    assert.throws(() => store.getStatus(READ_ID), /Unsafe catalog media path/);
  }
});

test('supported readable file opens through the injected launcher', async (t) => {
  const { store, launches, libraryRoot, readerExecutable } = setup(t, {
    files: { 'Read/Test-Book/media/test.epub': 'epub bytes' },
  });
  const opened = await store.open(READ_ID);
  assert.equal(opened.ok, true);
  assert.equal(opened.name, 'test.epub');
  assert.deepEqual(launches, [
    {
      executable: readerExecutable,
      source: join(libraryRoot, 'Read', 'Test-Book', 'media', 'test.epub'),
    },
  ]);
});

test('unsupported format is reported safely and cannot launch', async (t) => {
  const items = [
    makeItem({
      media: [
        {
          name: 'preview.jpg',
          path: 'Read/Test-Book/media/preview.jpg',
          extension: '.jpg',
        },
      ],
    }),
  ];
  const { store, launches } = setup(t, {
    items,
    files: { 'Read/Test-Book/media/preview.jpg': 'image bytes' },
  });
  const status = store.getStatus(READ_ID);
  assert.equal(status.state, 'unsupported');
  assert.deepEqual(status.unsupported, [
    { name: 'preview.jpg', format: 'JPG' },
  ]);
  assert.equal('path' in status.unsupported[0], false);
  await assert.rejects(store.open(READ_ID), /No supported local book/);
  assert.equal(launches.length, 0);
});

test('multiple readable candidates require an explicit opaque candidate ID', async (t) => {
  const items = [
    makeItem({
      media: [
        {
          name: 'one.epub',
          path: 'Read/Test-Book/media/one.epub',
          extension: '.epub',
        },
        {
          name: 'two.pdf',
          path: 'Read/Test-Book/media/two.pdf',
          extension: '.pdf',
        },
      ],
    }),
  ];
  const { store, launches } = setup(t, {
    items,
    files: {
      'Read/Test-Book/media/one.epub': 'one',
      'Read/Test-Book/media/two.pdf': 'two',
    },
  });
  const status = store.getStatus(READ_ID);
  assert.equal(status.state, 'multiple');
  assert.equal(status.candidates.length, 2);
  await assert.rejects(store.open(READ_ID), /Choose a book candidate/);
  assert.equal(launches.length, 0);
  await store.open(READ_ID, status.candidates[1].id);
  assert.equal(launches.length, 1);
  assert.match(launches[0].source, /two\.pdf$/);
});

test('catalog-declared missing book is reported and cannot launch', async (t) => {
  const { store, launches } = setup(t);
  const status = store.getStatus(READ_ID);
  assert.equal(status.state, 'missing');
  assert.deepEqual(status.missing, [{ name: 'test.epub', format: 'EPUB' }]);
  await assert.rejects(store.open(READ_ID), /No supported local book/);
  assert.equal(launches.length, 0);
});

test('launch bridge does not alter source bytes or modification time', async (t) => {
  const { store, libraryRoot } = setup(t, {
    files: { 'Read/Test-Book/media/test.epub': 'immutable source bytes' },
  });
  const source = join(libraryRoot, 'Read', 'Test-Book', 'media', 'test.epub');
  const beforeStat = statSync(source);
  const beforeHash = createHash('sha256')
    .update(readFileSync(source))
    .digest('hex');
  await store.open(READ_ID);
  const afterStat = statSync(source);
  const afterHash = createHash('sha256')
    .update(readFileSync(source))
    .digest('hex');
  assert.equal(afterHash, beforeHash);
  assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs);
});

test('generic ZIP is classified as unknown and never launched', async (t) => {
  const items = [
    makeItem({
      media: [
        {
          name: 'unknown.zip',
          path: 'Read/Test-Book/media/unknown.zip',
          extension: '.zip',
        },
      ],
    }),
  ];
  const { store, launches } = setup(t, {
    items,
    files: { 'Read/Test-Book/media/unknown.zip': 'not inspected' },
  });
  const status = store.getStatus(READ_ID);
  assert.equal(status.state, 'unsupported');
  assert.deepEqual(status.unsupported, [
    { name: 'unknown.zip', format: 'ZIP' },
  ]);
  await assert.rejects(store.open(READ_ID), /No supported local book/);
  assert.equal(launches.length, 0);
});
