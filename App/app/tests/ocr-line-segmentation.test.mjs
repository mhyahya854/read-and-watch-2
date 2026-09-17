import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { after } from 'node:test';

import {
  LINE_SEGMENTATION_REVISION,
  LINE_SOURCE,
  SEGMENTATION_WARNING,
  lineCropPath,
  segmentPageLines,
} from '../server/ocr/line-segmentation.mjs';

const scratchDirs = [];

function scratchRoot(prefix = 'rw-ocr-lines-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of scratchDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }
});

test('P17-T005: detection boxes become stable page/region/line identities', () => {
  const page = segmentPageLines({
    pageIndex: 3,
    language: 'ur',
    regions: [
      {
        regionId: 'body',
        box: { x: 0, y: 100, width: 400, height: 120 },
        regionType: 'body',
        language: 'ur',
      },
    ],
    detectionBlocks: [
      { text: '\u0679\u06be\u06cc\u06a9', box: { x: 10, y: 110, width: 380, height: 30 } },
      { text: '\u062f\u0648\u0633\u0631\u0627', box: { x: 10, y: 150, width: 380, height: 30 } },
    ],
  });

  assert.equal(page.revision, LINE_SEGMENTATION_REVISION);
  assert.equal(page.lines.length, 2);
  assert.deepEqual(
    page.lines.map((line) => line.lineId),
    ['p3-r0-l0', 'p3-r0-l1'],
  );
  assert.deepEqual(
    page.lines.map((line) => line.readingOrderIndex),
    [0, 1],
  );
  for (const line of page.lines) {
    assert.equal(line.regionId, 'body');
    assert.equal(line.language, 'ur');
    assert.equal(line.segmentationSource, LINE_SOURCE.DETECTED);
    assert.ok(line.bbox && line.bbox.width > 0);
  }
});

test('P17-T005: a declared single-line region becomes exactly one line', () => {
  const page = segmentPageLines({
    pageIndex: 0,
    language: 'ur',
    regions: [
      {
        regionId: 'line-1',
        box: { x: 0, y: 0, width: 200, height: 40 },
        singleLine: true,
        language: 'ur',
      },
    ],
  });
  assert.equal(page.lines.length, 1);
  assert.equal(page.lines[0].segmentationSource, LINE_SOURCE.SINGLE_LINE_REGION);
  assert.deepEqual(page.warnings, []);
});

test('P17-T005: an unsegmented region is a documented fallback, never a silent PASS', () => {
  const page = segmentPageLines({
    pageIndex: 1,
    language: 'ur',
    regions: [{ regionId: 'blob', box: { x: 0, y: 0, width: 200, height: 90 } }],
  });
  assert.equal(page.lines.length, 1);
  assert.equal(page.lines[0].segmentationSource, LINE_SOURCE.SPANNING_FALLBACK);
  assert.ok(page.warnings.includes(SEGMENTATION_WARNING.REGION_NOT_SEGMENTED));
});

test('P17-T005: detector blocks outside every declared region are reported', () => {
  const page = segmentPageLines({
    pageIndex: 2,
    language: 'en',
    regions: [{ regionId: 'left', box: { x: 0, y: 0, width: 100, height: 100 } }],
    detectionBlocks: [{ text: 'outside', box: { x: 400, y: 400, width: 60, height: 20 } }],
  });
  assert.ok(page.warnings.includes(SEGMENTATION_WARNING.DETECTION_BLOCK_OUTSIDE_REGIONS));
});

test('P17-T019: a line crop can never escape the managed OCR temp root', () => {
  const tempRoot = scratchRoot('rw-ocr-temp-');
  const safe = lineCropPath({ tempRoot, pageIndex: 2, lineId: 'p2-r0-l0' });
  assert.ok(safe.startsWith(resolve(tempRoot)));
  assert.ok(safe.endsWith(`p2-r0-l0.png`));

  for (const lineId of ['..', '../../evil', 'a/b', 'a\\b', '', 'with space', '...']) {
    assert.throws(
      () => lineCropPath({ tempRoot, pageIndex: 0, lineId }),
      (error) => Boolean(error?.code),
      `line id "${lineId}" must be refused`,
    );
  }
  assert.throws(() => lineCropPath({ tempRoot: '', pageIndex: 0, lineId: 'p0-r0-l0' }));
  assert.throws(() => lineCropPath({ tempRoot, pageIndex: -1, lineId: 'p0-r0-l0' }));
});

test('P17-T005: segmentation refuses invalid input instead of guessing', () => {
  assert.throws(() => segmentPageLines({ pageIndex: -1, language: 'ur' }));
  assert.throws(() => segmentPageLines({ pageIndex: 0, language: '' }));
});

test('P17-T005: line identity is deterministic for identical geometry', () => {
  const build = () =>
    segmentPageLines({
      pageIndex: 7,
      language: 'ur',
      regions: [
        { regionId: 'r-a', box: { x: 0, y: 0, width: 200, height: 100 } },
        { regionId: 'r-b', box: { x: 0, y: 200, width: 200, height: 100 } },
      ],
      detectionBlocks: [
        { text: 'x', box: { x: 5, y: 210, width: 190, height: 30 } },
        { text: 'y', box: { x: 5, y: 10, width: 190, height: 30 } },
      ],
    });
  const first = build();
  const second = build();
  assert.deepEqual(
    first.lines.map((line) => [line.lineId, line.regionId, line.bbox.y]),
    second.lines.map((line) => [line.lineId, line.regionId, line.bbox.y]),
  );
  assert.equal(first.lines[0].regionId, 'r-a', 'regions keep geometric reading order');
});
