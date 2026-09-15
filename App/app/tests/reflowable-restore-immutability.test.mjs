import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  FoliateReflowableAdapter,
  serializeDocumentLocation,
  deserializeDocumentLocation,
  createSemanticLocation,
  DocumentError,
} from '../lib/document/index.ts';
import { resolveDataPaths } from '../server/data-paths.mjs';

const SAMPLE_SOURCE = {
  itemId: 'read-sample-epub-000000000000002',
  formatId: 'read-media-1',
  format: 'epub',
  sourceHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
  byteSize: 524288,
  title: 'Domain Driven Reader Systems.epub',
};

test('Reading position serializes, deserializes, and restores cleanly across sessions', async () => {
  const adapter1 = new FoliateReflowableAdapter();
  await adapter1.open(SAMPLE_SOURCE);

  // Navigate to chapter 3
  const targetLoc = createSemanticLocation(SAMPLE_SOURCE.sourceHash, {
    sectionId: 'chap-3',
    spineIndex: 2,
    progression: 0.4,
    title: 'Chapter 3',
  });
  await adapter1.goTo(targetLoc);

  const loc1 = await adapter1.getCurrentLocation();
  const serialized = serializeDocumentLocation(loc1);
  assert.equal(typeof serialized, 'string');
  assert.ok(serialized.includes(SAMPLE_SOURCE.sourceHash));

  await adapter1.close();
  assert.equal(adapter1.lifecycleState, 'closed');

  // New adapter session: restore serialized position
  const adapter2 = new FoliateReflowableAdapter();
  await adapter2.open(SAMPLE_SOURCE);

  const restoredLoc = deserializeDocumentLocation(serialized, SAMPLE_SOURCE.sourceHash);
  await adapter2.goTo(restoredLoc);

  const loc2 = await adapter2.getCurrentLocation();
  assert.equal(loc2.sourceHash, SAMPLE_SOURCE.sourceHash);
  assert.equal(loc2.kind, 'semantic');
  const payload2 = loc2.payload;
  assert.equal(payload2.spineIndex, 2);

  await adapter2.close();
});

test('Location deserialization rejects mismatched source content hashes', () => {
  const original = createSemanticLocation(SAMPLE_SOURCE.sourceHash, {
    sectionId: 'chap-1',
    progression: 0.1,
  });
  const serialized = serializeDocumentLocation(original);

  const differentHash = '0000000000000000000000000000000000000000000000000000000000000000';

  assert.throws(
    () => deserializeDocumentLocation(serialized, differentHash),
    (err) => DocumentError.isDocumentError(err) && err.code === 'SOURCE_CHANGED'
  );
});

async function findEpubsRecursively(dir) {
  const results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await findEpubsRecursively(full);
        results.push(...sub);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.epub')) {
        results.push(full);
      }
    }
  } catch {
    // Directory may not exist in some environments
  }
  return results;
}

async function computeSha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

test('Source Immutability Gate: Real local EPUBs remain 100% byte-identical', async () => {
  const appRoot = resolve(process.cwd());
  const { dataRoot } = resolveDataPaths({ appRoot });
  const bookDir = join(dataRoot, 'Read', 'Book');

  let epubPaths = await findEpubsRecursively(bookDir);
  const isFallback = epubPaths.length === 0;
  if (isFallback) {
    const fixtureDir = resolve(appRoot, 'tests', 'fixtures', 'epub');
    epubPaths = await findEpubsRecursively(fixtureDir);
  }

  assert.ok(
    epubPaths.length >= (isFallback ? 1 : 8),
    `Expected at least ${isFallback ? 1 : 8} EPUB files in ${isFallback ? 'test fixtures' : 'local data directory'}, found ${epubPaths.length}`
  );

  // 1. Hash all EPUB files BEFORE adapter operations
  const preHashes = new Map();
  const preStats = new Map();
  for (const filePath of epubPaths) {
    const hash = await computeSha256(filePath);
    const st = await stat(filePath);
    preHashes.set(filePath, hash);
    preStats.set(filePath, { size: st.size, mtimeMs: st.mtimeMs });
  }

  // 2. Open and operate on a real EPUB using FoliateReflowableAdapter
  const testEpubPath = epubPaths.find((p) => p.includes('Quick Start Guide')) || epubPaths[0];
  const fileBytes = await readFile(testEpubPath);
  const realHash = await computeSha256(testEpubPath);

  const realSource = {
    itemId: 'read-real-epub-test',
    formatId: 'read-media-real',
    format: 'epub',
    sourceHash: realHash,
    byteSize: fileBytes.length,
    title: 'Real Verification Book.epub',
  };

  const adapter = new FoliateReflowableAdapter({ initialData: fileBytes });
  await adapter.open(realSource);

  // Read metadata, TOC, navigate, search
  await adapter.getMetadata();
  const toc = await adapter.getTOC();
  if (toc.length > 0) {
    await adapter.goTo(toc[0].targetLocation);
  }
  await adapter.search('the');
  const selection = await adapter.getSelection();
  if (selection) {
    const anchor = await adapter.createTextAnchor(selection);
    await adapter.resolveTextAnchor(anchor);
  }
  await adapter.close();

  // 3. Hash all EPUB files AFTER adapter operations
  for (const filePath of epubPaths) {
    const postHash = await computeSha256(filePath);
    const postStat = await stat(filePath);
    const preHash = preHashes.get(filePath);
    const preSt = preStats.get(filePath);

    assert.equal(
      postHash,
      preHash,
      `Source immutability violation! File "${filePath}" was modified!`
    );
    assert.equal(postStat.size, preSt.size, `File size changed for "${filePath}"`);
    assert.equal(
      postStat.mtimeMs,
      preSt.mtimeMs,
      `Modification time changed for "${filePath}"`
    );
  }
});
