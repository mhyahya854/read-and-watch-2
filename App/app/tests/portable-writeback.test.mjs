/**
 * Synthetic write-back tests only — no real titles, paths or hashes.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { rebuildPortableLibrary } from '../server/portable-rebuild.mjs';
import { updatePortableItem } from '../server/portable-writeback.mjs';

async function fixture(t, { document: markdown } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rw-portable-writeback-'));
  const title = join(root, 'Read', 'Books', 'A Book (2020)');
  await mkdir(title, { recursive: true });
  const markdownPath = join(title, 'A Book (2020).md');
  await writeFile(markdownPath, markdown ?? `---
schema_version: 1
id: "read-0123456789abcdef"
collection: "Read"
title: "A Book"
status: "unread"
x_custom: "preserved"
---

# A Book

## Overview

Old overview.

## Unknown Section

Unknown body must survive.
`);
  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  await rebuildPortableLibrary({ root, databasePath, apply: true });
  const database = new DatabaseSync(databasePath);
  t.after(() => {
    try {
      database.close();
    } catch {
      // A test may close the database deliberately to exercise failure paths.
    }
    return rm(root, { recursive: true, force: true });
  });
  return {
    root,
    title,
    markdownPath,
    database,
    backupRoot: join(root, 'App', 'backups'),
    itemId: 'read-0123456789abcdef',
  };
}

test('personal fields write back surgically and preserve unknown data', async (t) => {
  const { root, markdownPath, database, backupRoot, itemId } = await fixture(t);
  const result = updatePortableItem({
    database,
    root,
    backupRoot,
    itemId,
    expectedRevision: 1,
    patch: {
      status: 'reading',
      rating: 4.5,
      favorite: true,
      tags: ['Arabic: مرحبا', 'Urdu: اردو'],
      people: ['An Author'],
      summary: "New & improved 'overview'.",
      customProperties: {},
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.revision, 2);
  const text = await readFile(markdownPath, 'utf8');
  assert.match(text, /status: "reading"/);
  assert.match(text, /personal_rating: 4.5/);
  assert.match(text, /favorite: true/);
  assert.match(text, /x_custom: "preserved"/);
  assert.match(text, /Unknown body must survive\./);
  assert.match(text, /New & improved 'overview'\./);
  assert.match(text, /مرحبا/);
  assert.match(text, /اردو/);
  assert.equal(database.prepare('SELECT status,rating,summary,revision FROM items WHERE id=?').get(itemId).status, 'reading');
});

test('absent personal values stay absent', async (t) => {
  const { root, markdownPath, database, backupRoot, itemId } = await fixture(t);
  updatePortableItem({
    database,
    root,
    backupRoot,
    itemId,
    expectedRevision: 1,
    patch: { status: 'reading', customProperties: {} },
  });
  const text = await readFile(markdownPath, 'utf8');
  assert.equal(/personal_rating:/.test(text), false);
  assert.equal(/favorite:/.test(text), false);
  assert.equal(/date_completed:/.test(text), false);
});

test('invalid rating, status, date and progress are refused before writing', async (t) => {
  const { root, markdownPath, database, backupRoot, itemId } = await fixture(t);
  const before = await readFile(markdownPath, 'utf8');
  for (const patch of [
    { rating: 5.5 },
    { status: 'not-a-status' },
    { date_completed: 'September 18, 2026' },
    { progress_percent: 140 },
  ]) {
    assert.throws(
      () => updatePortableItem({ database, root, backupRoot, itemId, expectedRevision: 1, patch }),
      (error) => error.status === 400,
    );
  }
  assert.equal(await readFile(markdownPath, 'utf8'), before);
});

test('CRLF and Unicode survive a write-back', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'rw-portable-writeback-crlf-'));
  const title = join(root, 'Read', 'Books', 'A Book (2020)');
  await mkdir(title, { recursive: true });
  const markdownPath = join(title, 'A Book (2020).md');
  const crlf = [
    '---',
    'schema_version: 1',
    'id: "read-0123456789abcdef"',
    'collection: "Read"',
    'title: "A Book"',
    'status: "unread"',
    '---',
    '',
    '# A Book',
    '',
    '## Overview',
    '',
    'Old.',
    '',
  ].join('\r\n');
  await writeFile(markdownPath, crlf);
  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  await rebuildPortableLibrary({ root, databasePath, apply: true });
  const database = new DatabaseSync(databasePath);
  t.after(() => {
    try {
      database.close();
    } catch {
      // Already closed by the test.
    }
    return rm(root, { recursive: true, force: true });
  });
  updatePortableItem({
    database,
    root,
    backupRoot: join(root, 'App', 'backups'),
    itemId: 'read-0123456789abcdef',
    expectedRevision: 1,
    patch: { status: 'reading', summary: 'مرحبا & اردو', customProperties: {} },
  });
  const text = await readFile(markdownPath, 'utf8');
  assert.ok(text.includes('\r\n'));
  assert.match(text, /status: "reading"/);
  assert.match(text, /مرحبا & اردو/);
});

test('external edits conflict on the same field and merge on different fields', async (t) => {
  const { root, markdownPath, database, backupRoot, itemId } = await fixture(t);
  const externallyEdited = (await readFile(markdownPath, 'utf8'))
    .replace('status: "unread"', 'status: "completed"');
  await writeFile(markdownPath, externallyEdited);
  assert.throws(
    () => updatePortableItem({
      database,
      root,
      backupRoot,
      itemId,
      expectedRevision: 1,
      patch: { status: 'reading' },
    }),
    (error) => error.status === 409 && error.code === 'PORTABLE_MARKDOWN_CONFLICT',
  );
  const merged = updatePortableItem({
    database,
    root,
    backupRoot,
    itemId,
    expectedRevision: 1,
    patch: { summary: 'Merged summary.', customProperties: {} },
  });
  assert.equal(merged.ok, true);
  const text = await readFile(markdownPath, 'utf8');
  assert.match(text, /status: "completed"/);
  assert.match(text, /Merged summary\./);
  assert.equal(database.prepare('SELECT status,summary FROM items WHERE id=?').get(itemId).status, 'completed');
});

test('recovery evidence failure aborts before the original is replaced', async (t) => {
  const { root, markdownPath, database, itemId } = await fixture(t);
  const blocker = join(root, 'App', 'blocked-backups');
  await writeFile(blocker, 'not a directory');
  const before = await readFile(markdownPath, 'utf8');
  assert.throws(
    () => updatePortableItem({
      database,
      root,
      backupRoot: blocker,
      itemId,
      expectedRevision: 1,
      patch: { status: 'reading' },
    }),
    (error) => error.code === 'PORTABLE_RECOVERY_EVIDENCE_FAILED',
  );
  assert.equal(await readFile(markdownPath, 'utf8'), before);
  assert.equal(database.prepare('SELECT status FROM items WHERE id=?').get(itemId).status, 'unread');
});

test('a database failure does not corrupt the Markdown or claim success', async (t) => {
  const { root, markdownPath, database, backupRoot, itemId } = await fixture(t);
  const before = await readFile(markdownPath, 'utf8');
  database.close();
  assert.throws(
    () => updatePortableItem({
      database,
      root,
      backupRoot,
      itemId,
      expectedRevision: 1,
      patch: { status: 'reading' },
    }),
  );
  assert.equal(await readFile(markdownPath, 'utf8'), before);
});

test('an unchanged patch is a no-op and does not bump the revision', async (t) => {
  const { root, markdownPath, database, backupRoot, itemId } = await fixture(t);
  const before = await readFile(markdownPath, 'utf8');
  const result = updatePortableItem({
    database,
    root,
    backupRoot,
    itemId,
    expectedRevision: 1,
    patch: { status: 'unread', title: 'A Book', customProperties: {} },
  });
  assert.equal(result.unchanged, true);
  assert.equal(result.revision, 1);
  assert.equal(await readFile(markdownPath, 'utf8'), before);
  assert.equal(
    createHash('sha256').update(await readFile(markdownPath)).digest('hex'),
    createHash('sha256').update(before).digest('hex'),
  );
});
