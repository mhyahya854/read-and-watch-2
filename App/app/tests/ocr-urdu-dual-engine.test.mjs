import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import { OCR_PROVIDERS, OCR_REQUIRED_PROVIDERS } from '../server/ocr/ocr-contract.mjs';
import { findForbiddenSemantics } from '../server/ocr/benchmark/schema.mjs';
import { createOcrStore } from '../server/ocr/ocr-store.mjs';
import { createUrduPipeline, URDU_EXECUTION_STATE } from '../server/ocr/urdu-pipeline.mjs';

const scratchDirs = [];

function scratchRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'rw-ocr-urdu-'));
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

const SOURCE_HASH = 'f'.repeat(64);
const IMAGE_PATH = 'page.png';

/** Two Urdu lines with distinct geometry so segmentation produces two lines. */
const BLOCKS = [
  { text: '\u06a9\u062a\u0627\u0628', confidence: 0.9, box: { x: 10, y: 10, width: 300, height: 30 } },
  { text: '\u0645\u06cc\u0632', confidence: 0.8, box: { x: 10, y: 60, width: 300, height: 30 } },
];

function paddleProvider({ available = true, failCode = null, blocks = BLOCKS, onCall } = {}) {
  return {
    id: 'paddleocr',
    displayName: OCR_PROVIDERS.paddleocr.displayName,
    languages: ['ar', 'ur'],
    version: 'paddle-rev-1',
    modelRevision: 'arabic_PP-OCRv5_mobile_rec',
    isAvailable: () =>
      available
        ? { ok: true, activeRevision: 'paddle-rev-1' }
        : { ok: false, code: 'ENGINE_NOT_INSTALLED', message: 'PP-OCRv5 is not installed' },
    async recognizePage({ pageIndex, language, sourceHash }) {
      onCall?.();
      if (failCode) throw Object.assign(new Error('simulated PP-OCRv5 failure'), { code: failCode });
      return {
        ok: true,
        unitType: 'PAGE',
        provider: 'paddleocr',
        providerVersion: 'paddle-rev-1',
        modelRevision: 'arabic_PP-OCRv5_mobile_rec',
        language,
        pageIndex,
        sourceHash,
        rawText: blocks.map((block) => block.text).join('\n'),
        displayText: blocks.map((block) => block.text).join('\n'),
        blocks,
        confidence: 0.8,
      };
    },
    async recognizeRegion() {
      throw new Error('region recognition is not used by the Urdu page pipeline');
    },
    async recognizeLine() {
      throw new Error('PP-OCRv5 line text comes from its own boxed page output');
    },
    cancel: () => ({ ok: true }),
  };
}

function specialistProvider({ available = true, failCode = null, texts = {}, onCall } = {}) {
  return {
    id: 'urdu-nastaliq-trocr',
    displayName: OCR_PROVIDERS['urdu-nastaliq-trocr'].displayName,
    languages: ['ur'],
    version: 'spec-rev-1',
    modelRevision: 'a9ef072320b50014f6df7ed9db807810157a410e',
    isAvailable: () =>
      available
        ? { ok: true, activeRevision: 'spec-rev-1' }
        : { ok: false, code: 'MODEL_NOT_INSTALLED', message: 'specialist model is not installed' },
    async recognizePage() {
      throw Object.assign(new Error('line-only engine'), { code: 'UNSUPPORTED_UNIT' });
    },
    async recognizeLine({ line }) {
      onCall?.(line);
      if (failCode) throw Object.assign(new Error('simulated specialist failure'), { code: failCode });
      const text = texts[line.lineId] ?? `spec:${line.lineId}`;
      return {
        ok: true,
        unitType: 'LINE',
        provider: 'urdu-nastaliq-trocr',
        providerVersion: 'spec-rev-1',
        modelRevision: 'a9ef072320b50014f6db...',
        language: 'ur',
        regionId: line.regionId,
        lineId: line.lineId,
        displayText: text,
        rawText: text,
        searchText: text,
        confidence: null,
        confidenceSource: 'not-supplied',
        bbox: line.box,
      };
    },
    cancel: () => ({ ok: true }),
  };
}

function pipelineWith(providers, { store = null } = {}) {
  return createUrduPipeline({ providers, store });
}

test('P17-T005: Urdu requires BOTH mandatory engines', () => {
  assert.deepEqual([...OCR_REQUIRED_PROVIDERS.ur], ['paddleocr', 'urdu-nastaliq-trocr']);
  const pipeline = pipelineWith({
    paddleocr: paddleProvider(),
    'urdu-nastaliq-trocr': specialistProvider(),
  });
  assert.deepEqual(pipeline.mandatoryProviderIds(), ['paddleocr', 'urdu-nastaliq-trocr']);
});

