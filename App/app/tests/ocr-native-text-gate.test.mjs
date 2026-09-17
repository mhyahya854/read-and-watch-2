import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NATIVE_TEXT_DECISION,
  NATIVE_TEXT_REASON,
  evaluateNativeTextGate,
  summariseTextLayer,
} from '../server/ocr/native-text-gate.mjs';

test('P17-T001: a PDF page with no text layer requires OCR', () => {
  const result = evaluateNativeTextGate({ hasTextLayer: false, text: '' });
  assert.equal(result.decision, NATIVE_TEXT_DECISION.OCR_REQUIRED);
  assert.equal(result.reason, NATIVE_TEXT_REASON.NO_TEXT_LAYER);
});

test('P17-T001: a page with a usable embedded text layer wins over OCR', () => {
  const result = evaluateNativeTextGate({
    hasTextLayer: true,
    text: 'Chapter One. This page carries ordinary searchable prose from the publisher.',
  });
  assert.equal(result.decision, NATIVE_TEXT_DECISION.NATIVE_TEXT);
  assert.equal(result.reason, NATIVE_TEXT_REASON.USABLE_TEXT_LAYER);
  assert.ok(result.metrics.letterRatio > 0.4);
});

test('P17-T001: an empty or whitespace-only text layer is not usable', () => {
  assert.equal(
    evaluateNativeTextGate({ hasTextLayer: true, text: '        \n\n   ' }).decision,
    NATIVE_TEXT_DECISION.OCR_REQUIRED,
  );
  assert.equal(
    evaluateNativeTextGate({ hasTextLayer: true, text: '' }).reason,
    NATIVE_TEXT_REASON.TEXT_LAYER_TOO_SPARSE,
  );
});

test('P17-T001: a glyph-noise text layer is rejected as not meaningful', () => {
  const noisy = '||| /// --- +++ ||| ### /// --- +++';
  const result = evaluateNativeTextGate({ hasTextLayer: true, text: noisy });
  assert.equal(result.decision, NATIVE_TEXT_DECISION.OCR_REQUIRED);
  assert.equal(result.reason, NATIVE_TEXT_REASON.TEXT_LAYER_NOT_MEANINGFUL);
});

test('P17-T001: a single stray word on an otherwise image-only page requires OCR', () => {
  const result = evaluateNativeTextGate({ hasTextLayer: true, text: 'Page' });
  assert.equal(result.decision, NATIVE_TEXT_DECISION.OCR_REQUIRED);
});

test('P17-T001: a present-but-unsupplied text layer is trusted rather than OCR-forced', () => {
  const result = evaluateNativeTextGate({ hasTextLayer: true });
  assert.equal(result.decision, NATIVE_TEXT_DECISION.NATIVE_TEXT);
  assert.equal(result.metrics, null);
});

test('P17-T001: text metrics count non-Latin scripts correctly', () => {
  const metrics = summariseTextLayer('\u0627\u0644\u0652\u062d\u064e\u0645\u0652\u062f\u064f \u0644\u0650\u0644\u0651\u064e\u0647\u0650');
  assert.ok(metrics.letterCount >= 8, `expected letters to be counted, got ${metrics.letterCount}`);
  assert.ok(metrics.letterRatio >= 0.4);
});
