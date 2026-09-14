/**
 * Annotation validation helpers.
 * Validates raw unknown input against the canonical Annotation type.
 * No engine-specific types imported.
 */

import {
  ANNOTATION_SCHEMA_VERSION,
  type Annotation,
  type AnnotationAnchor,
  type AnnotationContent,
  type AnnotationKind,
  type AnnotationLifecycle,
  type AnnotationStyle,
  type NormalizedRect,
  type PdfDrawingAnchor,
  type PdfTextAnchor,
  type ReflowableTextAnchor,
  type TextMarkSubKind,
  type DrawingSubKind,
} from './types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bad(msg: string): never {
  throw Object.assign(new Error(msg), { code: 'ANNOTATION_INVALID' });
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) bad(`Annotation.${field} must be a non-empty string`);
  return v as string;
}

function requireNumber(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`Annotation.${field} must be a finite number`);
  return v as number;
}

function requirePositiveInteger(v: unknown, field: string): number {
  const n = requireNumber(v, field);
  if (!Number.isInteger(n) || n < 1) bad(`Annotation.${field} must be a positive integer`);
  return n;
}

// ---------------------------------------------------------------------------
// Normalized rect
// ---------------------------------------------------------------------------

function validateNormalizedRect(v: unknown, field: string): NormalizedRect {
  if (typeof v !== 'object' || v === null) bad(`${field} must be an object`);
  const r = v as Record<string, unknown>;
  const x = requireNumber(r.x, `${field}.x`);
  const y = requireNumber(r.y, `${field}.y`);
  const width = requireNumber(r.width, `${field}.width`);
  const height = requireNumber(r.height, `${field}.height`);
  if (x < 0 || x > 1) bad(`${field}.x must be in [0,1]`);
  if (y < 0 || y > 1) bad(`${field}.y must be in [0,1]`);
  if (width < 0 || width > 1) bad(`${field}.width must be in [0,1]`);
  if (height < 0 || height > 1) bad(`${field}.height must be in [0,1]`);
  return { x, y, width, height };
}

// ---------------------------------------------------------------------------
// Anchor validators
// ---------------------------------------------------------------------------

function validatePdfTextAnchor(a: Record<string, unknown>): PdfTextAnchor {
  const pageNumber = requirePositiveInteger(a.pageNumber, 'anchor.pageNumber');
  if (!Array.isArray(a.rects) || a.rects.length === 0)
    bad('anchor.rects must be a non-empty array');
  const rects = (a.rects as unknown[]).map((r, i) =>
    validateNormalizedRect(r, `anchor.rects[${i}]`)
  );
  const quote = requireString(a.quote, 'anchor.quote');
  const sourceHash = requireString(a.sourceHash, 'anchor.sourceHash');
  return {
    kind: 'pdf-text',
    pageNumber,
    rects,
    quote,
    ...(typeof a.prefix === 'string' ? { prefix: a.prefix } : {}),
    ...(typeof a.suffix === 'string' ? { suffix: a.suffix } : {}),
    sourceHash,
  };
}

function validatePdfDrawingAnchor(a: Record<string, unknown>): PdfDrawingAnchor {
  const pageNumber = requirePositiveInteger(a.pageNumber, 'anchor.pageNumber');
  if (!Array.isArray(a.points) || a.points.length === 0)
    bad('anchor.points must be a non-empty array');
  const points = (a.points as unknown[]).map((p, i) => {
    if (typeof p !== 'object' || p === null) bad(`anchor.points[${i}] must be an object`);
    const pt = p as Record<string, unknown>;
    return {
      x: requireNumber(pt.x, `anchor.points[${i}].x`),
      y: requireNumber(pt.y, `anchor.points[${i}].y`),
    };
  });
  const bounds = validateNormalizedRect(a.bounds, 'anchor.bounds');
  const sourceHash = requireString(a.sourceHash, 'anchor.sourceHash');
  return { kind: 'pdf-drawing', pageNumber, points, bounds, sourceHash };
}

function validateReflowableTextAnchor(a: Record<string, unknown>): ReflowableTextAnchor {
  const startCfi = requireString(a.startCfi, 'anchor.startCfi');
  const endCfi = requireString(a.endCfi, 'anchor.endCfi');
  const spineIndex = requireNumber(a.spineIndex, 'anchor.spineIndex');
  if (!Number.isInteger(spineIndex) || spineIndex < 0)
    bad('anchor.spineIndex must be a non-negative integer');
  const quote = requireString(a.quote, 'anchor.quote');
  const sourceHash = requireString(a.sourceHash, 'anchor.sourceHash');
  return {
    kind: 'reflowable-text',
    startCfi,
    endCfi,
    spineIndex,
    quote,
    ...(typeof a.prefix === 'string' ? { prefix: a.prefix } : {}),
    ...(typeof a.suffix === 'string' ? { suffix: a.suffix } : {}),
    sourceHash,
  };
}

function validateAnchor(v: unknown): AnnotationAnchor {
  if (typeof v !== 'object' || v === null) bad('anchor must be a non-null object');
  const a = v as Record<string, unknown>;
  switch (a.kind) {
    case 'pdf-text':        return validatePdfTextAnchor(a);
    case 'pdf-drawing':     return validatePdfDrawingAnchor(a);
    case 'reflowable-text': return validateReflowableTextAnchor(a);
    default: bad(`Unknown anchor kind: ${String(a.kind)}`);
  }
}

// ---------------------------------------------------------------------------
// Content validators
// ---------------------------------------------------------------------------

