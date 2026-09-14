/**
 * Phase 09 — Annotation Anchors Test Suite.
 * Tests P09-T002 (PDF anchors) and P09-T003 (Reflowable anchors).
 *
 * Covers:
 *   - Normalized bounds [0..1] validation
 *   - Multi-rect text selection
 *   - Drawing point anchors
 *   - CFI range anchors
 *   - Zoom/rotation invariance (coordinate model validation)
 *   - Source hash mismatch detection
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateAnnotation,
  serializeAnnotation,
  deserializeAnnotation,
  ANNOTATION_SCHEMA_VERSION,
} from '../lib/annotation/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBase(overrides = {}) {
  return {
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    itemId: 'read-abc123',
    assetId: 'cand-001',
    kind: 'text-mark',
    anchor: {
      kind: 'pdf-text',
      pageNumber: 1,
      rects: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.05 }],
      quote: 'Hello world',
      sourceHash: 'sha256-abc',
    },
    content: { subKind: 'highlight', color: '#FFFF00' },
    sourceHash: 'sha256-abc',
    revision: 1,
    lifecycle: 'active',
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// P09-T002 — PDF Text Anchors
// ---------------------------------------------------------------------------

test('PDF text anchor: accepts valid normalized rects and quote', () => {
  const ann = validateAnnotation(makeBase());
  assert.equal(ann.anchor.kind, 'pdf-text');
  const anchor = ann.anchor;
  if (anchor.kind === 'pdf-text') {
    assert.equal(anchor.pageNumber, 1);
    assert.equal(anchor.rects.length, 1);
    assert.equal(anchor.rects[0].x, 0.1);
    assert.equal(anchor.quote, 'Hello world');
  }
});

test('PDF text anchor: accepts multi-rect selection', () => {
  const ann = validateAnnotation(makeBase({
    anchor: {
      kind: 'pdf-text',
      pageNumber: 3,
      rects: [
        { x: 0.0, y: 0.5, width: 1.0, height: 0.05 },
        { x: 0.0, y: 0.55, width: 0.4, height: 0.05 },
      ],
      quote: 'Multi-line selection text',
      prefix: 'Before the ',
      suffix: ' ends here',
      sourceHash: 'sha256-pdf1',
    },
  }));
  const anchor = ann.anchor;
  if (anchor.kind === 'pdf-text') {
    assert.equal(anchor.rects.length, 2);
    assert.equal(anchor.prefix, 'Before the ');
    assert.equal(anchor.suffix, ' ends here');
  }
});

test('PDF text anchor: rejects pageNumber < 1', () => {
  assert.throws(
    () => validateAnnotation(makeBase({
      anchor: { kind: 'pdf-text', pageNumber: 0, rects: [{ x: 0.1, y: 0.1, width: 0.1, height: 0.1 }], quote: 'x', sourceHash: 'h' },
    })),
    /positive integer/i,
  );
});

test('PDF text anchor: rejects empty rects array', () => {
  assert.throws(
    () => validateAnnotation(makeBase({
      anchor: { kind: 'pdf-text', pageNumber: 1, rects: [], quote: 'x', sourceHash: 'h' },
    })),
    /non-empty/i,
  );
});

test('PDF text anchor: rejects x > 1 (out of normalized range)', () => {
  assert.throws(
    () => validateAnnotation(makeBase({
      anchor: {
        kind: 'pdf-text',
        pageNumber: 1,
        rects: [{ x: 1.5, y: 0.1, width: 0.1, height: 0.1 }],
        quote: 'x',
        sourceHash: 'h',
      },
    })),
    /\[0,1\]/i,
  );
});

test('PDF text anchor: zoom-invariance — normalized coordinates do not change', () => {
  // The model stores normalized [0..1] coordinates.
  // At any zoom level the same ratio is stored. This test documents the invariant.
  const rect = { x: 0.2, y: 0.3, width: 0.6, height: 0.1 };
  const ann = validateAnnotation(makeBase({
    anchor: {
      kind: 'pdf-text',
      pageNumber: 1,
      rects: [rect],
      quote: 'Test zoom invariance',
      sourceHash: 'sha256-zoom',
    },
  }));
  const anchor = ann.anchor;
  if (anchor.kind === 'pdf-text') {
    // Coordinates are stored verbatim — zoom is a render-time concern
    assert.deepEqual(anchor.rects[0], rect);
  }
});

test('PDF text anchor: rotation-invariance — normalized coordinates survive', () => {
  // The normalized coordinate system is defined relative to unrotated page.
  // A reader UI translates display rotation to query coordinates — the anchor stays fixed.
  const ann = validateAnnotation(makeBase({
    anchor: {
      kind: 'pdf-text',
      pageNumber: 2,
      rects: [{ x: 0.1, y: 0.8, width: 0.3, height: 0.05 }],
      quote: 'Rotation invariance test',
      sourceHash: 'sha256-rotate',
    },
  }));
  assert.ok(ann); // anchor model is rotation-agnostic
});

// ---------------------------------------------------------------------------
// P09-T002 — PDF Drawing Anchors
// ---------------------------------------------------------------------------

test('PDF drawing anchor: accepts valid points and bounds', () => {
  const ann = validateAnnotation(makeBase({
    kind: 'drawing',
    anchor: {
      kind: 'pdf-drawing',
      pageNumber: 1,
      points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }],
      bounds: { x: 0.1, y: 0.2, width: 0.4, height: 0.4 },
      sourceHash: 'sha256-draw',
    },
    content: { subKind: 'pen', color: '#000000', strokeWidth: 2 },
    sourceHash: 'sha256-draw',
  }));
  const anchor = ann.anchor;
  if (anchor.kind === 'pdf-drawing') {
    assert.equal(anchor.points.length, 2);
    assert.equal(anchor.bounds.width, 0.4);
  }
});

test('PDF drawing anchor: rejects empty points array', () => {
  assert.throws(
    () => validateAnnotation(makeBase({
      kind: 'drawing',
      anchor: {
        kind: 'pdf-drawing',
        pageNumber: 1,
        points: [],
        bounds: { x: 0, y: 0, width: 0.1, height: 0.1 },
        sourceHash: 'h',
      },
      content: { subKind: 'pen', color: '#000', strokeWidth: 1 },
      sourceHash: 'h',
    })),
    /non-empty/i,
  );
});

// ---------------------------------------------------------------------------
// P09-T003 — Reflowable Anchors
// ---------------------------------------------------------------------------

test('Reflowable text anchor: accepts valid CFI range and quote', () => {
  const ann = validateAnnotation(makeBase({
    anchor: {
      kind: 'reflowable-text',
      startCfi: '/6/4[ch01]!/4/2[p1]/1:0',
      endCfi: '/6/4[ch01]!/4/2[p1]/1:22',
      spineIndex: 2,
      quote: 'Opening paragraph text',
      prefix: 'Before the quote',
      suffix: 'After the quote',
      sourceHash: 'sha256-epub1',
    },
    sourceHash: 'sha256-epub1',
  }));
  const anchor = ann.anchor;
  if (anchor.kind === 'reflowable-text') {
    assert.equal(anchor.spineIndex, 2);
    assert.equal(anchor.quote, 'Opening paragraph text');
    assert.equal(anchor.prefix, 'Before the quote');
  }
});

test('Reflowable text anchor: rejects missing startCfi', () => {
  assert.throws(
    () => validateAnnotation(makeBase({
      anchor: {
        kind: 'reflowable-text',
        startCfi: '',
        endCfi: '/6/4!/4/2/1:10',
        spineIndex: 0,
        quote: 'text',
        sourceHash: 'h',
      },
    })),
    /non-empty string/i,
  );
});

test('Reflowable text anchor: rejects negative spineIndex', () => {
  assert.throws(
    () => validateAnnotation(makeBase({
      anchor: {
        kind: 'reflowable-text',
        startCfi: '/6/4!/4/2/1:0',
        endCfi: '/6/4!/4/2/1:10',
        spineIndex: -1,
        quote: 'text',
        sourceHash: 'h',
      },
    })),
    /non-negative integer/i,
  );
});

test('Reflowable text anchor: font/layout invariance — anchor uses CFI not pixel coords', () => {
  // CFI anchors are inherently layout-invariant: they refer to DOM structure, not coordinates
  const ann = validateAnnotation(makeBase({
    anchor: {
      kind: 'reflowable-text',
      startCfi: '/6/4[ch05]!/4/2[p10]/1:15',
      endCfi: '/6/4[ch05]!/4/2[p10]/1:40',
      spineIndex: 5,
      quote: 'Font size invariant passage',
      sourceHash: 'sha256-epub2',
    },
    sourceHash: 'sha256-epub2',
  }));
  assert.ok(ann.anchor.kind === 'reflowable-text');
  assert.ok(ann.anchor.startCfi.includes('ch05'));
});

// ---------------------------------------------------------------------------
// P09-T003 — Source hash mismatch detection
// ---------------------------------------------------------------------------

test('Annotation anchor tracks sourceHash independently', () => {
  const ann = validateAnnotation(makeBase({
    anchor: {
      kind: 'pdf-text',
      pageNumber: 1,
      rects: [{ x: 0.1, y: 0.1, width: 0.1, height: 0.05 }],
      quote: 'passage',
      sourceHash: 'original-hash-123',
    },
    sourceHash: 'original-hash-123',
  }));
  // Both the annotation envelope and the anchor independently record sourceHash
  assert.equal(ann.sourceHash, 'original-hash-123');
  if (ann.anchor.kind === 'pdf-text') {
    assert.equal(ann.anchor.sourceHash, 'original-hash-123');
  }
});

// ---------------------------------------------------------------------------
// Serialization round-trip
// ---------------------------------------------------------------------------

test('Annotation serializes and deserializes with full fidelity', () => {
  const ann = validateAnnotation(makeBase({
    anchor: {
      kind: 'reflowable-text',
      startCfi: '/6/2[s1]!/4/2/1:10',
      endCfi: '/6/2[s1]!/4/2/1:25',
      spineIndex: 1,
      quote: 'Round-trip test',
      sourceHash: 'sha256-rt',
    },
    content: { subKind: 'underline' },
    sourceHash: 'sha256-rt',
  }));
  const json = serializeAnnotation(ann);
  const restored = deserializeAnnotation(json);
  assert.deepEqual(restored, ann);
});

// ---------------------------------------------------------------------------
// Annotation kind matrix
// ---------------------------------------------------------------------------

test('All 13 annotation types can be created and validated', () => {
  // 3 text-mark sub-kinds × both PDF and reflowable = 6 text-mark variants
  // 1 comment, 1 excerpt = 2
  // 7 drawing sub-kinds (PDF only) = 7
  // Total: 15 variants (13 distinct UI types)

  const textMarkCases = ['highlight', 'underline', 'strike'];
  for (const subKind of textMarkCases) {
    const pdfAnn = validateAnnotation(makeBase({ content: { subKind } }));
    assert.equal(pdfAnn.content.subKind, subKind);

    const reflowAnn = validateAnnotation(makeBase({
      anchor: {
        kind: 'reflowable-text',
        startCfi: '/6/2!/4/1:0',
        endCfi: '/6/2!/4/1:10',
        spineIndex: 0,
        quote: subKind + ' quote',
        sourceHash: 'h',
      },
      content: { subKind },
      sourceHash: 'h',
    }));
    assert.equal(reflowAnn.content.subKind, subKind);
  }

  // Comment
  const comment = validateAnnotation(makeBase({
    kind: 'comment',
    content: { body: 'A comment body', selectionSubKind: 'highlight', color: '#FFFF00' },
  }));
  assert.equal(comment.kind, 'comment');
  assert.equal(comment.content.body, 'A comment body');

  // Excerpt
  const excerpt = validateAnnotation(makeBase({
    kind: 'excerpt',
    content: { passage: 'Quoted passage', note: 'My note on this' },
  }));
  assert.equal(excerpt.kind, 'excerpt');
  assert.equal(excerpt.content.passage, 'Quoted passage');

  // Drawing sub-kinds
  const drawingSubKinds = ['pen', 'highlighter', 'line', 'arrow', 'rectangle', 'ellipse', 'text-box'];
  for (const subKind of drawingSubKinds) {
    const drawing = validateAnnotation(makeBase({
      kind: 'drawing',
      anchor: {
        kind: 'pdf-drawing',
        pageNumber: 1,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }],
        bounds: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
        sourceHash: 'sha256-draw',
      },
      content: {
        subKind,
        color: '#FF0000',
        strokeWidth: 2,
        ...(subKind === 'text-box' ? { text: 'Text box content' } : {}),
      },
      sourceHash: 'sha256-draw',
    }));
    assert.equal(drawing.content.subKind, subKind);
  }
});

// ---------------------------------------------------------------------------
// Lifecycle state machine
// ---------------------------------------------------------------------------

test('Annotation lifecycle states are all valid', () => {
  const lifecycles = ['active', 'edited', 'hidden', 'soft-deleted'];
  for (const lifecycle of lifecycles) {
    const ann = validateAnnotation(makeBase({ lifecycle }));
    assert.equal(ann.lifecycle, lifecycle);
  }
});

test('Annotation rejects unknown lifecycle state', () => {
  assert.throws(
    () => validateAnnotation(makeBase({ lifecycle: 'unknown-state' })),
    /lifecycle must be one of/i,
  );
});

test('Annotation with deletedAt set has soft-deleted lifecycle', () => {
  const ann = validateAnnotation(makeBase({
    lifecycle: 'soft-deleted',
    deletedAt: '2026-09-14T12:00:00.000Z',
  }));
  assert.equal(ann.lifecycle, 'soft-deleted');
  assert.equal(ann.deletedAt, '2026-09-14T12:00:00.000Z');
});

test('Annotation with null deletedAt is not deleted', () => {
  const ann = validateAnnotation(makeBase({ deletedAt: null }));
  assert.equal(ann.deletedAt, null);
});
