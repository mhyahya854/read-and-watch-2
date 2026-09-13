import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DocumentError,
  validateDocumentSource,
  createPageLocation,
  createSemanticLocation,
  createProgressionLocation,
  serializeDocumentLocation,
  deserializeDocumentLocation,
  validateDocumentLocation,
  createPdfGeometryAnchor,
  createReflowableRangeAnchor,
  serializeTextAnchor,
  deserializeTextAnchor,
  validateTextAnchor,
} from '../lib/document/index.ts';

const SAMPLE_HASH = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const OTHER_HASH = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

test('Document Source descriptor validates required fields and types', () => {
  const valid = validateDocumentSource({
    itemId: 'read-item-1',
    formatId: 'media-0',
    format: 'PDF',
    sourceHash: SAMPLE_HASH,
    byteSize: 1024,
    title: 'Test Book',
  });

  assert.equal(valid.itemId, 'read-item-1');
  assert.equal(valid.formatId, 'media-0');
  assert.equal(valid.format, 'pdf');
  assert.equal(valid.sourceHash, SAMPLE_HASH);
  assert.equal(valid.byteSize, 1024);
  assert.equal(valid.title, 'Test Book');

  // Missing itemId throws
  assert.throws(
    () => validateDocumentSource({ formatId: '0', format: 'pdf', sourceHash: SAMPLE_HASH }),
    (err) => DocumentError.isDocumentError(err) && err.code === 'INVALID_SOURCE'
  );

  // Missing sourceHash throws
  assert.throws(
    () => validateDocumentSource({ itemId: '1', formatId: '0', format: 'pdf' }),
    (err) => DocumentError.isDocumentError(err) && err.code === 'INVALID_SOURCE'
  );

  // Negative byte size throws
  assert.throws(
    () =>
      validateDocumentSource({
        itemId: '1',
        formatId: '0',
        format: 'pdf',
        sourceHash: SAMPLE_HASH,
        byteSize: -5,
      }),
    (err) => DocumentError.isDocumentError(err) && err.code === 'INVALID_SOURCE'
  );
});

test('Document Location envelope creates, serializes, and deserializes page locations', () => {
  const loc = createPageLocation(SAMPLE_HASH, 42, {
    totalPages: 100,
    normalizedCoordinates: { x: 0.25, y: 0.75 },
    scrollFraction: 0.5,
  });

  assert.equal(loc.schemaVersion, 1);
  assert.equal(loc.kind, 'page');
  assert.equal(loc.sourceHash, SAMPLE_HASH);
  assert.equal(loc.payload.pageNumber, 42);
  assert.equal(loc.payload.totalPages, 100);

  // JSON round trip
  const jsonStr = serializeDocumentLocation(loc);
  const roundTripped = deserializeDocumentLocation(jsonStr, SAMPLE_HASH);
  assert.deepEqual(roundTripped, loc);

  // Expected source hash mismatch throws SOURCE_CHANGED
  assert.throws(
    () => deserializeDocumentLocation(jsonStr, OTHER_HASH),
    (err) => DocumentError.isDocumentError(err) && err.code === 'SOURCE_CHANGED'
  );

  // Invalid page number throws
  assert.throws(
    () => createPageLocation(SAMPLE_HASH, 0),
    (err) => DocumentError.isDocumentError(err) && err.code === 'INVALID_SOURCE'
  );
});

test('Document Location envelope handles semantic and progression locations', () => {
  const semanticLoc = createSemanticLocation(SAMPLE_HASH, {
    sectionId: 'sec-4',
    cfi: 'epubcfi(/6/8[chapter4]!/4/2)',
    spineIndex: 3,
    progression: 0.65,
    title: 'Chapter 4',
  });

  assert.equal(semanticLoc.kind, 'semantic');
  assert.equal(semanticLoc.payload.spineIndex, 3);
  const semanticJson = serializeDocumentLocation(semanticLoc);
  const roundTripSemantic = deserializeDocumentLocation(semanticJson);
  assert.deepEqual(roundTripSemantic, semanticLoc);

  const progLoc = createProgressionLocation(SAMPLE_HASH, 0.85, '85% read');
  assert.equal(progLoc.kind, 'progression');
  assert.equal(progLoc.payload.fraction, 0.85);

  // Progress fraction clamps between 0.0 and 1.0
  const overProg = createProgressionLocation(SAMPLE_HASH, 1.5);
  assert.equal(overProg.payload.fraction, 1.0);
  const underProg = createProgressionLocation(SAMPLE_HASH, -0.5);
  assert.equal(underProg.payload.fraction, 0.0);
});

