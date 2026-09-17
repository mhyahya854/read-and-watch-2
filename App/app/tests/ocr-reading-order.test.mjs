import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ORDER_SOURCE,
  ORDER_WARNING,
  READING_ORDER_REVISION,
  directionForLanguage,
  orderPageUnits,
} from '../server/ocr/reading-order.mjs';

/** A page unit with explicit geometry. `id` doubles as the assertion handle. */
function unit(id, { x, y, width = 200, height = 20, language = 'en', regionType = null, regionId = null }) {
  return { id, bbox: { x, y, width, height }, language, regionType, regionId };
}

function ids(result) {
  return result.units.map((entry) => entry.id);
}

test('P17-T005: English LTR single column reads top to bottom', () => {
  const result = orderPageUnits({
    units: [unit('first', { x: 0, y: 0 }), unit('second', { x: 0, y: 30 }), unit('third', { x: 0, y: 60 })],
  });
  assert.deepEqual(ids(result), ['first', 'second', 'third']);
  assert.equal(result.pageDirection, 'ltr');
  assert.equal(result.orderSource, ORDER_SOURCE.SINGLE_COLUMN);
  assert.equal(result.revision, READING_ORDER_REVISION);
  assert.deepEqual(result.warnings, []);
});

test('P17-T005: Arabic RTL single column reads top to bottom and right to left', () => {
  const result = orderPageUnits({
    units: [
      unit('left', { x: 0, y: 0, width: 200, language: 'ar' }),
      unit('right', { x: 100, y: 0, width: 200, language: 'ar' }),
      unit('below', { x: 100, y: 40, width: 200, language: 'ar' }),
    ],
  });
  assert.equal(result.pageDirection, 'rtl');
  assert.equal(ids(result)[0], 'right', 'the rightmost unit of the first line is read first');
  assert.equal(ids(result)[1], 'left');
  assert.equal(ids(result)[2], 'below');
});

test('P17-T005: Urdu is treated as RTL', () => {
  assert.equal(directionForLanguage('ur'), 'rtl');
  const result = orderPageUnits({
    units: [unit('a', { x: 10, y: 0, language: 'ur' }), unit('b', { x: 10, y: 30, language: 'ur' })],
  });
  assert.equal(result.pageDirection, 'rtl');
  assert.deepEqual(ids(result), ['a', 'b']);
});

test('P17-T005: a two-column LTR page is read column by column, not row by row', () => {
  const result = orderPageUnits({
    units: [
      unit('left-1', { x: 0, y: 0, width: 200 }),
      unit('right-1', { x: 300, y: 0, width: 200 }),
      unit('left-2', { x: 0, y: 30, width: 200 }),
      unit('right-2', { x: 300, y: 30, width: 200 }),
    ],
  });
  assert.equal(result.orderSource, ORDER_SOURCE.COLUMNS);
  assert.deepEqual(ids(result), ['left-1', 'left-2', 'right-1', 'right-2']);
});

test('P17-T005: a two-column RTL page is read right column first', () => {
  const result = orderPageUnits({
    units: [
      unit('left-1', { x: 0, y: 0, width: 200, language: 'ur' }),
      unit('right-1', { x: 300, y: 0, width: 200, language: 'ur' }),
      unit('left-2', { x: 0, y: 30, width: 200, language: 'ur' }),
      unit('right-2', { x: 300, y: 30, width: 200, language: 'ur' }),
    ],
  });
  assert.equal(result.pageDirection, 'rtl');
  assert.equal(result.orderSource, ORDER_SOURCE.COLUMNS);
  assert.deepEqual(ids(result), ['right-1', 'right-2', 'left-1', 'left-2']);
});

