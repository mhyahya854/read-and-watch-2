/**
 * P17-T002 benchmark corpus, manifest, and privacy tests.
 *
 * Requirement coverage in this file (see docs/project/OCR_BENCHMARK_PROTOCOL.md):
 *   1  valid benchmark manifest
 *   2  invalid/missing source hash rejected
 *   3  duplicate benchmark ID rejected
 *   4  only FINAL truth accepted for formal scoring
 *   17 mixed-language region metadata validates
 *   18 region reading-order ground truth validates
 *   19 line-level Urdu ground truth validates
 *   20 Urdu line parent/region/page relationships validate
 *   21 source and ground-truth hashes bind to the sample
 *   22 private corpus path remains outside Git
 *   24 no private benchmark artifact enters repository hygiene
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  SYNTHETIC_CORPUS_DESCRIPTION,
  SYNTHETIC_CORPUS_ID,
  SYNTHETIC_SAMPLES,
} from './fixtures/ocr-benchmark/synthetic-corpus.mjs';
import {
  BenchmarkProtocolError,
  buildSyntheticCorpus,
  createBenchmarkCorpusStore,
  groundTruthHashForText,
  manifestHash,
  scoreSample,
  validateBenchmarkItem,
  validateManifest,
  verifyManifestIntegrity,
} from '../server/ocr/benchmark/index.mjs';

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repositoryRoot = resolve(appDir, '..');
const scratchDirs = [];

function scratchRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'rw-bench-corpus-'));
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

const FIXED_TIME = '2026-09-17T00:00:00.000Z';

async function syntheticCorpus() {
  const stubRender = async (definition) => ({
    bytes: Buffer.from(`synthetic-image::${definition.benchmarkItemId}`, 'utf8'),
    extension: 'png',
  });
  return buildSyntheticCorpus({
    corpusId: SYNTHETIC_CORPUS_ID,
    description: SYNTHETIC_CORPUS_DESCRIPTION,
    definitions: SYNTHETIC_SAMPLES,
    render: stubRender,
    now: () => FIXED_TIME,
  });
}

function cloneSample(manifest, benchmarkItemId, patch) {
  return {
    ...manifest,
    samples: manifest.samples.map((sample) =>
      sample.benchmarkItemId === benchmarkItemId ? { ...sample, ...patch } : sample,
    ),
  };
}

test('P17-T002 case 1: the synthetic starter manifest validates end to end', async () => {
  const { manifest, rendered } = await syntheticCorpus();
  const validation = validateManifest(manifest);
  assert.deepEqual(validation.problems, [], 'the synthetic manifest must be valid');
  assert.equal(validation.ok, true);
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.samples.length, SYNTHETIC_SAMPLES.length);
  assert.equal(rendered.length, SYNTHETIC_SAMPLES.length);
  assert.equal(manifest.manifestHash, manifestHash({ ...manifest, manifestHash: undefined }));
  assert.deepEqual(verifyManifestIntegrity(manifest).problems, []);

  for (const sample of manifest.samples) {
    assert.ok(sample.sourceHash.length === 64, `${sample.benchmarkItemId} needs a source hash`);
    assert.ok(sample.renderedSampleHash.length === 64, `${sample.benchmarkItemId} needs a rendered hash`);
    assert.match(sample.renderedSampleRef, /^ocr\/benchmark\/corpus\//);
    assert.equal(sample.groundTruth.status, 'FINAL');
    assert.equal(sample.groundTruth.hash, groundTruthHashForText(sample.groundTruth.exactText));
  }
});

test('P17-T002 case 2: a missing or malformed source hash is rejected', async () => {
  const { manifest } = await syntheticCorpus();
  const missing = cloneSample(manifest, 'syn-en-page-0001', { sourceHash: undefined });
  assert.equal(validateManifest(missing).ok, false);
  assert.ok(
    validateManifest(missing).problems.some((problem) => problem.includes('sourceHash')),
    'a missing source hash must be reported',
  );

  const malformed = cloneSample(manifest, 'syn-en-page-0001', { sourceHash: 'not-a-hash' });
  const result = validateManifest(malformed);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => problem.includes('sourceHash')));
});

test('P17-T002 case 3: a duplicate benchmark item id is rejected', async () => {
  const { manifest } = await syntheticCorpus();
  const duplicated = {
    ...manifest,
    samples: [...manifest.samples, manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ur-line-0001')],
  };
  const result = validateManifest(duplicated);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => problem.includes('duplicate benchmarkItemId')));
});

test('P17-T002 case 4: only FINAL ground truth may be scored formally', async () => {
  const { manifest } = await syntheticCorpus();
  const sample = manifest.samples.find((entry) => entry.benchmarkItemId === 'syn-ar-line-0001');

  assert.throws(
    () => scoreSample({ item: { ...sample, groundTruth: { ...sample.groundTruth, status: 'REVIEWED' } }, provider: 'paddleocr', prediction: sample.groundTruth.exactText }),
    (error) => error instanceof BenchmarkProtocolError && error.code === 'GROUND_TRUTH_NOT_FINAL',
  );
  assert.throws(
    () => scoreSample({ item: { ...sample, groundTruth: { ...sample.groundTruth, status: 'DRAFT' } }, provider: 'paddleocr', prediction: sample.groundTruth.exactText }),
    (error) => error.code === 'GROUND_TRUTH_NOT_FINAL',
  );
  // FINAL truth scores normally.
  assert.equal(scoreSample({ item: sample, provider: 'paddleocr', prediction: sample.groundTruth.exactText }).metrics.fullyVocalized.exactMatch, true);

  const store = createBenchmarkCorpusStore({ dataRoot: scratchRoot(), repositoryRoot });
  store.writeGroundTruthDraft({ sampleId: 'syn-ar-line-0001', exactText: 'نص مسودة' });
  assert.throws(
    () => store.readFinalGroundTruth('syn-ar-line-0001'),
    (error) => error instanceof BenchmarkProtocolError && error.code === 'GROUND_TRUTH_NOT_FINAL',
  );
  const final = store.finalizeGroundTruth({ sampleId: 'syn-ar-line-0001', reviewedBy: 'test-run' });
  assert.equal(final.status, 'FINAL');
  assert.equal(final.hash, groundTruthHashForText('نص مسودة'));
  assert.equal(store.readFinalGroundTruth('syn-ar-line-0001').hash, final.hash);
});

test('P17-T002 case 17: mixed-language region metadata validates, broken metadata does not', async () => {
  const { manifest } = await syntheticCorpus();
  const mixed = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-mixed-page-0001');
  assert.equal(mixed.language, 'mixed');
  assert.deepEqual(
    mixed.regions.map((region) => region.language),
    ['ur', 'en'],
  );
  assert.deepEqual(mixed.regions[0].requiredProviders, ['paddleocr', 'urdu-nastaliq-trocr']);
  assert.deepEqual(mixed.regions[1].requiredProviders, ['unlimited-ocr']);
  assert.deepEqual([...mixed.requiredProviders].sort(), ['paddleocr', 'unlimited-ocr', 'urdu-nastaliq-trocr']);

  const brokenUnion = cloneSample(manifest, 'syn-mixed-page-0001', {
    requiredProviders: ['unlimited-ocr'],
  });
  const unionResult = validateBenchmarkItem(brokenUnion.samples.find((sample) => sample.benchmarkItemId === 'syn-mixed-page-0001'));
  assert.equal(unionResult.ok, false);
  assert.ok(unionResult.problems.some((problem) => problem.includes('union of its region providers')));

  const noRegions = cloneSample(manifest, 'syn-mixed-page-0001', { regions: [] });
  const regionResult = validateBenchmarkItem(noRegions.samples.find((sample) => sample.benchmarkItemId === 'syn-mixed-page-0001'));
  assert.equal(regionResult.ok, false);
  assert.ok(regionResult.problems.some((problem) => problem.includes('regions')));
});

test('P17-T002 case 18: region reading-order ground truth is validated', async () => {
  const { manifest } = await syntheticCorpus();
  const page = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ur-page-0001');
  assert.deepEqual(
    page.regions.map((region) => region.readingOrder),
    [0, 1, 2],
  );

  const shuffled = {
    ...page,
    regions: page.regions.map((region) => ({ ...region, readingOrder: region.readingOrder + 1 })),
  };
  const result = validateBenchmarkItem(shuffled);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => problem.includes('reading order')));

  const lineOrder = {
    ...page,
    regions: page.regions.map((region, index) =>
      index === 0 ? { ...region, lines: region.lines.map((line, position) => ({ ...line, index: position * 2 })) } : region,
    ),
  };
  const lineResult = validateBenchmarkItem(lineOrder);
  assert.equal(lineResult.ok, false);
  assert.ok(lineResult.problems.some((problem) => problem.includes('lines reading order')));
});

test('P17-T002 case 19: line-level Urdu ground truth validates and keeps exact text', async () => {
  const { manifest } = await syntheticCorpus();
  const line = manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ur-line-0001');
  assert.equal(line.unitType, 'LINE');
  assert.equal(line.script, 'arabic-nastaliq');
  assert.equal(line.line.exactText, line.groundTruth.exactText);
  assert.ok(line.groundTruth.exactText.includes('\u0679'), 'tteh must survive');
  assert.ok(line.groundTruth.exactText.includes('\u06D2'), 'yeh barree must survive');
  assert.deepEqual(validateBenchmarkItem(line).problems, []);

  const mismatched = validateBenchmarkItem({ ...line, line: { ...line.line, exactText: 'مختلف متن' } });
  assert.equal(mismatched.ok, false);
  assert.ok(mismatched.problems.some((problem) => problem.includes('line.exactText')));
});

test('P17-T002 case 20: Urdu line parent page/region relationships are validated', async () => {
  const { manifest } = await syntheticCorpus();
  const good = validateManifest(manifest);
  assert.equal(good.ok, true);

  const orphanRegion = cloneSample(manifest, 'syn-ur-line-0001', { parentRegionId: 'syn-ur-region-9999' });
  const orphanResult = validateManifest(orphanRegion);
  assert.equal(orphanResult.ok, false);
  assert.ok(orphanResult.problems.some((problem) => problem.includes('syn-ur-region-9999')));

  const orphanPage = cloneSample(manifest, 'syn-ur-line-0002', { parentPageId: 'syn-ur-page-9999' });
  const pageResult = validateManifest(orphanPage);
  assert.equal(pageResult.ok, false);
  assert.ok(pageResult.problems.some((problem) => problem.includes('syn-ur-page-9999')));

  const wrongIndex = cloneSample(manifest, 'syn-ur-line-0002', {
    line: { lineId: 'syn-ur-line-0002', index: 5, box: { x: 40, y: 120, width: 820, height: 72 } },
  });
  const indexResult = validateManifest(wrongIndex);
  assert.equal(indexResult.ok, false);
  assert.ok(indexResult.problems.some((problem) => problem.includes('line index disagrees')));
});

test('P17-T002 case 21: source and ground-truth hashes bind to the sample', async () => {
  const { manifest } = await syntheticCorpus();
  const tampered = cloneSample(manifest, 'syn-ar-line-0001', {
    groundTruth: {
      ...manifest.samples.find((sample) => sample.benchmarkItemId === 'syn-ar-line-0001').groundTruth,
      exactText: 'نص مختلف تماما',
    },
  });
  const integrity = verifyManifestIntegrity(tampered);
  assert.equal(integrity.ok, false);
  assert.ok(
    integrity.problems.some((problem) => problem.includes('groundTruth.hash is not the hash of the stored exact text')),
    'editing the text without re-hashing must be detected',
  );
  assert.ok(integrity.problems.some((problem) => problem.includes('manifestHash')));

  const sample = manifest.samples.find((entry) => entry.benchmarkItemId === 'syn-ar-line-0001');
  const rerecorded = {
    ...sample,
    line: { ...sample.line, exactText: 'نص مختلف تماما' },
    groundTruth: { ...sample.groundTruth, exactText: 'نص مختلف تماما' },
  };
  rerecorded.groundTruth.hash = groundTruthHashForText(rerecorded.groundTruth.exactText);
  assert.deepEqual(validateBenchmarkItem(rerecorded).problems, []);
  const rebound = { ...manifest, samples: manifest.samples.map((entry) => (entry.benchmarkItemId === sample.benchmarkItemId ? rerecorded : entry)) };
  rebound.manifestHash = manifestHash({ ...rebound, manifestHash: undefined });
  assert.deepEqual(verifyManifestIntegrity(rebound).problems, [], 're-hashing restores a consistent, bound record');
});

test('P17-T002 case 22: the private corpus root refuses to live inside the repository', () => {
  assert.throws(
    () => createBenchmarkCorpusStore({ dataRoot: appDir, repositoryRoot }),
    (error) => error instanceof BenchmarkProtocolError && error.code === 'BENCHMARK_INSIDE_REPOSITORY',
  );
  assert.throws(() => createBenchmarkCorpusStore({ dataRoot: repositoryRoot, repositoryRoot }));

  const dataRoot = scratchRoot();
  const store = createBenchmarkCorpusStore({ dataRoot, repositoryRoot });
  assert.equal(resolve(store.root), resolve(dataRoot, 'ocr', 'benchmark'));
  for (const path of [
    store.directories.corpusByLanguage.english,
    store.directories.corpusByLanguage.arabic,
    store.directories.corpusByLanguage.urdu,
    store.directories.corpusByLanguage.mixed,
    store.directories.groundTruth,
    store.directories.manifests,
    store.directories.runsByProvider['unlimited-ocr'],
    store.directories.runsByProvider.paddleocr,
    store.directories.runsByProvider['urdu-nastaliq-specialist'],
    store.directories.runsByProvider.combined,
    store.directories.reports,
    store.directories.temp,
  ]) {
    assert.ok(statSync(path).isDirectory(), `${path} must be a directory`);
  }
  assert.throws(() => store.assertInsideBenchmark(resolve(dataRoot, '..', 'elsewhere')), () => true);
  assert.throws(() => store.recordRenderedSample({ sampleId: '../escape', language: 'ur', bytes: Buffer.from('x') }));
});

test('P17-T002 case 22b: the private sampling workflow registers a lawful source sample', () => {
  const dataRoot = scratchRoot();
  const workDir = join(dataRoot, 'work');
  mkdirSync(workDir, { recursive: true });

  // A lawful source the user owns, plus the page/line image they selected.
  const sourcePath = join(workDir, 'owned-source.pdf');
  writeFileSync(sourcePath, 'owned source document bytes', 'utf8');
  const imagePath = join(workDir, 'owned-source-line-0003.png');
  // PNG signature and IHDR header only: the workflow under test stores and hashes
  // bytes and reads the pixel size from IHDR. It does not decode pixels.
  const image = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(image, 0);
  image.writeUInt32BE(13, 8);
  image.write('IHDR', 12, 'latin1');
  image.writeUInt32BE(820, 16);
  image.writeUInt32BE(72, 20);
  writeFileSync(imagePath, image);
  const textPath = join(workDir, 'owned-source-line-0003.txt');
  const truth = 'یہ اصل ماخذ سے لیا گیا نمونہ ہے۔';
  writeFileSync(textPath, truth, 'utf8');

  const result = spawnSync(
    process.execPath,
    [
      join(appDir, 'scripts', 'import-benchmark-sample.mjs'),
      '--sample-id', 'real-book01-region0001-line0003',
      '--language', 'ur',
      '--unit', 'line',
      '--source', sourcePath,
      '--image', imagePath,
      '--text-file', textPath,
      '--page', 'real-book01-page0042',
      '--region', 'real-book01-region0001',
      '--line-index', '3',
      '--script-features', 'nastaliq,isolated-line,urdu-specific-letters',
      '--layout', 'isolated-line',
    ],
    { encoding: 'utf8', env: { ...process.env, READ_WATCH_DATA_ROOT: dataRoot } },
  );
  assert.equal(result.status, 0, `importer failed: ${result.stderr}`);

  const benchRoot = join(dataRoot, 'ocr', 'benchmark');
  const storedImage = join(benchRoot, 'corpus', 'urdu', 'real-book01-region0001-line0003.png');
  const draftPath = join(benchRoot, 'ground-truth', 'real-book01-region0001-line0003.draft.txt');
  const itemPath = join(benchRoot, 'manifests', 'real-book01-region0001-line0003.item.json');
  for (const path of [storedImage, draftPath, itemPath]) {
    assert.ok(existsSync(path), `${path} must exist under the private benchmark root`);
  }
  assert.equal(readFileSync(draftPath, 'utf8'), truth, 'the draft must carry exactly what the human wrote');
  const item = JSON.parse(readFileSync(itemPath, 'utf8'));
  assert.deepEqual([...item.requiredProviders].sort(), ['paddleocr', 'urdu-nastaliq-trocr']);
  assert.equal(item.groundTruth.status, 'DRAFT');
  assert.equal(item.groundTruth.hash, null, 'draft truth has no hash until it is finalised');
  assert.equal(item.line.index, 3);
  assert.equal(item.line.box.width, 820);
  assert.ok(!resolve(itemPath).startsWith(repositoryRoot), 'nothing may be written into the repository');
});

test('P17-T002 case 24: no private benchmark artifact can enter the repository', () => {
  const fixtureDir = join(appDir, 'tests', 'fixtures', 'ocr-benchmark');
  const entries = readdirSync(fixtureDir, { withFileTypes: true });
  const allowedSuffixes = new Set(['.mjs', '.json', '.md']);
  const allowedSuffixesForbidden = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.ttf', '.otf', '.woff', '.pdf', '.zip']);

  for (const entry of entries) {
    assert.equal(entry.isDirectory(), false, 'the committed benchmark fixture directory holds text definitions only');
    const suffix = extname(entry.name).toLowerCase();
    assert.ok(!allowedSuffixesForbidden.has(suffix), `${entry.name} must not be committed`);
    assert.ok(allowedSuffixes.has(suffix), `${entry.name} must be a small text fixture`);
    const content = readFileSync(join(fixtureDir, entry.name), 'utf8');
    // Absolute developer paths must never appear in a committed fixture. The
    // pattern is deliberately written as a character class so this assertion
    // does not itself embed a literal machine-path marker; the repository
    // hygiene gate remains the authority on private markers.
    assert.ok(
      !/[A-Za-z]:[\\/]+[Uu]sers[\\/]+/.test(content),
      `${entry.name} must not contain a developer machine path`,
    );
    assert.ok(!/^\/(?:home|Users)\//m.test(content), `${entry.name} must not contain a POSIX home path`);
  }

  // A rendered image may only ever be produced into the external data root.
  const dataRoot = scratchRoot();
  const store = createBenchmarkCorpusStore({ dataRoot, repositoryRoot });
  const stored = store.recordRenderedSample({
    sampleId: 'syn-ur-line-0001',
    language: 'ur',
    bytes: Buffer.from('png-bytes', 'utf8'),
  });
  assert.ok(stored.path.startsWith(store.root), 'rendered samples live under the private benchmark root');
  assert.equal(stored.ref, 'ocr/benchmark/corpus/urdu/syn-ur-line-0001.png');
  assert.ok(!stored.path.startsWith(repositoryRoot));
});
