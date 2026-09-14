import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  PdfAdapter,
  createPageLocation,
  DocumentError,
} from '../lib/document/index.ts';

// 1. Text-free image scan / empty page PDF
const SCAN_PDF_RAW = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
192
%%EOF`;
const SCAN_PDF_BYTES = new Uint8Array(Buffer.from(SCAN_PDF_RAW, 'utf-8'));

const SCAN_SOURCE = {
  itemId: 'read-scan-image-only-test',
  formatId: 'read-media-scan',
  format: 'pdf',
  sourceHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  byteSize: SCAN_PDF_BYTES.length,
  title: 'Historical Document Scan.pdf',
};

const ALICE_PATH = resolve(
  process.cwd(),
  '../forks/readest/apps/readest-app/src/__tests__/fixtures/data/sample-alice.pdf'
);
const ALICE_BYTES = new Uint8Array(readFileSync(ALICE_PATH));

const ALICE_SOURCE = {
  itemId: 'read-sample-alice-fixture',
  formatId: 'read-media-alice',
  format: 'pdf',
  sourceHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
  byteSize: ALICE_BYTES.length,
  title: "Alice's Adventures in Wonderland.pdf",
};

test('Missing-text / scanned PDF truthfully reports lack of text capabilities and does NOT attempt OCR', async () => {
  const adapter = new PdfAdapter({ initialData: SCAN_PDF_BYTES.slice() });
  await adapter.open(SCAN_SOURCE);

  // Truthful capability reporting: hasText is false
  assert.equal(adapter.hasText, false);
  const caps = adapter.getCapabilities();

  assert.equal(caps.has('textSearch'), false, 'Scan PDF must NOT report textSearch');
  assert.equal(caps.has('textSelection'), false, 'Scan PDF must NOT report textSelection');
  assert.equal(caps.has('textAnchors'), false, 'Scan PDF must NOT report textAnchors');

  // Fixed layout navigation must still function
  assert.equal(caps.has('pageNavigation'), true);
  assert.equal(caps.has('pagination'), true);
  assert.equal(caps.has('zoom'), true);

  // Searching on scanned document returns empty array immediately without attempting OCR
  const searchResults = await adapter.search('historical');
  assert.deepEqual(searchResults, []);

  // Selection is null on scanned document
  const selection = await adapter.getSelection();
  assert.equal(selection, null);

  // Attempting to create a text anchor throws UNSUPPORTED_CAPABILITY
  const fakeSelection = {
    text: 'Imaginary OCR text',
    location: createPageLocation(SCAN_SOURCE.sourceHash, 1),
  };
  await assert.rejects(
    () => adapter.createTextAnchor(fakeSelection),
    (err) => DocumentError.isDocumentError(err) && err.code === 'UNSUPPORTED_CAPABILITY'
  );

  // Page navigation and location still report accurately
  const loc = await adapter.getCurrentLocation();
  assert.equal(loc.payload.pageNumber, 1);
  assert.equal(loc.sourceHash, SCAN_SOURCE.sourceHash);

  await adapter.close();
});

test('Corrupt and malformed PDF files fail gracefully with DocumentError without unhandled crashes', async () => {
  const corruptBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
  const corruptSource = {
    ...SCAN_SOURCE,
    itemId: 'read-corrupt-file',
    title: 'Corrupted.pdf',
    byteSize: corruptBytes.length,
  };

  const adapter = new PdfAdapter({ initialData: corruptBytes });

  await assert.rejects(
    () => adapter.open(corruptSource),
    (err) =>
      DocumentError.isDocumentError(err) &&
      (err.code === 'PARSE_FAILED' || err.code === 'OPEN_FAILED')
  );

  assert.equal(adapter.lifecycleState, 'failed');
});

test('Multi-page document stress test: rapid forward and backward navigation maintains accurate position', async () => {
  const adapter = new PdfAdapter({ initialData: ALICE_BYTES.slice() });
  await adapter.open(ALICE_SOURCE);

  assert.equal(adapter.totalPages, 69);
  assert.equal(adapter.currentPage, 1);

  // Rapid forward navigation
  for (let i = 1; i <= 15; i++) {
    await adapter.nextPage();
    assert.equal(adapter.currentPage, i + 1);
  }
  assert.equal(adapter.currentPage, 16);

  // Jump to middle
  await adapter.goTo(
    createPageLocation(ALICE_SOURCE.sourceHash, 35, { totalPages: 69 })
  );
  assert.equal(adapter.currentPage, 35);

  // Rapid backward navigation
  for (let i = 35; i > 25; i--) {
    await adapter.prevPage();
    assert.equal(adapter.currentPage, i - 1);
  }
  assert.equal(adapter.currentPage, 25);

  // Verify location payload integrity
  const loc = await adapter.getCurrentLocation();
  assert.equal(loc.payload.pageNumber, 25);
  assert.equal(loc.payload.totalPages, 69);
  assert.equal(loc.sourceHash, ALICE_SOURCE.sourceHash);

  await adapter.close();
  assert.equal(adapter.lifecycleState, 'closed');
});

test('Search cancellation aborts cleanly when interrupted by an external AbortSignal', async () => {
  const adapter = new PdfAdapter({ initialData: ALICE_BYTES.slice() });
  await adapter.open(ALICE_SOURCE);

  const abortCtrl = new AbortController();

  // Search across 69 pages for a common word, aborting immediately
  const searchPromise = adapter.search('Alice', {}, abortCtrl.signal);
  abortCtrl.abort();

  await assert.rejects(
    () => searchPromise,
    (err) => DocumentError.isDocumentError(err) && err.code === 'CANCELLED'
  );

  await adapter.close();
});

test('Repeated open and close operations across independent adapter instances do not leak state', async () => {
  for (let cycle = 0; cycle < 5; cycle++) {
    const adapter = new PdfAdapter({ initialData: SCAN_PDF_BYTES.slice() });
    assert.equal(adapter.lifecycleState, 'created');

    await adapter.open(SCAN_SOURCE);
    assert.equal(adapter.lifecycleState, 'open');
    assert.equal(adapter.currentPage, 1);

    await adapter.close();
    assert.equal(adapter.lifecycleState, 'closed');
  }
});
