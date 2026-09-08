import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createUserDataStore } from '../server/user-data-store.mjs';
import { writeTestDatabase } from './test-database.mjs';

const READ_ID = 'read-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WATCH_ID = 'watch-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rw-user-data-'));
  const libraryDatabasePath = join(dir, 'library.sqlite3');
  writeTestDatabase(libraryDatabasePath, [
    { id: READ_ID, collection: 'read', itemPath: 'Read/Test/item.md' },
    { id: WATCH_ID, collection: 'watch', itemPath: 'Watch/Test/item.md' },
  ]);
  const userDataRoot = join(dir, 'user-data');
  const store = createUserDataStore({ userDataRoot, libraryDatabasePath });
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { store, userDataRoot };
}

test('load thoughts when none exists', (t) => {
  const { store } = setup(t);
  assert.deepEqual(store.load('thoughts', READ_ID), {
    content: null,
    revision: null,
  });
});

test('save new thoughts', (t) => {
  const { store, userDataRoot } = setup(t);
  const result = store.save('thoughts', READ_ID, 'My first thought.', null);
  assert.equal(result.ok, true);
  assert.equal(result.exists, true);
  assert.equal(result.content, 'My first thought.');
  assert.ok(result.revision);
  assert.equal(
    readFileSync(join(userDataRoot, 'items', READ_ID, 'thoughts.md'), 'utf8'),
    'My first thought.',
  );
});

test('reload saved thoughts', (t) => {
  const { store } = setup(t);
  store.save('thoughts', READ_ID, 'Persisted text.', null);
  const loaded = store.load('thoughts', READ_ID);
  assert.equal(loaded.content, 'Persisted text.');
  assert.ok(loaded.revision);
});

test('edit existing thoughts and history is bounded', (t) => {
  const { store, userDataRoot } = setup(t);
  let revision = null;
  for (let i = 1; i <= 7; i += 1) {
    const result = store.save('thoughts', READ_ID, `Version ${i}`, revision);
    assert.equal(result.ok, true);
    revision = result.revision;
  }
  assert.equal(store.load('thoughts', READ_ID).content, 'Version 7');
  const history = readdirSync(join(userDataRoot, '.history', READ_ID)).filter(
    (name) => name.startsWith('thoughts-'),
  );
  assert.equal(history.length, 5);
});

test('save notes independently of thoughts', (t) => {
  const { store, userDataRoot } = setup(t);
  store.save('thoughts', READ_ID, 'Thought content.', null);
  const result = store.save('notes', READ_ID, 'Note content.', null);
  assert.equal(result.ok, true);
  assert.equal(store.load('thoughts', READ_ID).content, 'Thought content.');
  assert.equal(store.load('notes', READ_ID).content, 'Note content.');
  assert.equal(
    existsSync(join(userDataRoot, 'items', READ_ID, 'thoughts.md')),
    true,
  );
  assert.equal(
    existsSync(join(userDataRoot, 'items', READ_ID, 'notes.md')),
    true,
  );
});

test('switching items preserves correct association', (t) => {
  const { store } = setup(t);
  store.save('thoughts', READ_ID, 'Read note.', null);
  store.save('thoughts', WATCH_ID, 'Watch note.', null);
  assert.equal(store.load('thoughts', READ_ID).content, 'Read note.');
  assert.equal(store.load('thoughts', WATCH_ID).content, 'Watch note.');
});

test('item IDs cannot escape the user-data path', (t) => {
  const { store } = setup(t);
  for (const badId of [
    '../../outside',
    'read-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/../escape',
    '..\\..\\outside',
    'read-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\..\\x',
  ]) {
    assert.throws(
      () => store.save('thoughts', badId, 'x', null),
      /Invalid item ID/,
    );
  }
  assert.throws(
    () =>
      store.save(
        'thoughts',
        'watch-cccccccccccccccccccccccccccccccc',
        'x',
        null,
      ),
    /Unknown item ID/,
  );
});

