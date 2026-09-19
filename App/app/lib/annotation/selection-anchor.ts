/**
 * Build canonical annotation anchors from a live reader selection.
 *
 * Pure geometry/derivation only — no DOM access — so the exact rules used by the
 * reader can be unit-tested. The reader supplies the page element rectangle and
 * the selection client rectangles; this module normalizes them so marks survive
 * zoom, rotation, and window resizing.
 */

import type {
  AnnotationAnchor,
  NormalizedRect,
  PdfTextAnchor,
  ReflowableTextAnchor,
} from './types.ts';
import {
  mergeNormalizedRects,
  normalizeClientRects,
  type ClientRectLike,
  type PageRectLike,
} from '../document/selection-geometry.ts';

export type { ClientRectLike, PageRectLike };

/** Normalize client-space rectangles into canonical page-relative rects. */
export function normalizeSelectionRects(
  rects: ReadonlyArray<ClientRectLike>,
  page: PageRectLike,
): NormalizedRect[] {
  return normalizeClientRects(rects, page) as NormalizedRect[];
}

/**
 * Build a PDF text anchor from REAL selection geometry.
 *
 * Returns null when no usable selection rectangles exist. A mark is never
 * invented: a full-width stripe standing in for a selection the engine could not
 * resolve would be fabricated evidence.
 */
export function pdfTextAnchorFromSelection(input: {
  pageNumber: number;
  sourceHash: string;
  quote: string;
  rects: ReadonlyArray<NormalizedRect>;
  prefix?: string;
  suffix?: string;
}): PdfTextAnchor | null {
  if (!input.rects || input.rects.length === 0) return null;
  return {
    kind: 'pdf-text',
    pageNumber: Math.max(1, Math.trunc(input.pageNumber)),
    rects: mergeNormalizedRects(input.rects) as NormalizedRect[],
    quote: input.quote,
    ...(input.prefix ? { prefix: input.prefix } : {}),
    ...(input.suffix ? { suffix: input.suffix } : {}),
    sourceHash: input.sourceHash,
  };
}

/**
 * Reflowable anchor.
 *
 * A CFI is stored ONLY when the engine actually supplied one. Otherwise the
 * anchor is section-level: spine/section identity, offsets when genuinely
 * available, the canonical reader location, and the quote/context for
 * re-resolution. No CFI is forged and no page number is invented.
 */
export function reflowableTextAnchorFromSelection(input: {
  sourceHash: string;
  quote: string;
  startCfi?: string;
  endCfi?: string;
  spineIndex?: number;
  startOffset?: number;
  endOffset?: number;
  sectionId?: string;
  location?: unknown;
  prefix?: string;
  suffix?: string;
}): ReflowableTextAnchor {
  const spineIndex = Number.isInteger(input.spineIndex) ? (input.spineIndex as number) : 0;
  const hasCfi = typeof input.startCfi === 'string' && input.startCfi.trim().length > 0;
  return {
    kind: 'reflowable-text',
    ...(hasCfi ? { startCfi: input.startCfi } : {}),
    ...(hasCfi && typeof input.endCfi === 'string' && input.endCfi.trim()
      ? { endCfi: input.endCfi }
      : {}),
    spineIndex,
    ...(typeof input.sectionId === 'string' && input.sectionId
      ? { sectionId: input.sectionId }
      : {}),
    ...(typeof input.startOffset === 'number' ? { startOffset: input.startOffset } : {}),
    ...(typeof input.endOffset === 'number' ? { endOffset: input.endOffset } : {}),
    ...(input.location !== undefined && input.location !== null
      ? { location: input.location }
      : {}),
    quote: input.quote,
    fidelity: hasCfi ? 'cfi' : 'section',
    ...(input.prefix ? { prefix: input.prefix } : {}),
    ...(input.suffix ? { suffix: input.suffix } : {}),
    sourceHash: input.sourceHash,
  };
}

/** True when the anchor carries geometry that can be drawn on a page. */
export function anchorHasGeometry(anchor: AnnotationAnchor): boolean {
  return anchor.kind === 'pdf-text' && anchor.rects.length > 0;
}

/**
 * Convert the document layer's versioned TextAnchor into the annotation store's
 * anchor. This is the single conversion path used by the reader, so the adapter
 * (which owns the real DOM geometry and the page rotation) decides the geometry.
 */
export function annotationAnchorFromTextAnchor(
  textAnchor: {
    kind: 'pdf-geometry' | 'reflowable-range';
    quote: string;
    sourceHash: string;
    context?: { prefix?: string; suffix?: string };
    payload: object;
  },
  options: { location?: unknown } = {},
): AnnotationAnchor | null {
  if (textAnchor.kind === 'pdf-geometry') {
    const payload = textAnchor.payload as unknown as {
      pageNumber?: number;
      rects?: NormalizedRect[];
    };
    if (!Array.isArray(payload.rects) || payload.rects.length === 0) return null;
    if (typeof payload.pageNumber !== 'number' || payload.pageNumber < 1) return null;
    return pdfTextAnchorFromSelection({
      pageNumber: payload.pageNumber,
      sourceHash: textAnchor.sourceHash,
      quote: textAnchor.quote,
      rects: payload.rects,
      prefix: textAnchor.context?.prefix,
      suffix: textAnchor.context?.suffix,
    });
  }

  const payload = textAnchor.payload as unknown as {
    startCfi?: string;
    endCfi?: string;
    spineIndex?: number;
    sectionId?: string;
    startOffset?: number;
    endOffset?: number;
  };
  return reflowableTextAnchorFromSelection({
    sourceHash: textAnchor.sourceHash,
    quote: textAnchor.quote,
    startCfi: payload.startCfi,
    endCfi: payload.endCfi,
    spineIndex: payload.spineIndex,
    sectionId: payload.sectionId,
    startOffset: payload.startOffset,
    endOffset: payload.endOffset,
    location: options.location,
    prefix: textAnchor.context?.prefix,
    suffix: textAnchor.context?.suffix,
  });
}

/** Human-readable source label for an anchor (no fabricated page numbers). */
export function describeAnnotationAnchor(anchor: AnnotationAnchor): string {
  if (anchor.kind === 'pdf-text' || anchor.kind === 'pdf-drawing') {
    return `Page ${anchor.pageNumber}`;
  }
  return `Location (section ${(anchor.spineIndex ?? 0) + 1})`;
}
