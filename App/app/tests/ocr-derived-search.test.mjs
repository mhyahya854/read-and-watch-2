import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import { findForbiddenSemantics } from '../server/ocr/benchmark/schema.mjs';
import { LINE_SEGMENTATION_REVISION } from '../server/ocr/line-segmentation.mjs';
import { READING_ORDER_REVISION } from '../server/ocr/reading-order.mjs';
import { createOcrDerivedSearch, SEARCH_PROVENANCE } from '../server/ocr/ocr-search.mjs';
import { createOcrStore } from '../server/ocr/ocr-store.mjs';
import { buildOcrTextRepresentations, toSearchText } from '../server/ocr/text-representations.mjs';
import { URDU_PIPELINE_REVISION } from '../server/ocr/urdu-pipeline.mjs';

const scratchDirs = [];

function scratchRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'rw-ocr-search-'));
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

const SOURCE_HASH = 'a'.repeat(64);
const OTHER_SOURCE_HASH = 'b'.repeat(64);
const VOCALISED = '\u0627\u0644\u0652\u062d\u064e\u0645\u0652\u062f\u064f \u0644\u0650\u0644\u0651\u064e\u0647\u0650';
const UNVOCALISED_QUERY = '\u0627\u0644\u062d\u0645\u062f';

function fakeProvider(id, { version = 'v1', modelRevision = 'm1' } = {}) {
  return { id, version, modelRevision };
}

function providers(overrides = {}) {
  return {
    paddleocr: fakeProvider('paddleocr', overrides.paddleocr),
    'urdu-nastaliq-trocr': fakeProvider('urdu-nastaliq-trocr', overrides['urdu-nastaliq-trocr']),
  };
}

function recordFor({
  provider,
  language,
  pageIndex,
  rawText,
  lines = null,
  providerVersion = 'v1',
  modelRevision = 'm1',
  urduExecutionState = null,
  readingOrderRevision = READING_ORDER_REVISION,
  lineSegmentationRevision = LINE_SEGMENTATION_REVISION,
  urduPipelineRevision = provider === 'urdu-nastaliq-trocr' ? URDU_PIPELINE_REVISION : undefined,
}) {
  const representations = buildOcrTextRepresentations({ rawText, language });
  const normalisedLines = Array.isArray(lines)
    ? lines.map((line) => ({
        ...line,
        searchText: line.searchText ?? toSearchText(line.text ?? '', language),
      }))
    : lines;
  return {
    ok: true,
    provider,
    providerVersion,
    modelRevision,
    language,
    pageIndex,
    sourceHash: SOURCE_HASH,
    settingsKey: 'default',
    ...representations,
    blocks: [],
    lines: normalisedLines,
    confidence: null,
    ...(urduExecutionState ? { urduExecutionState, urduLines: normalisedLines, urduDisagreements: [] } : {}),
    ...(urduPipelineRevision ? { urduPipelineRevision } : {}),
    lineSegmentationRevision,
    readingOrderRevision,
  };
}

function buildStore(dataRoot = scratchRoot()) {
  return createOcrStore({ ocrRoot: join(dataRoot, 'ocr') });
}

test('P17-T020: a page with usable native text contributes no OCR search hit', () => {
  const store = buildStore();
  store.save(recordFor({ provider: 'paddleocr', language: 'en', pageIndex: 1, rawText: 'native duplicate words here' }));
  const search = createOcrDerivedSearch({ store, providers: providers() });

  const response = search.search({
    sourceHash: SOURCE_HASH,
    query: 'duplicate',
    nativePages: [
      { pageIndex: 1, hasTextLayer: true, text: 'A usable native publisher text layer with plenty of real words' },
    ],
  });
  assert.equal(response.results.length, 0, 'native text must not be duplicated from OCR');
  assert.deepEqual(response.skipped.nativeTextPages, [1]);

  const withoutNativeReport = search.search({ sourceHash: SOURCE_HASH, query: 'duplicate' });
  assert.equal(withoutNativeReport.results.length, 1, 'the same record is searchable when the page has no native text');
});

