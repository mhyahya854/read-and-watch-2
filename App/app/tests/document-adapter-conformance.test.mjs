import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FakePdfAdapter,
  FakeReflowableAdapter,
  runDocumentAdapterConformanceSuite,
} from '../lib/document/index.ts';

const SAMPLE_PDF_SOURCE = {
  itemId: 'read-sample-pdf-0000000000000001',
  formatId: 'read-media-0',
  format: 'pdf',
  sourceHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
  byteSize: 1048576,
  title: 'Architecture & Design Principles.pdf',
};

const SAMPLE_EPUB_SOURCE = {
  itemId: 'read-sample-epub-000000000000002',
  formatId: 'read-media-1',
  format: 'epub',
  sourceHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
  byteSize: 524288,
  title: 'Domain Driven Reader Systems.epub',
};

test('FakePdfAdapter passes the universal document adapter conformance suite', async () => {
  const report = await runDocumentAdapterConformanceSuite(
    'FakePdfAdapter',
    () => new FakePdfAdapter(),
    SAMPLE_PDF_SOURCE
  );

  for (const check of report.checks) {
    assert.equal(
      check.passed,
      true,
      `Check "${check.checkName}" failed on FakePdfAdapter: ${check.detail || 'no details'}`
    );
  }

  assert.equal(report.passed, true);
  assert.ok(report.checks.length >= 15);
});

test('FakeReflowableAdapter passes the universal document adapter conformance suite', async () => {
  const report = await runDocumentAdapterConformanceSuite(
    'FakeReflowableAdapter',
    () => new FakeReflowableAdapter(),
    SAMPLE_EPUB_SOURCE
  );

  for (const check of report.checks) {
    assert.equal(
      check.passed,
      true,
      `Check "${check.checkName}" failed on FakeReflowableAdapter: ${check.detail || 'no details'}`
    );
  }

  assert.equal(report.passed, true);
  assert.ok(report.checks.length >= 15);
});
