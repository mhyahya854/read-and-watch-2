/**
 * Synthetic portable-library fixtures only — no real titles, paths or hashes.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createSearchStore } from '../server/search-store.mjs';
import { rebuildPortableLibrary } from '../server/portable-rebuild.mjs';

function document({ id, collection, title, extra = '', body = '' }) {
  return `---
schema_version: 1
id: "${id}"
collection: "${collection}"
title: "${title}"
status: "${collection === 'Read' ? 'unread' : 'to_watch'}"
${extra}---

# ${title}

## ${collection === 'Read' ? 'Overview' : 'My Description'}

${body}
`;
}

async function fixtureRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'rw-portable-rebuild-'));
  const cleanup = { database: null };
  t.after(async () => {
    try {
      cleanup.database?.close();
    } catch {
      // A test may have closed it; cleanup is best-effort.
    }
    try {
      cleanup.close?.();
    } catch {
      // A test may have closed it; cleanup is best-effort.
    }
    await rm(root, { recursive: true, force: true });
  });
  return { root, cleanup };
}

test('fresh rebuild projects Read and Watch with derived categories and assets', async (t) => {
  const { root, cleanup } = await fixtureRoot(t);
  const read = join(root, 'Read', 'Books', 'A Book (2020)');
  const watch = join(root, 'Watch', 'Movies', 'A Movie (2001)', 'Media');
  await mkdir(join(read, 'Files'), { recursive: true });
  await mkdir(watch, { recursive: true });
  await writeFile(join(read, 'Files', 'book.pdf'), 'PDF-BYTES');
  await writeFile(join(watch, 'A Movie (2001).mp4'), 'VIDEO-BYTES');
  await writeFile(join(read, 'A Book (2020).md'), document({
    id: 'read-0123456789abcdef',
    collection: 'Read',
    title: 'A Book',
    extra: `files:
  - name: "book.pdf"
    path: "Files/book.pdf"
    format: "PDF"
    size: 9
    sha256: "${'0'.repeat(64)}"
`,
  }));
  await writeFile(join(root, 'Watch', 'Movies', 'A Movie (2001)', 'A Movie (2001).md'), document({
    id: 'watch-fedcba9876543210',
    collection: 'Watch',
    title: 'A Movie',
    extra: 'type: "movie"\n',
  }));

  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  const result = await rebuildPortableLibrary({ root, databasePath, apply: true });
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.counts, { read: 1, watch: 1, total: 2 });

  const database = new DatabaseSync(databasePath);
  cleanup.database = database;
  assert.deepEqual(
    database.prepare('SELECT id,collection,item_path FROM items ORDER BY id').all().map((row) => ({
      id: row.id,
      collection: row.collection,
      path: row.item_path,
    })),
    [
      { id: 'read-0123456789abcdef', collection: 'read', path: 'Read/Books/A Book (2020)' },
      { id: 'watch-fedcba9876543210', collection: 'watch', path: 'Watch/Movies/A Movie (2001)' },
    ],
  );
  assert.deepEqual(
    database.prepare("SELECT property_key,value_json FROM item_properties WHERE item_id='read-0123456789abcdef' AND namespace='portable' ORDER BY property_key").all().map((row) => [row.property_key, JSON.parse(row.value_json)]).filter(([key]) => key === 'category'),
    [['category', 'Books']],
  );
  assert.equal(
    database.prepare("SELECT count(*) AS n FROM item_assets WHERE item_id='read-0123456789abcdef'").get().n,
    1,
  );
  assert.equal(
    database.prepare("SELECT count(*) AS n FROM item_assets WHERE item_id='watch-fedcba9876543210' AND relative_path LIKE '%Media/%'").get().n,
    1,
  );
});

test('rebuild is idempotent and does not change revisions on a second run', async (t) => {
  const { root, cleanup } = await fixtureRoot(t);
  const title = join(root, 'Read', 'Books', 'A Book (2020)');
  await mkdir(title, { recursive: true });
  await writeFile(join(title, 'A Book (2020).md'), document({
    id: 'read-0123456789abcdef',
    collection: 'Read',
    title: 'A Book',
  }));
  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  await rebuildPortableLibrary({ root, databasePath, apply: true });
  const database = new DatabaseSync(databasePath);
  cleanup.database = database;
  const before = database.prepare('SELECT id,revision FROM items ORDER BY id').all();
  const second = await rebuildPortableLibrary({ root, databasePath, apply: true });
  const after = database.prepare('SELECT id,revision FROM items ORDER BY id').all();
  assert.equal(second.changed, 0);
  assert.deepEqual(after, before);
});

test('rename and category move preserve stable identity', async (t) => {
  const { root, cleanup } = await fixtureRoot(t);
  const original = join(root, 'Read', 'Books', 'A Book (2020)');
  await mkdir(original, { recursive: true });
  await writeFile(join(original, 'A Book (2020).md'), document({
    id: 'read-0123456789abcdef',
    collection: 'Read',
    title: 'A Book',
  }));
  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  await rebuildPortableLibrary({ root, databasePath, apply: true });

  const moved = join(root, 'Read', 'Study Materials', 'A Book Renamed (2020)');
  await mkdir(join(root, 'Read', 'Study Materials'), { recursive: true });
  await rename(original, moved);
  await rename(join(moved, 'A Book (2020).md'), join(moved, 'A Book Renamed (2020).md'));
  const second = await rebuildPortableLibrary({ root, databasePath, apply: true });
  assert.equal(second.status, 'passed');
  assert.deepEqual(second.counts, { read: 1, watch: 0, total: 1 });

  const database = new DatabaseSync(databasePath);
  cleanup.database = database;
  const item = database.prepare("SELECT id,item_path FROM items WHERE id='read-0123456789abcdef'").get();
  assert.equal(item.item_path, 'Read/Study Materials/A Book Renamed (2020)');
  assert.equal(
    JSON.parse(
      database
        .prepare("SELECT value_json FROM item_properties WHERE item_id='read-0123456789abcdef' AND namespace='portable' AND property_key='category'")
        .get().value_json,
    ),
    'Study Materials',
  );
});

test('duplicate stable ids fail closed without touching the database', async (t) => {
  const { root, cleanup } = await fixtureRoot(t);
  for (const folder of ['A', 'B']) {
    const title = join(root, 'Read', 'Books', folder);
    await mkdir(title, { recursive: true });
    await writeFile(join(title, `${folder}.md`), document({
      id: 'read-0123456789abcdef',
      collection: 'Read',
      title: folder,
    }));
  }
  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  const result = await rebuildPortableLibrary({ root, databasePath, apply: true });
  assert.equal(result.ok, false);
  assert.equal(result.duplicateIds.length, 1);
  void cleanup;
  assert.equal(existsSync(databasePath), false);
});

test('one malformed required identity is isolated as a diagnostic', async (t) => {
  const { root, cleanup } = await fixtureRoot(t);
  void cleanup;
  const good = join(root, 'Read', 'Books', 'Good');
  const bad = join(root, 'Read', 'Books', 'Bad');
  await mkdir(good, { recursive: true });
  await mkdir(bad, { recursive: true });
  await writeFile(join(good, 'Good.md'), document({
    id: 'read-0123456789abcdef',
    collection: 'Read',
    title: 'Good',
  }));
  await writeFile(join(bad, 'Bad.md'), '---\nschema_version: 1\ncollection: "Read"\ntitle: "Bad"\n---\n\nbody\n');
  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  const result = await rebuildPortableLibrary({ root, databasePath, apply: true });
  assert.equal(result.status, 'partial');
  assert.equal(result.counts.total, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.diagnostics.some((entry) => entry.code === 'INVALID_STABLE_ID'), true);
  assert.equal(JSON.stringify(result.diagnostics).includes(root), false);
});

test('search rebuild indexes portable items', async (t) => {
  const { root, cleanup } = await fixtureRoot(t);
  const title = join(root, 'Read', 'Books', 'A Book (2020)');
  await mkdir(title, { recursive: true });
  await writeFile(join(title, 'A Book (2020).md'), document({
    id: 'read-0123456789abcdef',
    collection: 'Read',
    title: 'A Book',
    body: 'Searchable body text.',
  }));
  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  const searchStore = createSearchStore({
    databasePath,
    userDataRoot: join(root, 'App', 'user-data'),
  });
  cleanup.close = () => searchStore.close();
  const result = await rebuildPortableLibrary({ root, databasePath, searchStore, apply: true });
  assert.equal(result.status, 'passed');
  assert.equal(searchStore.getStatus().counts.items, 1);
  assert.equal(searchStore.search({ query: 'A Book' }).results.length, 1);
});

test('asset traversal is rejected and source binaries are not modified', async (t) => {
  const { root, cleanup } = await fixtureRoot(t);
  const title = join(root, 'Read', 'Books', 'A Book (2020)');
  await mkdir(join(title, 'Files'), { recursive: true });
  const source = join(title, 'Files', 'book.pdf');
  await writeFile(source, 'IMMUTABLE-BYTES');
  const before = createHash('sha256').update(await readFile(source)).digest('hex');
  await writeFile(join(title, 'A Book (2020).md'), document({
    id: 'read-0123456789abcdef',
    collection: 'Read',
    title: 'A Book',
    extra: `files:
  - name: "book.pdf"
    path: "Files/book.pdf"
    format: "PDF"
  - name: "escape.pdf"
    path: "../../../../outside.pdf"
    format: "PDF"
`,
  }));
  const result = await rebuildPortableLibrary({
    root,
    databasePath: join(root, 'App', 'state', 'read-watch.sqlite3'),
    apply: true,
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.diagnostics.some((entry) => entry.code === 'PATH_ESCAPE'), true);
  assert.equal(result.skipped.length, 1);
  assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'), before);
  const database = new DatabaseSync(join(root, 'App', 'state', 'read-watch.sqlite3'));
  cleanup.database = database;
  assert.equal(database.prepare('SELECT count(*) AS n FROM item_assets').get().n, 0);
});

test('a symlink escape is skipped rather than followed', async (t) => {
  const { root, cleanup } = await fixtureRoot(t);
  const outside = await mkdtemp(join(tmpdir(), 'rw-portable-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const outsideFile = join(outside, 'outside.mp4');
  await writeFile(outsideFile, 'OUTSIDE');
  const title = join(root, 'Watch', 'Movies', 'A Movie (2001)');
  await mkdir(join(title, 'Media'), { recursive: true });
  try {
    await symlink(outsideFile, join(title, 'Media', 'linked.mp4'), 'file');
  } catch {
    t.skip('symlink creation unavailable on this platform/account');
    return;
  }
  await writeFile(join(title, 'A Movie (2001).md'), document({
    id: 'watch-fedcba9876543210',
    collection: 'Watch',
    title: 'A Movie',
    extra: 'type: "movie"\n',
  }));
  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  await rebuildPortableLibrary({ root, databasePath, apply: true });
  const database = new DatabaseSync(databasePath);
  cleanup.database = database;
  assert.equal(
    database.prepare("SELECT count(*) AS n FROM item_assets WHERE relative_path LIKE '%linked.mp4'").get().n,
    0,
  );
});