test('P17-T005: mixed RTL/LTR regions keep each region direction and warn', () => {
  const result = orderPageUnits({
    units: [
      unit('english-region', { x: 0, y: 0, width: 200, language: 'en', regionType: 'body', regionId: 'r-en' }),
      unit('urdu-region', { x: 300, y: 0, width: 200, language: 'ur', regionType: 'body', regionId: 'r-ur' }),
    ],
  });
  assert.ok(result.warnings.includes(ORDER_WARNING.MIXED_DIRECTION_PAGE));
  assert.deepEqual(ids(result), ['english-region', 'urdu-region']);
  const byId = new Map(result.units.map((entry) => [entry.id, entry]));
  assert.equal(byId.get('english-region').direction, 'ltr');
  assert.equal(byId.get('urdu-region').direction, 'rtl');
});

test('P17-T005: a heading is ordered before body text in its own line band', () => {
  const result = orderPageUnits({
    units: [
      unit('body', { x: 0, y: 6, width: 300, height: 20 }),
      unit('heading', { x: 0, y: 0, width: 300, height: 20, regionType: 'heading' }),
    ],
  });
  assert.deepEqual(ids(result), ['heading', 'body']);
});

test('P17-T005: footnotes are read after the main flow even when they sit mid-page', () => {
  const result = orderPageUnits({
    units: [
      unit('body-1', { x: 0, y: 0, width: 400 }),
      unit('note', { x: 0, y: 100, width: 400, regionType: 'footnote' }),
      unit('body-2', { x: 0, y: 200, width: 400 }),
    ],
  });
  assert.deepEqual(ids(result), ['body-1', 'body-2', 'note']);
});

test('P17-T005: a caption follows the body unit sharing its band', () => {
  const result = orderPageUnits({
    units: [
      unit('caption', { x: 0, y: 2, width: 200, height: 20, regionType: 'caption' }),
      unit('body', { x: 0, y: 0, width: 200, height: 20 }),
    ],
  });
  assert.deepEqual(ids(result), ['body', 'caption']);
});

test('P17-T005: identical geometry always produces the identical order', () => {
  const units = [
    unit('c', { x: 300, y: 30, width: 200 }),
    unit('a', { x: 0, y: 0, width: 200 }),
    unit('b', { x: 300, y: 0, width: 200 }),
    unit('d', { x: 0, y: 30, width: 200 }),
  ];
  const first = orderPageUnits({ units });
  const second = orderPageUnits({ units: units.map((entry) => ({ ...entry })) });
  assert.deepEqual(ids(first), ids(second));
  assert.deepEqual(ids(first), ['a', 'd', 'b', 'c']);
  assert.deepEqual(first.detectionOrder, ['c', 'a', 'b', 'd'], 'detector order is preserved for provenance');
});

test('P17-T005: an ambiguous column structure warns instead of claiming false certainty', () => {
  const result = orderPageUnits({
    units: [
      unit('upper', { x: 0, y: 0, width: 100 }),
      unit('lower', { x: 70, y: 200, width: 100 }),
    ],
  });
  assert.ok(
    result.warnings.includes(ORDER_WARNING.AMBIGUOUS_COLUMN_STRUCTURE),
    'overlapping columns must be reported as ambiguous',
  );
  for (const entry of result.units) {
    assert.equal(Object.hasOwn(entry, 'orderConfidence'), false, 'no invented numeric confidence');
  }
  assert.equal(typeof result.orderSource, 'string');
});

test('P17-T005: units without usable geometry are kept and reported, never dropped', () => {
  const result = orderPageUnits({
    units: [unit('good', { x: 0, y: 0 }), { id: 'broken', bbox: { x: 0, y: 0, width: 0, height: 0 } }],
  });
  assert.ok(result.warnings.includes(ORDER_WARNING.UNUSABLE_GEOMETRY));
  assert.deepEqual(ids(result), ['good', 'broken']);
});

test('P17-T005: an empty page yields an explicit empty order', () => {
  const result = orderPageUnits({ units: [] });
  assert.equal(result.orderSource, ORDER_SOURCE.EMPTY);
  assert.deepEqual(result.units, []);
  assert.deepEqual(result.warnings, []);
});
