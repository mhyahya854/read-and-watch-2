/**
 * Benchmark manifest I/O — Phase 17, task P17-T002.
 *
 * The manifest is plain JSON on disk (inside the private benchmark root, never
 * inside Git). It carries a version, a corpus id, the samples, and a content
 * hash. Ground-truth hashes are computed from the exact stored Unicode text, so
 * a benchmark run can prove which revision of which truth it was scored against.
 */

import { readFileSync } from 'node:fs';

import {
  BENCHMARK_MANIFEST_VERSION,
  BenchmarkProtocolError,
  isSha256,
  manifestHash,
  sha256Hex,
  validateManifest,
} from './schema.mjs';

/** Ground-truth hash: the sha256 of the exact stored Unicode text. */
export function groundTruthHashForText(exactText) {
  if (typeof exactText !== 'string' || exactText.length === 0) {
    throw new BenchmarkProtocolError('GROUND_TRUTH_TEXT_REQUIRED', 'ground truth text must be a non-empty string');
  }
  return sha256Hex(exactText);
}

export function createManifest({ corpusId, description = '', samples, createdAt = new Date().toISOString() }) {
  const manifest = {
    manifestVersion: BENCHMARK_MANIFEST_VERSION,
    corpusId,
    description,
    createdAt,
    samples: samples.map((sample) => ({
      ...sample,
      groundTruth: sample.groundTruth
        ? {
            ...sample.groundTruth,
            hash:
              sample.groundTruth.status === 'DRAFT' && sample.groundTruth.hash === undefined
                ? null
                : (sample.groundTruth.hash ?? groundTruthHashForText(sample.groundTruth.exactText)),
          }
        : sample.groundTruth,
    })),
  };
  manifest.manifestHash = manifestHash(manifest);
  const validation = validateManifest(manifest);
  if (!validation.ok) {
    throw new BenchmarkProtocolError('INVALID_MANIFEST', validation.problems.join('; '), {
      problems: validation.problems,
    });
  }
  return manifest;
}

export function loadManifestFromFile(path) {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

/**
 * Full integrity check: schema, manifest hash, and per-sample binding of the
 * ground-truth hash to the exact stored text.
 */
export function verifyManifestIntegrity(manifest) {
  const validation = validateManifest(manifest);
  const problems = [...validation.problems];
  if (manifest?.manifestHash !== undefined) {
    const { manifestHash: declared, ...content } = manifest;
    if (declared !== manifestHash(content)) problems.push('manifestHash does not match the manifest content');
  }
  for (const sample of manifest?.samples ?? []) {
    const groundTruth = sample?.groundTruth;
    if (!groundTruth || groundTruth.status === 'DRAFT') continue;
    if (!isSha256(groundTruth.hash)) continue;
    if (groundTruth.hash !== sha256Hex(groundTruth.exactText)) {
      problems.push(`${sample.benchmarkItemId}: groundTruth.hash is not the hash of the stored exact text`);
    }
  }
  return { ok: problems.length === 0, problems };
}
