import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DocumentError,
  DocumentAdapterRegistry,
  FakePdfAdapter,
  FakeReflowableAdapter,
} from '../lib/document/index.ts';

test('DocumentAdapterRegistry registers and creates format adapters', () => {
  const registry = new DocumentAdapterRegistry();

  registry.register({
    format: 'pdf',
    family: 'pdf',
    factory: () => new FakePdfAdapter(),
    displayName: 'Fake PDF Engine',
  });

  registry.register({
    format: 'epub',
    family: 'reflowable',
    factory: () => new FakeReflowableAdapter(),
    displayName: 'Fake EPUB Engine',
  });

  assert.equal(registry.supportsFormat('pdf'), true);
  assert.equal(registry.supportsFormat('epub'), true);
  assert.equal(registry.supportsFormat('mobi'), false);

  const formats = registry.getSupportedFormats();
  assert.equal(formats.has('pdf'), true);
  assert.equal(formats.has('epub'), true);
  assert.equal(formats.size, 2);

  // Instantiates adapters correctly
  const pdfAdapter = registry.createAdapter({
    itemId: 'item-1',
    formatId: 'media-0',
    format: 'pdf',
    sourceHash: '1111111111111111111111111111111111111111111111111111111111111111',
  });
  assert.equal(pdfAdapter instanceof FakePdfAdapter, true);

  const epubAdapter = registry.createAdapter({
    itemId: 'item-2',
    formatId: 'media-1',
    format: 'epub',
    sourceHash: '2222222222222222222222222222222222222222222222222222222222222222',
  });
  assert.equal(epubAdapter instanceof FakeReflowableAdapter, true);
});

test('DocumentAdapterRegistry enforces duplicate registration policy', () => {
  const registry = new DocumentAdapterRegistry();

  registry.register({
    format: 'pdf',
    family: 'pdf',
    factory: () => new FakePdfAdapter(),
  });

  // Duplicate registration without allowOverwrite throws
  assert.throws(
    () =>
      registry.register({
        format: 'pdf',
        family: 'pdf',
        factory: () => new FakePdfAdapter(),
      }),
    (err) => DocumentError.isDocumentError(err) && err.code === 'INVALID_SOURCE'
  );

  // Duplicate registration WITH allowOverwrite succeeds
  let replaced = false;
  registry.register(
    {
      format: 'pdf',
      family: 'pdf',
      factory: () => {
        replaced = true;
        return new FakePdfAdapter();
      },
    },
    true
  );

  registry.createAdapter({
    itemId: 'item-1',
    formatId: 'media-0',
    format: 'pdf',
    sourceHash: '1111111111111111111111111111111111111111111111111111111111111111',
  });
  assert.equal(replaced, true);
});

test('DocumentAdapterRegistry throws UNSUPPORTED_FORMAT for unregistered formats', () => {
  const registry = new DocumentAdapterRegistry();

  assert.throws(
    () =>
      registry.createAdapter({
        itemId: 'item-unknown',
        formatId: 'media-0',
        format: 'azw3',
        sourceHash: '3333333333333333333333333333333333333333333333333333333333333333',
      }),
    (err) => DocumentError.isDocumentError(err) && err.code === 'UNSUPPORTED_FORMAT'
  );
});

test('DocumentAdapterRegistry clears registrations cleanly', () => {
  const registry = new DocumentAdapterRegistry();
  registry.register({
    format: 'pdf',
    family: 'pdf',
    factory: () => new FakePdfAdapter(),
  });

  assert.equal(registry.supportsFormat('pdf'), true);
  registry.clear();
  assert.equal(registry.supportsFormat('pdf'), false);
  assert.equal(registry.getSupportedFormats().size, 0);
});
