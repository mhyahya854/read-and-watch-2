/**
 * Pure selection geometry helpers shared by document adapters and annotation UI.
 *
 * Coordinates are normalized 0..1 in CANONICAL (unrotated) page space so a mark
 * stays attached to the same page region through zoom, rotation and resize.
 */

export interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type PageRectLike = ClientRectLike;

export interface NormalizedRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Merge rectangles that sit on the same text line into one band. */
export function mergeNormalizedRects(
  rects: ReadonlyArray<NormalizedRectLike>,
): NormalizedRectLike[] {
  const merged: NormalizedRectLike[] = [];
  for (const rect of rects) {
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
  return merged;
}

/**
 * Normalize client-space rectangles against the rendered page rectangle.
 * Zero-area rects are dropped; the result is merged per line.
 */
export function normalizeClientRects(
  rects: ReadonlyArray<ClientRectLike>,
  page: PageRectLike,
): NormalizedRectLike[] {
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
  return mergeNormalizedRects(normalized);
}

/** Quarter turns (0..3) for a PDF viewport rotation in degrees. */
export function quarterTurnsFromDegrees(degrees: number): number {
  const normalized = ((Math.round((degrees || 0) / 90) % 4) + 4) % 4;
  return normalized;
}

/**
 * Rotate a normalized rect about the page centre by whole quarter turns.
 * Used to convert between canonical page space and a rotated render space.
 */
export function rotateNormalizedRect(
  rect: NormalizedRectLike,
  quarterTurns: number,
): NormalizedRectLike {
  switch (((quarterTurns % 4) + 4) % 4) {
    case 1:
      // 90° clockwise
      return {
        x: clamp01(1 - (rect.y + rect.height)),
        y: clamp01(rect.x),
        width: rect.height,
        height: rect.width,
      };
    case 2:
      return {
        x: clamp01(1 - (rect.x + rect.width)),
        y: clamp01(1 - (rect.y + rect.height)),
        width: rect.width,
        height: rect.height,
      };
    case 3:
      return {
        x: clamp01(rect.y),
        y: clamp01(1 - (rect.x + rect.width)),
        width: rect.height,
        height: rect.width,
      };
    default:
      return { ...rect };
  }
}

/** Rotate a normalized point about the page centre by whole quarter turns. */
export function rotateNormalizedPoint(
  point: { x: number; y: number },
  quarterTurns: number,
): { x: number; y: number } {
  switch (((quarterTurns % 4) + 4) % 4) {
    case 1:
      return { x: clamp01(1 - point.y), y: clamp01(point.x) };
    case 2:
      return { x: clamp01(1 - point.x), y: clamp01(1 - point.y) };
    case 3:
      return { x: clamp01(point.y), y: clamp01(1 - point.x) };
    default:
      return { x: clamp01(point.x), y: clamp01(point.y) };
  }
}

/** Convert a rotated-space rect into canonical page space. */
export function toCanonicalRect(
  rect: NormalizedRectLike,
  rotationDegrees: number,
): NormalizedRectLike {
  const turns = quarterTurnsFromDegrees(rotationDegrees);
  return rotateNormalizedRect(rect, (4 - turns) % 4);
}

/** Convert a canonical rect into the space of a rendered rotation. */
export function fromCanonicalRect(
  rect: NormalizedRectLike,
  rotationDegrees: number,
): NormalizedRectLike {
  return rotateNormalizedRect(rect, quarterTurnsFromDegrees(rotationDegrees));
}

export function toCanonicalPoint(
  point: { x: number; y: number },
  rotationDegrees: number,
): { x: number; y: number } {
  const turns = quarterTurnsFromDegrees(rotationDegrees);
  return rotateNormalizedPoint(point, (4 - turns) % 4);
}

export function fromCanonicalPoint(
  point: { x: number; y: number },
  rotationDegrees: number,
): { x: number; y: number } {
  return rotateNormalizedPoint(point, quarterTurnsFromDegrees(rotationDegrees));
}

export function clampNormalizedPoint(point: { x: number; y: number }): {
  x: number;
  y: number;
} {
  return { x: clamp01(point.x), y: clamp01(point.y) };
}

