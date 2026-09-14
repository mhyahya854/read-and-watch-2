import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  PdfAdapter,
  DocumentError,
} from '../lib/document/index.ts';
import { FakeReflowableAdapter } from '../lib/document/test-doubles/fake-reflowable-adapter.ts';

const PAPER_PATH = fileURLToPath(
  new URL('./fixtures/pdf/sample-paper.pdf', import.meta.url)
);
const PAPER_BYTES = new Uint8Array(readFileSync(PAPER_PATH));

const PAPER_SOURCE = {
  itemId: 'read-sample-paper-fixture',
  formatId: 'read-media-paper',
  format: 'pdf',
  sourceHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  byteSize: PAPER_BYTES.length,
  title: 'Sample Academic Paper.pdf',
};

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

test('Book-local PDF search finds occurrences with snippets and respects options', async () => {
  const adapter = new PdfAdapter({ initialData: PAPER_BYTES });
  await adapter.open(PAPER_SOURCE);

  assert.equal(adapter.getCapabilities().has('textSearch'), true);

  // 1. Basic search
  const results = await adapter.search('paper');
  assert.ok(results.length > 0, 'Expected matches for "paper"');
  for (const r of results) {
    assert.ok(r.id, 'Match must have an id');
    assert.equal(r.location.kind, 'page');
    assert.ok(r.location.payload.pageNumber >= 1);
    assert.ok(r.snippet.length > 0, 'Snippet must not be empty');
  }

  // 2. Case sensitive search
  const upperHits = await adapter.search('ABSTRACT', { caseSensitive: true });
  assert.ok(upperHits.length > 0);
  const lowerHits = await adapter.search('abstract', { caseSensitive: true });
  assert.notEqual(upperHits.length, lowerHits.length);

  // 3. maxResults limit
  const limited = await adapter.search('the', { maxResults: 2 });
  assert.equal(limited.length, 2);

  // 4. Empty or whitespace query returns empty array
  const emptyHits = await adapter.search('   ');
  assert.deepEqual(emptyHits, []);

  await adapter.close();
});

test('Book-local PDF search handles cancellation via AbortSignal', async () => {
  const adapter = new PdfAdapter({ initialData: PAPER_BYTES });
  await adapter.open(PAPER_SOURCE);

  const abortCtrl = new AbortController();
  abortCtrl.abort();

  await assert.rejects(
    () => adapter.search('paper', {}, abortCtrl.signal),
    (err) => DocumentError.isDocumentError(err) && err.code === 'CANCELLED'
  );

  await adapter.close();
});

test('Image-only/scanned PDF without text layer truthfully refuses search without OCR', async () => {
  const adapter = new PdfAdapter({ initialData: SCAN_PDF_BYTES.slice() });
  await adapter.open(SCAN_SOURCE);

  assert.equal(adapter.hasText, false);
  assert.equal(adapter.getCapabilities().has('textSearch'), false);

  // Searching returns empty array immediately and does not invoke OCR
  const hits = await adapter.search('text');
  assert.deepEqual(hits, []);

  await adapter.close();
});

test('Book-local Reflowable search returns semantic locations with chapter/section context', async () => {
  const fakeAdapter = new FakeReflowableAdapter();
  await fakeAdapter.open({
    itemId: 'epub-test-1',
    formatId: 'read-media-epub',
    format: 'epub',
    sourceHash: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
    byteSize: 1024,
    title: 'Test EPUB Book',
  });

  assert.equal(fakeAdapter.getCapabilities().has('textSearch'), true);

  const hits = await fakeAdapter.search('Chapter');
  assert.ok(hits.length > 0);

  const firstHit = hits[0];
  assert.equal(firstHit.location.kind, 'semantic');
  assert.ok(firstHit.snippet.length > 0);
  assert.ok(firstHit.location.payload.spineIndex !== undefined || firstHit.location.payload.cfi);

  // Cancellation
  const abortCtrl = new AbortController();
  abortCtrl.abort();
  await assert.rejects(
    () => fakeAdapter.search('Chapter', {}, abortCtrl.signal),
    (err) => DocumentError.isDocumentError(err) && err.code === 'CANCELLED'
  );

  await fakeAdapter.close();
});