test('P17-T005: both engine outputs are preserved independently with matching line identities', async () => {
  const seen = [];
  const pipeline = pipelineWith({
    paddleocr: paddleProvider(),
    'urdu-nastaliq-trocr': specialistProvider({ onCall: (line) => seen.push(line.lineId) }),
  });
  const result = await pipeline.recognizePage({
    sourceHash: SOURCE_HASH,
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: IMAGE_PATH,
  });

  assert.equal(result.ok, true);
  assert.equal(result.lines.length, 2);
  assert.deepEqual(seen, ['p0-r0-l0', 'p0-r0-l1'], 'the specialist receives the same line identities');
  for (const line of result.lines) {
    assert.ok(line.engines.paddleocr.ok, 'PP-OCRv5 text must be preserved');
    assert.ok(line.engines['urdu-nastaliq-trocr'].ok, 'specialist text must be preserved');
    assert.notEqual(
      line.engines.paddleocr.text,
      undefined,
      'no engine result may be collapsed into an undefined placeholder',
    );
  }
  assert.deepEqual(result.completedProviders.sort(), ['paddleocr', 'urdu-nastaliq-trocr']);
});

test('P17-T005: a PP-OCRv5-only Urdu result can never become COMPLETE', async () => {
  const pipeline = pipelineWith({
    paddleocr: paddleProvider(),
    'urdu-nastaliq-trocr': specialistProvider({ available: false }),
  });
  const result = await pipeline.recognizePage({
    sourceHash: SOURCE_HASH,
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: IMAGE_PATH,
  });
  assert.equal(result.executionState, URDU_EXECUTION_STATE.PARTIAL_ENGINE_FAILURE);
  assert.notEqual(result.executionState, 'COMPLETE');
  assert.equal(result.allMandatoryEnginesCompleted, false);
  assert.deepEqual(result.completedProviders, ['paddleocr']);
  assert.deepEqual(result.failedProviders, ['urdu-nastaliq-trocr']);
  const specialist = result.engines.find((engine) => engine.providerId === 'urdu-nastaliq-trocr');
  assert.equal(specialist.error.code, 'MODEL_NOT_INSTALLED');
});

test('P17-T005: a specialist-only Urdu result can never become COMPLETE', async () => {
  const pipeline = pipelineWith({
    paddleocr: paddleProvider({ failCode: 'RUNTIME_UNAVAILABLE' }),
    'urdu-nastaliq-trocr': specialistProvider(),
  });
  // Declared region geometry lets the line engine run even when the detection
  // engine failed, which is exactly the "specialist completed, PP-OCRv5 did not"
  // case that must never be reported as COMPLETE.
  const result = await pipeline.recognizePage({
    sourceHash: SOURCE_HASH,
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: IMAGE_PATH,
    regions: [
      {
        regionId: 'declared-body',
        regionType: 'body',
        language: 'ur',
        box: { x: 0, y: 0, width: 320, height: 100 },
        lines: [{ lineId: 'declared-line-1', box: { x: 10, y: 10, width: 300, height: 30 } }],
      },
    ],
  });
  assert.equal(result.executionState, URDU_EXECUTION_STATE.PARTIAL_ENGINE_FAILURE);
  assert.deepEqual(result.completedProviders, ['urdu-nastaliq-trocr']);
  const paddle = result.engines.find((engine) => engine.providerId === 'paddleocr');
  assert.equal(paddle.ok, false);
  assert.equal(paddle.error.code, 'RUNTIME_UNAVAILABLE');
  assert.notEqual(result.executionState, 'COMPLETE');
});

test('P17-T005: adding line geometry never invents a specialist call when nothing can run', async () => {
  const pipeline = pipelineWith({
    paddleocr: paddleProvider({ failCode: 'ENGINE_NOT_INSTALLED' }),
    'urdu-nastaliq-trocr': specialistProvider(),
  });
  const result = await pipeline.recognizePage({
    sourceHash: SOURCE_HASH,
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: IMAGE_PATH,
  });
  const specialist = result.engines.find((engine) => engine.providerId === 'urdu-nastaliq-trocr');
  assert.equal(specialist.ok, false);
  assert.match(specialist.error.message, /No line geometry was available/);
  assert.equal(result.executionState, URDU_EXECUTION_STATE.BLOCKED);
});