const TEXT_MARK_SUB_KINDS = new Set<TextMarkSubKind>(['highlight', 'underline', 'strike']);
const DRAWING_SUB_KINDS = new Set<DrawingSubKind>([
  'pen', 'highlighter', 'line', 'arrow', 'rectangle', 'ellipse', 'text-box',
]);

function validateContent(kind: AnnotationKind, v: unknown): AnnotationContent {
  if (typeof v !== 'object' || v === null) bad('content must be a non-null object');
  const c = v as Record<string, unknown>;
  switch (kind) {
    case 'text-mark': {
      if (!TEXT_MARK_SUB_KINDS.has(c.subKind as TextMarkSubKind))
        bad(`content.subKind must be one of: ${[...TEXT_MARK_SUB_KINDS].join(', ')}`);
      return {
        subKind: c.subKind as TextMarkSubKind,
        ...(typeof c.color === 'string' ? { color: c.color } : {}),
      };
    }
    case 'comment': {
      requireString(c.body, 'content.body');
      return {
        body: c.body as string,
        ...(typeof c.selectionSubKind === 'string' ? { selectionSubKind: c.selectionSubKind as TextMarkSubKind } : {}),
        ...(typeof c.color === 'string' ? { color: c.color } : {}),
      };
    }
    case 'excerpt': {
      requireString(c.passage, 'content.passage');
      return {
        passage: c.passage as string,
        ...(typeof c.note === 'string' ? { note: c.note } : {}),
      };
    }
    case 'drawing': {
      if (!DRAWING_SUB_KINDS.has(c.subKind as DrawingSubKind))
        bad(`content.subKind must be one of: ${[...DRAWING_SUB_KINDS].join(', ')}`);
      requireString(c.color, 'content.color');
      requireNumber(c.strokeWidth, 'content.strokeWidth');
      return {
        subKind: c.subKind as DrawingSubKind,
        color: c.color as string,
        strokeWidth: c.strokeWidth as number,
        ...(typeof c.fill === 'string' ? { fill: c.fill } : {}),
        ...(typeof c.text === 'string' ? { text: c.text } : {}),
      };
    }
    default:
      bad(`Unknown annotation kind: ${String(kind)}`);
  }
}

// ---------------------------------------------------------------------------
// Style validator
// ---------------------------------------------------------------------------

function validateStyle(v: unknown): AnnotationStyle | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object') bad('style must be an object if provided');
  const s = v as Record<string, unknown>;
  return {
    ...(typeof s.opacity === 'number' ? { opacity: s.opacity } : {}),
    ...(typeof s.hidden === 'boolean' ? { hidden: s.hidden } : {}),
  };
}

// ---------------------------------------------------------------------------
// Lifecycle validator
// ---------------------------------------------------------------------------

const VALID_LIFECYCLES = new Set<AnnotationLifecycle>([
  'active', 'edited', 'hidden', 'soft-deleted',
]);

function validateLifecycle(v: unknown): AnnotationLifecycle {
  if (!VALID_LIFECYCLES.has(v as AnnotationLifecycle))
    bad(`lifecycle must be one of: ${[...VALID_LIFECYCLES].join(', ')}`);
  return v as AnnotationLifecycle;
}

// ---------------------------------------------------------------------------
// Top-level annotation validator
// ---------------------------------------------------------------------------

export function validateAnnotation(input: unknown): Annotation {
  if (typeof input !== 'object' || input === null) bad('Annotation must be a non-null object');
  const a = input as Record<string, unknown>;

  if (a.schemaVersion !== ANNOTATION_SCHEMA_VERSION)
    bad(`Annotation.schemaVersion must be ${ANNOTATION_SCHEMA_VERSION}, got ${String(a.schemaVersion)}`);

  const id = requireString(a.id, 'id');
  const itemId = requireString(a.itemId, 'itemId');
  const assetId = requireString(a.assetId, 'assetId');

  const validKinds = new Set<AnnotationKind>(['text-mark', 'comment', 'excerpt', 'drawing']);
  if (!validKinds.has(a.kind as AnnotationKind))
    bad(`Annotation.kind must be one of: ${[...validKinds].join(', ')}`);
  const kind = a.kind as AnnotationKind;

  const anchor = validateAnchor(a.anchor);
  const content = validateContent(kind, a.content);
  const style = validateStyle(a.style);
  const sourceHash = requireString(a.sourceHash, 'sourceHash');
  const revision = requirePositiveInteger(a.revision, 'revision');
  const lifecycle = validateLifecycle(a.lifecycle);
  requireString(a.createdAt, 'createdAt');
  requireString(a.updatedAt, 'updatedAt');

  if (a.deletedAt !== null && a.deletedAt !== undefined && typeof a.deletedAt !== 'string')
    bad('Annotation.deletedAt must be a string or null');

  return {
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    id,
    itemId,
    assetId,
    kind,
    anchor,
    content,
    ...(style ? { style } : {}),
    sourceHash,
    revision,
    lifecycle,
    createdAt: a.createdAt as string,
    updatedAt: a.updatedAt as string,
    deletedAt: typeof a.deletedAt === 'string' ? a.deletedAt : null,
  };
}

export function serializeAnnotation(annotation: Annotation): string {
  return JSON.stringify(annotation);
}

export function deserializeAnnotation(json: string): Annotation {
  try {
    return validateAnnotation(JSON.parse(json));
  } catch (err) {
    throw Object.assign(
      new Error(`Failed to deserialize annotation: ${String(err)}`),
      { code: 'ANNOTATION_INVALID', cause: err }
    );
  }
}
