/**
 * Private benchmark corpus store — Phase 17, task P17-T002.
 *
 * Every byte of real benchmark material (lawful source pages, rendered sample
 * images, ground truth, run outputs, reports) lives under
 *
 *   READ_WATCH_DATA_ROOT/ocr/benchmark/...
 *
 * outside Git. This module owns that layout, refuses to create it inside the
 * repository, and implements the sampling workflow: hash the lawful source,
 * render a representative sample, draft the ground truth, validate it, finalise
 * it, lock the sample.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { BenchmarkProtocolError, isSha256, sha256Hex } from './schema.mjs';
import { groundTruthHashForText } from './manifest.mjs';

/** Corpus category folders. One folder per language plus the mixed bucket. */
export const CORPUS_CATEGORIES = Object.freeze(['english', 'arabic', 'urdu', 'mixed']);

/** Run folders, one per mandatory engine plus the combined comparison bucket. */
export const RUN_CATEGORIES = Object.freeze([
  'unlimited-ocr',
  'paddleocr',
  'urdu-nastaliq-specialist',
  'combined',
]);

const SAMPLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/;

export function resolveBenchmarkRoot(dataRoot) {
  if (typeof dataRoot !== 'string' || dataRoot.trim().length === 0) {
    throw new BenchmarkProtocolError('DATA_ROOT_REQUIRED', 'the benchmark needs the external data root');
  }
  return resolve(dataRoot, 'ocr', 'benchmark');
}

function isInside(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot));
}

export function assertPrivateCorpusOutsideRepository({ root, repositoryRoot }) {
  if (!repositoryRoot) return true;
  if (isInside(resolve(repositoryRoot), resolve(root))) {
    throw new BenchmarkProtocolError(
      'BENCHMARK_INSIDE_REPOSITORY',
      'the benchmark corpus, ground truth, and OCR outputs must live outside the Git repository',
      { root: resolve(root), repositoryRoot: resolve(repositoryRoot) },
    );
  }
  return true;
}

export function benchmarkDirectories(root) {
  const corpus = join(root, 'corpus');
  const runs = join(root, 'runs');
  return {
    root,
    corpus,
    corpusByLanguage: Object.fromEntries(
      CORPUS_CATEGORIES.map((category) => [category, join(corpus, category)]),
    ),
    groundTruth: join(root, 'ground-truth'),
    manifests: join(root, 'manifests'),
    runs,
    runsByProvider: Object.fromEntries(RUN_CATEGORIES.map((category) => [category, join(runs, category)])),
    reports: join(root, 'reports'),
    temp: join(root, 'temp'),
    fonts: join(root, 'fonts'),
  };
}

function assertSampleId(sampleId) {
  if (typeof sampleId !== 'string' || !SAMPLE_ID_PATTERN.test(sampleId)) {
    throw new BenchmarkProtocolError('INVALID_SAMPLE_ID', `invalid benchmark sample id: ${String(sampleId)}`);
  }
  return sampleId;
}

/**
 * Creates/opens the private benchmark layout.
 *
 * @param {{dataRoot: string, repositoryRoot?: string|null, create?: boolean}} options
 */
