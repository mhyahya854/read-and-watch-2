import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultAdapterRegistry,
  FoliateReflowableAdapter,
  DocumentError,
} from '../lib/document/index.ts';

const FORMATS = [
  { format: 'epub', title: 'Test EPUB Publication', ext: '.epub' },
  { format: 'mobi', title: 'Test Mobipocket E-Book', ext: '.mobi' },
  { format: 'azw', title: 'Test Kindle AZW E-Book', ext: '.azw' },
  { format: 'azw3', title: 'Test Kindle KF8 E-Book', ext: '.azw3' },
  { format: 'fb2', title: 'Test FictionBook 2.0 Document', ext: '.fb2' },
  { format: 'cbz', title: 'Test Comic Book Archive', ext: '.cbz' },
];

test('defaultAdapterRegistry supports all reflowable book and comic formats', () => {
  const supported = defaultAdapterRegistry.getSupportedFormats();
  for (const item of FORMATS) {
    assert.equal(
      supported.has(item.format),
      true,
      `Registry should support format "${item.format}"`
    );
  }
});

test('defaultAdapterRegistry creates FoliateReflowableAdapter for all supported formats', () => {
  for (const item of FORMATS) {
    const source = {
      itemId: `item-${item.format}-01`,
      formatId: `fmt-${item.format}`,
      format: item.format,
      sourceHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      byteSize: 10240,
      title: item.title,
    };

    const adapter = defaultAdapterRegistry.createAdapter(source);
    assert.ok(adapter instanceof FoliateReflowableAdapter);
    assert.equal(adapter.lifecycleState, 'created');
  }
});

test('FoliateReflowableAdapter opens, extracts metadata, TOC, and navigates across formats', async () => {
  for (const item of FORMATS) {
    const source = {
      itemId: `item-format-${item.format}-test`,
      formatId: `fmt-${item.format}`,
      format: item.format,
      sourceHash: `9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba`,
      byteSize: 51200,
      title: item.title,
    };

    const adapter = new FoliateReflowableAdapter();
    await adapter.open(source);

    assert.equal(adapter.lifecycleState, 'open');
    assert.equal(adapter.source?.format, item.format);

    // Verify metadata
    const meta = await adapter.getMetadata();
    assert.equal(meta.format, item.format);
    assert.equal(meta.title, item.title);

    // Verify TOC
    const toc = await adapter.getTOC();
    assert.ok(Array.isArray(toc));
    assert.ok(toc.length > 0);

    // Verify navigation
    const firstTocEntry = toc[0];
    await adapter.goTo(firstTocEntry.targetLocation);
    const loc = await adapter.getCurrentLocation();
    assert.equal(loc.sourceHash, source.sourceHash);

    // Verify capabilities
    const caps = adapter.getCapabilities();
    if (item.format === 'cbz') {
      assert.equal(caps.has('pageNavigation'), true);
      assert.equal(caps.has('textSearch'), false);
    } else {
      assert.equal(caps.has('textSearch'), true);
      assert.equal(caps.has('fontControls'), true);
      assert.equal(caps.has('themeControls'), true);
    }

    await adapter.close();
    assert.equal(adapter.lifecycleState, 'closed');
  }
});

test('FoliateReflowableAdapter rejects unsupported formats like PDF or MP4', async () => {
  const adapter = new FoliateReflowableAdapter();

  // PDF is reserved for Phase 06, reflowable adapter must reject it
  const pdfSource = {
    itemId: 'item-pdf-not-reflowable',
    formatId: 'fmt-pdf',
    format: 'pdf',
    sourceHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    byteSize: 1048576,
    title: 'Manual.pdf',
  };

  await assert.rejects(
    () => adapter.open(pdfSource),
    (err) => DocumentError.isDocumentError(err) && err.code === 'UNSUPPORTED_FORMAT'
  );

  assert.equal(adapter.lifecycleState, 'failed');
});
