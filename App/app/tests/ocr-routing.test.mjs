import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OCR_LANGUAGE_ROUTING,
  authorisedProviderForLanguage,
} from '../server/ocr/ocr-contract.mjs';
import { createOcrRouter } from '../server/ocr/router.mjs';

function fakeProvider(id, languages, overrides = {}) {
  return {
    id,
    displayName: id,
    languages,
    version: 'rev-1',
    modelRevision: 'model-1',
    isAvailable: () => ({ ok: true, activeRevision: 'rev-1' }),
    getCapabilities: async () => ({ ok: true, capabilities: [] }),
    healthCheck: async () => ({ ok: true }),
    recognizePage: async ({ pageIndex, language, sourceHash }) => ({
      ok: true,
      provider: id,
      providerVersion: 'rev-1',
      modelRevision: 'model-1',
      language,
      pageIndex,
      sourceHash,
      settingsKey: 'default',
      rawText: `${id}:${language}`,
      displayText: `${id}:${language}`,
      searchText: `${id}:${language}`,
      blocks: [],
      confidence: null,
    }),
    recognizeRegion: async () => ({ ok: true }),
    cancel: () => ({ ok: true }),
    ...overrides,
  };
}

test('P17-T006: English routes to the authorised Unlimited-OCR provider only', () => {
  const router = createOcrRouter({
    providers: {
      'unlimited-ocr': fakeProvider('unlimited-ocr', ['en']),
      paddleocr: fakeProvider('paddleocr', ['ar', 'ur']),
    },
  });
  const plan = router.planForPage({ language: 'en', hasTextLayer: false, text: '' });
  assert.equal(plan.action, 'OCR');
  assert.equal(plan.providerId, 'unlimited-ocr');
});

test('P17-T006: Arabic and Urdu route to PP-OCRv5 and never to the English engine', () => {
  const router = createOcrRouter({
    providers: {
      'unlimited-ocr': fakeProvider('unlimited-ocr', ['en']),
      paddleocr: fakeProvider('paddleocr', ['ar', 'ur']),
    },
  });
  for (const language of ['ar', 'ur']) {
    const plan = router.planForPage({ language, hasTextLayer: false, text: '' });
    assert.equal(plan.providerId, 'paddleocr', `${language} must route to PP-OCRv5`);
  }
  assert.deepEqual(OCR_LANGUAGE_ROUTING, { en: 'unlimited-ocr', ar: 'paddleocr', ur: 'paddleocr' });
});

test('P17-T006: an unauthorised language is refused rather than substituted', () => {
  assert.throws(
    () => authorisedProviderForLanguage('fr'),
    (error) => error.code === 'UNAUTHORISED_LANGUAGE',
  );
});

test('P17-T006: an unavailable provider returns a structured state, never fake text', async () => {
  const unavailable = fakeProvider('paddleocr', ['ar', 'ur'], {
    isAvailable: () => ({
      ok: false,
      code: 'ENGINE_NOT_INSTALLED',
      message: 'not installed',
    }),
  });
  const router = createOcrRouter({
    providers: { 'unlimited-ocr': fakeProvider('unlimited-ocr', ['en']), paddleocr: unavailable },
  });
  const result = await router.recognizePage({
    sourceHash: 'a'.repeat(64),
    pageIndex: 3,
    language: 'ar',
    hasTextLayer: false,
    text: '',
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ENGINE_NOT_INSTALLED');
  assert.equal(result.pageIndex, 3);
  assert.equal(result.displayText, undefined);
});

test('P17-T001: the router never invokes OCR when native text is usable', async () => {
  let called = false;
  const provider = fakeProvider('unlimited-ocr', ['en'], {
    recognizePage: async () => {
      called = true;
      return { ok: true };
    },
  });
  const router = createOcrRouter({ providers: { 'unlimited-ocr': provider } });
  const result = await router.recognizePage({
    sourceHash: 'b'.repeat(64),
    pageIndex: 1,
    language: 'en',
    hasTextLayer: true,
    text: 'A properly searchable publisher text layer with plenty of real words.',
  });
  assert.equal(result.action, 'NATIVE_TEXT');
  assert.equal(result.ocrInvoked, false);
  assert.equal(called, false, 'OCR must not run for native text pages');
});

test('P17-T006: a missing registered provider is reported, not silently skipped', async () => {
  const router = createOcrRouter({ providers: {} });
  await assert.rejects(
    () =>
      router.recognizePage({
        sourceHash: 'c'.repeat(64),
        pageIndex: 0,
        language: 'ar',
        hasTextLayer: false,
        text: '',
      }),
    (error) => error.code === 'ENGINE_NOT_INSTALLED',
  );
});
