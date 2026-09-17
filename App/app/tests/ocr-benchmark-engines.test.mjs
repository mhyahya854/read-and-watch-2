/**
 * P17-T002 mandatory-provider, multi-engine Urdu, and provenance tests.
 *
 * Requirement coverage in this file:
 *   23 benchmark output provenance validates
 *   25 synthetic corpus works end to end through the scoring harness
 *   26 English sample requires Unlimited-OCR
 *   27 Arabic sample requires PP-OCRv5
 *   28 formal Urdu sample requires PP-OCRv5
 *   29 formal Urdu sample ALSO requires the Nastaliq specialist
 *   30 Urdu benchmark rejects accidental single-provider completion
 *   31 one failed mandatory Urdu provider yields PARTIAL_ENGINE_FAILURE
 *   32 the available provider result is preserved when the other fails
 *   33 no alternate provider is invoked as a fallback
 *   34 provider result records stay independent
 *   35 disagreement does not automatically pick a winner
 *   36 ground truth, not provider agreement, determines correctness
 *   37 the Urdu specialist result supports line-level sample identity
 *   38 requiredProviders schema contains no fallback semantics
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  SYNTHETIC_CORPUS_DESCRIPTION,
  SYNTHETIC_CORPUS_ID,
  SYNTHETIC_SAMPLES,
} from './fixtures/ocr-benchmark/synthetic-corpus.mjs';
import { OCR_PROVIDERS, OCR_REQUIRED_PROVIDERS } from '../server/ocr/ocr-contract.mjs';
import {
  BenchmarkProtocolError,
  buildSyntheticCorpus,
  compareProviders,
  createBenchmarkCorpusStore,
  createGroupRunRecord,
  createProviderRunRecord,
  evaluateRunState,
  findForbiddenSemantics,
  loadManifestFromFile,
  mandatoryProvidersForLanguage,
  scoreSample,
  validateBenchmarkItem,
  validateGroupRunRecord,
  validateManifest,
  validateRunRecord,
  verifyManifestIntegrity,
} from '../server/ocr/benchmark/index.mjs';

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repositoryRoot = resolve(appDir, '..');
const scratchDirs = [];

function scratchRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'rw-bench-engines-'));
  scratchDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of scratchDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

async function syntheticCorpus() {
  return buildSyntheticCorpus({
    corpusId: SYNTHETIC_CORPUS_ID,
    description: SYNTHETIC_CORPUS_DESCRIPTION,
    definitions: SYNTHETIC_SAMPLES,
    render: async (definition) => ({ bytes: Buffer.from(`synthetic-image::${definition.benchmarkItemId}`, 'utf8') }),
    now: () => '2026-09-17T00:00:00.000Z',
  });
}

function runRecord(manifest, sample, provider, predictionText) {
  return createProviderRunRecord({
    runId: 'run-2026-09-17T00:00:00.000Z',
    benchmarkManifestHash: manifest.manifestHash,
    item: sample,
    provider,
    engineRevision: 'rev-1',
    modelRevision: 'model-1',
    runtime: { name: 'stub-runtime', python: '3.12', packages: {} },
    hardware: { platform: 'test-host', accelerator: 'cpu' },
    settings: { language: sample.language },
    predictionText,
  });
}

function groupRecord({ manifest, sample, results, disagreements = [] }) {
  return createGroupRunRecord({
    runId: 'run-2026-09-17T00:00:00.000Z',
    benchmarkManifestHash: manifest.manifestHash,
    item: sample,
    providerResults: results,
    disagreements,
    manifest,
  });
}

const okResult = (provider, text) => ({ provider, ok: true, predictionText: text });
const failedResult = (provider, code = 'RUNTIME_UNAVAILABLE') => ({
  provider,
  ok: false,
  status: code,
  error: { code, message: `${provider} could not run on this host` },
});

test('P17-T002 case 23: benchmark output provenance is required and validated', async () => {
  const { manifest } = await syntheticCorpus();
  const sample = manifest.samples.find((entry) => entry.benchmarkItemId === 'syn-en-page-0001');
  const record = runRecord(manifest, sample, 'unlimited-ocr', sample.groundTruth.exactText);

  assert.deepEqual(validateRunRecord(record).problems, []);
  assert.equal(record.sampleId, 'syn-en-page-0001');
  assert.equal(record.benchmarkManifestHash, manifest.manifestHash);
  assert.equal(record.sourceHash, sample.sourceHash);
  assert.equal(record.renderedSampleHash, sample.renderedSampleHash);
  assert.equal(record.groundTruthHash, sample.groundTruth.hash);
  assert.equal(record.engineRevision, 'rev-1');
  assert.equal(record.modelRevision, 'model-1');
  assert.equal(typeof record.predictionHash, 'string');
  assert.equal(record.predictionHash.length, 64);

  for (const field of ['benchmarkManifestHash', 'engineRevision', 'modelRevision', 'runtime', 'hardware', 'settings', 'groundTruthHash']) {
    const broken = { ...record, [field]: field === 'runtime' || field === 'hardware' || field === 'settings' ? null : undefined };
    assert.equal(validateRunRecord(broken).ok, false, `${field} must be required`);
  }
  const fabricated = { ...record, status: 'UNSUPPORTED_HARDWARE', predictionText: 'invented text' };
  assert.equal(validateRunRecord(fabricated).ok, false, 'a failed run must not carry fabricated text');
});

test('P17-T002 case 25: the synthetic corpus runs end to end through the scoring harness', async () => {
  const { manifest } = await syntheticCorpus();
  const store = createBenchmarkCorpusStore({ dataRoot: scratchRoot(), repositoryRoot });
  const written = store.writeManifest(manifest);
  const roundTripped = loadManifestFromFile(written.path);
  assert.deepEqual(verifyManifestIntegrity(roundTripped).problems, [], 'the written manifest must round-trip intact');

  const english = roundTripped.samples.find((sample) => sample.benchmarkItemId === 'syn-en-page-0001');
  const arabic = roundTripped.samples.find((sample) => sample.benchmarkItemId === 'syn-ar-line-0001');
  const urdu = roundTripped.samples.find((sample) => sample.benchmarkItemId === 'syn-ur-line-0001');
  const mixed = roundTripped.samples.find((sample) => sample.benchmarkItemId === 'syn-mixed-page-0001');

  const englishScore = scoreSample({ item: english, provider: 'unlimited-ocr', prediction: english.groundTruth.exactText });
  assert.equal(englishScore.metrics.exactMatch, true);
  assert.equal(englishScore.metrics.cer, 0);

  const arabicScore = scoreSample({ item: arabic, provider: 'paddleocr', prediction: arabic.groundTruth.exactText });
  assert.equal(arabicScore.metrics.fullyVocalized.exactMatch, true);
  assert.equal(arabicScore.metrics.tashkeel.exactMatch, true);

  const urduScore = scoreSample({ item: urdu, provider: 'urdu-nastaliq-trocr', prediction: urdu.groundTruth.exactText });
  assert.equal(urduScore.metrics.exactMatch, true);
  assert.equal(urduScore.groundTruthStatus, 'FINAL');

  const englishGroup = groupRecord({
    manifest: roundTripped,
    sample: english,
    results: [okResult('unlimited-ocr', english.groundTruth.exactText)],
  });
  assert.equal(englishGroup.overallExecutionState, 'COMPLETE');
  assert.equal(englishGroup.transcriptionState, 'MACHINE_TRANSCRIBED');

  const urduGroup = groupRecord({
    manifest: roundTripped,
    sample: urdu,
    results: [
      okResult('paddleocr', urdu.groundTruth.exactText),
      okResult('urdu-nastaliq-trocr', urdu.groundTruth.exactText),
    ],
  });
  assert.equal(urduGroup.overallExecutionState, 'COMPLETE');
  assert.deepEqual([...urduGroup.completedProviders].sort(), ['paddleocr', 'urdu-nastaliq-trocr']);

  const mixedGroup = groupRecord({
    manifest: roundTripped,
    sample: mixed,
    results: [
      okResult('unlimited-ocr', mixed.groundTruth.exactText),
      okResult('paddleocr', mixed.regions[0].lines[0].exactText),
      {
        provider: 'urdu-nastaliq-trocr',
        ok: true,
        predictionText: mixed.regions[0].lines[0].exactText,
        unitType: 'LINE',
        lineAssociation: {
          pageId: 'syn-mixed-page-0001',
          regionId: 'syn-mixed-region-0001',
          lineId: 'syn-mixed-line-0001',
          lineIndex: 0,
        },
      },
    ],
  });
  assert.equal(mixedGroup.overallExecutionState, 'COMPLETE');
  assert.equal(mixedGroup.requiredProviders.length, 3);
});

test('P17-T002 cases 26-29: mandatory providers per language are enforced', async () => {
  const { manifest } = await syntheticCorpus();
  const english = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-en-page-0001');
  const arabic = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ar-line-0001');
  const urdu = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ur-line-0001');

  assert.deepEqual(mandatoryProvidersForLanguage('en'), ['unlimited-ocr']);
  assert.deepEqual(mandatoryProvidersForLanguage('ar'), ['paddleocr']);
  assert.deepEqual(mandatoryProvidersForLanguage('ur'), ['paddleocr', 'urdu-nastaliq-trocr']);
  assert.deepEqual([...OCR_REQUIRED_PROVIDERS.ur], ['paddleocr', 'urdu-nastaliq-trocr']);

  // Case 26: English requires Unlimited-OCR and nothing else.
  const englishWrong = validateBenchmarkItem({ ...english, requiredProviders: ['paddleocr'] });
  assert.equal(englishWrong.ok, false);
  assert.ok(englishWrong.problems.some((problem) => problem.includes('formal en sample must require exactly unlimited-ocr')));

  // Case 27: Arabic requires PP-OCRv5.
  const arabicWrong = validateBenchmarkItem({ ...arabic, requiredProviders: ['unlimited-ocr'] });
  assert.equal(arabicWrong.ok, false);
  assert.ok(arabicWrong.problems.some((problem) => problem.includes('not an engine for language "ar"')));

  // Case 28: a formal Urdu sample that omits PP-OCRv5 is rejected.
  const urduNoPaddle = validateBenchmarkItem({ ...urdu, requiredProviders: ['urdu-nastaliq-trocr'] });
  assert.equal(urduNoPaddle.ok, false);
  assert.ok(urduNoPaddle.problems.some((problem) => problem.includes('must require exactly paddleocr + urdu-nastaliq-trocr')));

  // Case 29: a formal Urdu sample that omits the Nastaliq specialist is rejected.
  const urduNoSpecialist = validateBenchmarkItem({ ...urdu, requiredProviders: ['paddleocr'] });
  assert.equal(urduNoSpecialist.ok, false);
  assert.ok(urduNoSpecialist.problems.some((problem) => problem.includes('paddleocr + urdu-nastaliq-trocr')));

  // The committed Urdu acceptance samples declare both engines.
  for (const sample of manifest.samples.filter((entry) => entry.language === 'ur' && entry.purpose === 'formal-acceptance')) {
    assert.deepEqual([...sample.requiredProviders].sort(), ['paddleocr', 'urdu-nastaliq-trocr']);
  }
  assert.equal(validateManifest(manifest).ok, true);
});

test('P17-T002 cases 30-32: single-engine Urdu completion is refused and partial output is preserved', async () => {
  const { manifest } = await syntheticCorpus();
  const urdu = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ur-line-0001');
  const paddleText = urdu.groundTruth.exactText;

  // Case 30: only one mandatory engine produced output.
  const single = groupRecord({ manifest, sample: urdu, results: [okResult('paddleocr', paddleText)] });
  assert.equal(single.overallExecutionState, 'PARTIAL_ENGINE_FAILURE');
  assert.notEqual(single.overallExecutionState, 'COMPLETE');
  assert.deepEqual(single.completedProviders, ['paddleocr']);
  assert.deepEqual(single.failedProviders, []);
  assert.deepEqual(single.missingProviders, ['urdu-nastaliq-trocr']);

  // A hand-built record that claims COMPLETE is rejected.
  const dishonest = { ...single, overallExecutionState: 'COMPLETE' };
  const dishonestValidation = validateGroupRunRecord(dishonest);
  assert.equal(dishonestValidation.ok, false);
  assert.ok(dishonestValidation.problems.some((problem) => problem.includes('COMPLETE is prohibited')));

  // Case 31: one mandatory engine failed.
  const partial = groupRecord({
    manifest,
    sample: urdu,
    results: [okResult('paddleocr', paddleText), failedResult('urdu-nastaliq-trocr')],
  });
  assert.equal(partial.overallExecutionState, 'PARTIAL_ENGINE_FAILURE');
  assert.deepEqual(partial.failedProviders, ['urdu-nastaliq-trocr']);
  assert.equal(partial.reviewState, 'NOT_REQUIRED');

  // Case 32: the successful engine's raw output is preserved.
  const preserved = partial.providerResults.find((result) => result.provider === 'paddleocr');
  assert.equal(preserved.predictionText, paddleText);
  assert.equal(preserved.ok, true);
  assert.equal(typeof preserved.predictionHash, 'string');
  const failure = partial.providerResults.find((result) => result.provider === 'urdu-nastaliq-trocr');
  assert.equal(failure.ok, false);
  assert.equal(failure.predictionText, null, 'a failed engine must not carry text');
  assert.equal(typeof failure.error.message, 'string');
  assert.equal(partial.transcriptionState, 'MACHINE_TRANSCRIBED', 'partial machine output is still declared honestly');
});

test('P17-T002 case 33: no alternate provider can be substituted for a mandatory engine', async () => {
  const { manifest } = await syntheticCorpus();
  const urdu = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ur-line-0001');

  assert.throws(
    () =>
      groupRecord({
        manifest,
        sample: urdu,
        results: [okResult('paddleocr', urdu.groundTruth.exactText), okResult('unlimited-ocr', urdu.groundTruth.exactText)],
      }),
    (error) => error instanceof BenchmarkProtocolError && error.code === 'PROVIDER_NOT_REQUIRED',
  );

  const state = evaluateRunState({
    requiredProviders: ['paddleocr', 'urdu-nastaliq-trocr'],
    providerResults: [okResult('paddleocr', 'x'), okResult('unlimited-ocr', 'x')],
  });
  assert.equal(state.executionState, 'PARTIAL_ENGINE_FAILURE');
  assert.deepEqual(state.unexpectedProviders, ['unlimited-ocr']);
  assert.ok(state.reason.includes('outside the mandatory set'));
});

test('P17-T002 case 34: provider result records stay independent', async () => {
  const { manifest } = await syntheticCorpus();
  const urdu = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ur-line-0001');
  const specialistText = 'یہ ایک آزمائشی سطر ہے';
  const group = groupRecord({
    manifest,
    sample: urdu,
    results: [
      okResult('paddleocr', urdu.groundTruth.exactText),
      okResult('urdu-nastaliq-trocr', specialistText),
    ],
  });

  assert.equal(group.providerResults.length, 2);
  const [paddle, specialist] = group.providerResults;
  assert.equal(paddle.provider, 'paddleocr');
  assert.equal(specialist.provider, 'urdu-nastaliq-trocr');
  assert.notEqual(paddle.predictionText, specialist.predictionText);
  assert.notEqual(paddle.predictionHash, specialist.predictionHash);
  assert.equal(paddle.unitType, 'LINE');
  assert.equal(specialist.unitType, 'LINE');
  for (const forbidden of ['bestText', 'combinedText', 'fallbackProvider', 'primaryProvider', 'winner']) {
    assert.equal(Object.hasOwn(group, forbidden), false, `${forbidden} must not exist at benchmark-foundation level`);
  }
});

test('P17-T002 cases 35-36: disagreement never picks a winner, ground truth decides correctness', async () => {
  const { manifest } = await syntheticCorpus();
  const urdu = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ur-line-0001');
  const truth = urdu.groundTruth.exactText;
  const specialistText = 'یہ ایک آزمائشی سطر ہی';

  const comparison = compareProviders({
    item: urdu,
    providerResults: [
      { provider: 'paddleocr', text: truth },
      { provider: 'urdu-nastaliq-trocr', text: specialistText },
    ],
  });
  assert.equal(comparison.correctnessAuthority, 'ground-truth');
  assert.equal(comparison.materialDisagreement, true);
  assert.equal(comparison.enginesAgreeWithEachOther, false);
  assert.ok(comparison.pairwiseDisagreement[0].disagreementCount > 0);
  assert.ok(comparison.pairwiseDisagreement[0].locations.length > 0);
  assert.deepEqual(findForbiddenSemantics(comparison), [], 'no winner/bestText semantics may appear');
  const specialised = comparison.providerScores.find((entry) => entry.provider === 'urdu-nastaliq-trocr');
  assert.equal(specialised.score.metrics.exactMatch, false);

  const group = groupRecord({
    manifest,
    sample: urdu,
    results: [okResult('paddleocr', truth), okResult('urdu-nastaliq-trocr', specialistText)],
    disagreements: comparison.pairwiseDisagreement,
  });
  assert.equal(group.overallExecutionState, 'REVIEW_REQUIRED');
  assert.equal(group.reviewState, 'REVIEW_REQUIRED');

  // Case 36: both engines can agree and both still be wrong. Agreement is not
  // correctness, and the group record does not claim verification.
  const wrongText = 'مکمل غلط متن';
  const agreeing = compareProviders({
    item: urdu,
    providerResults: [
      { provider: 'paddleocr', text: wrongText },
      { provider: 'urdu-nastaliq-trocr', text: wrongText },
    ],
  });
  assert.equal(agreeing.enginesAgreeWithEachOther, true);
  assert.equal(agreeing.materialDisagreement, false);
  for (const entry of agreeing.providerScores) {
    assert.equal(entry.score.metrics.exactMatch, false, 'ground truth, not agreement, decides correctness');
    assert.ok(entry.score.metrics.cer > 0);
  }
  const agreeingGroup = groupRecord({
    manifest,
    sample: urdu,
    results: [okResult('paddleocr', wrongText), okResult('urdu-nastaliq-trocr', wrongText)],
  });
  assert.equal(agreeingGroup.overallExecutionState, 'COMPLETE', 'execution completed; accuracy is measured against truth');
  assert.equal(agreeingGroup.correctnessAuthority, 'ground-truth');
  assert.notEqual(agreeingGroup.transcriptionState, 'HUMAN_VERIFIED');
});

test('P17-T002 case 37: Nastaliq specialist results carry line-level sample identity', async () => {
  const { manifest } = await syntheticCorpus();
  const line = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ur-line-0001');
  const page = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ur-page-0001');

  assert.equal(OCR_PROVIDERS['urdu-nastaliq-trocr'].documentedInputGranularity, 'line');
  assert.deepEqual([...OCR_PROVIDERS['urdu-nastaliq-trocr'].supportedUnitTypes], ['LINE']);
  // The specialist gained a real execution path in the P17-T005 run, so the
  // integration status is INTEGRATED. Its LINE-only contract is unchanged.
  assert.equal(OCR_PROVIDERS['urdu-nastaliq-trocr'].integrationStatus, 'INTEGRATED');

  const lineGroup = groupRecord({
    manifest,
    sample: line,
    results: [okResult('paddleocr', line.groundTruth.exactText), okResult('urdu-nastaliq-trocr', line.groundTruth.exactText)],
  });
  const specialistEntry = lineGroup.providerResults.find((entry) => entry.provider === 'urdu-nastaliq-trocr');
  assert.equal(specialistEntry.unitType, 'LINE');

  // A page-level specialist result without a line association is refused.
  assert.throws(
    () =>
      groupRecord({
        manifest,
        sample: page,
        results: [okResult('paddleocr', page.groundTruth.exactText), okResult('urdu-nastaliq-trocr', page.groundTruth.exactText)],
      }),
    (error) => error instanceof BenchmarkProtocolError && error.code === 'LINE_ASSOCIATION_REQUIRED',
  );

  // The same specialist output is accepted when it names the line it came from.
  const pageGroup = groupRecord({
    manifest,
    sample: page,
    results: [
      okResult('paddleocr', page.groundTruth.exactText),
      {
        provider: 'urdu-nastaliq-trocr',
        ok: true,
        predictionText: 'یہ ایک آزمائشی سطر ہے، جس میں ٹ، ڈ، ڑ، ں، ھ اور ے شامل ہیں۔',
        unitType: 'LINE',
        lineAssociation: { pageId: 'syn-ur-page-0001', regionId: 'syn-ur-region-0001', lineId: 'syn-ur-line-0001', lineIndex: 0 },
      },
    ],
  });
  const associated = pageGroup.providerResults.find((entry) => entry.provider === 'urdu-nastaliq-trocr');
  assert.equal(associated.unitType, 'LINE');
  assert.equal(associated.lineAssociation.lineId, 'syn-ur-line-0001');
  assert.equal(associated.lineAssociation.pageId, 'syn-ur-page-0001');
});

test('P17-T002 case 38: requiredProviders and run records contain no fallback semantics', async () => {
  const { manifest } = await syntheticCorpus();
  const urdu = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ur-line-0001');
  const group = groupRecord({
    manifest,
    sample: urdu,
    results: [okResult('paddleocr', urdu.groundTruth.exactText), okResult('urdu-nastaliq-trocr', urdu.groundTruth.exactText)],
  });

  assert.deepEqual(findForbiddenSemantics(manifest), []);
  assert.deepEqual(findForbiddenSemantics(group), []);
  assert.ok(Array.isArray(urdu.requiredProviders));
  assert.equal(Object.hasOwn(urdu, 'fallbackProvider'), false);

  const contaminated = {
    ...urdu,
    fallbackProvider: 'tesseract',
    providers: { primary: 'paddleocr', backup: 'unlimited-ocr' },
  };
  const detected = findForbiddenSemantics(contaminated);
  assert.ok(detected.some((path) => path.includes('fallbackProvider')));
  assert.ok(detected.some((path) => path.includes('backup')));
  assert.equal(validateBenchmarkItem(contaminated).ok, false);
});
