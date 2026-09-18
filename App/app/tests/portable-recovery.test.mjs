/**
 * Synthetic recovery fixtures only. No real library data is touched.
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
import {
  PORTABLE_RECOVERY_CODES,
  PORTABLE_RECOVERY_STATUS,
  runPortableStartupRecovery,
} from '../server/portable-recovery.mjs';
import { rebuildPortableLibrary } from '../server/portable-rebuild.mjs';
import { createSearchStore } from '../server/search-store.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function markdown({ id = 'read-0123456789abcdef', title = 'A Book', status = 'unread', extra = '', body = 'Old.' } = {}) {
  return `---
schema_version: 1
id: "${id}"
collection: "Read"
title: "${title}"
status: "${status}"
x_custom: "preserved"
${extra}---

# ${title}

## Overview

${body}

## Unknown Section

Unknown body survives.
`;
}

async function fixture(t, { document = markdown(), extraFiles = [] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rw-portable-recovery-'));
  const title = join(root, 'Read', 'Books', 'A Book (2020)');
  mkdirSync(title, { recursive: true });
  const markdownPath = join(title, 'A Book (2020).md');
  writeFileSync(markdownPath, document);
  for (const [relative, content] of extraFiles) {
    const target = join(title, relative);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  const state = { databases: [] };
  t.after(async () => {
    for (const database of state.databases) {
      try {
        database.close();
      } catch {}
    }
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    title,
    markdownPath,
    databasePath,
    itemId: 'read-0123456789abcdef',
    open() {
      const database = new DatabaseSync(databasePath);
      state.databases.push(database);
      return database;
    },
    readOnly() {
      const database = new DatabaseSync(databasePath, { readOnly: true });
      state.databases.push(database);
      return database;
    },
  };
}

async function rebuild(root, databasePath) {
  return rebuildPortableLibrary({ root, databasePath, apply: true });
}

function writeJournal(root, journal) {
  const path = join(root, 'App', 'state', 'portable-writeback-journal.json');
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, typeof journal === 'string' ? journal : JSON.stringify(journal));
  return path;
}

function journalPath(root) {
  return join(root, 'App', 'state', 'portable-writeback-journal.json');
}

function markerPath(root) {
  return join(root, 'App', 'state', 'portable-recovery-required.json');
}

function dbValue(databasePath, itemId, key) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database
      .prepare(
        "SELECT value_json FROM item_properties WHERE item_id=? AND namespace='portable' AND property_key=?",
      )
      .get(itemId, key);
    return row ? JSON.parse(row.value_json) : null;
  } finally {
    database.close();
  }
}

function dbRevision(databasePath, itemId) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database.prepare('SELECT revision FROM items WHERE id=?').get(itemId)?.revision ?? null;
  } finally {
    database.close();
  }
}

async function closeDesktopService(service, instance) {
  await instance.close();
  for (const store of Object.values(service.stores ?? {})) {
    try {
      store?.close?.();
    } catch {
      // Store cleanup is best effort in synthetic tests.
    }
  }
}

test('healthy runtime with no journal is HEALTHY and does not scan or rebuild', async (t) => {
  const fx = await fixture(t);
  await rebuild(fx.root, fx.databasePath);
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.HEALTHY);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.HEALTHY);
  assert.equal(result.metrics.portableRootScanned, false);
  assert.equal(result.metrics.rebuildApplied, false);
  assert.equal(result.metrics.searchRebuilt, false);
  assert.equal(existsSync(markerPath(fx.root)), false);
});

test('missing runtime database rebuilds runtime and search from portable Markdown', async (t) => {
  const pdf = Buffer.from('PDF-BYTES');
  const fx = await fixture(t, { extraFiles: [['Files/book.pdf', pdf]] });
  rmSync(fx.databasePath, { force: true });
  const before = sha256(readFileSync(fx.markdownPath));
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_RUNTIME_REBUILT);
  assert.deepEqual(result.counts, { read: 1, watch: 0, total: 1 });
  assert.equal(result.metrics.rebuildApplied, true);
  assert.equal(result.metrics.searchRebuilt, true);
  const database = fx.readOnly();
  assert.equal(database.prepare('SELECT count(*) AS n FROM items').get().n, 1);
  assert.equal(
    database.prepare("SELECT count(*) AS n FROM search_index_records WHERE kind='library-item'").get().n,
    1,
  );
  assert.equal(sha256(readFileSync(fx.markdownPath)), before);
  assert.equal(sha256(readFileSync(join(fx.title, 'Files', 'book.pdf'))), sha256(pdf));
});

test('search-only runtime database is rebuilt from portable Markdown', async (t) => {
  const fx = await fixture(t);
  createSearchStore({
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  }).close();
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERED);
  assert.equal(result.metrics.rebuildApplied, true);
  assert.equal(fx.readOnly().prepare('SELECT count(*) AS n FROM items').get().n, 1);
});

test('PREPARED with Markdown previous and DB previous archives the stale journal', async (t) => {
  const fx = await fixture(t);
  await rebuild(fx.root, fx.databasePath);
  const previous = sha256(readFileSync(fx.markdownPath));
  writeJournal(fx.root, {
    code: 'PORTABLE_WRITEBACK_PREPARED',
    itemId: fx.itemId,
    markdownRelativePath: 'Read/Books/A Book (2020)/A Book (2020).md',
    previousSha256: previous,
    stagedSha256: sha256('staged-but-not-applied'),
    preparedAtUtc: '2026-09-18T00:00:00Z',
  });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_STALE_PREPARED_JOURNAL);
  assert.equal(existsSync(journalPath(fx.root)), false);
  assert.equal(sha256(readFileSync(fx.markdownPath)), previous);
});

test('PREPARED with Markdown staged and DB previous reconciles from Markdown', async (t) => {
  const fx = await fixture(t);
  await rebuild(fx.root, fx.databasePath);
  const previous = sha256(readFileSync(fx.markdownPath));
  const stagedText = readFileSync(fx.markdownPath, 'utf8').replace('status: "unread"', 'status: "reading"');
  writeFileSync(fx.markdownPath, stagedText);
  const staged = sha256(readFileSync(fx.markdownPath));
  writeJournal(fx.root, {
    code: 'PORTABLE_WRITEBACK_PREPARED',
    itemId: fx.itemId,
    markdownRelativePath: 'Read/Books/A Book (2020)/A Book (2020).md',
    previousSha256: previous,
    stagedSha256: staged,
    preparedAtUtc: '2026-09-18T00:00:00Z',
  });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_WRITEBACK_RECONCILED);
  assert.equal(dbValue(fx.databasePath, fx.itemId, 'markdown_sha256'), staged);
  assert.equal(fx.readOnly().prepare('SELECT status FROM items WHERE id=?').get(fx.itemId).status, 'reading');
  assert.equal(existsSync(journalPath(fx.root)), false);
});

test('PREPARED with Markdown staged and DB staged clears the journal without revision inflation', async (t) => {
  const fx = await fixture(t);
  await rebuild(fx.root, fx.databasePath);
  const previous = sha256(readFileSync(fx.markdownPath));
  const stagedText = readFileSync(fx.markdownPath, 'utf8').replace('status: "unread"', 'status: "reading"');
  writeFileSync(fx.markdownPath, stagedText);
  const staged = sha256(readFileSync(fx.markdownPath));
  await rebuild(fx.root, fx.databasePath);
  const revisionBefore = dbRevision(fx.databasePath, fx.itemId);
  writeJournal(fx.root, {
    code: 'PORTABLE_WRITEBACK_PREPARED',
    itemId: fx.itemId,
    markdownRelativePath: 'Read/Books/A Book (2020)/A Book (2020).md',
    previousSha256: previous,
    stagedSha256: staged,
    preparedAtUtc: '2026-09-18T00:00:00Z',
  });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_STALE_PREPARED_JOURNAL);
  assert.equal(dbRevision(fx.databasePath, fx.itemId), revisionBefore);
  assert.equal(existsSync(journalPath(fx.root)), false);
});

test('PREPARED with Markdown previous and DB staged reconciles runtime back to filesystem', async (t) => {
  const fx = await fixture(t);
  const previousText = readFileSync(fx.markdownPath, 'utf8');
  await rebuild(fx.root, fx.databasePath);
  const previous = sha256(Buffer.from(previousText));
  const stagedText = previousText.replace('status: "unread"', 'status: "reading"');
  writeFileSync(fx.markdownPath, stagedText);
  const staged = sha256(Buffer.from(stagedText));
  await rebuild(fx.root, fx.databasePath);
  writeFileSync(fx.markdownPath, previousText);
  writeJournal(fx.root, {
    code: 'PORTABLE_WRITEBACK_PREPARED',
    itemId: fx.itemId,
    markdownRelativePath: 'Read/Books/A Book (2020)/A Book (2020).md',
    previousSha256: previous,
    stagedSha256: staged,
    preparedAtUtc: '2026-09-18T00:00:00Z',
  });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_WRITEBACK_RECONCILED);
  assert.equal(fx.readOnly().prepare('SELECT status FROM items WHERE id=?').get(fx.itemId).status, 'unread');
  assert.equal(sha256(readFileSync(fx.markdownPath)), previous);
});

test('PREPARED with an unexpected third Markdown hash requires review and preserves Markdown', async (t) => {
  const fx = await fixture(t);
  await rebuild(fx.root, fx.databasePath);
  const current = sha256(readFileSync(fx.markdownPath));
  writeJournal(fx.root, {
    code: 'PORTABLE_WRITEBACK_PREPARED',
    itemId: fx.itemId,
    markdownRelativePath: 'Read/Books/A Book (2020)/A Book (2020).md',
    previousSha256: sha256('previous'),
    stagedSha256: sha256('staged'),
    preparedAtUtc: '2026-09-18T00:00:00Z',
  });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.DIVERGENCE_REQUIRES_REVIEW);
  assert.equal(sha256(readFileSync(fx.markdownPath)), current);
  assert.equal(existsSync(journalPath(fx.root)), true);
  assert.equal(existsSync(markerPath(fx.root)), true);
});

test('PORTABLE_DIVERGENCE with valid current Markdown reconciles safely', async (t) => {
  const fx = await fixture(t);
  await rebuild(fx.root, fx.databasePath);
  const currentText = readFileSync(fx.markdownPath, 'utf8').replace('status: "unread"', 'status: "completed"');
  writeFileSync(fx.markdownPath, currentText);
  const current = sha256(Buffer.from(currentText));
  writeJournal(fx.root, {
    code: 'PORTABLE_DIVERGENCE',
    itemId: fx.itemId,
    markdownRelativePath: 'Read/Books/A Book (2020)/A Book (2020).md',
    previousSha256: sha256('previous'),
    stagedSha256: sha256('staged'),
    preparedAtUtc: '2026-09-18T00:00:00Z',
  });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_DIVERGENCE_RECONCILED);
  assert.equal(fx.readOnly().prepare('SELECT status FROM items WHERE id=?').get(fx.itemId).status, 'completed');
  assert.equal(sha256(readFileSync(fx.markdownPath)), current);
  assert.equal(existsSync(journalPath(fx.root)), false);
});

test('PORTABLE_DIVERGENCE with ambiguous portable state requires review', async (t) => {
  const fx = await fixture(t);
  await rebuild(fx.root, fx.databasePath);
  const duplicate = join(fx.root, 'Read', 'Books', 'Duplicate (2021)');
  mkdirSync(duplicate, { recursive: true });
  writeFileSync(
    join(duplicate, 'Duplicate (2021).md'),
    markdown({ title: 'Duplicate' }),
  );
  writeJournal(fx.root, {
    code: 'PORTABLE_DIVERGENCE',
    itemId: fx.itemId,
    markdownRelativePath: 'Read/Books/A Book (2020)/A Book (2020).md',
    previousSha256: sha256('previous'),
    stagedSha256: sha256('staged'),
    preparedAtUtc: '2026-09-18T00:00:00Z',
  });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
  assert.equal(existsSync(journalPath(fx.root)), true);
});

test('malformed recovery journal JSON requires review and preserves the journal', async (t) => {
  const fx = await fixture(t);
  await rebuild(fx.root, fx.databasePath);
  writeJournal(fx.root, '{ not valid json');
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.MALFORMED_RECOVERY_JOURNAL);
  assert.equal(existsSync(journalPath(fx.root)), true);
});

test('a journal traversal path is rejected without touching an outside file', async (t) => {
  const fx = await fixture(t);
  await rebuild(fx.root, fx.databasePath);
  const outside = join(tmpdir(), 'rw-outside-sentinel.txt');
  writeFileSync(outside, 'outside');
  writeJournal(fx.root, {
    code: 'PORTABLE_WRITEBACK_PREPARED',
    itemId: fx.itemId,
    markdownRelativePath: '../../../../rw-outside-sentinel.txt',
    previousSha256: sha256('previous'),
    stagedSha256: sha256('staged'),
  });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
  assert.equal(readFileSync(outside, 'utf8'), 'outside');
  assert.equal(existsSync(journalPath(fx.root)), true);
  rmSync(outside, { force: true });
});

test('an invalid stable id in a journal is rejected', async (t) => {
  const fx = await fixture(t);
  await rebuild(fx.root, fx.databasePath);
  writeJournal(fx.root, {
    code: 'PORTABLE_WRITEBACK_PREPARED',
    itemId: 'not-a-stable-id',
    markdownRelativePath: 'Read/Books/A Book (2020)/A Book (2020).md',
    previousSha256: sha256('previous'),
    stagedSha256: sha256('staged'),
  });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.MALFORMED_RECOVERY_JOURNAL);
});

test('an unavailable portable root does not destroy the runtime database', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'rw-portable-recovery-missing-'));
  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  mkdirSync(resolve(databasePath, '..'), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES (\'keep\')');
  database.close();
  const before = sha256(readFileSync(databasePath));
  const missingRoot = join(root, 'does-not-exist');
  const result = await runPortableStartupRecovery({
    root: missingRoot,
    databasePath,
    userDataRoot: join(root, 'App', 'user-data'),
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.PORTABLE_ROOT_UNAVAILABLE);
  assert.equal(sha256(readFileSync(databasePath)), before);
  await rm(root, { recursive: true, force: true });
});

test('duplicate portable ids make recovery refuse to apply', async (t) => {
  const fx = await fixture(t);
  const duplicate = join(fx.root, 'Read', 'Books', 'Duplicate (2021)');
  mkdirSync(duplicate, { recursive: true });
  writeFileSync(join(duplicate, 'Duplicate (2021).md'), markdown({ title: 'Duplicate' }));
  rmSync(fx.databasePath, { force: true });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.PORTABLE_REBUILD_CONFLICT);
  assert.equal(existsSync(fx.databasePath), false);
});

test('a malformed title identity makes recovery refuse unsafe apply', async (t) => {
  const fx = await fixture(t);
  const bad = join(fx.root, 'Read', 'Books', 'Bad (2021)');
  mkdirSync(bad, { recursive: true });
  writeFileSync(join(bad, 'Bad (2021).md'), '---\nschema_version: 1\ncollection: "Read"\ntitle: "Bad"\n---\n\nbody\n');
  rmSync(fx.databasePath, { force: true });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.PORTABLE_REBUILD_CONFLICT);
  assert.equal(existsSync(fx.databasePath), false);
});

test('warning-only missing recommendation evidence does not block recovery', async (t) => {
  const fx = await fixture(t, {
    document: markdown({
      extra: `recommendations:
  - source: "Test"
    recommended_by: "Test"
    evidence: "missing-evidence.png"
`,
    }),
  });
  rmSync(fx.databasePath, { force: true });
  const result = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(result.status, PORTABLE_RECOVERY_STATUS.RECOVERED);
  assert.equal(result.code, PORTABLE_RECOVERY_CODES.RECOVERED_RUNTIME_REBUILT);
});

test('runtime recovery leaves canonical Markdown and unknown sections untouched', async (t) => {
  const fx = await fixture(t);
  const before = readFileSync(fx.markdownPath);
  rmSync(fx.databasePath, { force: true });
  await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  const after = readFileSync(fx.markdownPath);
  assert.deepEqual(after, before);
  assert.match(after.toString('utf8'), /x_custom/);
  assert.match(after.toString('utf8'), /Unknown body survives\./);
});

test('a second startup after recovery is HEALTHY and does not rebuild again', async (t) => {
  const fx = await fixture(t);
  rmSync(fx.databasePath, { force: true });
  const first = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(first.status, PORTABLE_RECOVERY_STATUS.RECOVERED);
  const second = await runPortableStartupRecovery({
    root: fx.root,
    databasePath: fx.databasePath,
    userDataRoot: join(fx.root, 'App', 'user-data'),
  });
  assert.equal(second.status, PORTABLE_RECOVERY_STATUS.HEALTHY);
  assert.equal(second.metrics.portableRootScanned, false);
  assert.equal(second.metrics.rebuildApplied, false);
});

test('portable write-back is blocked while a recovery journal exists', async (t) => {
  const fx = await fixture(t);
  await rebuild(fx.root, fx.databasePath);
  writeJournal(fx.root, '{ invalid json');
  const database = fx.open();
  const { updatePortableItem } = await import('../server/portable-writeback.mjs');
  assert.throws(
    () => updatePortableItem({
      database,
      root: fx.root,
      backupRoot: join(fx.root, 'App', 'backups'),
      itemId: fx.itemId,
      expectedRevision: 1,
      patch: { status: 'reading' },
    }),
    (error) => error.status === 503 && error.code === 'PORTABLE_RECOVERY_REQUIRED',
  );
});

test('desktop service establishes recovery before accepting requests', async (t) => {
  const fx = await fixture(t);
  rmSync(fx.databasePath, { force: true });
  const appRoot = resolve(import.meta.dirname, '..');
  const service = createDesktopService({ appRoot, dataRootOverride: fx.root });
  const instance = await service.start(0, '127.0.0.1');
  try {
    const response = await fetch(`${instance.origin}/api/library/catalog`);
    assert.equal(response.status, 200);
    const catalog = await response.json();
    assert.equal(catalog.items.length, 1);
    const recovery = await fetch(`${instance.origin}/api/library/recovery`).then((res) => res.json());
    assert.equal(recovery.status, PORTABLE_RECOVERY_STATUS.RECOVERED);
  } finally {
    await closeDesktopService(service, instance);
  }
});

test('desktop service keeps browsing available and blocks mutation while recovery is required', async (t) => {
  const fx = await fixture(t);
  await rebuild(fx.root, fx.databasePath);
  writeJournal(fx.root, '{ invalid json');
  const appRoot = resolve(import.meta.dirname, '..');
  const service = createDesktopService({ appRoot, dataRootOverride: fx.root });
  const instance = await service.start(0, '127.0.0.1');
  try {
    const recovery = await fetch(`${instance.origin}/api/library/recovery`).then((res) => res.json());
    assert.equal(recovery.status, PORTABLE_RECOVERY_STATUS.RECOVERY_REQUIRED);
    assert.equal(recovery.mutationBlocked, true);
    const catalog = await fetch(`${instance.origin}/api/library/catalog`);
    assert.equal(catalog.status, 200);
    const mutation = await fetch(
      `${instance.origin}/api/library/items/${encodeURIComponent(fx.itemId)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-ReadWatch-Session-Token': instance.sessionToken,
        },
        body: JSON.stringify({ patch: { status: 'reading' }, expectedRevision: 1 }),
      },
    );
    assert.equal(mutation.status, 503);
  } finally {
    await closeDesktopService(service, instance);
  }
});
