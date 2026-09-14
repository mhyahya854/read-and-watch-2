/**
 * Search Store & Derived Index Test Suite.
 *
 * Phase 11 — Search, Annotation Browser, and Study Workflow.
 * Verification Gate P11-G001: Completeness, precision, rebuild, and invalidation.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { createSearchStore, SEARCH_INDEX_SCHEMA_VERSION } from '../server/search-store.mjs';
import { createAnnotationStore } from '../server/annotation-store.mjs';
import { createCanvasStore } from '../server/canvas-store.mjs';
import { createReaderStore } from '../server/reader-store.mjs';
import { writeTestDatabase } from './test-database.mjs';
import { buildFtsQuery, normalizeQuery, parseSnippetTokens } from '../server/search-query.mjs';

function createTestEnvironment() {
  const directory = mkdtempSync(join(tmpdir(), 'read-watch-search-test-'));
  const databasePath = join(directory, 'read-watch.sqlite3');
  const userDataRoot = join(directory, 'user-data');
  const libraryRoot = join(directory, 'library');

  mkdirSync(userDataRoot, { recursive: true });
  mkdirSync(libraryRoot, { recursive: true });

  const items = [
    {
      id: 'read-11111111111111111111111111111111',
      collection: 'read',
      title: 'Principles of Molecular Biology',
      summary: 'A comprehensive study of cellular mitosis, genetics, and DNA replication.',
      itemPath: 'Principles.epub',
      media: [{ name: 'Principles.epub', path: 'Principles.epub', extension: '.epub' }],
    },
    {
      id: 'read-22222222222222222222222222222222',
      collection: 'read',
      title: 'Urdu Literature and Poetry دیوان غالب',
      summary: 'Classical Urdu Ghazals and historical analysis of Ghalib works.',
      itemPath: 'Urdu.pdf',
      media: [{ name: 'Urdu.pdf', path: 'Urdu.pdf', extension: '.pdf' }],
    },
    {
      id: 'watch-33333333333333333333333333333333',
      collection: 'watch',
      title: 'Cellular Automata Documentary',
      summary: 'Exploring computational biology and complex emergent patterns.',
      itemPath: 'Automata.mp4',
      media: [{ name: 'Automata.mp4', path: 'Automata.mp4', extension: '.mp4' }],
    },
  ];

  writeTestDatabase(databasePath, items);

  return {
    directory,
    databasePath,
    userDataRoot,
    libraryRoot,
    items,
    cleanup() {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {}
    },
  };
}

test('Derived search store initializes schema and reports ready after rebuild', () => {
  const env = createTestEnvironment();
  try {
    const searchStore = createSearchStore({
      databasePath: env.databasePath,
      userDataRoot: env.userDataRoot,
    });

    const initialStatus = searchStore.getStatus();
    assert.equal(initialStatus.schemaVersion, SEARCH_INDEX_SCHEMA_VERSION);

    const rebuildResult = searchStore.rebuildIndex();
    assert.equal(rebuildResult.ok, true);
    assert.equal(rebuildResult.counts.items, 3);

    const statusAfter = searchStore.getStatus();
    assert.equal(statusAfter.status, 'ready');
    assert.equal(statusAfter.counts.items, 3);
    assert.ok(statusAfter.lastRebuiltAtUtc);

    searchStore.close();
  } finally {
    env.cleanup();
  }
});

test('Search query builder normalizes input and escapes FTS5 special characters safely', () => {
  assert.equal(normalizeQuery('   hello    world   '), 'hello world');
  assert.equal(normalizeQuery(''), '');

  // Truncates at max length
  const longStr = 'a'.repeat(300);
  assert.equal(normalizeQuery(longStr).length, 200);

  // Safe FTS query escaping
  const safeQuotes = buildFtsQuery('hello "world"');
  assert.ok(!safeQuotes.includes('""world""'));

  const safeSpecial = buildFtsQuery('test: (foo OR bar) -baz* ^qux');
  assert.ok(safeSpecial.length > 0);
  assert.ok(!safeSpecial.includes('('));
  assert.ok(!safeSpecial.includes(')'));
  assert.ok(!safeSpecial.includes(':'));

  // Unicode tokens
  const urdu = buildFtsQuery('دیوان غالب');
  assert.ok(urdu.includes('دیوان'));
  assert.ok(urdu.includes('غالب'));
});

test('parseSnippetTokens extracts structured tokens for HTML-safe rendering', () => {
  const snippet = 'This is [[MATCH]]mitosis[[/MATCH]] in biology.';
  const tokens = parseSnippetTokens(snippet);
  assert.deepEqual(tokens, [
    { text: 'This is ', match: false },
    { text: 'mitosis', match: true },
    { text: ' in biology.', match: false },
  ]);

  const noMatch = 'Just plain text';
  assert.deepEqual(parseSnippetTokens(noMatch), [{ text: 'Just plain text', match: false }]);

  const empty = parseSnippetTokens('');
  assert.deepEqual(empty, []);
});

test('Indexes library metadata and enables search with type and book filters', () => {
  const env = createTestEnvironment();
  try {
    const searchStore = createSearchStore({
      databasePath: env.databasePath,
      userDataRoot: env.userDataRoot,
    });
    searchStore.rebuildIndex();

    // Query across all library items
    const resBiology = searchStore.search({ query: 'mitosis' });
    assert.equal(resBiology.total, 1);
    assert.equal(resBiology.results[0].title, 'Principles of Molecular Biology');
    assert.equal(resBiology.results[0].kind, 'library-item');

    // Filter by type: library-item
    const resFiltered = searchStore.search({ query: 'biology', typeFilter: 'library-item' });
    assert.equal(resFiltered.total, 2);

    // Filter by book
    const resBook = searchStore.search({
      query: 'biology',
      bookFilter: 'read-11111111111111111111111111111111',
    });
    assert.equal(resBook.total, 1);
    assert.equal(resBook.results[0].itemId, 'read-11111111111111111111111111111111');

    searchStore.close();
  } finally {
    env.cleanup();
  }
});

test('Indexes annotations, handles soft delete exclusion, and supports incremental invalidation', () => {
  const env = createTestEnvironment();
  let searchStore;
  let annotationStore;
  try {
    searchStore = createSearchStore({
      databasePath: env.databasePath,
      userDataRoot: env.userDataRoot,
    });
    annotationStore = createAnnotationStore({
      databasePath: env.databasePath,
      userDataRoot: env.userDataRoot,
      searchStore,
    });

    searchStore.rebuildIndex();

    // 1. Create a highlight
    const hl = annotationStore.createAnnotation({
      itemId: 'read-11111111111111111111111111111111',
      assetId: 'asset-1',
      kind: 'text-mark',
      anchor: { kind: 'pdf-text', pageNumber: 42, quote: 'Chromosomes align along the metaphase plate.' },
      content: { subKind: 'highlight', color: '#ffeb3b' },
      sourceHash: 'sha-sample-1',
    });

    // 2. Create a comment
    const cm = annotationStore.createAnnotation({
      itemId: 'read-11111111111111111111111111111111',
      assetId: 'asset-1',
      kind: 'comment',
      anchor: { kind: 'pdf-text', pageNumber: 43, quote: 'Centromere separation occurs in anaphase.' },
      content: { body: 'Crucial mechanism for daughter cell parity.' },
      sourceHash: 'sha-sample-1',
    });

    // Verify search finds the newly created highlight and comment
    const searchHl = searchStore.search({ query: 'Chromosomes' });
    assert.equal(searchHl.total, 1);
    assert.equal(searchHl.results[0].id, hl.id);
    assert.equal(searchHl.results[0].kind, 'annotation');
    assert.equal(searchHl.results[0].subkind, 'highlight');

    const searchCm = searchStore.search({ query: 'daughter cell' });
    assert.equal(searchCm.total, 1);
    assert.equal(searchCm.results[0].id, cm.id);
    assert.equal(searchCm.results[0].subkind, 'comment');

    // 3. Type filters
    const onlyComments = searchStore.search({ query: '', typeFilter: 'comment' });
    assert.equal(onlyComments.total, 1);
    assert.equal(onlyComments.results[0].id, cm.id);

    const onlyHighlights = searchStore.search({ query: '', typeFilter: 'highlight' });
    assert.equal(onlyHighlights.total, 1);
    assert.equal(onlyHighlights.results[0].id, hl.id);

    // 4. Soft delete annotation -> must immediately be excluded from search
    annotationStore.deleteAnnotation(hl.id, hl.revision);

    const searchDeleted = searchStore.search({ query: 'Chromosomes' });
    assert.equal(searchDeleted.total, 0);

    // 5. Restore annotation -> reappears in search
    const restored = annotationStore.restoreAnnotation(hl.id, hl.revision + 1);
    const searchRestored = searchStore.search({ query: 'Chromosomes' });
    assert.equal(searchRestored.total, 1);
    assert.equal(searchRestored.results[0].id, restored.id);
  } finally {
    if (annotationStore) annotationStore.close();
    if (searchStore) searchStore.close();
    env.cleanup();
  }
});

test('Indexes bookmarks, canvases, and notes with full searchability', () => {
  const env = createTestEnvironment();
  let searchStore;
  let readerStore;
  let canvasStore;
  try {
    searchStore = createSearchStore({
      databasePath: env.databasePath,
      userDataRoot: env.userDataRoot,
    });
    readerStore = createReaderStore({
      libraryRoot: env.libraryRoot,
      libraryDatabasePath: env.databasePath,
      userDataRoot: env.userDataRoot,
      searchStore,
    });
    canvasStore = createCanvasStore({
      databasePath: env.databasePath,
      userDataRoot: env.userDataRoot,
      searchStore,
    });

    searchStore.rebuildIndex();

    // 1. Add Bookmark
    const bm = readerStore.addBookmark('read-11111111111111111111111111111111', {
      label: 'Telophase Diagram',
      snippet: 'Nuclear envelopes re-form around chromosome sets.',
      pageNumber: 45,
      location: { schemaVersion: 1, kind: 'page', sourceHash: 'h1', payload: { pageNumber: 45 } },
    });

    // 2. Create Canvas with scene text
    const canvas = canvasStore.createCanvas({
      itemId: 'read-11111111111111111111111111111111',
      title: 'Mitosis Stage Flowchart',
      scene: {
        elements: [
          { type: 'text', text: 'Prophase to Metaphase spindle assembly' },
          { type: 'rectangle' },
        ],
      },
    });

    // 3. Index Note
    searchStore.indexNote('read-11111111111111111111111111111111', 'notes', 'Key summary of meiosis vs mitosis.');

    // Query bookmark
    const searchBm = searchStore.search({ query: 'Telophase' });
    assert.equal(searchBm.total, 1);
    assert.equal(searchBm.results[0].kind, 'bookmark');
    assert.equal(searchBm.results[0].id, bm.id);

    // Query canvas
    const searchCanvas = searchStore.search({ query: 'spindle assembly' });
    assert.equal(searchCanvas.total, 1);
    assert.equal(searchCanvas.results[0].kind, 'canvas');
    assert.equal(searchCanvas.results[0].id, canvas.canvasId);

    // Query note
    const searchNote = searchStore.search({ query: 'meiosis' });
    assert.equal(searchNote.total, 1);
    assert.equal(searchNote.results[0].kind, 'note');

    // Filterable books aggregation
    const filterBooks = searchStore.getFilterableBooks();
    assert.ok(filterBooks.length > 0);
    assert.equal(filterBooks[0].itemId, 'read-11111111111111111111111111111111');
    assert.equal(filterBooks[0].title, 'Principles of Molecular Biology');
  } finally {
    if (canvasStore) canvasStore.close();
    if (searchStore) searchStore.close();
    env.cleanup();
  }
});

test('Unicode queries (Urdu / Arabic / non-Latin) work accurately', () => {
  const env = createTestEnvironment();
  let searchStore;
  try {
    searchStore = createSearchStore({
      databasePath: env.databasePath,
      userDataRoot: env.userDataRoot,
    });
    searchStore.rebuildIndex();

    // Query Urdu book
    const urduSearch = searchStore.search({ query: 'غالب' });
    assert.equal(urduSearch.total, 1);
    assert.equal(urduSearch.results[0].itemId, 'read-22222222222222222222222222222222');

    const urduTitle = searchStore.search({ query: 'دیوان' });
    assert.equal(urduTitle.total, 1);
  } finally {
    if (searchStore) searchStore.close();
    env.cleanup();
  }
});

test('Rebuild is deterministic and produces identical result sets', () => {
  const env = createTestEnvironment();
  let searchStore;
  try {
    searchStore = createSearchStore({
      databasePath: env.databasePath,
      userDataRoot: env.userDataRoot,
    });

    searchStore.rebuildIndex();
    const run1 = searchStore.search({ query: '' });

    // Drop index and rebuild
    searchStore.rebuildIndex();
    const run2 = searchStore.search({ query: '' });

    assert.equal(run1.total, run2.total);
    assert.deepEqual(
      run1.results.map((r) => r.id),
      run2.results.map((r) => r.id),
    );
  } finally {
    if (searchStore) searchStore.close();
    env.cleanup();
  }
});

test('Deleting derived search tables preserves canonical user data and allows clean rebuild', () => {
  const env = createTestEnvironment();
  let searchStore;
  try {
    searchStore = createSearchStore({
      databasePath: env.databasePath,
      userDataRoot: env.userDataRoot,
    });
    searchStore.rebuildIndex();

    // Manually drop derived index tables to simulate corruption or missing index
    const db = new DatabaseSync(env.databasePath);
    db.exec('DROP TABLE IF EXISTS search_index_fts');
    db.exec('DROP TABLE IF EXISTS search_index_records');
    db.close();

    // Canonical items still exist untouched!
    const verifyDb = new DatabaseSync(env.databasePath);
    const countItems = verifyDb.prepare('SELECT COUNT(*) as c FROM items').get();
    assert.equal(countItems.c, 3);
    verifyDb.close();

    // Store recovers and rebuilds cleanly
    const rebuild = searchStore.rebuildIndex();
    assert.equal(rebuild.ok, true);
    assert.equal(rebuild.counts.items, 3);

    const postRebuild = searchStore.search({ query: 'mitosis' });
    assert.equal(postRebuild.total, 1);
  } finally {
    if (searchStore) searchStore.close();
    env.cleanup();
  }
});
