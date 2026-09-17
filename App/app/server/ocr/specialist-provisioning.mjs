/**
 * Urdu Nastaliq specialist provisioning — Phase 17.
 *
 * The specialist is a mandatory Urdu engine, but its weights are NOT bundled,
 * NOT vendored, and NOT committed. Read & Watch provisions them the same way it
 * provisions every other engine: resolve the authoritative upstream revision,
 * stage into a fresh directory, verify every downloaded file, health-check and
 * smoke-test the staged runtime, and only then let the update manager switch the
 * activation pointer.
 *
 * Legal posture (verified 2026-09-17, recorded in the upstream ledger):
 *   - model card: Apache-2.0
 *   - associated project repository: no licence file declared
 *   - training data includes UTRSet-Real, itself CC BY-NC-SA 4.0
 * Local downloading and local execution of the public files is what this module
 * does. Redistribution of the weights is not claimed and does not happen here.
 *
 * Privacy: only public model files are fetched. No document, page image, or
 * recognised text ever leaves the machine.
 */

import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { OCR_PROVIDERS, OcrError, OCR_STATE } from './ocr-contract.mjs';
import { runCommand } from './managed-provider.mjs';
import { createRuntimeBridge } from './runtime-bridge.mjs';
import { createUpstreamResolver } from './upstream-resolver.mjs';
import { sha256OfFile } from './engine-store.mjs';

export const URDU_NASTALIQ_MODEL_ID = 'qandeelasim13/urdu-ocr-trocr-si26';

/** Files without which the specialist runtime cannot load. */
const REQUIRED_MODEL_FILES = Object.freeze([
  'config.json',
  'generation_config.json',
  'model.safetensors',
  'preprocessor_config.json',
  'special_tokens_map.json',
  'tokenizer_config.json',
  'vocab.json',
  'merges.txt',
]);

function modelDirFor({ dataRoot, revision }) {
  return join(dataRoot, 'ocr', 'models', 'urdu-nastaliq-trocr', revision);
}

/**
 * Downloads one public model file, streaming it to disk while hashing.
 * A partial download is removed so a failed attempt can never look complete.
 */
async function downloadFile({ url, target, signal, fetchImpl }) {
  mkdirSync(dirname(target), { recursive: true });
  const partial = `${target}.partial`;
  const response = await fetchImpl(url, { signal, headers: { 'user-agent': 'read-and-watch-ocr' } });
  if (!response.ok || !response.body) {
    throw new OcrError(
      OCR_STATE.UPDATE_FAILED,
      `Model file download failed (HTTP ${response.status}) for ${url}`,
    );
  }
  const hash = createHash('sha256');
  let bytes = 0;
  const source = Readable.fromWeb(response.body);
  source.on('data', (chunk) => {
    hash.update(chunk);
    bytes += chunk.length;
  });
  try {
    await pipeline(source, createWriteStream(partial));
  } catch (error) {
    rmSync(partial, { force: true });
    throw new OcrError(OCR_STATE.UPDATE_FAILED, `Model file download failed: ${error.message}`);
  }
  const digest = hash.digest('hex');
  rmSync(target, { force: true });
  renameSync(partial, target);
  return { path: target, size: statSync(target).size, sha256: digest, downloadedBytes: bytes };
}

/**
 * Builds the provider hooks that give the specialist a real execution path:
 * authoritative revision resolution, isolated runtime + model staging,
 * independent verification, and a synthetic staged smoke test.
 */
