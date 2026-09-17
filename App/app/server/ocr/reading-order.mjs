/**
 * Deterministic reading-order reconstruction — Phase 17, task P17-T005.
 *
 * Detector emission order is not reading order, and sorting every box by
 * `y` then `x` destroys multi-column pages. This module rebuilds a canonical,
 * reproducible order from geometry plus declared language/region information.
 *
 * Deliberate limits (documented rather than hidden):
 *   - No LLM, no machine learning, no heuristics that cannot be explained.
 *   - No numeric confidence is invented. When the layout is ambiguous the result
 *     carries a named warning (`AMBIGUOUS_COLUMN_STRUCTURE` and friends) instead
 *     of a fabricated certainty score.
 *   - The detector's own emission order is preserved separately as
 *     `detectionOrder` for provenance and debugging.
 *   - This is derived data. It never writes to a document, and the revision is
 *     part of every derived-record identity so a change here invalidates
 *     dependent caches (see `ocr-search.mjs`).
 */

/** Bump when the algorithm changes: derived records must be invalidated. */
export const READING_ORDER_REVISION = 1;

export const ORDER_SOURCE = Object.freeze({
  EMPTY: 'empty',
  SINGLE_COLUMN: 'geometry-single-column',
  COLUMNS: 'geometry-columns',
});

export const ORDER_WARNING = Object.freeze({
  AMBIGUOUS_COLUMN_STRUCTURE: 'AMBIGUOUS_COLUMN_STRUCTURE',
  MIXED_DIRECTION_PAGE: 'MIXED_DIRECTION_PAGE',
  MIXED_DIRECTION_COLUMN: 'MIXED_DIRECTION_COLUMN',
  UNUSABLE_GEOMETRY: 'UNUSABLE_GEOMETRY',
});

/** Region kinds that are always read after the main flow. */
const TRAILING_REGION_TYPES = Object.freeze(['footnote', 'endnote']);

/** Region kinds that follow the body unit of their own line band. */
const DEFERRED_REGION_TYPES = Object.freeze(['caption']);

/**
 * Width ratio above which two horizontally overlapping units are treated as
 * different structural roles (for example a full-width heading over a column)
 * rather than members of the same column.
 */
const COLUMN_WIDTH_SIMILARITY = 1.6;

/** Minimum overlap (as a share of the narrower unit) to call two units column-mates. */
const COLUMN_OVERLAP_RATIO = 0.5;

/** Vertical overlap share that puts two units in the same text line band. */
const BAND_OVERLAP_RATIO = 0.5;

const RTL_LANGUAGES = Object.freeze(['ar', 'ur', 'fa', 'he']);

