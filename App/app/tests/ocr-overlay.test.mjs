import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOcrOverlayModel,
  mountOcrOverlay,
  ocrOverlaySearchText,
} from '../lib/document/ocr-overlay.ts';

/** Minimal DOM double: enough to observe the structure the overlay builds. */
function fakeDocument() {
  function createElement(tagName) {
    const element = {
      tagName,
      className: '',
      textContent: '',
      style: {},
      attributes: {},
      children: [],
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
    };
    return element;
  }
  return { createElement };
}

const VOCALISED = '\u0627\u0644\u0652\u062d\u064e\u0645\u0652\u062f\u064f \u0644\u0650\u0644\u0651\u064e\u0647\u0650';

test('P17-T005: overlay geometry is expressed as resolution-independent percentages', () => {
  const model = createOcrOverlayModel({
    imageWidth: 1000,
    imageHeight: 2000,
    lines: [{ text: 'x', box: { x: 100, y: 400, width: 300, height: 50 }, confidence: 0.9 }],
  });
  assert.equal(model.spans.length, 1);
  assert.equal(model.spans[0].leftPercent, 10);
  assert.equal(model.spans[0].topPercent, 20);
  assert.equal(model.spans[0].widthPercent, 30);
  assert.equal(model.spans[0].heightPercent, 2.5);
});

test('P17-T005: a line without a box is kept rather than silently dropped', () => {
  const model = createOcrOverlayModel({
    imageWidth: 100,
    imageHeight: 100,
    lines: [{ text: 'no geometry', box: null }],
  });
  assert.equal(model.spans.length, 1);
  assert.equal(model.spans[0].text, 'no geometry');
  assert.equal(model.spans[0].widthPercent, 0);
});

test('P17-T006: the overlay preserves Arabic tashkeel exactly', () => {
  const model = createOcrOverlayModel({
    imageWidth: 500,
    imageHeight: 500,
    lines: [{ text: VOCALISED, box: { x: 0, y: 0, width: 500, height: 40 } }],
  });
  assert.equal(model.spans[0].text, VOCALISED);
  for (const mark of ['\u064e', '\u064f', '\u0650', '\u0651', '\u0652']) {
    assert.ok(model.spans[0].text.includes(mark), `overlay dropped mark ${mark}`);
  }
});

test('P17-T005: the overlay is explicitly marked as machine transcription', () => {
  const model = createOcrOverlayModel({
    imageWidth: 100,
    imageHeight: 100,
    provider: 'paddleocr',
    providerVersion: 'rev-9',
    modelRevision: 'arabic_PP-OCRv5_mobile_rec',
    language: 'ar',
    pageIndex: 7,
    lines: [{ text: 'line', box: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.5 }],
  });
  assert.equal(model.kind, 'ocr-derived');

  const container = fakeDocument().createElement('div');
  const layer = mountOcrOverlay(container, model, fakeDocument());
  assert.ok(layer, 'the overlay layer must be mounted');
  assert.equal(layer.attributes['data-ocr-text-layer'], 'derived');
  assert.equal(layer.attributes['data-ocr-provider'], 'paddleocr');
  assert.equal(layer.attributes['data-ocr-language'], 'ar');
  assert.equal(layer.children.length, 1);
  assert.equal(layer.children[0].textContent, 'line');
  assert.equal(layer.children[0].attributes['data-ocr-derived'], 'true');
  assert.equal(layer.children[0].attributes['data-ocr-confidence'], '0.500');
  assert.equal(layer.children[0].style.color, 'transparent');
});

test('P17-T005: an empty overlay mounts nothing', () => {
  const model = createOcrOverlayModel({ imageWidth: 10, imageHeight: 10, lines: [] });
  const container = fakeDocument().createElement('div');
  assert.equal(mountOcrOverlay(container, model, fakeDocument()), null);
  assert.equal(container.children.length, 0);
});

test('P17-T006: overlay coordinates are clamped to the page', () => {
  const model = createOcrOverlayModel({
    imageWidth: 100,
    imageHeight: 100,
    lines: [{ text: 'out of bounds', box: { x: 90, y: 95, width: 80, height: 80 } }],
  });
  for (const span of model.spans) {
    assert.ok(span.leftPercent >= 0 && span.leftPercent <= 100);
    assert.ok(span.widthPercent >= 0 && span.widthPercent <= 100);
    assert.ok(span.topPercent >= 0 && span.topPercent <= 100);
    assert.ok(span.heightPercent >= 0 && span.heightPercent <= 100);
  }
});

test('P17-T006: searchable text prefers the canonical diacritic-insensitive key when supplied', () => {
  const model = createOcrOverlayModel({
    imageWidth: 100,
    imageHeight: 100,
    lines: [{ text: VOCALISED, box: { x: 0, y: 0, width: 100, height: 10 } }],
  });
  assert.equal(ocrOverlaySearchText(model), VOCALISED);
  assert.equal(ocrOverlaySearchText(model, 'search-key'), 'search-key');
});