test('P17-T020: derived OCR text is searchable and carries OCR provenance', () => {
  const store = buildStore();
  store.save(recordFor({ provider: 'paddleocr', language: 'en', pageIndex: 4, rawText: 'A scanned page about architecture' }));
  const search = createOcrDerivedSearch({ store, providers: providers() });

  const response = search.search({ sourceHash: SOURCE_HASH, query: 'architecture' });
  assert.equal(response.total, 1);
  const hit = response.results[0];
  assert.equal(hit.provenance, SEARCH_PROVENANCE.OCR_DERIVED);
  assert.equal(hit.machineTranscription, true);
  assert.equal(hit.nativeTextPage, false);
  assert.equal(hit.pageIndex, 4);
  assert.match(hit.snippet, /architecture/);
  assert.equal(hit.providers[0].providerId, 'paddleocr');
  assert.equal(hit.providers[0].providerVersion, 'v1');
  assert.equal(hit.providers[0].modelRevision, 'm1');
  assert.ok(response.invalidationKey && response.invalidationKey.length === 64);
});

test('P17-T021: an unvocalised Arabic query finds vocalised OCR text', () => {
  const store = buildStore();
  store.save(recordFor({ provider: 'paddleocr', language: 'ar', pageIndex: 2, rawText: VOCALISED }));
  const search = createOcrDerivedSearch({ store, providers: providers() });

  const response = search.search({ sourceHash: SOURCE_HASH, query: UNVOCALISED_QUERY, language: 'ar' });
  assert.equal(response.total, 1, 'diacritic-insensitive matching must find the vocalised text');
  const hit = response.results[0];
  assert.equal(hit.providers[0].displayText, VOCALISED, 'display text keeps its tashkeel');
  assert.ok(/[\u064B-\u0652]/.test(hit.providers[0].displayText));
  assert.ok(
    /[\u064B-\u0652]/.test(hit.snippet),
    'the snippet returned to the reader keeps the original vocalisation',
  );
});

test('P17-T021: the stored canonical Arabic text is never replaced by the folded search key', () => {
  const store = buildStore();
  store.save(recordFor({ provider: 'paddleocr', language: 'ar', pageIndex: 2, rawText: VOCALISED }));
  const record = store.load({ provider: 'paddleocr', sourceHash: SOURCE_HASH, pageIndex: 2, language: 'ar' });
  assert.equal(record.displayText, VOCALISED);
  assert.notEqual(record.displayText, record.searchText);
  assert.equal(record.rawText, VOCALISED);
});

test('P17-T022: Urdu PP-OCRv5 and specialist line outputs are both searchable', () => {
  const store = buildStore();
  store.save(
    recordFor({
      provider: 'paddleocr',
      language: 'ur',
      pageIndex: 0,
      rawText: '',
      lines: [{ lineId: 'p0-r0-l0', regionId: 'r0', readingOrderIndex: 0, text: '\u06a9\u062a\u0627\u0628', searchText: '\u06a9\u062a\u0627\u0628', bbox: null }],
      urduExecutionState: 'COMPLETE',
    }),
  );
  store.save(
    recordFor({
      provider: 'urdu-nastaliq-trocr',
      language: 'ur',
      pageIndex: 0,
      rawText: '',
      lines: [{ lineId: 'p0-r0-l0', regionId: 'r0', readingOrderIndex: 0, text: '\u06a9\u062a\u0627\u0628', searchText: '\u06a9\u062a\u0627\u0628', bbox: null }],
      urduExecutionState: 'COMPLETE',
    }),
  );
  const search = createOcrDerivedSearch({ store, providers: providers() });
  const response = search.search({ sourceHash: SOURCE_HASH, query: '\u06a9\u062a\u0627\u0628', language: 'ur' });
  assert.equal(response.total, 1, 'the same line from both engines is presented once');
  const hit = response.results[0];
  assert.deepEqual(hit.providerIds.sort(), ['paddleocr', 'urdu-nastaliq-trocr']);
  assert.equal(hit.providers.length, 2, 'both provenance records are preserved');
  assert.equal(hit.completionState, 'COMPLETE');
  assert.equal(hit.partial, false);
});