test('P17-T005: disagreement produces review evidence instead of a winner', async () => {
  const pipeline = pipelineWith({
    paddleocr: paddleProvider(),
    'urdu-nastaliq-trocr': specialistProvider({ texts: { 'p0-r0-l0': '\u06a9\u062a\u0627\u0628\u06be' } }),
  });
  const result = await pipeline.recognizePage({
    sourceHash: SOURCE_HASH,
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: IMAGE_PATH,
  });
  assert.equal(result.executionState, URDU_EXECUTION_STATE.REVIEW_REQUIRED);
  assert.equal(result.reviewState, 'REVIEW_REQUIRED');
  assert.ok(result.disagreements.length >= 1);
  const disagreement = result.disagreements[0];
  assert.deepEqual(disagreement.providers.sort(), ['paddleocr', 'urdu-nastaliq-trocr']);
  assert.ok(disagreement.pairwiseDisagreement[0].disagreementCount >= 1);
  assert.equal(disagreement.correctnessAuthority, 'none');
  assert.match(disagreement.note, /not truth/);
  assert.match(result.reviewEvidence.note, /not truth/);
});

test('P17-T005: engine agreement is COMPLETE but still not a truth claim', async () => {
  const pipeline = pipelineWith({
    paddleocr: paddleProvider(),
    'urdu-nastaliq-trocr': specialistProvider({
      texts: { 'p0-r0-l0': '\u06a9\u062a\u0627\u0628', 'p0-r0-l1': '\u0645\u06cc\u0632' },
    }),
  });
  const result = await pipeline.recognizePage({
    sourceHash: SOURCE_HASH,
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: IMAGE_PATH,
  });
  assert.equal(result.executionState, URDU_EXECUTION_STATE.COMPLETE);
  assert.equal(result.disagreements.length, 0);
  assert.match(result.reviewEvidence.policy.description, /not truth/);
});

test('P17-T005: no fallback or backup engine is ever consulted', async () => {
  let fallbackCalls = 0;
  const fallback = {
    id: 'unlimited-ocr',
    displayName: 'Unlimited-OCR (Baidu)',
    languages: ['en'],
    version: 'x',
    modelRevision: 'y',
    isAvailable: () => ({ ok: true }),
    async recognizePage() {
      fallbackCalls += 1;
      return { ok: true, blocks: [] };
    },
    async recognizeRegion() {
      fallbackCalls += 1;
      return { ok: true };
    },
    async recognizeLine() {
      fallbackCalls += 1;
      return { ok: true };
    },
    cancel: () => ({ ok: true }),
  };
  const pipeline = pipelineWith({
    paddleocr: paddleProvider({ failCode: 'OCR_FAILED' }),
    'urdu-nastaliq-trocr': specialistProvider({ available: false }),
    'unlimited-ocr': fallback,
  });
  const result = await pipeline.recognizePage({
    sourceHash: SOURCE_HASH,
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: IMAGE_PATH,
  });
  assert.equal(fallbackCalls, 0, 'no unauthorised engine may be substituted');
  assert.equal(result.executionState, URDU_EXECUTION_STATE.BLOCKED);
  assert.deepEqual(findForbiddenSemantics(result), []);
});

test('P17-T005: an unregistered mandatory engine is reported, never skipped', async () => {
  const pipeline = pipelineWith({ paddleocr: paddleProvider() });
  const result = await pipeline.recognizePage({
    sourceHash: SOURCE_HASH,
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: IMAGE_PATH,
  });
  const specialist = result.engines.find((engine) => engine.providerId === 'urdu-nastaliq-trocr');
  assert.equal(specialist.ok, false);
  assert.equal(specialist.error.code, 'ENGINE_NOT_INSTALLED');
  assert.equal(result.executionState, URDU_EXECUTION_STATE.PARTIAL_ENGINE_FAILURE);
});

test('P17-T005: native text pages never reach either Urdu engine', async () => {
  let paddleCalls = 0;
  const pipeline = pipelineWith({
    paddleocr: paddleProvider({ onCall: () => (paddleCalls += 1) }),
    'urdu-nastaliq-trocr': specialistProvider(),
  });
  const result = await pipeline.recognizePage({
    sourceHash: SOURCE_HASH,
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: true,
    text: '\u06cc\u06c1 \u0645\u06a9\u0645\u0644 \u0645\u062a\u0646 \u06c1\u06d2 \u062c\u0648 \u067e\u06c1\u0644\u06d2 \u0633\u06d2 \u0645\u0648\u062c\u0648\u062f \u06c1\u06d2',
    imagePath: IMAGE_PATH,
  });
  assert.equal(result.action, 'NATIVE_TEXT');
  assert.equal(result.ocrInvoked, false);
  assert.equal(paddleCalls, 0);
});

