import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSearchStore } from '../server/search-store.mjs';
import { createAnnotationStore } from '../server/annotation-store.mjs';
import { createCanvasStore } from '../server/canvas-store.mjs';
import { createUserDataStore } from '../server/user-data-store.mjs';
import { writeTestDatabase } from './test-database.mjs';
import { studyExtensions } from '../lib/study/extension-hooks.ts';
import {
  createPageLocation,
  createSemanticLocation,
} from '../lib/document/location.ts';

function createTestEnvironment(initialItems = []) {
  const tempDir = mkdtempSync(join(tmpdir(), 'rw-p11-study-'));
  const dbPath = join(tempDir, 'library.sqlite3');
  const userDataRoot = join(tempDir, 'user-data');

  writeTestDatabase(dbPath, initialItems);

  const searchStore = createSearchStore({ databasePath: dbPath, userDataRoot });
  const annotationStore = createAnnotationStore({ databasePath: dbPath, userDataRoot, searchStore });
  const canvasStore = createCanvasStore({ databasePath: dbPath, userDataRoot, searchStore });
  const userDataStore = createUserDataStore({ libraryDatabasePath: dbPath, userDataRoot, searchStore });

  return {
    tempDir,
    dbPath,
    userDataRoot,
    searchStore,
    annotationStore,
    canvasStore,
    userDataStore,
    cleanup() {
      userDataStore.close();
      canvasStore.close();
      annotationStore.close();
      searchStore.close();
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

test('Study extension hooks are disabled/offline by default and support dynamic registration', async () => {
  // Offline by default
  assert.equal(studyExtensions.isDictionaryConfigured(), false);
  assert.equal(studyExtensions.isTranslationConfigured(), false);
  assert.equal(studyExtensions.getDictionaryProvider(), null);
  assert.equal(studyExtensions.getTranslationProvider(), null);

  // Register mock provider
  const mockDict = {
    id: 'test-dict',
    name: 'Test Local Dictionary',
    async lookup({ word }) {
      return {
        word,
        definitions: [{ definition: `Definition of ${word}` }],
        source: 'Mock Dict',
      };
    },
  };

  studyExtensions.setDictionaryProvider(mockDict);
  assert.equal(studyExtensions.isDictionaryConfigured(), true);
  const res = await studyExtensions.getDictionaryProvider().lookup({ word: 'epistemology' });
  assert.equal(res.word, 'epistemology');
  assert.equal(res.definitions[0].definition, 'Definition of epistemology');

  // Reset to offline
  studyExtensions.setDictionaryProvider(null);
  assert.equal(studyExtensions.isDictionaryConfigured(), false);
  assert.equal(studyExtensions.getDictionaryProvider(), null);
});

test('Study browser filters by type and book correctly across all artifact kinds', async () => {
  const book1 = {
    id: 'read-11111111111111111111111111111111',
    collection: 'read',
    type: 'Book',
    title: 'Quantum Computing Principles',
    summary: 'A study of qubits, superposition, and quantum computing algorithms.',
    itemPath: 'Quantum.epub',
    authors: ['David Deutsch'],
    tags: ['physics', 'computing'],
  };

  const book2 = {
    id: 'read-22222222222222222222222222222222',
    collection: 'read',
    type: 'Book',
    title: 'Cell Biology Fundamentals',
    summary: 'Essential concepts in molecular biology and cellular respiration.',
    itemPath: 'Cell.epub',
    authors: ['Bruce Alberts'],
    tags: ['biology'],
  };

  const env = createTestEnvironment([book1, book2]);

  try {
    const { annotationStore, canvasStore, userDataStore, searchStore } = env;
    searchStore.rebuildIndex();

    // Add Highlight on book 1
    annotationStore.createAnnotation({
      itemId: book1.id,
      assetId: 'asset-qc',
      kind: 'text-mark',
      anchor: {
        kind: 'pdf-text',
        pageNumber: 42,
        selectedText: 'superposition of quantum states',
        sourceHash: 'qc-hash-01',
      },
      content: { subKind: 'highlight', color: '#ff0' },
      sourceHash: 'qc-hash-01',
    });

    // Add Comment on book 1
    annotationStore.createAnnotation({
      itemId: book1.id,
      assetId: 'asset-qc',
      kind: 'comment',
      anchor: {
        kind: 'pdf-text',
        pageNumber: 45,
        selectedText: 'quantum decoherence',
        sourceHash: 'qc-hash-01',
      },
      content: { body: 'Crucial limitation for physical qubits' },
      sourceHash: 'qc-hash-01',
    });

    // Add Highlight on book 2
    annotationStore.createAnnotation({
      itemId: book2.id,
      assetId: 'asset-cell',
      kind: 'text-mark',
      anchor: {
        kind: 'reflowable-text',
        startCfi: '/6/4!/4',
        endCfi: '/6/4!/8',
        spineIndex: 2,
        quote: 'mitochondrial oxidative phosphorylation',
        sourceHash: 'cell-hash-01',
      },
      content: { subKind: 'highlight', color: '#0f0' },
      sourceHash: 'cell-hash-01',
    });

    // Add Canvas linked to book 1
    canvasStore.createCanvas({
      title: 'Qubit Architecture Diagram',
      itemId: book1.id,
    });

    // Add Item Note to book 2
    userDataStore.save(
      'notes',
      book2.id,
      '# Cellular Respiration\nATP synthase generates ATP across the inner mitochondrial membrane.',
      null,
    );

    // 1. Search with typeFilter: 'highlight'
    const hlHits = searchStore.search({ query: '', typeFilter: 'highlight' });
    assert.equal(hlHits.results.length, 2);
    for (const h of hlHits.results) {
      assert.equal(h.kind, 'annotation');
      assert.equal(h.subkind, 'highlight');
    }

    // 2. Search with typeFilter: 'comment'
    const cmHits = searchStore.search({ query: '', typeFilter: 'comment' });
    assert.equal(cmHits.results.length, 1);
    assert.equal(cmHits.results[0].title, 'Crucial limitation for physical qubits');

    // 3. Search with bookFilter: book1.id
    const b1Hits = searchStore.search({ query: '', bookFilter: book1.id });
    assert.ok(b1Hits.results.length >= 3, 'Should find highlights, comments, and canvases for book 1');
    for (const h of b1Hits.results) {
      assert.equal(h.itemId, book1.id);
    }

    // 4. Search with bookFilter: book2.id and query: 'mitochondrial'
    const mitoHits = searchStore.search({ query: 'mitochondrial', bookFilter: book2.id });
    assert.ok(mitoHits.results.length >= 2, 'Should find both highlight and note for book 2');

    // 5. Test Filterable Books summary
    const books = searchStore.getFilterableBooks();
    assert.ok(books.length >= 2);
    const b1 = books.find((b) => b.itemId === book1.id);
    assert.ok(b1);
    assert.equal(b1.title, 'Quantum Computing Principles');
    assert.ok(b1.count >= 3);
  } finally {
    env.cleanup();
  }
});

test('Location anchor resolution correctly maps PDF and Reflowable anchors to DocumentLocation', () => {
  const sourceHash = 'abc123def456';

  // PDF Text anchor
  const pdfAnchor = {
    kind: 'pdf-text',
    pageNumber: 15,
    selectedText: 'Quantum mechanics',
    sourceHash,
  };
  const pdfLoc = createPageLocation(sourceHash, pdfAnchor.pageNumber);
  assert.equal(pdfLoc.kind, 'page');
  assert.equal(pdfLoc.payload.pageNumber, 15);

  // Reflowable text anchor
  const reflowAnchor = {
    kind: 'reflowable-text',
    startCfi: '/6/12!/4/2',
    endCfi: '/6/12!/4/10',
    spineIndex: 5,
    quote: 'Thermodynamics of computation',
    sourceHash,
  };
  const reflowLoc = createSemanticLocation(sourceHash, {
    cfi: reflowAnchor.startCfi,
    spineIndex: reflowAnchor.spineIndex,
  });
  assert.equal(reflowLoc.kind, 'semantic');
  assert.equal(reflowLoc.payload.cfi, '/6/12!/4/2');
  assert.equal(reflowLoc.payload.spineIndex, 5);
});