test('P17-T022: two Urdu engines that disagree are never silently merged', () => {
  const store = buildStore();
  store.save(
    recordFor({
      provider: 'paddleocr',
      language: 'ur',
      pageIndex: 1,
      rawText: '',
      lines: [{ lineId: 'p1-r0-l1', regionId: 'r0', readingOrderIndex: 1, text: '\u06a9\u062a\u0627\u0628', searchText: '\u06a9\u062a\u0627\u0628', bbox: null }],
      urduExecutionState: 'REVIEW_REQUIRED',
    }),
  );
  store.save(
    recordFor({
      provider: 'urdu-nastaliq-trocr',
      language: 'ur',
      pageIndex: 1,
      rawText: '',
      lines: [{ lineId: 'p1-r0-l1', regionId: 'r0', readingOrderIndex: 1, text: '\u06a9\u062a\u0627\u0628\u06be', searchText: '\u06a9\u062a\u0627\u0628\u06be', bbox: null }],
      urduExecutionState: 'REVIEW_REQUIRED',
    }),
  );
  const search = createOcrDerivedSearch({ store, providers: providers() });
  const response = search.search({ sourceHash: SOURCE_HASH, query: '\u06a9\u062a\u0627\u0628', language: 'ur' });

  // Both strings match the folded query, so both engines appear on one hit --
  // but each keeps its own text. Nothing picks a winner.
  const hit = response.results[0];
  const texts = hit.providers.map((provider) => provider.text).sort();
  assert.equal(texts.length, 2);
  assert.notEqual(texts[0], texts[1], 'disagreeing engine strings must both survive');
  assert.equal(Object.hasOwn(hit, 'bestText'), false);
  assert.equal(Object.hasOwn(hit, 'winner'), false);
  assert.deepEqual(findForbiddenSemantics(hit), []);
});

test('P17-T022: a specialist-only Urdu hit is searchable and reported as partial', () => {
  const store = buildStore();
  store.save(
    recordFor({
      provider: 'urdu-nastaliq-trocr',
      language: 'ur',
      pageIndex: 7,
      rawText: '',
      lines: [
        { lineId: 'p7-r0-l0', regionId: 'r0', readingOrderIndex: 0, text: '\u0691\u0627\u06a9', bbox: null },
      ],
      urduExecutionState: 'PARTIAL_ENGINE_FAILURE',
    }),
  );
  const search = createOcrDerivedSearch({ store, providers: providers() });
  const response = search.search({ sourceHash: SOURCE_HASH, query: '\u0691\u0627\u06a9', language: 'ur' });
  assert.equal(response.total, 1, 'the specialist output is searchable on its own');
  const hit = response.results[0];
  assert.deepEqual(hit.providerIds, ['urdu-nastaliq-trocr']);
  assert.equal(hit.partial, true, 'one engine is not a completed Urdu recognition');
  assert.deepEqual(hit.requiredProviders, ['paddleocr', 'urdu-nastaliq-trocr']);
  assert.deepEqual(hit.completedProviders, ['urdu-nastaliq-trocr']);
});

test('P17-T022: a partially completed Urdu page stays visibly partial in search', () => {
  const store = buildStore();
  store.save(
    recordFor({
      provider: 'paddleocr',
      language: 'ur',
      pageIndex: 5,
      rawText: '',
      lines: [{ lineId: 'p5-r0-l0', regionId: 'r0', readingOrderIndex: 0, text: '\u0645\u06cc\u0632', searchText: '\u0645\u06cc\u0632', bbox: null }],
      urduExecutionState: 'PARTIAL_ENGINE_FAILURE',
    }),
  );
  const search = createOcrDerivedSearch({ store, providers: providers() });
  const response = search.search({ sourceHash: SOURCE_HASH, query: '\u0645\u06cc\u0632', language: 'ur' });
  const hit = response.results[0];
  assert.equal(hit.provenance, SEARCH_PROVENANCE.OCR_DERIVED);
  assert.equal(hit.partial, true);
  assert.equal(hit.completionState, 'PARTIAL_ENGINE_FAILURE');
  assert.deepEqual(hit.completedProviders, ['paddleocr']);
  assert.deepEqual(hit.requiredProviders, ['paddleocr', 'urdu-nastaliq-trocr']);
});

test('P17-T023: a different source hash invalidates the derived search evidence', () => {
  const store = buildStore();
  store.save(recordFor({ provider: 'paddleocr', language: 'en', pageIndex: 0, rawText: 'unique marker text' }));
  const search = createOcrDerivedSearch({ store, providers: providers() });
  const present = search.search({ sourceHash: SOURCE_HASH, query: 'marker' });
  const absent = search.search({ sourceHash: OTHER_SOURCE_HASH, query: 'marker' });
  assert.equal(present.total, 1);
  assert.equal(absent.total, 0, 'a record bound to another source must never be served');
  assert.notEqual(present.invalidationKey, absent.invalidationKey);
});

