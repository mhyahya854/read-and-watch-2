/**
 * Synthetic library integrity diagnostic tests only.
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
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDesktopService } from '../electron/desktop-service.mjs';
import { createLibraryStore } from '../server/library-store.mjs';
import {
  inspectLibraryStateIntegrity,
  libraryStatePath,
  readLibraryState,
  writeLibraryStateAtomic,
} from '../server/library-state.mjs';
import { rebuildPortableLibrary } from '../server/portable-rebuild.mjs';

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

async function setup(t, { savedViews = [], relationships = [] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rw-library-integrity-'));
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
  if (savedViews.length > 0 || relationships.length > 0) {
    writeLibraryStateAtomic(userDataRoot, {
      schemaVersion: 1,
      savedViews,
      relationships,
    });
  }
  const store = createLibraryStore({ databasePath });
  t.after(async () => {
    try {
      store.close();
    } catch {}
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    databasePath,
    userDataRoot,
    readId: 'read-0123456789abcdef',
    watchId: 'watch-fedcba9876543210',
    store,
  };
}

function view(id, name, definition = { status: 'reading' }, revision = 1) {
  return {
    id,
    name,
    definition,
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

function inspect(fx) {
  return inspectLibraryStateIntegrity({
    database: fx.store.database,
    userDataRoot: fx.userDataRoot,
    itemExists: (itemId) => fx.store.itemExists(itemId),
  });
}

test('mirror present with exact DB match is HEALTHY', async (t) => {
  const fx = await setup(t);
  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [view('view-1', 'Reading Now')],
    relationships: [relationship(fx.readId, fx.watchId)],
  });
  fx.store.restoreLibraryState(readLibraryState(fx.userDataRoot).state, {
    conflictResolution: 'overwrite',
  });
  const result = inspect(fx);
  assert.equal(result.status, 'HEALTHY');
  assert.equal(result.mirror.savedViewCount, 1);
  assert.equal(result.runtime.savedViewCount, 1);
  assert.equal(result.mirror.relationshipCount, 1);
  assert.equal(result.runtime.relationshipCount, 1);
  assert.equal(result.parity.matches, true);
  assert.equal(result.metrics.dbMutated, false);
  assert.equal(result.metrics.portableRootScanned, false);
  assert.equal(result.metrics.searchRebuilt, false);
});

test('semantic mismatch is detected even when counts match', async (t) => {
  const fx = await setup(t);
  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [view('view-1', 'Reading Now', { status: 'reading' })],
    relationships: [],
  });
  fx.store.restoreLibraryState(readLibraryState(fx.userDataRoot).state, {
    conflictResolution: 'overwrite',
  });
  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [view('view-1', 'Reading Now', { status: 'completed' })],
    relationships: [],
  });
  const result = inspect(fx);
  assert.equal(result.status, 'MISMATCH');
  assert.equal(result.parity.savedViewsMatch, false);
  assert.equal(result.mirror.savedViewCount, result.runtime.savedViewCount);
});

test('relationship semantic mismatch is detected even when counts match', async (t) => {
  const fx = await setup(t);
  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [],
    relationships: [relationship(fx.readId, fx.watchId)],
  });
  fx.store.restoreLibraryState(readLibraryState(fx.userDataRoot).state, {
    conflictResolution: 'overwrite',
  });
  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [],
    relationships: [{
      ...relationship(fx.readId, fx.watchId),
      relationshipType: 'different_type',
    }],
  });
  const result = inspect(fx);
  assert.equal(result.status, 'MISMATCH');
  assert.equal(result.parity.relationshipsMatch, false);
});

test('file greater than runtime and runtime greater than file are both mismatches', async (t) => {
  const fx = await setup(t);
  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [view('view-1', 'One'), view('view-2', 'Two')],
    relationships: [relationship(fx.readId, fx.watchId, 'rel-1')],
  });
  const fileOnly = inspect(fx);
  assert.equal(fileOnly.status, 'MISMATCH');
  assert.equal(fileOnly.mirror.savedViewCount, 2);
  assert.equal(fileOnly.runtime.savedViewCount, 0);

  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [],
    relationships: [],
  });
  const database = new DatabaseSync(fx.databasePath);
  database
    .prepare('INSERT INTO saved_views VALUES(?,?,?,?,?,?)')
    .run('view-db', 'DB View', '{}', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  database.close();
  const runtimeOnly = inspect(fx);
  assert.equal(runtimeOnly.status, 'MISMATCH');
  assert.equal(runtimeOnly.mirror.savedViewCount, 0);
  assert.equal(runtimeOnly.runtime.savedViewCount, 1);
});

test('mirror absent reports MIRROR_MISSING and creates no file', async (t) => {
  const fx = await setup(t);
  const path = libraryStatePath(fx.userDataRoot);
  rmSync(path, { force: true });
  const result = inspect(fx);
  assert.equal(result.status, 'MIRROR_MISSING');
  assert.equal(result.mirror.present, false);
  assert.equal(existsSync(path), false);
});

test('malformed mirror reports RECOVERY_REQUIRED and remains untouched', async (t) => {
  const fx = await setup(t);
  const path = libraryStatePath(fx.userDataRoot);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, '{ malformed');
  const before = readFileSync(path, 'utf8');
  const result = inspect(fx);
  assert.equal(result.status, 'RECOVERY_REQUIRED');
  assert.equal(result.code, 'MALFORMED_LIBRARY_STATE');
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('database unavailable reports the existing recovery state without mutation', async (t) => {
  const fx = await setup(t);
  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [],
    relationships: [],
  });
  const result = inspectLibraryStateIntegrity({
    database: null,
    userDataRoot: fx.userDataRoot,
  });
  assert.equal(result.status, 'RECOVERY_REQUIRED');
  assert.equal(result.code, 'RUNTIME_DB_UNUSABLE');
  assert.equal(result.runtime.available, false);
});

test('empty 0/0 and complex external relationship states are handled', async (t) => {
  const fx = await setup(t);
  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [],
    relationships: [],
  });
  assert.equal(inspect(fx).status, 'HEALTHY');

  const complexView = view('view-complex', 'Complex', {
    filters: { collections: ['read', 'watch'], ratings: [4.5, 5] },
    nested: { enabled: true },
  });
  const external = {
    id: 'rel-external',
    sourceItemId: fx.readId,
    targetItemId: null,
    targetExternal: { kind: 'url', value: 'https://example.test' },
    relationshipType: 'cites',
    direction: 'undirected',
    position: 3,
    provenance: { source: 'synthetic' },
    createdAtUtc: '2026-01-01T00:00:00.000Z',
  };
  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [complexView],
    relationships: [external],
  });
  fx.store.restoreLibraryState(readLibraryState(fx.userDataRoot).state, {
    conflictResolution: 'overwrite',
  });
  const result = inspect(fx);
  assert.equal(result.status, 'HEALTHY');
  assert.equal(result.mirror.savedViewCount, 1);
  assert.equal(result.mirror.relationshipCount, 1);
});

test('repeated diagnostics do not rewrite the mirror', async (t) => {
  const fx = await setup(t);
  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [view('view-1', 'Reading Now')],
    relationships: [],
  });
  fx.store.restoreLibraryState(readLibraryState(fx.userDataRoot).state, {
    conflictResolution: 'overwrite',
  });
  const path = libraryStatePath(fx.userDataRoot);
  const before = readFileSync(path);
  inspect(fx);
  inspect(fx);
  assert.equal(Buffer.compare(before, readFileSync(path)), 0);
});

test('diagnostic API exposes sanitized counts only and is read-only', async (t) => {
  const fx = await setup(t);
  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [view('view-secret-id', 'Private View Name', { secret: 'definition-secret' })],
    relationships: [{
      ...relationship(fx.readId, fx.watchId, 'relationship-secret-id'),
      targetItemId: null,
      targetExternal: { secret: 'target-secret' },
    }],
  });
  fx.store.restoreLibraryState(readLibraryState(fx.userDataRoot).state, {
    conflictResolution: 'overwrite',
  });
  const appRoot = resolve(import.meta.dirname, '..');
  const service = createDesktopService({ appRoot, dataRootOverride: fx.root });
  const instance = await service.start(0, '127.0.0.1');
  try {
    const mirrorBefore = readFileSync(libraryStatePath(fx.userDataRoot));
    const databaseBefore = readFileSync(fx.databasePath);
    const response = await fetch(`${instance.origin}/api/library/integrity`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'HEALTHY');
    assert.equal(payload.parity.matches, true);
    assert.equal(payload.mirror.savedViewCount, 1);
    assert.equal(payload.runtime.savedViewCount, 1);
    assert.equal(payload.metrics.portableRootScanned, false);
    assert.equal(payload.metrics.searchRebuilt, false);
    const serialized = JSON.stringify(payload);
    for (const secret of [
      'Private View Name',
      'definition-secret',
      'relationship-secret-id',
      fx.readId,
      fx.watchId,
      'target-secret',
      fx.root,
      libraryStatePath(fx.userDataRoot),
    ]) {
      assert.equal(serialized.includes(secret), false, `leaked ${secret}`);
    }
    assert.equal(serialized.includes('sha256'), false);
    assert.equal(Buffer.compare(mirrorBefore, readFileSync(libraryStatePath(fx.userDataRoot))), 0);
    assert.equal(Buffer.compare(databaseBefore, readFileSync(fx.databasePath)), 0);
  } finally {
    await instance.close();
    for (const store of Object.values(service.stores ?? {})) {
      try {
        store?.close?.();
      } catch {}
    }
  }
});

test('retry reconciliation uses the existing recovery path and refreshes integrity', async (t) => {
  const fx = await setup(t);
  writeLibraryStateAtomic(fx.userDataRoot, {
    schemaVersion: 1,
    savedViews: [],
    relationships: [],
  });
  fx.store.restoreLibraryState(readLibraryState(fx.userDataRoot).state, {
    conflictResolution: 'overwrite',
  });
  const appRoot = resolve(import.meta.dirname, '..');
  const service = createDesktopService({ appRoot, dataRootOverride: fx.root });
  const instance = await service.start(0, '127.0.0.1');
  try {
    writeLibraryStateAtomic(fx.userDataRoot, {
      schemaVersion: 1,
      savedViews: [view('view-1', 'Reading Now')],
      relationships: [relationship(fx.readId, fx.watchId)],
    });
    const before = await fetch(`${instance.origin}/api/library/integrity`).then((res) => res.json());
    assert.equal(before.status, 'MISMATCH');
    const retry = await fetch(`${instance.origin}/api/library/recovery/retry`, { method: 'POST' });
    assert.equal(retry.status, 200);
    const after = await fetch(`${instance.origin}/api/library/integrity`).then((res) => res.json());
    assert.equal(after.status, 'HEALTHY');
    assert.equal(after.parity.matches, true);
  } finally {
    await instance.close();
    for (const store of Object.values(service.stores ?? {})) {
      try {
        store?.close?.();
      } catch {}
    }
  }
});