test('P17-T005: a cancelled Urdu job is never COMPLETE and keeps partial evidence', async () => {
  const controller = new AbortController();
  const pipeline = pipelineWith({
    paddleocr: paddleProvider(),
    'urdu-nastaliq-trocr': {
      ...specialistProvider(),
      async recognizeLine({ line }) {
        controller.abort();
        return {
          ok: true,
          unitType: 'LINE',
          provider: 'urdu-nastaliq-trocr',
          displayText: `partial:${line.lineId}`,
          rawText: `partial:${line.lineId}`,
          searchText: `partial:${line.lineId}`,
          confidence: null,
          confidenceSource: 'not-supplied',
          bbox: line.box,
        };
      },
    },
  });
  const result = await pipeline.recognizePage({
    sourceHash: SOURCE_HASH,
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: IMAGE_PATH,
    signal: controller.signal,
  });
  assert.equal(result.cancelled, true);
  assert.notEqual(result.executionState, 'COMPLETE');
  assert.ok(result.lines.some((line) => line.engines['urdu-nastaliq-trocr']?.ok), 'completed work is preserved');
  for (const line of result.lines) {
    if (line.engines['urdu-nastaliq-trocr'] && line.engines['urdu-nastaliq-trocr'].ok === false) {
      assert.ok(line.engines['urdu-nastaliq-trocr'].error, 'unfinished lines carry a structured error');
    }
  }
});

test('P17-T006: each mandatory engine persists its own derived record', async () => {
  const dataRoot = scratchRoot();
  const store = createOcrStore({ ocrRoot: join(dataRoot, 'ocr') });
  const pipeline = pipelineWith(
    { paddleocr: paddleProvider(), 'urdu-nastaliq-trocr': specialistProvider() },
    { store },
  );
  await pipeline.recognizePage({
    sourceHash: SOURCE_HASH,
    pageIndex: 3,
    language: 'ur',
    hasTextLayer: false,
    imagePath: IMAGE_PATH,
  });
  const paddle = store.load({ provider: 'paddleocr', sourceHash: SOURCE_HASH, pageIndex: 3, language: 'ur' });
  const specialist = store.load({
    provider: 'urdu-nastaliq-trocr',
    sourceHash: SOURCE_HASH,
    pageIndex: 3,
    language: 'ur',
  });
  assert.ok(paddle && specialist, 'both engines must have independent derived records');
  assert.equal(paddle.unitType, 'PAGE');
  assert.equal(specialist.unitType, 'LINE');
  assert.equal(paddle.urduExecutionState, specialist.urduExecutionState);
  assert.equal(paddle.lineSegmentationRevision, specialist.lineSegmentationRevision);
  assert.ok(Array.isArray(specialist.lines) && specialist.lines.length === 2);
});

test('P17-T005: a completed Urdu page is served from the derived cache without re-running either engine', async () => {
  const dataRoot = scratchRoot();
  const store = createOcrStore({ ocrRoot: join(dataRoot, 'ocr') });
  let paddleCalls = 0;
  let specialistCalls = 0;
  const pipeline = pipelineWith(
    {
      paddleocr: paddleProvider({ onCall: () => (paddleCalls += 1) }),
      'urdu-nastaliq-trocr': specialistProvider({ onCall: () => (specialistCalls += 1) }),
    },
    { store },
  );
  const input = {
    sourceHash: SOURCE_HASH,
    pageIndex: 9,
    language: 'ur',
    hasTextLayer: false,
    imagePath: IMAGE_PATH,
  };
  const first = await pipeline.recognizePage(input);
  assert.equal(first.cached, false);
  const callsAfterFirst = { paddleCalls, specialistCalls };

  const second = await pipeline.recognizePage(input);
  assert.equal(second.cached, true, 'the second request must be served from the derived store');
  assert.equal(paddleCalls, callsAfterFirst.paddleCalls, 'PP-OCRv5 must not re-run for a cached page');
  assert.equal(specialistCalls, callsAfterFirst.specialistCalls, 'the specialist must not re-run for a cached page');
  assert.equal(second.executionState, first.executionState);
  assert.deepEqual(second.requiredProviders, ['paddleocr', 'urdu-nastaliq-trocr']);
});

test('P17-T005: a page whose mandatory engines did not all complete is never cached as finished', async () => {
  const dataRoot = scratchRoot();
  const store = createOcrStore({ ocrRoot: join(dataRoot, 'ocr') });
  const pipeline = pipelineWith(
    {
      paddleocr: paddleProvider(),
      'urdu-nastaliq-trocr': specialistProvider({ available: false }),
    },
    { store },
  );
  const input = {
    sourceHash: SOURCE_HASH,
    pageIndex: 4,
    language: 'ur',
    hasTextLayer: false,
    imagePath: IMAGE_PATH,
  };
  const first = await pipeline.recognizePage(input);
  assert.equal(first.executionState, URDU_EXECUTION_STATE.PARTIAL_ENGINE_FAILURE);
  const specialistRecord = store.load({
    provider: 'urdu-nastaliq-trocr',
    sourceHash: SOURCE_HASH,
    pageIndex: 4,
    language: 'ur',
  });
  assert.equal(specialistRecord, null, 'a failed engine must not leave a success record behind');
});
