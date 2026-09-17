/**
 * Line segmentation abstraction — Phase 17, task P17-T005.
 *
 * The Nastaliq specialist is a LINE engine. Feeding it a whole page would be
 * dishonest, so every page that can reach it must first be expressed as
 * deterministic, stably-identified lines.
 *
 * Layout ownership stays here, not in a recognition provider:
 *   - recognition providers return text plus geometry; they never own canonical
 *     page structure;
 *   - this module turns geometry into `pageId / regionId / lineId` records with a
 *     bounding box, a reading-order index, and a language;
 *   - when the PP-OCRv5 detector already produced usable text boxes those boxes
 *     are reused rather than re-detected, which is why no extra heavyweight
 *     detection framework was added.
 *
 * Line crops are temporary derived artefacts and are only ever written inside
 * the managed OCR temp root (`lineCropPath()` refuses an escaping path).
 */

import { join } from 'node:path';

import { assertInsideDirectory, assertSafeSegment } from './engine-store.mjs';
import { orderPageUnits } from './reading-order.mjs';

/** Bump when segmentation changes: derived line identities must be invalidated. */
export const LINE_SEGMENTATION_REVISION = 1;

export const LINE_SOURCE = Object.freeze({
  DETECTED: 'detected',
  DECLARED: 'declared',
  SINGLE_LINE_REGION: 'region-single-line',
  SPANNING_FALLBACK: 'region-spanning-fallback',
});

export const SEGMENTATION_WARNING = Object.freeze({
  REGION_NOT_SEGMENTED: 'REGION_NOT_SEGMENTED',
  DETECTION_BLOCK_OUTSIDE_REGIONS: 'DETECTION_BLOCK_OUTSIDE_REGIONS',
  REGION_WITHOUT_GEOMETRY: 'REGION_WITHOUT_GEOMETRY',
});

export class LineSegmentationError extends Error {
  constructor(message, code = 'INVALID_INPUT') {
    super(message);
    this.name = 'LineSegmentationError';
    this.code = code;
  }
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

function intersectionArea(first, second) {
  const width = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x),
  );
  const height = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y),
  );
  return width * height;
}

function boxContainsRegion(blockBox, regionBox, threshold = 0.5) {
  const blockArea = blockBox.width * blockBox.height;
  if (blockArea <= 0) return false;
  return intersectionArea(blockBox, regionBox) / blockArea >= threshold;
}

function regionIdFor(region, index) {
  const declared = typeof region?.regionId === 'string' ? region.regionId : null;
  if (declared && /^[A-Za-z0-9._-]{1,128}$/.test(declared)) return declared;
  return `region-${index}`;
}

function lineIdFor(pageIndex, regionOrdinal, lineOrdinal) {
  return `p${pageIndex}-r${regionOrdinal}-l${lineOrdinal}`;
}

/**
 * Builds canonical line records for one page.
 *
 * @param {object} input
 * @param {number} input.pageIndex
 * @param {string} input.language          Page language ('en' | 'ar' | 'ur').
 * @param {Array<object>} [input.regions]  Declared/detected regions with boxes.
 * @param {Array<object>} [input.detectionBlocks] Provider blocks with `box` geometry.
 * @returns {object} page-level segmentation with a flattened, ordered line list.
 */