export function createBenchmarkCorpusStore({ dataRoot, repositoryRoot = null, create = true }) {
  const directories = benchmarkDirectories(resolveBenchmarkRoot(dataRoot));
  assertPrivateCorpusOutsideRepository({ root: directories.root, repositoryRoot });
  if (create) {
    for (const path of [
      directories.root,
      directories.corpus,
      ...Object.values(directories.corpusByLanguage),
      directories.groundTruth,
      directories.manifests,
      directories.runs,
      ...Object.values(directories.runsByProvider),
      directories.reports,
      directories.temp,
      directories.fonts,
    ]) {
      mkdirSync(path, { recursive: true });
    }
  }

  function assertInsideBenchmark(path) {
    if (!isInside(directories.root, resolve(path))) {
      throw new BenchmarkProtocolError(
        'PATH_OUTSIDE_BENCHMARK_ROOT',
        `refusing to touch ${path}; the benchmark only writes inside ${directories.root}`,
      );
    }
    return resolve(path);
  }

  function dataRootRelativeRef(path) {
    return relative(resolve(directories.root, '..', '..'), assertInsideBenchmark(path)).replace(/\\/g, '/');
  }

  function corpusDirFor(language) {
    const category =
      language === 'en' ? 'english' : language === 'ar' ? 'arabic' : language === 'ur' ? 'urdu' : 'mixed';
    return directories.corpusByLanguage[category];
  }

  /**
   * Hashes a lawful source document WITHOUT copying it anywhere and WITHOUT
   * recording the machine path anywhere. Sampling never copies a whole book
   * unless the user explicitly asks for that.
   */
  function registerSampleSource({ sourcePath }) {
    if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
      throw new BenchmarkProtocolError('SOURCE_REQUIRED', 'a lawful source document is required');
    }
    const resolved = resolve(sourcePath);
    if (!existsSync(resolved)) {
      throw new BenchmarkProtocolError('SOURCE_NOT_FOUND', `source document not found: ${resolved}`);
    }
    const bytes = readFileSync(resolved);
    return { sourceHash: sha256Hex(bytes), byteLength: bytes.length };
  }

  /** Writes ONE rendered benchmark sample image into the private corpus. */
  function recordRenderedSample({ sampleId, language, bytes, extension = 'png' }) {
    assertSampleId(sampleId);
    const suffix = String(extension).replace(/^\./, '');
    if (!/^[a-z0-9]{2,5}$/i.test(suffix)) {
      throw new BenchmarkProtocolError('INVALID_EXTENSION', `invalid sample extension: ${extension}`);
    }
    const path = assertInsideBenchmark(join(corpusDirFor(language), `${sampleId}.${suffix}`));
    writeFileSync(path, bytes);
    return { path, hash: sha256Hex(bytes), ref: dataRootRelativeRef(path), byteLength: bytes.length };
  }

  function groundTruthDraftPath(sampleId) {
    return assertInsideBenchmark(join(directories.groundTruth, `${assertSampleId(sampleId)}.draft.txt`));
  }

  function groundTruthFinalPath(sampleId) {
    return assertInsideBenchmark(join(directories.groundTruth, `${assertSampleId(sampleId)}.final.json`));
  }

  /** Creates the EDITABLE draft a human will correct against the image. */
  function writeGroundTruthDraft({ sampleId, exactText }) {
    if (typeof exactText !== 'string' || exactText.length === 0) {
      throw new BenchmarkProtocolError('GROUND_TRUTH_TEXT_REQUIRED', 'draft ground truth must not be empty');
    }
    const path = groundTruthDraftPath(sampleId);
    writeFileSync(path, exactText, 'utf8');
    return { path, revision: 1, status: 'DRAFT', hash: null, exactText };
  }

  function readGroundTruthDraft(sampleId) {
    return readFileSync(groundTruthDraftPath(sampleId), 'utf8');
  }

  /**
   * Finalises a reviewed draft. Only FINAL ground truth may be scored formally.
   */
  function finalizeGroundTruth({ sampleId, exactText = null, reviewedBy = null, revision = 1 }) {
    const text = exactText ?? readGroundTruthDraft(sampleId);
    const hash = groundTruthHashForText(text);
    const record = {
      sampleId: assertSampleId(sampleId),
      revision,
      status: 'FINAL',
      exactText: text,
      hash,
      reviewedBy,
      finalizedAt: new Date().toISOString(),
    };
    writeFileSync(groundTruthFinalPath(sampleId), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return record;
  }

  function readFinalGroundTruth(sampleId) {
    const path = groundTruthFinalPath(sampleId);
    if (!existsSync(path)) {
      throw new BenchmarkProtocolError(
        'GROUND_TRUTH_NOT_FINAL',
        `no FINAL ground truth exists for ${sampleId}; formal scoring is prohibited`,
      );
    }
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  /** Locks a sample: source hash, rendered hash, and truth hash frozen together. */
  function lockSample({ sampleId, sourceHash, renderedSampleHash, groundTruthHash }) {
    assertSampleId(sampleId);
    for (const [label, hash] of Object.entries({ sourceHash, renderedSampleHash, groundTruthHash })) {
      if (!isSha256(hash)) {
        throw new BenchmarkProtocolError('HASH_REQUIRED', `${label} must be a sha256 before a sample is locked`);
      }
    }
    const path = assertInsideBenchmark(join(directories.groundTruth, `${sampleId}.lock.json`));
    const record = {
      sampleId,
      sourceHash,
      renderedSampleHash,
      groundTruthHash,
      lockedAt: new Date().toISOString(),
    };
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return { path, ...record };
  }

  function writeManifest(manifest) {
    const path = assertInsideBenchmark(join(directories.manifests, `${manifest.corpusId}.manifest.json`));
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { path, ref: dataRootRelativeRef(path), manifestHash: manifest.manifestHash ?? null };
  }

  /** Sanitized, path-free description of the layout for reports and docs. */
  function describeLayout() {
    return {
      root: 'READ_WATCH_DATA_ROOT/ocr/benchmark',
      directories: {
        corpus: 'corpus/{english,arabic,urdu,mixed}',
        groundTruth: 'ground-truth/',
        manifests: 'manifests/',
        runs: 'runs/{unlimited-ocr,paddleocr,urdu-nastaliq-specialist,combined}',
        reports: 'reports/',
        temp: 'temp/',
        fonts: 'fonts/',
      },
    };
  }

  return {
    root: directories.root,
    directories,
    layout: describeLayout,
    assertInsideBenchmark,
    dataRootRelativeRef,
    corpusDirFor,
    registerSampleSource,
    recordRenderedSample,
    writeGroundTruthDraft,
    readGroundTruthDraft,
    finalizeGroundTruth,
    readFinalGroundTruth,
    lockSample,
    writeManifest,
  };
}