export function createSpecialistProvisioningHooks({
  dataRoot,
  driverPath,
  fetchImpl = globalThis.fetch,
  interpreter = 'python',
  onProgress = null,
} = {}) {
  const metadata = OCR_PROVIDERS['urdu-nastaliq-trocr'];
  const resolver = createUpstreamResolver({ fetchImpl });

  function report(stage, detail = {}) {
    if (typeof onProgress === 'function') onProgress({ stage, ...detail });
  }

  async function resolveUpstreamRevision({ signal } = {}) {
    const resolved = await resolver.resolveHuggingFaceModelRevision({
      modelId: URDU_NASTALIQ_MODEL_ID,
      expectedRevision: metadata.modelRevision,
      signal,
    });
    return {
      revision: resolved.pinnedRevisionIsCurrent ? resolved.revision : resolved.revision,
      pinnedRevision: resolved.pinnedRevision,
      pinnedRevisionIsCurrent: resolved.pinnedRevisionIsCurrent,
      provenance: {
        ...resolved.provenance,
        pinnedRevision: resolved.pinnedRevision,
        pinnedRevisionIsCurrent: resolved.pinnedRevisionIsCurrent,
      },
    };
  }

  async function stageRevision({ revision, stagingDir, signal, runtimeForRevision } = {}) {
    if (!revision) throw new OcrError(OCR_STATE.UPDATE_FAILED, 'A revision is required to stage the specialist');

    const { base, pythonBin } = runtimeForRevision(revision);
    const packages = [...(metadata.runtimeRequirements.installPackages ?? [])];
    report('runtime', { revision, base });

    let createdRuntime = false;
    if (!existsSync(pythonBin)) {
      mkdirSync(base, { recursive: true });
      createdRuntime = true;
      const venv = await runCommand(interpreter, ['-m', 'venv', base], { signal });
      if (!venv.ok) {
        throw new OcrError(OCR_STATE.UPDATE_FAILED, `Could not create specialist runtime: ${venv.stderr.slice(-300)}`);
      }
    }
    if (packages.length > 0) {
      const pip = await runCommand(
        pythonBin,
        ['-m', 'pip', 'install', '--no-input', '--disable-pip-version-check', ...packages],
        { signal, timeoutMs: 90 * 60 * 1000 },
      );
      if (!pip.ok) {
        const combined = `${pip.stdout}\n${pip.stderr}`;
        // Windows without long-path support cannot materialise a deep Python
        // package tree under a long data root. That is a platform limit, not a
        // silently ignorable failure, and it must be actionable rather than a
        // raw pip tail. A partially provisioned runtime is removed so it can
        // never masquerade as a working engine.
        if (/Long Path support|too long|MAX_PATH/i.test(combined)) {
          if (createdRuntime) rmSync(base, { recursive: true, force: true });
          throw new OcrError(
            OCR_STATE.UNSUPPORTED_PLATFORM,
            `Specialist runtime staging failed because the staging path exceeds this platform's path limit: ${base}. ` +
              'Enable operating-system long-path support or move the Read & Watch data root to a shorter path, then retry.',
            { runtimeBase: base, createdRuntime },
          );
        }
        if (createdRuntime) rmSync(base, { recursive: true, force: true });
        throw new OcrError(
          OCR_STATE.UPDATE_FAILED,
          `Specialist package installation failed: ${pip.stderr.slice(-400)}`,
          { runtimeBase: base, createdRuntime },
        );
      }
    }

    const modelDir = modelDirFor({ dataRoot, revision });
    const files = metadata.modelFiles ?? [];
    report('model', { revision, modelDir, fileCount: files.length });
    const modelArtifacts = [];
    for (const file of files) {
      const target = join(modelDir, file.path);
      const url = `${metadata.modelSource}/resolve/${encodeURIComponent(revision)}/${file.path}`;
      const downloaded = await downloadFile({ url, target, signal, fetchImpl });
      if (file.size != null && downloaded.size !== file.size) {
        rmSync(target, { force: true });
        throw new OcrError(
          OCR_STATE.UPDATE_FAILED,
          `Specialist model file ${file.path} has size ${downloaded.size}, expected ${file.size}`,
        );
      }
      if (file.upstreamSha256 && downloaded.sha256 !== file.upstreamSha256) {
        rmSync(target, { force: true });
        throw new OcrError(
          OCR_STATE.UPDATE_FAILED,
          `Specialist model file ${file.path} does not match its published upstream hash`,
        );
      }
      modelArtifacts.push({
        path: target,
        size: downloaded.size,
        sha256: downloaded.sha256,
        role: 'model',
        upstreamSha256: file.upstreamSha256 ?? null,
      });
      report('model-file', { path: file.path, size: downloaded.size });
    }

    const runtimeArtifacts = [];
    for (const relative of ['Scripts/python.exe', 'bin/python']) {
      const candidate = join(base, relative);
      if (existsSync(candidate)) {
        runtimeArtifacts.push({
          path: candidate,
          size: statSync(candidate).size,
          sha256: sha256OfFile(candidate),
          role: 'runtime-interpreter',
        });
      }
    }

    return {
      artifacts: [...runtimeArtifacts, ...modelArtifacts],
      modelDir,
      reused: false,
      stagingDir,
    };
  }

  /** A staged revision is only usable with every required model file present. */
  function verifyModelDirectory({ revision }) {
    const dir = modelDirFor({ dataRoot, revision });
    const missing = REQUIRED_MODEL_FILES.filter((name) => !existsSync(join(dir, name)));
    return { ok: missing.length === 0, dir, missing };
  }

  function resolveModelDir({ revision }) {
    return modelDirFor({ dataRoot, revision });
  }

  async function smokeTestStaged({ revision, signal, runtimeForRevision } = {}) {
    const { pythonBin } = runtimeForRevision(revision);
    if (!existsSync(pythonBin)) {
      return { ok: false, error: `Staged specialist runtime missing for ${revision}`, code: OCR_STATE.RUNTIME_UNAVAILABLE };
    }
    const model = verifyModelDirectory({ revision });
    if (!model.ok) {
      return {
        ok: false,
        error: `Staged specialist model is incomplete: ${model.missing.join(', ')}`,
        code: OCR_STATE.MODEL_NOT_INSTALLED,
      };
    }
    const bridge = createRuntimeBridge({
      command: pythonBin,
      args: [driverPath, '--provider', 'urdu-nastaliq-trocr', '--model-dir', model.dir],
      cwd: dirname(pythonBin),
      env: { PYTHONNOUSERSITE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
    try {
      const health = await bridge.request('health', { providerId: 'urdu-nastaliq-trocr' }, { signal, timeoutMs: 180_000 });
      const fixture = await bridge.request(
        'smoke',
        { providerId: 'urdu-nastaliq-trocr', languages: ['ur'], unitType: 'LINE' },
        { signal, timeoutMs: 600_000 },
      );
      return {
        ok: Boolean(health?.ok !== false && fixture?.ok),
        revision,
        fixtureKind: 'synthetic-line',
        health,
        fixture,
        hardware: fixture?.hardware ?? null,
      };
    } catch (error) {
      return { ok: false, error: error.message, code: error.code ?? OCR_STATE.UPDATE_FAILED };
    } finally {
      await bridge.dispose();
    }
  }

  return {
    resolveUpstreamRevision,
    stageRevision,
    verifyModelDirectory,
    resolveModelDir,
    smokeTestStaged,
  };
}