export function segmentPageLines({ pageIndex, language, regions = [], detectionBlocks = [] } = {}) {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new LineSegmentationError('pageIndex must be a non-negative integer');
  }
  if (typeof language !== 'string' || language.length === 0) {
    throw new LineSegmentationError('a language is required for line segmentation');
  }

  const warnings = [];
  const declaredRegions = regions.map((region, index) => ({
    region,
    regionId: regionIdFor(region, index),
    index,
    box: usableBox(region?.box) ? region.box : null,
    regionType: typeof region?.regionType === 'string' ? region.regionType : null,
    language: typeof region?.language === 'string' ? region.language : language,
  }));

  const orderInput = declaredRegions
    .filter((entry) => entry.box)
    .map((entry) => ({
      id: entry.regionId,
      bbox: entry.box,
      language: entry.language,
      regionType: entry.regionType,
      regionId: entry.regionId,
    }));
  const regionOrder = orderPageUnits({ units: orderInput });
  const orderIndexByRegion = new Map(
    regionOrder.units.map((unit) => [unit.id, unit.readingOrderIndex]),
  );

  const blocks = (Array.isArray(detectionBlocks) ? detectionBlocks : [])
    .filter((block) => usableBox(block?.box))
    .map((block, index) => ({ text: block.text ?? null, box: block.box, detectionIndex: index, claimed: false }));

  const lines = [];
  const segmentedRegions = [];
  let overall = 0;
  let regionOrdinal = 0;

  const orderedRegions = [...declaredRegions].sort((a, b) => {
    const left = orderIndexByRegion.get(a.regionId) ?? Number.MAX_SAFE_INTEGER;
    const right = orderIndexByRegion.get(b.regionId) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.index - b.index;
  });

  for (const entry of orderedRegions) {
    const declaredLines = Array.isArray(entry.region?.lines) ? entry.region.lines : [];
    const ownBlocks = entry.box
      ? blocks.filter((block) => {
          if (block.claimed) return false;
          if (!boxContainsRegion(block.box, entry.box)) return false;
          block.claimed = true;
          return true;
        })
      : [];

    let lineInputs = [];
    let source = LINE_SOURCE.DETECTED;
    if (declaredLines.length > 0) {
      lineInputs = declaredLines.map((line, index) => ({
        lineId: typeof line?.lineId === 'string' ? line.lineId : null,
        box: line?.box ?? null,
        text: typeof line?.exactText === 'string' ? line.exactText : null,
        detectionIndex: index,
      }));
      source = LINE_SOURCE.DECLARED;
    } else if (ownBlocks.length > 0) {
      lineInputs = ownBlocks;
    } else if (entry.box && entry.region?.singleLine === true) {
      lineInputs = [{ lineId: null, box: entry.box, text: null, detectionIndex: 0 }];
      source = LINE_SOURCE.SINGLE_LINE_REGION;
    } else if (entry.box) {
      lineInputs = [{ lineId: null, box: entry.box, text: null, detectionIndex: 0 }];
      source = LINE_SOURCE.SPANNING_FALLBACK;
      if (!warnings.includes(SEGMENTATION_WARNING.REGION_NOT_SEGMENTED)) {
        warnings.push(SEGMENTATION_WARNING.REGION_NOT_SEGMENTED);
      }
    } else if (!warnings.includes(SEGMENTATION_WARNING.REGION_WITHOUT_GEOMETRY)) {
      warnings.push(SEGMENTATION_WARNING.REGION_WITHOUT_GEOMETRY);
    }

    const orderedLineInputs = [...lineInputs].sort((a, b) => {
      const shift = entry.language === 'en' ? 1 : -1;
      if (a.box && b.box) {
        if (a.box.y !== b.box.y) return a.box.y - b.box.y;
        const aEdge = shift > 0 ? a.box.x : a.box.x + a.box.width;
        const bEdge = shift > 0 ? b.box.x : b.box.x + b.box.width;
        if (aEdge !== bEdge) return shift * (aEdge - bEdge);
      }
      return a.detectionIndex - b.detectionIndex;
    });

    const regionLines = [];
    orderedLineInputs.forEach((line, lineOrdinal) => {
      const record = {
        lineId: lineIdFor(pageIndex, regionOrdinal, lineOrdinal),
        declaredLineId: line.lineId ?? null,
        pageIndex,
        regionId: entry.regionId,
        regionIndex: entry.index,
        lineIndex: lineOrdinal,
        readingOrderIndex: overall,
        language: entry.language,
        regionType: entry.regionType,
        bbox: line.box ?? null,
        segmentationSource: source,
        detectionIndex: line.detectionIndex,
        detectionText: line.text ?? null,
      };
      overall += 1;
      regionLines.push(record);
      lines.push(record);
    });

    segmentedRegions.push({
      regionId: entry.regionId,
      regionType: entry.regionType,
      language: entry.language,
      bbox: entry.box,
      readingOrderIndex: orderIndexByRegion.get(entry.regionId) ?? null,
      lines: regionLines.map((line) => line.lineId),
    });
    regionOrdinal += 1;
  }

  if (blocks.some((block) => !block.claimed) && !warnings.includes(SEGMENTATION_WARNING.DETECTION_BLOCK_OUTSIDE_REGIONS)) {
    warnings.push(SEGMENTATION_WARNING.DETECTION_BLOCK_OUTSIDE_REGIONS);
  }

  return {
    revision: LINE_SEGMENTATION_REVISION,
    pageIndex,
    language,
    readingOrderRevision: regionOrder.revision,
    readingOrderWarnings: regionOrder.warnings,
    orderSource: regionOrder.orderSource,
    warnings,
    regions: segmentedRegions,
    lines,
  };
}

/**
 * Resolves the only directory a line crop may be written into.
 * Any attempt to escape the managed OCR temp root is refused.
 */
export function lineCropPath({ tempRoot, pageIndex, lineId }) {
  if (typeof tempRoot !== 'string' || tempRoot.length === 0) {
    throw new LineSegmentationError('a managed OCR temp root is required for line crops');
  }
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new LineSegmentationError('pageIndex must be a non-negative integer');
  }
  const segment = assertSafeSegment(String(lineId), 'line id');
  const dir = join(tempRoot, 'lines', `page-${pageIndex}`);
  const target = join(dir, `${segment}.png`);
  assertInsideDirectory(tempRoot, target, 'line crop');
  return target;
}