test('P17-T023: a changed model revision invalidates the corresponding search evidence', () => {
  const store = buildStore();
  store.save(recordFor({ provider: 'paddleocr', language: 'en', pageIndex: 0, rawText: 'marker text', modelRevision: 'm1' }));

  const current = createOcrDerivedSearch({ store, providers: providers() });
  assert.equal(current.search({ sourceHash: SOURCE_HASH, query: 'marker' }).total, 1);

  const upgraded = createOcrDerivedSearch({
    store,
    providers: providers({ paddleocr: { version: 'v1', modelRevision: 'm2' } }),
  });
  const response = upgraded.search({ sourceHash: SOURCE_HASH, query: 'marker' });
  assert.equal(response.total, 0, 'a model revision change must invalidate old search evidence');
  assert.deepEqual(response.skipped.staleRecords, [{ providerId: 'paddleocr', pageIndex: 0 }]);
});

test('P17-T023: a changed engine revision invalidates the corresponding search evidence', () => {
  const store = buildStore();
  store.save(recordFor({ provider: 'paddleocr', language: 'en', pageIndex: 0, rawText: 'marker text', providerVersion: 'v1' }));
  const upgraded = createOcrDerivedSearch({
    store,
    providers: providers({ paddleocr: { version: 'v2', modelRevision: 'm1' } }),
  });
  assert.equal(upgraded.search({ sourceHash: SOURCE_HASH, query: 'marker' }).total, 0);
});

test('P17-T023: a changed reading-order or segmentation revision invalidates derived search', () => {
  const store = buildStore();
  store.save(
    recordFor({
      provider: 'paddleocr',
      language: 'ur',
      pageIndex: 0,
      rawText: 'x',
      readingOrderRevision: READING_ORDER_REVISION + 1,
    }),
  );
  const search = createOcrDerivedSearch({ store, providers: providers() });
  assert.equal(search.search({ sourceHash: SOURCE_HASH, query: 'x' }).total, 0);

  const secondRoot = scratchRoot();
  const secondStore = buildStore(secondRoot);
  secondStore.save(
    recordFor({
      provider: 'paddleocr',
      language: 'ur',
      pageIndex: 0,
      rawText: 'y',
      lineSegmentationRevision: LINE_SEGMENTATION_REVISION + 1,
    }),
  );
  const second = createOcrDerivedSearch({ store: secondStore, providers: providers() });
  assert.equal(second.search({ sourceHash: SOURCE_HASH, query: 'y' }).total, 0);
});

test('P17-T023: a changed Urdu pipeline revision invalidates the specialist evidence', () => {
  const store = buildStore();
  store.save(
    recordFor({
      provider: 'urdu-nastaliq-trocr',
      language: 'ur',
      pageIndex: 0,
      rawText: 'z',
      lines: [{ lineId: 'p0-r0-l0', regionId: 'r0', readingOrderIndex: 0, text: 'z', searchText: 'z', bbox: null }],
      urduExecutionState: 'COMPLETE',
      urduPipelineRevision: URDU_PIPELINE_REVISION + 1,
    }),
  );
  const search = createOcrDerivedSearch({ store, providers: providers() });
  assert.equal(search.search({ sourceHash: SOURCE_HASH, query: 'z', language: 'ur' }).total, 0);
});

test('P17-T023: an empty query and a malformed source hash are refused, not guessed', () => {
  const store = buildStore();
  const search = createOcrDerivedSearch({ store, providers: providers() });
  assert.equal(search.search({ sourceHash: SOURCE_HASH, query: '   ' }).total, 0);
  assert.throws(
    () => search.search({ sourceHash: 'not-a-hash', query: 'x' }),
    (error) => error.code === 'INVALID_INPUT',
  );
});

test('P17-T020: search results never claim native provenance for machine text', () => {
  const store = buildStore();
  store.save(recordFor({ provider: 'paddleocr', language: 'en', pageIndex: 0, rawText: 'machine only text' }));
  const search = createOcrDerivedSearch({ store, providers: providers() });
  const hit = search.search({ sourceHash: SOURCE_HASH, query: 'machine' }).results[0];
  assert.equal(hit.provenance, 'OCR_DERIVED');
  assert.notEqual(hit.provenance, 'NATIVE_TEXT');
  assert.equal(hit.nativeTextPage, false);
});
