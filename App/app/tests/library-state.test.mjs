/**
 * Synthetic library-state mirror tests only.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createLibraryStore } from '../server/library-store.mjs';
import {
  LIBRARY_STATE_CODES,
  libraryStatePath,
  readLibraryState,
  validateLibraryState,
} from '../server/library-state.mjs';
import { rebuildPortableLibrary } from '../server/portable-rebuild.mjs';
import {
  PORTABLE_RECOVERY_CODES,
  PORTABLE_RECOVERY_STATUS,
  runPortableStartupRecovery,
} from '../server/portable-recovery.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function markdown(id, collection, title) {
  return `---
schema_version: 1
id: "${id}"
collection: "${collection}"
title: "${title}"
status: "${collection === 'Read' ? 'unread' : 'to_watch'}"
---

# ${title}

## ${collection === 'Read' ? 'Overview' : 'My Description'}

Body.
`;
}

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'rw-library-state-'));
  const readDir = join(root, 'Read', 'Books', 'Read Book (2020)');
  const watchDir = join(root, 'Watch', 'Movies', 'Watch Movie (2001)');
  mkdirSync(readDir, { recursive: true });
  mkdirSync(watchDir, { recursive: true });
  writeFileSync(
    join(readDir, 'Read Book (2020).md'),
    markdown('read-0123456789abcdef', 'Read', 'Read Book'),
  );
  writeFileSync(
    join(watchDir, 'Watch Movie (2001).md'),
    markdown('watch-fedcba9876543210', 'Watch', 'Watch Movie'),
  );
  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  const userDataRoot = join(root, 'App', 'user-data');
  await rebuildPortableLibrary({ root, databasePath, apply: true });
  const state = { stores: [] };
  t.after(async () => {
    for (const store of state.stores) {
      try {
        store.close();
      } catch {}
    }
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    databasePath,
    userDataRoot,
    readId: 'read-0123456789abcdef',
    watchId: 'watch-fedcba9876543210',
    open() {
      const store = createLibraryStore({ databasePath });
      state.stores.push(store);
      return store;
    },
    raw() {
      const database = new DatabaseSync(databasePath);
      state.stores.push({ close: () => database.close() });
      return database;
    },
  };
}

function writeState(root, state) {
  const path = libraryStatePath(join(root, 'App', 'user-data'));
  mkdirSync(join(root, 'App', 'user-data'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
  return path;
}

function view(id, name, revision = 1) {
  return {
    id,
    name,
    definition: { collection: 'read', status: 'reading' },
    revision,
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    updatedAtUtc: '2026-01-01T00:00:00.000Z',
  };
}

function relationship(sourceItemId, targetItemId, id = 'relationship-1') {
  return {
    id,
    sourceItemId,
    targetItemId,
    targetExternal: null,
    relationshipType: 'related_to',
    direction: 'directed',
    position: 0,
    provenance: {},
    createdAtUtc: '2026-01-01T00:00:00.000Z',
  };
}

test('an empty healthy runtime seeds an initialized empty mirror once', async (t) => {
  const fx = await setup(t);
  const first = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(first.status, PORTABLE_RECOVERY_STATUS.RECOVERED);
  assert.equal(first.code, PORTABLE_RECOVERY_CODES.RECOVERED_LIBRARY_STATE_MIGRATED);
  const file = readLibraryState(fx.userDataRoot);
  assert.equal(file.ok, true);
  assert.deepEqual(file.state.savedViews, []);
  assert.deepEqual(file.state.relationships, []);
  const hash = sha256(readFileSync(libraryStatePath(fx.userDataRoot)));
  const second = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(second.status, PORTABLE_RECOVERY_STATUS.HEALTHY);
  assert.equal(sha256(readFileSync(libraryStatePath(fx.userDataRoot))), hash);
});

test('existing DB-only saved views and relationships migrate exactly', async (t) => {
  const fx = await setup(t);
  const database = fx.raw();
  database
    .prepare('INSERT INTO saved_views VALUES(?,?,?,?,?,?)')
    .run('view-1', 'Reading Now', JSON.stringify({ status: 'reading' }), 3, '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
  database
    .prepare(
      'INSERT INTO relationships(id,source_item_id,target_item_id,relationship_type,direction,position,provenance_json,created_at_utc) VALUES(?,?,?,?,?,?,?,?)',
    )
    .run('rel-1', fx.readId, fx.watchId, 'inspired_by', 'directed', 0, '{}', '2026-01-01T00:00:00.000Z');
  database.close();

  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_LIBRARY_STATE_MIGRATED);
  const file = readLibraryState(fx.userDataRoot);
  assert.equal(file.state.savedViews[0].id, 'view-1');
  assert.equal(file.state.savedViews[0].revision, 3);
  assert.equal(file.state.savedViews[0].definition.status, 'reading');
  assert.equal(file.state.relationships[0].id, 'rel-1');
  assert.equal(file.state.relationships[0].sourceItemId, fx.readId);
  assert.equal(file.state.relationships[0].targetItemId, fx.watchId);
});

test('complex relationship fields survive migration and projection', async (t) => {
  const fx = await setup(t);
  const database = fx.raw();
  database
    .prepare(
      'INSERT INTO relationships(id,source_item_id,target_item_id,target_external_json,relationship_type,direction,position,provenance_json,created_at_utc) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    .run(
      'rel-external',
      fx.readId,
      null,
      JSON.stringify({ kind: 'url', value: 'https://example.test/source' }),
      'cites',
      'undirected',
      7,
      JSON.stringify({ source: 'manual' }),
      '2026-01-01T00:00:00.000Z',
    );
  database.close();
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_LIBRARY_STATE_MIGRATED);
  const file = readLibraryState(fx.userDataRoot);
  const relationship = file.state.relationships[0];
  assert.equal(relationship.targetItemId, null);
  assert.deepEqual(relationship.targetExternal, { kind: 'url', value: 'https://example.test/source' });
  assert.equal(relationship.direction, 'undirected');
  assert.equal(relationship.position, 7);
  assert.deepEqual(relationship.provenance, { source: 'manual' });
});

test('mirror-present DB-stale reconciliation uses the durable file', async (t) => {
  const fx = await setup(t);
  writeState(fx.root, {
    schemaVersion: 1,
    savedViews: [view('view-1', 'Reading Now', 4)],
    relationships: [relationship(fx.readId, fx.watchId, 'rel-1')],
  });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_LIBRARY_STATE_RECONCILED);
  const database = new DatabaseSync(fx.databasePath, { readOnly: true });
  try {
    assert.equal(database.prepare('SELECT revision FROM saved_views WHERE id=?').get('view-1').revision, 4);
    assert.equal(database.prepare('SELECT count(*) AS n FROM relationships').get().n, 1);
  } finally {
    database.close();
  }
});

test('malformed mirror requires recovery and is preserved', async (t) => {
  const fx = await setup(t);
  const path = writeState(fx.root, { schemaVersion: 1, savedViews: [], relationships: [] });
  writeFileSync(path, '{ malformed');
  const before = readFileSync(path, 'utf8');
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.MALFORMED_LIBRARY_STATE);
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('validation rejects duplicate names, duplicate ids and missing references', async (t) => {
  const fx = await setup(t);
  assert.equal(
    validateLibraryState({
      schemaVersion: 1,
      savedViews: [view('a', 'Same'), view('b', 'same')],
      relationships: [],
    }).ok,
    false,
  );
  assert.equal(
    validateLibraryState({
      schemaVersion: 1,
      savedViews: [view('a', 'One'), view('a', 'Two')],
      relationships: [],
    }).ok,
    false,
  );
  assert.equal(
    validateLibraryState({
      schemaVersion: 1,
      savedViews: [],
      relationships: [relationship('read-ffffffffffffffff', fx.watchId, 'missing-source')],
    }, { itemExists: (id) => id === fx.watchId }).ok,
    false,
  );
  assert.equal(
    validateLibraryState({
      schemaVersion: 1,
      savedViews: [],
      relationships: [relationship(fx.readId, 'watch-ffffffffffffffff', 'missing-target')],
    }, { itemExists: (id) => id === fx.readId }).ok,
    false,
  );
  assert.equal(
    validateLibraryState({
      schemaVersion: 1,
      savedViews: [],
      relationships: [{
        ...relationship(fx.readId, null, 'external-ok'),
        targetExternal: { kind: 'url', value: 'https://example.test' },
      }],
    }, { itemExists: (id) => id === fx.readId }).ok,
    true,
  );
});

test('saveView writes the mirror and updates revision once', async (t) => {
  const fx = await setup(t);
  const store = fx.open();
  const first = store.saveView('Reading Now', { status: 'reading' });
  assert.equal(first.revision, 1);
  let file = readLibraryState(fx.userDataRoot);
  assert.equal(file.state.savedViews[0].revision, 1);
  const second = store.saveView('Reading Now', { status: 'completed' });
  assert.equal(second.revision, 2);
  file = readLibraryState(fx.userDataRoot);
  assert.equal(file.state.savedViews[0].revision, 2);
  assert.deepEqual(file.state.savedViews[0].definition, { status: 'completed' });
  const database = new DatabaseSync(fx.databasePath, { readOnly: true });
  try {
    assert.equal(database.prepare('SELECT count(*) AS n FROM saved_views').get().n, 1);
    assert.equal(database.prepare('SELECT revision FROM saved_views').get().revision, 2);
  } finally {
    database.close();
  }
});

test('addRelationship writes the mirror and repeated projection is stable', async (t) => {
  const fx = await setup(t);
  const store = fx.open();
  const relationship = store.addRelationship(fx.readId, fx.watchId, 'related_to', 1);
  const file = readLibraryState(fx.userDataRoot);
  assert.equal(file.state.relationships.length, 1);
  assert.equal(file.state.relationships[0].id, relationship.id);
  const second = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(second.status, PORTABLE_RECOVERY_STATUS.HEALTHY);
  assert.equal(readLibraryState(fx.userDataRoot).state.relationships.length, 1);
});

test('hard-crash mirror-new DB-old is reconciled from the mirror on startup', async (t) => {
  const fx = await setup(t);
  writeState(fx.root, {
    schemaVersion: 1,
    savedViews: [view('view-1', 'Reading Now', 1)],
    relationships: [relationship(fx.readId, fx.watchId, 'rel-1')],
  });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_LIBRARY_STATE_RECONCILED);
  const database = new DatabaseSync(fx.databasePath, { readOnly: true });
  try {
    assert.equal(database.prepare('SELECT count(*) AS n FROM saved_views').get().n, 1);
    assert.equal(database.prepare('SELECT count(*) AS n FROM relationships').get().n, 1);
  } finally {
    database.close();
  }
});

test('a failed DB transaction compensates the mirror and does not claim success', async (t) => {
  const fx = await setup(t);
  const store = fx.open();
  store.saveView('Existing', { status: 'reading' });
  const before = readFileSync(libraryStatePath(fx.userDataRoot), 'utf8');
  const originalExec = store.database.exec.bind(store.database);
  store.database.exec = (sql) => {
    if (sql === 'BEGIN IMMEDIATE') throw new Error('synthetic commit failure');
    return originalExec(sql);
  };
  assert.throws(() => store.saveView('Broken', { status: 'reading' }));
  store.database.exec = originalExec;
  assert.equal(readFileSync(libraryStatePath(fx.userDataRoot), 'utf8'), before);
  assert.equal(store.listViews().length, 1);
  const leaked = readLibraryState(fx.userDataRoot);
  assert.equal(leaked.state.savedViews.length, 1);
});

test('partial pre-mirror validation remains explicit', async (t) => {
  const fx = await setup(t);
  const bad = {
    schemaVersion: 1,
    savedViews: [],
    relationships: [relationship('read-ffffffffffffffff', fx.watchId, 'missing')],
  };
  const validation = validateLibraryState(bad, {
    itemExists: (id) => id === fx.watchId,
  });
  assert.equal(validation.ok, false);
  assert.equal(validation.diagnostics[0].code, LIBRARY_STATE_CODES.MALFORMED);
});
