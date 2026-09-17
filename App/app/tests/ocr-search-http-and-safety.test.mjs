import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createOcrService } from '../server/ocr/index.mjs';
import { handleOcrRequest } from '../server/ocr/ocr-http.mjs';
import { createOcrStore } from '../server/ocr/ocr-store.mjs';
import { createUrduPipeline } from '../server/ocr/urdu-pipeline.mjs';
import { buildOcrTextRepresentations } from '../server/ocr/text-representations.mjs';

const moduleDir = resolve(fileURLToPath(import.meta.url), '..');
const APP_ROOT = resolve(moduleDir, '..');
const scratchDirs = [];

function scratchRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'rw-ocr-http-'));
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

const SOURCE_HASH = '9'.repeat(64);

test('P17-T020: GET /api/ocr/search returns derived hits with OCR provenance', async () => {
  const dataRoot = scratchRoot();
  const service = createOcrService({ dataRoot });
  const representations = buildOcrTextRepresentations({
    rawText: 'A scanned paragraph about cartography',
    language: 'en',
  });
  service.store.save({
    ok: true,
    provider: 'paddleocr',
    providerVersion: 'rev-1',
    modelRevision: 'm1',
    language: 'en',
    pageIndex: 2,
    sourceHash: SOURCE_HASH,
    settingsKey: 'default',
    ...representations,
    blocks: [],
    lines: null,
  });

  const response = await handleOcrRequest({
    service,
    method: 'GET',
    rest: 'search',
    query: { sourceHash: SOURCE_HASH, q: 'cartography' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.payload.provenance, 'OCR_DERIVED');
  assert.equal(response.payload.results.length, 1);
  assert.equal(response.payload.results[0].provenance, 'OCR_DERIVED');
  assert.deepEqual(response.payload.results[0].providerIds, ['paddleocr']);
});

test('P17-T020: GET /api/ocr/search refuses a malformed source hash', async () => {
  const dataRoot = scratchRoot();
  const service = createOcrService({ dataRoot });
  const response = await handleOcrRequest({
    service,
    method: 'GET',
    rest: 'search',
    query: { sourceHash: 'nope', q: 'anything' },
  });
  assert.equal(response.status, 400);
  assert.equal(response.payload.code, 'INVALID_INPUT');
});

test('P17-T005: GET /api/ocr/providers reports the mandatory dual-engine Urdu pipeline', async () => {
  const dataRoot = scratchRoot();
  const service = createOcrService({ dataRoot });
  const response = await handleOcrRequest({ service, method: 'GET', rest: 'providers' });
  assert.equal(response.status, 200);

  const ids = response.payload.providers.map((provider) => provider.id);
  assert.ok(ids.includes('urdu-nastaliq-trocr'));
  const specialist = response.payload.providers.find((provider) => provider.id === 'urdu-nastaliq-trocr');
  assert.equal(specialist.modelLicense, 'apache-2.0 (declared on the model card)');
  assert.deepEqual(specialist.supportedUnitTypes, ['LINE']);
  assert.match(specialist.redistributionPolicy, /NOT REDISTRIBUTED/);

  const urdu = response.payload.routing.find((route) => route.language === 'ur');
  assert.equal(urdu.pipeline, 'urdu-dual-engine');
  assert.deepEqual(
    urdu.requiredProviders.map((entry) => entry.providerId),
    ['paddleocr', 'urdu-nastaliq-trocr'],
  );
  for (const entry of urdu.requiredProviders) {
    assert.equal(entry.integrationStatus, 'INTEGRATED');
  }
  assert.equal(
    response.payload.routing.some((route) => route.requiredProviders?.length === 1 && route.language === 'ur'),
    false,
    'Urdu must never be represented as a single-engine language',
  );
});

test('P17-T005: POST /api/ocr/recognize/urdu runs the dual-engine pipeline', async () => {
  const calls = [];
  const service = {
    urduPipeline: {
      async recognizePage(input) {
        calls.push(input);
        return { ok: true, action: 'OCR', language: 'ur', pageIndex: input.pageIndex, executionState: 'COMPLETE' };
      },
    },
    router: {
      async recognizePage() {
        throw new Error('the single-engine router must not be used for the Urdu pipeline route');
      },
    },
    ocrRoot: scratchRoot(),
  };
  const response = await handleOcrRequest({
    service,
    method: 'POST',
    rest: 'recognize/urdu',
    body: {
      sourceHash: SOURCE_HASH,
      pageIndex: 1,
      language: 'ur',
      imageBase64: Buffer.from('page bytes').toString('base64'),
      hasTextLayer: false,
      regions: [],
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.payload.executionState, 'COMPLETE');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pageIndex, 1);
});

test('P17-T018: running the Urdu dual-engine pipeline leaves the source document byte-identical', async () => {
  const dataRoot = scratchRoot();
  const store = createOcrStore({ ocrRoot: join(dataRoot, 'ocr') });
  const pdfPath = resolve(APP_ROOT, 'tests', 'fixtures', 'pdf', 'sample-paper.pdf');
  const before = createHash('sha256').update(readFileSync(pdfPath)).digest('hex');

  const providerBlock = (id, languages) => ({
    id,
    displayName: id,
    languages,
    version: 'rev-1',
    modelRevision: 'm1',
    isAvailable: () => ({ ok: true, activeRevision: 'rev-1' }),
    async recognizePage({ pageIndex, language, sourceHash }) {
      return {
        ok: true,
        provider: id,
        unitType: 'PAGE',
        language,
        pageIndex,
        sourceHash,
        rawText: '\u06a9\u062a\u0627\u0628',
        displayText: '\u06a9\u062a\u0627\u0628',
        blocks: [{ text: '\u06a9\u062a\u0627\u0628', confidence: 0.5, box: { x: 0, y: 0, width: 100, height: 20 } }],
        confidence: 0.5,
      };
    },
    async recognizeRegion() {
      throw new Error('unused');
    },
    async recognizeLine({ line }) {
      return {
        ok: true,
        displayText: '\u06a9\u062a\u0627\u0628',
        rawText: '\u06a9\u062a\u0627\u0628',
        searchText: '\u06a9\u062a\u0627\u0628',
        confidence: null,
        confidenceSource: 'not-supplied',
        bbox: line.box,
      };
    },
    cancel: () => ({ ok: true }),
  });

  const pipeline = createUrduPipeline({
    providers: {
      paddleocr: providerBlock('paddleocr', ['ar', 'ur']),
      'urdu-nastaliq-trocr': providerBlock('urdu-nastaliq-trocr', ['ur']),
    },
    store,
  });
  const result = await pipeline.recognizePage({
    sourceHash: before,
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: join(dataRoot, 'rendered-page.png'),
  });
  assert.equal(result.ok, true);
  const after = createHash('sha256').update(readFileSync(pdfPath)).digest('hex');
  assert.equal(after, before, 'OCR is derived data: the source document must not change');
});

test('P17-T029: the OCR surfaces never receive a developer-machine path from stored records', async () => {
  const dataRoot = scratchRoot();
  const store = createOcrStore({ ocrRoot: join(dataRoot, 'ocr') });
  const representations = buildOcrTextRepresentations({ rawText: 'safe text', language: 'en' });
  store.save({
    ok: true,
    provider: 'paddleocr',
    providerVersion: 'rev-1',
    modelRevision: 'm1',
    language: 'en',
    pageIndex: 0,
    sourceHash: SOURCE_HASH,
    settingsKey: 'default',
    ...representations,
    blocks: [],
  });
  const search = createOcrService({ dataRoot }).derivedSearch;
  const response = search.search({ sourceHash: SOURCE_HASH, query: 'safe' });
  const serialised = JSON.stringify(response);
  assert.equal(/[A-Za-z]:[\\/]+Users[\\/]+/.test(serialised), false);
  assert.equal(/\/(?:home|Users)\/[A-Za-z0-9._-]+\//.test(serialised), false);
});
