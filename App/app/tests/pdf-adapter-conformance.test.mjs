import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PdfAdapter,
  runDocumentAdapterConformanceSuite,
  DocumentError,
} from '../lib/document/index.ts';

const SAMPLE_PDF_SOURCE = {
  itemId: 'read-sample-pdf-0000000000000001',
  formatId: 'read-media-0',
  format: 'pdf',
  sourceHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
  byteSize: 1048576,
  title: 'Architecture & Design Principles.pdf',
};

test('PdfAdapter passes the universal document adapter conformance suite', async () => {
  const report = await runDocumentAdapterConformanceSuite(
    'PdfAdapter-Production',
    () => new PdfAdapter(),
    SAMPLE_PDF_SOURCE
  );

  for (const check of report.checks) {
    assert.equal(
      check.passed,
      true,
      `Check "${check.checkName}" failed on PdfAdapter: ${check.detail || 'no details'}`
    );
  }

  assert.equal(report.passed, true);
  assert.ok(report.checks.length >= 18);
});

test('PdfAdapter reports truthful capability profile for fixed-layout PDF', async () => {
  const adapter = new PdfAdapter();
  await adapter.open(SAMPLE_PDF_SOURCE);

  const caps = adapter.getCapabilities();

  // Fixed layout capabilities must be strictly reported
  assert.equal(caps.has('pageNavigation'), true, 'PDF must support page navigation');
  assert.equal(caps.has('pagination'), true, 'PDF must report pagination');
  assert.equal(caps.has('zoom'), true, 'PDF must support zoom');
  assert.equal(caps.has('textSearch'), true, 'PDF with text must support search');
  assert.equal(caps.has('textSelection'), true, 'PDF with text must support selection');
  assert.equal(caps.has('textAnchors'), true, 'PDF with text must support anchors');
  assert.equal(caps.has('toc'), true, 'PDF must report toc support');

  // Reflowable capabilities must NOT be claimed
  assert.equal(caps.has('fontControls'), false, 'PDF must not claim font controls');
  assert.equal(caps.has('themeControls'), false, 'PDF must not claim theme controls');
  assert.equal(caps.has('continuousLayout'), false, 'PDF must not claim continuous layout');
  assert.equal(caps.has('semanticLocationNavigation'), false, 'PDF must not claim semantic location navigation');

  await adapter.close();
});

test('PdfAdapter enforces strict lifecycle guards and state machine transitions', async () => {
  const adapter = new PdfAdapter();
  assert.equal(adapter.lifecycleState, 'created');
  assert.equal(adapter.source, null);

  // Calling async methods before open rejects with INVALID_LIFECYCLE_STATE
  await assert.rejects(
    () => adapter.getCurrentLocation(),
    (err) => DocumentError.isDocumentError(err) && err.code === 'INVALID_LIFECYCLE_STATE'
  );

  await adapter.open(SAMPLE_PDF_SOURCE);
  assert.equal(adapter.lifecycleState, 'open');
  assert.equal(adapter.source?.itemId, SAMPLE_PDF_SOURCE.itemId);

  // Double open throws INVALID_LIFECYCLE_STATE
  await assert.rejects(
    () => adapter.open(SAMPLE_PDF_SOURCE),
    (err) => DocumentError.isDocumentError(err) && err.code === 'INVALID_LIFECYCLE_STATE'
  );

  await adapter.close();
  assert.equal(adapter.lifecycleState, 'closed');

  // Double close is idempotent
  await adapter.close();
  assert.equal(adapter.lifecycleState, 'closed');

  // Calling methods after close throws ADAPTER_CLOSED
  await assert.rejects(
    () => adapter.getCurrentLocation(),
    (err) => DocumentError.isDocumentError(err) && err.code === 'ADAPTER_CLOSED'
  );
  await assert.rejects(
    () => adapter.getMetadata(),
    (err) => DocumentError.isDocumentError(err) && err.code === 'ADAPTER_CLOSED'
  );
  await assert.rejects(
    () => adapter.getTOC(),
    (err) => DocumentError.isDocumentError(err) && err.code === 'ADAPTER_CLOSED'
  );
  await assert.rejects(
    () => adapter.search('test'),
    (err) => DocumentError.isDocumentError(err) && err.code === 'ADAPTER_CLOSED'
  );
});

test('PdfAdapter rejects non-PDF document formats with UNSUPPORTED_FORMAT', async () => {
  const adapter = new PdfAdapter();
  const invalidSource = {
    ...SAMPLE_PDF_SOURCE,
    format: 'epub',
  };

  await assert.rejects(
    () => adapter.open(invalidSource),
    (err) => DocumentError.isDocumentError(err) && err.code === 'UNSUPPORTED_FORMAT'
  );
  assert.equal(adapter.lifecycleState, 'failed');
});
