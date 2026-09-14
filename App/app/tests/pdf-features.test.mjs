import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  PdfAdapter,
  serializeDocumentLocation,
  deserializeDocumentLocation,
  createPageLocation,
  DocumentError,
} from '../lib/document/index.ts';

const FIXTURE_PATH = resolve(
  process.cwd(),
  '../forks/readest/apps/readest-app/src/__tests__/fixtures/data/sample-paper.pdf'
);
const FIXTURE_BYTES = new Uint8Array(readFileSync(FIXTURE_PATH));

const PAPER_SOURCE = {
  itemId: 'read-sample-paper-fixture',
  formatId: 'read-media-paper',
  format: 'pdf',
  sourceHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  byteSize: FIXTURE_BYTES.length,
  title: 'Sample Academic Paper.pdf',
};

test('Page navigation traverses pages, respects boundaries, and rejects invalid targets', async () => {
  const adapter = new PdfAdapter({ initialData: FIXTURE_BYTES });
  await adapter.open(PAPER_SOURCE);

  assert.equal(adapter.currentPage, 1);
  assert.equal(adapter.totalPages, 2);

  // Advance to next page
  await adapter.nextPage();
  assert.equal(adapter.currentPage, 2);

  // nextPage at end clamps to totalPages
  await adapter.nextPage();
  assert.equal(adapter.currentPage, 2);

  // Return to previous page
  await adapter.prevPage();
  assert.equal(adapter.currentPage, 1);

  // prevPage at beginning clamps to 1
  await adapter.prevPage();
  assert.equal(adapter.currentPage, 1);

  // Explicit goTo page 2
  await adapter.goTo(
    createPageLocation(PAPER_SOURCE.sourceHash, 2, { totalPages: 2 })
  );
  assert.equal(adapter.currentPage, 2);

  // Invalid page navigation (page 0 or page 999) throws NAVIGATION_FAILED or INVALID_SOURCE
  await assert.rejects(
    () =>
      adapter.goTo({
        schemaVersion: 1,
        sourceHash: PAPER_SOURCE.sourceHash,
        kind: 'page',
        payload: { pageNumber: 0, totalPages: 2 },
      }),
    (err) => DocumentError.isDocumentError(err)
  );

  await assert.rejects(
    () =>
      adapter.goTo(
        createPageLocation(PAPER_SOURCE.sourceHash, 999, { totalPages: 2 })
      ),
    (err) => DocumentError.isDocumentError(err) && err.code === 'NAVIGATION_FAILED'
  );

  // Mismatched source hash throws NAVIGATION_FAILED or SOURCE_CHANGED
  const wrongHash = '0000000000000000000000000000000000000000000000000000000000000000';
  await assert.rejects(
    () =>
      adapter.goTo(
        createPageLocation(wrongHash, 1, { totalPages: 2 })
      ),
    (err) =>
      DocumentError.isDocumentError(err) &&
      (err.code === 'SOURCE_CHANGED' || err.code === 'NAVIGATION_FAILED')
  );

  await adapter.close();
});

test('Outline extraction discovers bookmarks and enables targeted TOC navigation', async () => {
  const adapter = new PdfAdapter({ initialData: FIXTURE_BYTES });
  await adapter.open(PAPER_SOURCE);

  const toc = await adapter.getTOC();
  assert.ok(Array.isArray(toc));
  assert.ok(toc.length >= 1, 'Sample paper must have at least 1 outline entry');

  const firstEntry = toc[0];
  assert.equal(firstEntry.title, 'ABSTRACT');
  assert.ok(firstEntry.id.startsWith('toc-'));
  assert.ok(firstEntry.targetLocation);
  assert.equal(firstEntry.targetLocation.kind, 'page');
  assert.equal(firstEntry.targetLocation.sourceHash, PAPER_SOURCE.sourceHash);

  // Navigate using TOC entry
  await adapter.goTo(firstEntry.targetLocation);
  const loc = await adapter.getCurrentLocation();
  assert.equal(loc.payload.pageNumber, 1);

  await adapter.close();
});

test('Text search locates phrases across pages with snippets and supports cancellation', async () => {
  const adapter = new PdfAdapter({ initialData: FIXTURE_BYTES });
  await adapter.open(PAPER_SOURCE);

  // 1. Search for common academic word 'system' or 'paper'
  const results = await adapter.search('paper');
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0, 'Should find occurrences of "paper"');

  const firstResult = results[0];
  assert.ok(firstResult.id.startsWith('search-'));
  assert.ok(firstResult.matchText.toLowerCase().includes('paper'));
  assert.ok(firstResult.snippet.length > 0);
  assert.ok(firstResult.location.kind === 'page');
  assert.equal(firstResult.location.sourceHash, PAPER_SOURCE.sourceHash);

  // 2. Case sensitivity test
  const caseSensitiveMatches = await adapter.search('ABSTRACT', { caseSensitive: true });
  assert.ok(caseSensitiveMatches.length > 0);
  for (const m of caseSensitiveMatches) {
    assert.ok(m.matchText.includes('ABSTRACT'));
  }

  // 3. Max results limit test
  const limited = await adapter.search('the', { maxResults: 2 });
  assert.ok(limited.length <= 2, `Expected at most 2 results, got ${limited.length}`);

  // 4. AbortSignal cancellation test
  const abortCtrl = new AbortController();
  abortCtrl.abort();
  await assert.rejects(
    () => adapter.search('the', {}, abortCtrl.signal),
    (err) => DocumentError.isDocumentError(err) && err.code === 'CANCELLED'
  );

  await adapter.close();
});