test('invalid item IDs rejected', (t) => {
  const { store } = setup(t);
  for (const badId of [
    'watch-xyz',
    'read-',
    'movie-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'READ-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'read-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'watch-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    null,
    undefined,
    42,
  ]) {
    assert.throws(
      () => store.save('thoughts', badId, 'x', null),
      /Invalid item ID/,
    );
  }
  assert.throws(
    () => store.save('diary', READ_ID, 'x', null),
    /Invalid user-data type/,
  );
});

test('atomic persistence behavior where testable', (t) => {
  const { store, userDataRoot } = setup(t);
  store.save('thoughts', READ_ID, 'Atomic content.', null);
  const itemDir = join(userDataRoot, 'items', READ_ID);
  const leftovers = readdirSync(itemDir).filter((name) =>
    name.includes('.tmp-'),
  );
  assert.equal(leftovers.length, 0);
  writeFileSync(join(itemDir, '.thoughts.md.tmp-999-1'), 'stray temp');
  assert.equal(store.load('thoughts', READ_ID).content, 'Atomic content.');
});

test('conflict detection', (t) => {
  const { store } = setup(t);
  const first = store.save('thoughts', READ_ID, 'Original.', null);
  const changed = store.save(
    'thoughts',
    READ_ID,
    'Changed elsewhere.',
    first.revision,
  );
  const conflict = store.save('thoughts', READ_ID, 'My edit.', first.revision);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.content, 'Changed elsewhere.');
  const resolved = store.save(
    'thoughts',
    READ_ID,
    'My edit.',
    changed.revision,
  );
  assert.equal(resolved.ok, true);
  assert.equal(store.load('thoughts', READ_ID).content, 'My edit.');
});

test('user-data index updates and contains no note bodies', (t) => {
  const { store, userDataRoot } = setup(t);
  store.save('thoughts', READ_ID, 'Secret body text.', null);
  const indexText = readFileSync(join(userDataRoot, 'index.json'), 'utf8');
  assert.equal(indexText.includes('Secret body text.'), false);
  const index = JSON.parse(indexText);
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.items[READ_ID].hasThoughts, true);
  assert.equal(index.items[READ_ID].hasNotes, false);
  assert.equal(
    index.items[READ_ID].thoughtsPath,
    `items/${READ_ID}/thoughts.md`,
  );
  assert.ok(index.items[READ_ID].thoughtsLastModifiedUtc);
  store.save('notes', READ_ID, 'Note body.', null);
  const updated = JSON.parse(
    readFileSync(join(userDataRoot, 'index.json'), 'utf8'),
  );
  assert.equal(updated.items[READ_ID].hasNotes, true);
  assert.equal(updated.items[READ_ID].notesPath, `items/${READ_ID}/notes.md`);
});

test('Markdown Unicode text round-trips exactly', (t) => {
  const { store } = setup(t);
  const text =
    '# أفكاري 🎬\n\n**bold** و *مائل* وقائمة:\n- بند واحد\n`code` نهاية';
  const result = store.save('thoughts', READ_ID, text, null);
  assert.equal(store.load('thoughts', READ_ID).content, text);
  assert.equal(result.content, text);
});

test('empty note handling', (t) => {
  const { store, userDataRoot } = setup(t);
  const empty = store.save('thoughts', READ_ID, '   ', null);
  assert.equal(empty.ok, true);
  assert.equal(empty.exists, false);
  assert.equal(
    existsSync(join(userDataRoot, 'items', READ_ID, 'thoughts.md')),
    false,
  );
  const indexAfterEmpty = JSON.parse(
    readFileSync(join(userDataRoot, 'index.json'), 'utf8'),
  );
  assert.equal(indexAfterEmpty.items[READ_ID] ?? null, null);

  store.save('thoughts', READ_ID, 'Temporary.', null);
  store.save('thoughts', READ_ID, '', store.load('thoughts', READ_ID).revision);
  assert.equal(
    existsSync(join(userDataRoot, 'items', READ_ID, 'thoughts.md')),
    false,
  );
  assert.ok(readdirSync(join(userDataRoot, '.history', READ_ID)).length >= 1);
});

test('long note handling', (t) => {
  const { store } = setup(t);
  const text = `${'y'.repeat(300_000)}\nالأخيرة`;
  store.save('notes', READ_ID, text, null);
  assert.equal(store.load('notes', READ_ID).content, text);
});