export function directionForLanguage(language) {
  return RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function usableBox(box) {
  return (
    Boolean(box) &&
    isFiniteNumber(box.x) &&
    isFiniteNumber(box.y) &&
    isFiniteNumber(box.width) &&
    isFiniteNumber(box.height) &&
    box.width > 0 &&
    box.height > 0
  );
}

function normaliseUnit(raw, detectionIndex) {
  const box = raw?.bbox ?? raw?.box ?? null;
  const language = typeof raw?.language === 'string' ? raw.language : null;
  return {
    id: String(raw?.id ?? raw?.lineId ?? `unit-${detectionIndex}`),
    box: usableBox(box) ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
    language,
    direction: directionForLanguage(language),
    regionType: typeof raw?.regionType === 'string' ? raw.regionType : null,
    regionId: typeof raw?.regionId === 'string' ? raw.regionId : null,
    detectionIndex,
  };
}

function overlapLength(left, right) {
  return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
}

function sameColumn(candidate, cluster) {
  const narrower = Math.min(candidate.width, cluster.width);
  if (narrower <= 0) return false;
  const ratio = Math.max(candidate.width, cluster.width) / narrower;
  if (ratio > COLUMN_WIDTH_SIMILARITY) return false;
  return overlapLength(candidate.interval, cluster.interval) / narrower >= COLUMN_OVERLAP_RATIO;
}

function clusterColumns(units) {
  const clusters = [];
  const ordered = [...units].sort((a, b) => a.box.x - b.box.x || a.detectionIndex - b.detectionIndex);
  for (const unit of ordered) {
    const candidate = {
      width: unit.box.width,
      interval: { start: unit.box.x, end: unit.box.x + unit.box.width },
      units: [unit],
    };
    const host = clusters.find((cluster) => sameColumn(candidate, cluster));
    if (!host) {
      clusters.push(candidate);
      continue;
    }
    host.units.push(unit);
    const start = Math.min(host.interval.start, candidate.interval.start);
    const end = Math.max(host.interval.end, candidate.interval.end);
    host.interval = { start, end };
    host.width = end - start;
  }
  return clusters.map((cluster, index) => ({
    columnId: `column-${index + 1}`,
    interval: cluster.interval,
    units: cluster.units.sort((a, b) => a.detectionIndex - b.detectionIndex),
  }));
}

function overlapsVertically(first, second) {
  const overlap = overlapLength(
    { start: first.y, end: first.y + first.height },
    { start: second.y, end: second.y + second.height },
  );
  return overlap / Math.min(first.height, second.height) >= BAND_OVERLAP_RATIO;
}

function kindRank(unit) {
  if (unit.regionType === 'heading') return 0;
  if (unit.regionType && DEFERRED_REGION_TYPES.includes(unit.regionType)) return 2;
  return 1;
}

/**
 * Groups units into text-line bands (by vertical overlap), then sorts the bands
 * top-to-bottom and the units inside each band by the band's own direction.
 */
function orderWithinColumn(units, direction) {
  const bands = [];
  const byTop = [...units].sort((a, b) => a.box.y - b.box.y || a.detectionIndex - b.detectionIndex);
  for (const unit of byTop) {
    const band = bands.find((candidate) => candidate.units.some((member) => overlapsVertically(member.box, unit.box)));
    if (band) {
      band.units.push(unit);
      band.top = Math.min(band.top, unit.box.y);
    } else {
      bands.push({ top: unit.box.y, units: [unit] });
    }
  }
  bands.sort((a, b) => a.top - b.top);
  const ordered = [];
  for (const band of bands) {
    band.units.sort((a, b) => {
      const rank = kindRank(a) - kindRank(b);
      if (rank !== 0) return rank;
      if (direction === 'rtl') {
        const rightmostA = a.box.x + a.box.width;
        const rightmostB = b.box.x + b.box.width;
        if (rightmostB !== rightmostA) return rightmostB - rightmostA;
      } else if (a.box.x !== b.box.x) {
        return a.box.x - b.box.x;
      }
      return a.detectionIndex - b.detectionIndex;
    });
    for (const unit of band.units) {
      ordered.push({ ...unit, bandTop: band.top });
    }
  }
  return ordered;
}

/**
 * Orders columns for reading.
 *
 * Columns that occupy the same vertical band are read in page direction
 * (left-to-right for LTR, right-to-left for RTL). Columns that sit in separate
 * vertical bands (a full-width heading above two columns, for example) are read
 * band by band from the top, so a spanning heading is never pushed behind the
 * columns it introduces.
 */
function orderColumns(clusters, pageDirection) {
  const withExtent = clusters.map((cluster) => {
    const top = Math.min(...cluster.units.map((unit) => unit.box.y));
    const bottom = Math.max(...cluster.units.map((unit) => unit.box.y + unit.box.height));
    return { cluster, top, bottom, height: Math.max(1, bottom - top) };
  });
  const byTop = [...withExtent].sort((a, b) => a.top - b.top);
  const bands = [];
  for (const entry of byTop) {
    const band = bands.find(
      (candidate) =>
        overlapLength(
          { start: entry.top, end: entry.bottom },
          { start: candidate.top, end: candidate.bottom },
        ) /
          Math.min(entry.height, candidate.height) >=
        BAND_OVERLAP_RATIO,
    );
    if (band) {
      band.entries.push(entry);
      band.top = Math.min(band.top, entry.top);
      band.bottom = Math.max(band.bottom, entry.bottom);
      band.height = Math.max(1, band.bottom - band.top);
    } else {
      bands.push({ top: entry.top, bottom: entry.bottom, height: entry.height, entries: [entry] });
    }
  }
  bands.sort((a, b) => a.top - b.top);
  const ordered = [];
  for (const band of bands) {
    const entries = [...band.entries].sort((a, b) => {
      if (pageDirection === 'rtl') return b.cluster.interval.start - a.cluster.interval.start;
      return a.cluster.interval.start - b.cluster.interval.start;
    });
    for (const entry of entries) ordered.push(entry.cluster);
  }
  return ordered;
}

/**
 * Reconstructs a canonical reading order for one page.
 *
 * @param {object} input
 * @param {Array<{id?: string, lineId?: string, bbox?: object, box?: object, language?: string, regionType?: string, regionId?: string}>} input.units
 * @returns {{
 *   revision: number,
 *   orderSource: string,
 *   pageDirection: 'ltr'|'rtl',
 *   warnings: string[],
 *   columns: Array<object>,
 *   units: Array<object>,
 *   detectionOrder: string[],
 * }}
 */
export function orderPageUnits({ units } = {}) {
  const inputUnits = Array.isArray(units) ? units : [];
  const normalised = inputUnits.map((unit, index) => normaliseUnit(unit, index));
  const detectionOrder = normalised.map((unit) => unit.id);
  if (normalised.length === 0) {
    return {
      revision: READING_ORDER_REVISION,
      orderSource: ORDER_SOURCE.EMPTY,
      pageDirection: 'ltr',
      warnings: [],
      columns: [],
      units: [],
      detectionOrder,
    };
  }

  const warnings = [];
  const withGeometry = [];
  for (const unit of normalised) {
    if (!unit.box) {
      if (!warnings.includes(ORDER_WARNING.UNUSABLE_GEOMETRY)) {
        warnings.push(ORDER_WARNING.UNUSABLE_GEOMETRY);
      }
      continue;
    }
    withGeometry.push(unit);
  }

  const directionsPresent = new Set(withGeometry.map((unit) => unit.direction));
  if (directionsPresent.size > 1) {
    warnings.push(ORDER_WARNING.MIXED_DIRECTION_PAGE);
  }

  const anchor = [...withGeometry].sort(
    (a, b) => a.box.y - b.box.y || a.box.x - b.box.x || a.detectionIndex - b.detectionIndex,
  )[0];
  const pageDirection = anchor ? anchor.direction : 'ltr';

  const mainFlow = [];
  const trailing = [];
  for (const unit of withGeometry) {
    if (unit.regionType && TRAILING_REGION_TYPES.includes(unit.regionType)) trailing.push(unit);
    else mainFlow.push(unit);
  }

  const clusters = clusterColumns(mainFlow);
  for (const cluster of clusters) {
    const clusterDirections = new Set(cluster.units.map((unit) => unit.direction));
    if (clusterDirections.size > 1) {
      warnings.push(ORDER_WARNING.MIXED_DIRECTION_COLUMN);
      break;
    }
  }
  for (let left = 0; left < clusters.length; left += 1) {
    for (let right = left + 1; right < clusters.length; right += 1) {
      const overlap = overlapLength(clusters[left].interval, clusters[right].interval);
      const narrower = Math.min(
        clusters[left].interval.end - clusters[left].interval.start,
        clusters[right].interval.end - clusters[right].interval.start,
      );
      if (narrower > 0 && overlap / narrower > 0.25) {
        if (!warnings.includes(ORDER_WARNING.AMBIGUOUS_COLUMN_STRUCTURE)) {
          warnings.push(ORDER_WARNING.AMBIGUOUS_COLUMN_STRUCTURE);
        }
      }
    }
  }

  const orderedColumns = orderColumns(clusters, pageDirection);

  const ordered = [];
  const columnRecords = [];
  for (const column of orderedColumns) {
    const columnDirection = column.units[0]?.direction ?? pageDirection;
    const columnUnits = orderWithinColumn(column.units, columnDirection);
    columnRecords.push({
      columnId: column.columnId,
      direction: columnDirection,
      detectionOrder: column.units.map((unit) => unit.id),
      unitIds: columnUnits.map((unit) => unit.id),
    });
    for (const unit of columnUnits) {
      ordered.push({ ...unit, columnId: column.columnId, columnDirection });
    }
  }

  for (const unit of orderWithinColumn(trailing, pageDirection)) {
    ordered.push({ ...unit, columnId: 'trailing-notes', columnDirection: pageDirection });
  }
  for (const unit of normalised) {
    if (unit.box) continue;
    ordered.push({ ...unit, columnId: 'unplaced', columnDirection: pageDirection, bandTop: null });
  }

  return {
    revision: READING_ORDER_REVISION,
    orderSource:
      clusters.length > 1 ? ORDER_SOURCE.COLUMNS : ORDER_SOURCE.SINGLE_COLUMN,
    pageDirection,
    warnings,
    columns: columnRecords,
    units: ordered.map((unit, index) => ({
      id: unit.id,
      regionId: unit.regionId,
      language: unit.language,
      direction: unit.direction,
      regionType: unit.regionType,
      columnId: unit.columnId,
      bandTop: unit.box ? unit.box.y : null,
      readingOrderIndex: index,
      detectionIndex: unit.detectionIndex,
      bbox: unit.box,
    })),
    detectionOrder,
  };
}
