import assert from 'node:assert/strict';
import test from 'node:test';

import { handleOcrRequest } from '../server/ocr/ocr-http.mjs';

function fakeProvider(id, overrides = {}) {
  return {
    id,
    async install() {
      return { providerId: id, status: 'staged', activated: true };
    },
    async checkForUpdates() {
      return { providerId: id, status: 'up-to-date' };
    },
    async updateNow() {
      return { providerId: id, status: 'up-to-date', activated: false };
    },
    rollback() {
      return { providerId: id, status: 'rolled-back' };
    },
    async healthCheck() {
      return { ok: true, providerId: id };
    },
    ...overrides,
  };
}

function fakeService(providers) {
  return {
    providers,
    ocrRoot: '/tmp/ocr',
    listProviders: () => Object.values(providers).map((provider) => ({ id: provider.id })),
    describeRouting: () => [{ language: 'en', providerId: 'unlimited-ocr' }],
    getDerivedText: ({ sourceHash, language }) => ({ sourceHash, language: language ?? null, pages: [] }),
  };
}

test('P17-T018: the provider inventory endpoint reports providers and routing', async () => {
  const service = fakeService({ paddleocr: fakeProvider('paddleocr') });
  const result = await handleOcrRequest({ service, method: 'GET', rest: 'providers' });
  assert.equal(result.status, 200);
  assert.equal(result.payload.providers.length, 1);
  assert.equal(result.payload.routing[0].providerId, 'unlimited-ocr');
});

test('P17-T018: an unknown provider is a 404 with a structured body', async () => {
  const service = fakeService({ paddleocr: fakeProvider('paddleocr') });
  const result = await handleOcrRequest({ service, method: 'POST', rest: 'providers/nope/update' });
  assert.equal(result.status, 404);
  assert.equal(result.payload.code, 'INVALID_INPUT');
});

test('P17-T018: a provider GET where POST is required is rejected', async () => {
  const service = fakeService({ paddleocr: fakeProvider('paddleocr') });
  const result = await handleOcrRequest({ service, method: 'GET', rest: 'providers/paddleocr/update' });
  assert.equal(result.status, 405);
});

test('P17-T018: an update failure is surfaced as a structured payload, not a crash', async () => {
  const failing = fakeProvider('paddleocr', {
    async updateNow() {
      const error = new Error('staged revision failed smoke verification');
      error.code = 'UPDATE_FAILED';
      throw error;
    },
  });
  const service = fakeService({ paddleocr: failing });
  const result = await handleOcrRequest({ service, method: 'POST', rest: 'providers/paddleocr/update' });
  assert.equal(result.status, 409);
  assert.equal(result.payload.code, 'UPDATE_FAILED');
  assert.match(result.payload.message, /smoke verification/);
});

test('P17-T018: "update all" continues past a failing engine and reports each result', async () => {
  const service = fakeService({
    'unlimited-ocr': fakeProvider('unlimited-ocr', {
      async updateNow() {
        const error = new Error('no CUDA device');
        error.code = 'UNSUPPORTED_HARDWARE';
        throw error;
      },
    }),
    paddleocr: fakeProvider('paddleocr'),
  });
  const result = await handleOcrRequest({ service, method: 'POST', rest: 'update-all' });
  assert.equal(result.status, 200);
  assert.equal(result.payload.results.length, 2);
  const failure = result.payload.results.find((entry) => entry.ok === false);
  assert.equal(failure.code, 'UNSUPPORTED_HARDWARE');
  const success = result.payload.results.find((entry) => entry.providerId === 'paddleocr');
  assert.ok(success);
});

test('P17-T018: the derived-text endpoint rejects anything that is not a source hash', async () => {
  const service = fakeService({ paddleocr: fakeProvider('paddleocr') });
  const bad = await handleOcrRequest({ service, method: 'GET', rest: 'text', query: { sourceHash: '../etc' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.payload.code, 'INVALID_INPUT');

  const good = await handleOcrRequest({
    service,
    method: 'GET',
    rest: 'text',
    query: { sourceHash: 'a'.repeat(64), language: 'ar' },
  });
  assert.equal(good.status, 200);
  assert.equal(good.payload.language, 'ar');
});

test('P17-T018: recognition without a rendered page image is refused', async () => {
  const service = fakeService({ paddleocr: fakeProvider('paddleocr') });
  const result = await handleOcrRequest({ service, method: 'POST', rest: 'recognize', body: {} });
  assert.equal(result.status, 400);
  assert.equal(result.payload.code, 'INVALID_INPUT');
});
