/**
 * Canonical Versioned Text Anchor Envelope and Resolution Model.
 * Binds text annotations to document source revisions with context fallbacks.
 */

import { DocumentError } from './errors.ts';
import { type DocumentLocation } from './location.ts';

export const TEXT_ANCHOR_SCHEMA_VERSION = 1 as const;

export type AnchorKind = 'pdf-geometry' | 'reflowable-range';

export interface NormalizedRect {
  readonly x: number; // 0.0 - 1.0 from page left
  readonly y: number; // 0.0 - 1.0 from page top
  readonly width: number; // 0.0 - 1.0 page width fraction
  readonly height: number; // 0.0 - 1.0 page height fraction
}

export interface PdfGeometryAnchorPayload {
  readonly pageNumber: number; // 1-based page index
  readonly rects: ReadonlyArray<NormalizedRect>;
}

export interface ReflowableRangeAnchorPayload {
  readonly startCfi?: string;
  readonly endCfi?: string;
  readonly spineIndex?: number;
  readonly startOffset?: number;
  readonly endOffset?: number;
}

export interface TextAnchor {
  readonly schemaVersion: typeof TEXT_ANCHOR_SCHEMA_VERSION;
  readonly sourceHash: string;
  readonly kind: AnchorKind;
  readonly quote: string;
  readonly context?: {
    readonly prefix?: string;
    readonly suffix?: string;
  };
  readonly payload: PdfGeometryAnchorPayload | ReflowableRangeAnchorPayload;
}

export type AnchorResolutionStatus =
  | 'exact'
  | 'fuzzy'
  | 'unresolved'
  | 'source-mismatch'
  | 'version-unsupported';

export interface ResolvedAnchor {
  readonly status: AnchorResolutionStatus;
  readonly location?: DocumentLocation;
  readonly confidence: number; // 0.0 - 1.0 (1.0 = exact)
  readonly details?: string;
}

export function createPdfGeometryAnchor(
  sourceHash: string,
  quote: string,
  pageNumber: number,
  rects: ReadonlyArray<NormalizedRect>,
  context?: { prefix?: string; suffix?: string }
): TextAnchor {
  if (pageNumber < 1 || !Number.isInteger(pageNumber)) {
    throw DocumentError.anchorInvalid(`Page number must be a positive integer, got ${pageNumber}`);
  }
  if (!rects || rects.length === 0) {
    throw DocumentError.anchorInvalid('PDF geometry anchor must include at least one bounding rect');
  }

  return {
    schemaVersion: TEXT_ANCHOR_SCHEMA_VERSION,
    sourceHash,
    kind: 'pdf-geometry',
    quote,
    ...(context ? { context } : {}),
    payload: {
      pageNumber,
      rects,
    },
  };
}

export function createReflowableRangeAnchor(
  sourceHash: string,
  quote: string,
  payload: ReflowableRangeAnchorPayload,
  context?: { prefix?: string; suffix?: string }
): TextAnchor {
  if (!quote.trim()) {
    throw DocumentError.anchorInvalid('Text anchor quote must be non-empty');
  }

  return {
    schemaVersion: TEXT_ANCHOR_SCHEMA_VERSION,
    sourceHash,
    kind: 'reflowable-range',
    quote,
    ...(context ? { context } : {}),
    payload,
  };
}

export function validateTextAnchor(input: unknown): TextAnchor {
  if (typeof input !== 'object' || input === null) {
    throw DocumentError.anchorInvalid('Text anchor must be a non-null object');
  }

  const a = input as Record<string, unknown>;

  if (typeof a.schemaVersion !== 'number') {
    throw DocumentError.anchorInvalid('Text anchor missing schemaVersion');
  }

  if (a.schemaVersion > TEXT_ANCHOR_SCHEMA_VERSION) {
    throw DocumentError.anchorVersionUnsupported(a.schemaVersion);
  }

  if (a.schemaVersion < 1) {
    throw DocumentError.anchorInvalid(`Invalid schema version: ${a.schemaVersion}`);
  }

  if (typeof a.sourceHash !== 'string' || !a.sourceHash.trim()) {
    throw DocumentError.anchorInvalid('Text anchor missing valid sourceHash');
  }

  if (typeof a.quote !== 'string') {
    throw DocumentError.anchorInvalid('Text anchor missing quote string');
  }

  if (a.kind !== 'pdf-geometry' && a.kind !== 'reflowable-range') {
    throw DocumentError.anchorInvalid(`Unknown text anchor kind: ${String(a.kind)}`);
  }

  if (typeof a.payload !== 'object' || a.payload === null) {
    throw DocumentError.anchorInvalid('Text anchor payload must be a non-null object');
  }

  const payload = a.payload as Record<string, unknown>;

  if (a.kind === 'pdf-geometry') {
    if (typeof payload.pageNumber !== 'number' || payload.pageNumber < 1) {
      throw DocumentError.anchorInvalid('PDF geometry payload requires positive pageNumber');
    }
    if (!Array.isArray(payload.rects)) {
      throw DocumentError.anchorInvalid('PDF geometry payload requires rects array');
    }
  }

  let context: { prefix?: string; suffix?: string } | undefined;
  if (a.context !== undefined) {
    if (typeof a.context !== 'object' || a.context === null) {
      throw DocumentError.anchorInvalid('Context must be an object if provided');
    }
    const c = a.context as Record<string, unknown>;
    context = {
      ...(typeof c.prefix === 'string' ? { prefix: c.prefix } : {}),
      ...(typeof c.suffix === 'string' ? { suffix: c.suffix } : {}),
    };
  }

  return {
    schemaVersion: TEXT_ANCHOR_SCHEMA_VERSION,
    sourceHash: a.sourceHash,
    kind: a.kind,
    quote: a.quote,
    ...(context ? { context } : {}),
    payload: payload as PdfGeometryAnchorPayload | ReflowableRangeAnchorPayload,
  };
}

export function serializeTextAnchor(anchor: TextAnchor): string {
  return JSON.stringify(anchor);
}

export function deserializeTextAnchor(jsonStr: string): TextAnchor {
  try {
    const parsed = JSON.parse(jsonStr);
    return validateTextAnchor(parsed);
  } catch (err) {
    if (DocumentError.isDocumentError(err)) {
      throw err;
    }
    throw DocumentError.anchorInvalid(`Failed to parse text anchor JSON: ${String(err)}`);
  }
}