test('Selection and versioned text anchors support creation, resolution, and mismatch guards', async () => {
  const adapter = new PdfAdapter({ initialData: FIXTURE_BYTES });
  await adapter.open(PAPER_SOURCE);

  // Create a synthetic selection on page 1
  const selection = {
    text: 'Autonomous reading systems',
    location: createPageLocation(PAPER_SOURCE.sourceHash, 1, { totalPages: 2 }),
    context: {
      prefix: 'Evaluation of ',
      suffix: ' in offline environments.',
    },
  };

  const anchor = await adapter.createTextAnchor(selection);
  assert.equal(anchor.schemaVersion, 1);
  assert.equal(anchor.kind, 'pdf-geometry');
  assert.equal(anchor.sourceHash, PAPER_SOURCE.sourceHash);
  assert.equal(anchor.quote, 'Autonomous reading systems');
  assert.equal(anchor.context?.prefix, 'Evaluation of ');
  assert.equal(anchor.context?.suffix, ' in offline environments.');
  assert.equal(anchor.payload.pageNumber, 1);
  assert.ok(Array.isArray(anchor.payload.rects));
  assert.ok(anchor.payload.rects.length > 0);

  // 1. Resolve matching anchor -> exact
  const resolved = await adapter.resolveTextAnchor(anchor);
  assert.equal(resolved.status, 'exact');
  assert.equal(resolved.confidence, 1.0);
  assert.ok(resolved.location);
  assert.equal(resolved.location.payload.pageNumber, 1);

  // 2. Resolve anchor with different sourceHash -> source-mismatch
  const foreignAnchor = {
    ...anchor,
    sourceHash: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
  };
  const foreignResolved = await adapter.resolveTextAnchor(foreignAnchor);
  assert.equal(foreignResolved.status, 'source-mismatch');
  assert.equal(foreignResolved.confidence, 0);

  // 3. Resolve anchor with future unsupported schemaVersion -> version-unsupported
  const futureAnchor = {
    ...anchor,
    schemaVersion: 999,
  };
  const futureResolved = await adapter.resolveTextAnchor(futureAnchor);
  assert.equal(futureResolved.status, 'version-unsupported');
  assert.equal(futureResolved.confidence, 0);

  // 4. Resolve anchor with out-of-bounds page -> unresolved
  const outOfBoundsAnchor = {
    ...anchor,
    payload: {
      ...anchor.payload,
      pageNumber: 99,
    },
  };
  const outOfBoundsResolved = await adapter.resolveTextAnchor(outOfBoundsAnchor);
  assert.equal(outOfBoundsResolved.status, 'unresolved');
  assert.equal(outOfBoundsResolved.confidence, 0);

  await adapter.close();
});

test('Reading progress serializes, deserializes, and restores cleanly across sessions', async () => {
  // Session 1: Navigate to page 2 and capture serialized location
  const session1 = new PdfAdapter({ initialData: FIXTURE_BYTES });
  await session1.open(PAPER_SOURCE);

  await session1.goTo(
    createPageLocation(PAPER_SOURCE.sourceHash, 2, { totalPages: 2 })
  );
  assert.equal(session1.currentPage, 2);

  const loc1 = await session1.getCurrentLocation();
  const serialized = serializeDocumentLocation(loc1);
  assert.ok(typeof serialized === 'string');
  assert.ok(serialized.includes(PAPER_SOURCE.sourceHash));

  await session1.close();

  // Session 2: New adapter instance restores location
  const session2 = new PdfAdapter({ initialData: FIXTURE_BYTES });
  await session2.open(PAPER_SOURCE);
  assert.equal(session2.currentPage, 1); // Initially page 1

  const restoredLoc = deserializeDocumentLocation(serialized, PAPER_SOURCE.sourceHash);
  await session2.goTo(restoredLoc);
  assert.equal(session2.currentPage, 2);

  const loc2 = await session2.getCurrentLocation();
  assert.equal(loc2.payload.pageNumber, 2);
  assert.equal(loc2.sourceHash, PAPER_SOURCE.sourceHash);

  await session2.close();
});
