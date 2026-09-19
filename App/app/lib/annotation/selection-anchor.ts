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

export interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type PageRectLike = ClientRectLike;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Normalize client-space rectangles into page-relative 0..1 rectangles.
 * Zero-area rects (typical for collapsed selection boundaries) are dropped.
 */
export function normalizeSelectionRects(
  rects: ReadonlyArray<ClientRectLike>,
  page: PageRectLike,
): NormalizedRect[] {
  if (page.width <= 0 || page.height <= 0) return [];
  const normalized = rects
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) => ({
      x: clamp01((r.left - page.left) / page.width),
      y: clamp01((r.top - page.top) / page.height),
      width: clamp01(r.width / page.width),
      height: clamp01(r.height / page.height),
    }))
    .filter((r) => r.width > 0 && r.height > 0);

  // Merge rectangles that share a line (same y band) so a single mark is one
  // anchor rather than one per glyph run.
  const merged: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const rect of normalized) {
    const existing = merged.find(
      (m) => Math.abs(m.y - rect.y) < 0.004 && Math.abs(m.height - rect.height) < 0.01,
    );
    if (existing) {
      const right = Math.max(existing.x + existing.width, rect.x + rect.width);
      const left = Math.min(existing.x, rect.x);
      existing.x = left;
      existing.width = clamp01(right - left);
    } else {
      merged.push({ ...rect });
    }
  }
  return merged as NormalizedRect[];
}

export function pdfTextAnchorFromSelection(input: {
  pageNumber: number;
  sourceHash: string;
  quote: string;
  rects: ReadonlyArray<NormalizedRect>;
  prefix?: string;
  suffix?: string;
}): PdfTextAnchor {
  return {
    kind: 'pdf-text',
    pageNumber: Math.max(1, Math.trunc(input.pageNumber)),
    rects: input.rects.length
      ? input.rects
      : [{ x: 0, y: 0, width: 1, height: 0.02 }],
    quote: input.quote,
    ...(input.prefix ? { prefix: input.prefix } : {}),
    ...(input.suffix ? { suffix: input.suffix } : {}),
    sourceHash: input.sourceHash,
  };
}

/**
 * Reflowable anchor. A CFI is used when the engine supplies one; otherwise the
 * anchor is section-level (spine/section + offsets) with the quote and context
 * used for re-resolution. No page number is invented for reflowable documents.
 */
export function reflowableTextAnchorFromSelection(input: {
  sourceHash: string;
  quote: string;
  startCfi?: string;
  endCfi?: string;
  spineIndex?: number;
  startOffset?: number;
  endOffset?: number;
  prefix?: string;
  suffix?: string;
}): ReflowableTextAnchor {
  const spineIndex = Number.isInteger(input.spineIndex) ? (input.spineIndex as number) : 0;
  const fallbackCfi = `epubcfi(/6/${(spineIndex + 1) * 2}!)`;
  return {
    kind: 'reflowable-text',
    startCfi: input.startCfi || `${fallbackCfi}[${input.startOffset ?? 0}]`,
    endCfi:
      input.endCfi ||
      `${input.startCfi || fallbackCfi}[${input.endOffset ?? input.startOffset ?? 0}]`,
    spineIndex,
    quote: input.quote,
    ...(input.prefix ? { prefix: input.prefix } : {}),
    ...(input.suffix ? { suffix: input.suffix } : {}),
    sourceHash: input.sourceHash,
  };
}

/** True when the anchor carries geometry that can be drawn on a page. */
export function anchorHasGeometry(anchor: AnnotationAnchor): boolean {
  return anchor.kind === 'pdf-text' && anchor.rects.length > 0;
}

/** Human-readable source label for an anchor (no fabricated page numbers). */
export function describeAnnotationAnchor(anchor: AnnotationAnchor): string {
  if (anchor.kind === 'pdf-text' || anchor.kind === 'pdf-drawing') {
    return `Page ${anchor.pageNumber}`;
  }
  return `Location (section ${(anchor.spineIndex ?? 0) + 1})`;
}