test('Text Anchor envelope creates and validates PDF geometry anchors', () => {
  const anchor = createPdfGeometryAnchor(
    SAMPLE_HASH,
    'Contract-first architecture guarantees isolation.',
    15,
    [{ x: 0.1, y: 0.2, width: 0.7, height: 0.04 }],
    { prefix: 'In summary, ', suffix: ' This rule is strict.' }
  );

  assert.equal(anchor.schemaVersion, 1);
  assert.equal(anchor.kind, 'pdf-geometry');
  assert.equal(anchor.quote, 'Contract-first architecture guarantees isolation.');
  assert.equal(anchor.payload.pageNumber, 15);
  assert.equal(anchor.context?.prefix, 'In summary, ');

  // JSON round trip
  const json = serializeTextAnchor(anchor);
  const parsed = deserializeTextAnchor(json);
  assert.deepEqual(parsed, anchor);

  // Missing rects throws
  assert.throws(
    () => createPdfGeometryAnchor(SAMPLE_HASH, 'quote', 1, []),
    (err) => DocumentError.isDocumentError(err) && err.code === 'ANCHOR_INVALID'
  );
});

test('Text Anchor envelope creates and validates Reflowable range anchors', () => {
  const anchor = createReflowableRangeAnchor(
    SAMPLE_HASH,
    'Engines provide capabilities; Read & Watch owns the experience.',
    {
      spineIndex: 2,
      startCfi: 'epubcfi(/6/6!/4/2:10)',
      endCfi: 'epubcfi(/6/6!/4/2:73)',
      startOffset: 10,
      endOffset: 73,
    },
    { prefix: 'As stated, ' }
  );

  assert.equal(anchor.schemaVersion, 1);
  assert.equal(anchor.kind, 'reflowable-range');
  assert.equal(anchor.payload.spineIndex, 2);

  // JSON round trip
  const json = serializeTextAnchor(anchor);
  const parsed = deserializeTextAnchor(json);
  assert.deepEqual(parsed, anchor);

  // Empty quote throws
  assert.throws(
    () =>
      createReflowableRangeAnchor(SAMPLE_HASH, '   ', {
        spineIndex: 0,
      }),
    (err) => DocumentError.isDocumentError(err) && err.code === 'ANCHOR_INVALID'
  );
});

test('Text Anchor rejects unsupported schema versions and malformed payloads', () => {
  // Unsupported future schema version throws ANCHOR_VERSION_UNSUPPORTED
  assert.throws(
    () =>
      validateTextAnchor({
        schemaVersion: 999,
        sourceHash: SAMPLE_HASH,
        kind: 'pdf-geometry',
        quote: 'future anchor',
        payload: { pageNumber: 1, rects: [] },
      }),
    (err) => DocumentError.isDocumentError(err) && err.code === 'ANCHOR_VERSION_UNSUPPORTED'
  );

  // Missing schema version throws ANCHOR_INVALID
  assert.throws(
    () =>
      validateTextAnchor({
        sourceHash: SAMPLE_HASH,
        kind: 'pdf-geometry',
        quote: 'test',
        payload: {},
      }),
    (err) => DocumentError.isDocumentError(err) && err.code === 'ANCHOR_INVALID'
  );

  // Malformed JSON string throws ANCHOR_INVALID
  assert.throws(
    () => deserializeTextAnchor('{ malformed json '),
    (err) => DocumentError.isDocumentError(err) && err.code === 'ANCHOR_INVALID'
  );
});

test('DocumentError provides normalized codes, messages, and causes without leaking paths', () => {
  const cause = new Error('Low level read failure');
  const err = DocumentError.openFailed('File could not be parsed', cause);

  assert.equal(err.name, 'DocumentError');
  assert.equal(err.code, 'OPEN_FAILED');
  assert.equal(err.cause, cause);
  assert.equal(err.retryable, true);
  assert.ok(DocumentError.isDocumentError(err));

  // Verify personal path is not in safe messages
  const notFound = DocumentError.sourceNotFound('item-123', 'pdf-0');
  assert.ok(!notFound.message.includes('C:'));
  assert.ok(!notFound.message.includes('/Users/'));
  assert.equal(notFound.code, 'SOURCE_NOT_FOUND');
});
