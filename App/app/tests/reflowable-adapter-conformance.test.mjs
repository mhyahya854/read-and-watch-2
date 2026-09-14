import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FoliateReflowableAdapter,
  runDocumentAdapterConformanceSuite,
} from '../lib/document/index.ts';

const SAMPLE_EPUB_SOURCE = {
  itemId: 'read-sample-epub-000000000000002',
  formatId: 'read-media-1',
  format: 'epub',
  sourceHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
  byteSize: 524288,
  title: 'Domain Driven Reader Systems.epub',
};

const SAMPLE_CBZ_SOURCE = {
  itemId: 'read-sample-cbz-000000000000003',
  formatId: 'read-media-2',
  format: 'cbz',
  sourceHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  byteSize: 2097152,
  title: 'Graphic Novel Volume 1.cbz',
};

test('FoliateReflowableAdapter passes the universal document adapter conformance suite for EPUB', async () => {
  const report = await runDocumentAdapterConformanceSuite(
    'FoliateReflowableAdapter-EPUB',
    () => new FoliateReflowableAdapter(),
    SAMPLE_EPUB_SOURCE
  );

  for (const check of report.checks) {
    assert.equal(
      check.passed,
      true,
      `Check "${check.checkName}" failed on FoliateReflowableAdapter: ${check.detail || 'no details'}`
    );
  }

  assert.equal(report.passed, true);
  assert.ok(report.checks.length >= 18);
});

test('FoliateReflowableAdapter reports correct capabilities for reflowable vs fixed comic formats', () => {
  const epubAdapter = new FoliateReflowableAdapter();
  // Before open, default reflowable capabilities
  const epubCaps = epubAdapter.getCapabilities();
  assert.equal(epubCaps.has('textSearch'), true);
  assert.equal(epubCaps.has('textSelection'), true);
  assert.equal(epubCaps.has('fontControls'), true);

  const cbzAdapter = new FoliateReflowableAdapter();
  // Open with CBZ source
  cbzAdapter.open(SAMPLE_CBZ_SOURCE);
  const cbzCaps = cbzAdapter.getCapabilities();
  assert.equal(cbzCaps.has('pageNavigation'), true);
  assert.equal(cbzCaps.has('textSearch'), false);
  assert.equal(cbzCaps.has('textSelection'), false);
  assert.equal(cbzCaps.has('spreadLayout'), true);
});
