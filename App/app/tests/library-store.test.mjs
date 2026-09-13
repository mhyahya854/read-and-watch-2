import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createLibraryStore } from '../server/library-store.mjs';
import { writeTestDatabase } from './test-database.mjs';

const READ_ID = 'read-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WATCH_ID = 'watch-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'rw-library-store-'));
  const databasePath = join(root, 'library.sqlite3');
  writeTestDatabase(databasePath, [
    {
      id: READ_ID,
      collection: 'read',
      itemPath: 'Read/A/item.md',
      title: 'Shared title',
      status: 'reading',
      summary: 'Alpha summary',
    },
    {
      id: WATCH_ID,
      collection: 'watch',
      itemPath: 'Watch/B/item.md',
      title: 'Shared title',
      status: 'queued',
      summary: 'Beta summary',
    },
  ]);
  const store = createLibraryStore({ databasePath });
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return store;
}

test('catalog projection preserves Read and Watch identities', (t) => {
  const catalog = setup(t).getCatalog();
  assert.deepEqual(catalog.counts, { read: 1, watch: 1, total: 2 });
  assert.deepEqual(
    catalog.items.map(({ id }) => id),
    [READ_ID, WATCH_ID],
  );
});

test('query supports collection, status, search, sort, and tags', (t) => {
  const store = setup(t);
  assert.deepEqual(
    store.queryItems({ collection: 'watch' }).map(({ id }) => id),
    [WATCH_ID],
  );
  assert.deepEqual(
    store.queryItems({ status: 'reading' }).map(({ id }) => id),
    [READ_ID],
  );
  assert.deepEqual(
    store.queryItems({ search: 'Beta' }).map(({ id }) => id),
    [WATCH_ID],
  );
  const revision = store.setTags(READ_ID, ['Study', 'Reference'], 1);
  assert.equal(revision, 2);
  assert.deepEqual(
    store.queryItems({ tag: 'study' }).map(({ id }) => id),
    [READ_ID],
  );
});

test('metadata and properties use optimistic revisions', (t) => {
  const store = setup(t);
  const updated = store.updateMetadata(
    READ_ID,
    { title: 'Changed', rating: 4.5 },
    1,
  );
  assert.equal(updated.revision, 2);
  assert.throws(
    () => store.updateMetadata(READ_ID, { title: 'Stale' }, 1),
    /conflict/,
  );
  const revision = store.setProperty(
    READ_ID,
    'custom',
    'language',
    'English',
    2,
  );
  assert.equal(revision, 3);
});

test('duplicate detection remains collection-aware', (t) => {
  const duplicates = setup(t).duplicateCandidates();
  assert.deepEqual(duplicates, { titles: [], files: [] });
});

test('Read series, people, relationships, and saved views stay explicit', (t) => {
  const store = setup(t);
  let revision = store.setPeople(READ_ID, 'author', ['An Author'], 1);
  revision = store.setSeries(READ_ID, 'A Series', 2, revision);
  const relationship = store.addRelationship(
    READ_ID,
    WATCH_ID,
    'inspired_by',
    revision,
  );
  assert.equal(relationship.revision, 4);
  assert.throws(
    () => store.setSeries(WATCH_ID, 'Wrong domain', 1, 1),
    /Read-specific/,
  );
  const view = store.saveView('Reading', {
    collection: 'read',
    status: 'reading',
  });
  assert.equal(view.revision, 1);
  assert.deepEqual(store.listViews()[0].definition, {
    collection: 'read',
    status: 'reading',
  });
});

test('UI catalog exposes editable state without changing the legacy projection', (t) => {
  const store = setup(t);
  const legacy = store.getCatalog();
  const ui = store.getUiCatalog();
  assert.equal(legacy.items[0].revision, undefined);
  assert.equal(ui.items[0].revision, 1);
  assert.deepEqual(ui.items[0].authors, []);
  assert.deepEqual(ui.items[1].creators, []);
  assert.deepEqual(ui.items[0].customProperties, {});
});

test('combined metadata save is atomic, collection-aware, and conflict-refusing', (t) => {
  const store = setup(t);
  const updated = store.updateItem(
    READ_ID,
    {
      title: 'Edited title',
      status: 'reading',
      rating: 4.5,
      people: ['First Author', 'Second Author'],
      tags: ['Study', 'Local'],
      series: { name: 'A Series', position: '2' },
      customProperties: { Language: 'English' },
    },
    1,
  );
  assert.equal(updated.revision, 2);
  assert.equal(updated.title, 'Edited title');
  assert.equal(updated.rating, 4.5);
  assert.deepEqual(updated.authors, ['First Author', 'Second Author']);
  assert.deepEqual(updated.tags, ['Study', 'Local']);
  assert.deepEqual(updated.series, { name: 'A Series', position: '2' });
  assert.deepEqual(updated.customProperties, { Language: 'English' });
  assert.throws(
    () => store.updateItem(READ_ID, { title: 'Stale' }, 1),
    /conflict/,
  );

  assert.throws(
    () =>
      store.updateItem(
        WATCH_ID,
        {
          title: 'Must not persist',
          series: { name: 'Wrong domain', position: '1' },
        },
        1,
      ),
    /Read-specific/,
  );
  assert.equal(
    store.getUiCatalog().items.find(({ id }) => id === WATCH_ID).title,
    'Shared title',
  );
});
