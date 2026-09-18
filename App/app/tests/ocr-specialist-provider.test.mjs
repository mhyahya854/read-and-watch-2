import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createEngineStore } from '../server/ocr/engine-store.mjs';
import { OCR_PROVIDERS, OCR_REQUIRED_PROVIDERS, OCR_STATE } from '../server/ocr/ocr-contract.mjs';
import { createOcrService } from '../server/ocr/index.mjs';
import { createUrduNastaliqProvider, URDU_NASTALIQ_ID } from '../server/ocr/provider-urdu-nastaliq.mjs';
import { URDU_NASTALIQ_MODEL_ID } from '../server/ocr/specialist-provisioning.mjs';
import { runCommand } from '../server/ocr/managed-provider.mjs';

const moduleDir = resolve(fileURLToPath(import.meta.url), '..');
const APP_ROOT = resolve(moduleDir, '..');
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..');
const scratchDirs = [];

function scratchRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'rw-ocr-specialist-'));
  scratchDirs.push(dir);
  // Keep the short runtime-root fallback inside the scratch tree during tests.
  process.env.READ_WATCH_OCR_RUNTIME_ROOT = join(dir, 'runtimes');
  return dir;
}

after(() => {
  delete process.env.READ_WATCH_OCR_RUNTIME_ROOT;
  for (const dir of scratchDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }
});

/**
 * A specialist provider whose provisioning hooks are simulated, so the real
 * staging/verification/activation/rollback sequence can be exercised without
 * downloading 1.3 GB of weights.
 */
function makeSpecialist(dataRoot, { revisions = {}, failAt = null, bridgeFactory } = {}) {
  const engineStore = createEngineStore({ ocrRoot: join(dataRoot, 'ocr') });
  engineStore.ensureLayout();
  const provider = createUrduNastaliqProvider({
    engineStore,
    dataRoot,
    driverPath: join(APP_ROOT, 'server', 'ocr', 'driver', 'engine_driver.py'),
    bridgeFactory,
    hooks: {
      async resolveUpstreamRevision() {
        return {
          revision: revisions.latest,
          provenance: {
            authority: 'official-upstream',
            host: 'huggingface.co',
            repository: URDU_NASTALIQ_MODEL_ID,
            revision: revisions.latest,
          },
        };
      },
      async stageRevision({ revision, stagingDir, runtimeForRevision }) {
        if (failAt === 'stage') throw new Error('simulated specialist download failure');
        const { base, pythonBin } = runtimeForRevision(revision);
        mkdirSync(join(base, 'Scripts'), { recursive: true });
        if (!readdirSync(join(base, 'Scripts')).includes('python.exe')) {
          writeFileSync(pythonBin, 'fake interpreter', 'utf8');
        }
        const modelDir = join(dataRoot, 'ocr', 'models', URDU_NASTALIQ_ID, revision);
        mkdirSync(modelDir, { recursive: true });
        const marker = join(modelDir, 'model.safetensors');
        writeFileSync(marker, `weights:${revision}`, 'utf8');
        const bytes = readFileSync(marker);
        return {
          artifacts: [
            {
              path: marker,
              size: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'),
              role: 'model',
            },
          ],
          modelDir,
          stagingDir,
        };
      },
      async smokeTestStaged() {
        if (failAt === 'smoke') return { ok: false, error: 'simulated specialist smoke failure' };
        return { ok: true, fixture: 'synthetic-line', hardware: { cuda: false } };
      },
    },
  });
  return { provider, engineStore };
}

test('P17-T005: the specialist is registered under its Read & Watch provider id', () => {
  const dataRoot = scratchRoot();
  const service = createOcrService({ dataRoot });
  assert.ok(service.providers[URDU_NASTALIQ_ID], 'urdu-nastaliq-trocr must be a registered provider');
  assert.equal(URDU_NASTALIQ_ID, 'urdu-nastaliq-trocr');
  const listed = service.listProviders().find((provider) => provider.id === URDU_NASTALIQ_ID);
  assert.ok(listed, 'the specialist must appear in the provider inventory');
  assert.deepEqual(listed.languages, ['ur']);
  assert.deepEqual(listed.supportedUnitTypes, ['LINE']);
});

test('P17-T005: the specialist upstream identity and pinned revision are preserved', () => {
  const specialist = OCR_PROVIDERS[URDU_NASTALIQ_ID];
  assert.equal(specialist.officialUpstream, URDU_NASTALIQ_MODEL_ID);
  assert.equal(specialist.modelId, 'qandeelasim13/urdu-ocr-trocr-si26');
  assert.equal(specialist.modelRevision, 'a9ef072320b50014f6df7ed9db807810157a410e');
  assert.equal(specialist.modelLicense, 'apache-2.0 (declared on the model card)');
  assert.match(specialist.projectLicense, /NO LICENCE FILE DECLARED/);
  assert.equal(specialist.baseModel, 'microsoft/trocr-base-printed');
  assert.match(specialist.architecture, /VisionEncoderDecoderModel/);
  assert.equal(specialist.documentedInputGranularity, 'line');
  assert.deepEqual([...specialist.supportedUnitTypes], ['LINE']);
  assert.match(specialist.redistributionPolicy, /NOT REDISTRIBUTED/);
  assert.ok(
    Array.isArray(specialist.modelFiles) && specialist.modelFiles.length >= 8,
    'the exact public file list must be recorded',
  );
  const weights = specialist.modelFiles.find((file) => file.path === 'model.safetensors');
  assert.equal(weights.size, 1335747032);
  assert.equal(weights.upstreamSha256, '420c828eff17e7e4dbfdc776d51b29aec6bbca5a9fde343573818a9c65099276');
});

test('P17-T005: the specialist is declared INTEGRATED and is mandatory for Urdu', () => {
  assert.equal(OCR_PROVIDERS[URDU_NASTALIQ_ID].integrationStatus, 'INTEGRATED');
  assert.deepEqual([...OCR_REQUIRED_PROVIDERS.ur], ['paddleocr', URDU_NASTALIQ_ID]);
});

test('P17-T005: the line-only capability is enforced, not advertised away', async () => {
  const dataRoot = scratchRoot();
  const { provider } = makeSpecialist(dataRoot, { revisions: { latest: 'rev-A' } });
  assert.deepEqual(provider.supportedUnitTypes, ['LINE']);

  await assert.rejects(
    () => provider.recognizePage({ imagePath: join(dataRoot, 'page.png'), pageIndex: 0, language: 'ur' }),
    (error) => error.code === OCR_STATE.UNSUPPORTED_UNIT,
  );
  await assert.rejects(
    () =>
      provider.recognizeRegion({
        imagePath: join(dataRoot, 'page.png'),
        region: { x: 0, y: 0, width: 10, height: 10 },
        pageIndex: 0,
        language: 'ur',
      }),
    (error) => error.code === OCR_STATE.UNSUPPORTED_UNIT,
  );
});

test('P17-T005: specialist model files stay in external storage, never in the repository', () => {
  const dataRoot = scratchRoot();
  const { provider } = makeSpecialist(dataRoot, { revisions: { latest: 'rev-A' } });
  const modelDir = provider.metadata.modelSource ? null : null;
  assert.equal(modelDir, null);
  const service = createOcrService({ dataRoot });
  const expectedModelRoot = join(service.ocrRoot, 'models', URDU_NASTALIQ_ID);
  assert.ok(expectedModelRoot.startsWith(service.ocrRoot));
  assert.ok(!expectedModelRoot.startsWith(REPOSITORY_ROOT), 'model storage must be outside Git');
});

test('P17-T047: no model weights or runtime caches exist anywhere in the repository', () => {
  const offenders = [];
  const forbiddenExtensions = [
    '.safetensors',
    '.ckpt',
    '.pt',
    '.pth',
    '.onnx',
    '.gguf',
    '.bin',
    '.pdparams',
    '.pdmodel',
  ];
  const skipDirs = new Set(['.git', 'node_modules', '.next', 'dist', 'dist-electron', '.vinext', '.wrangler']);
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(join(dir, entry.name));
        continue;
      }
      const lower = entry.name.toLowerCase();
      if (forbiddenExtensions.some((ext) => lower.endsWith(ext))) offenders.push(join(dir, entry.name));
    }
  };
  walk(REPOSITORY_ROOT);
  assert.deepEqual(offenders, [], 'model weights must never be committed or stored in the project');

  // The working tree may hold untracked scratch, but nothing cache-like may ever
  // be tracked, so ask Git directly as well.
  const tracked = execFileSync('git', ['ls-files'], { cwd: REPOSITORY_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const trackedOffenders = tracked.filter((path) =>
    /(^|\/)(__pycache__|site-packages|\.venv|node_modules)(\/|$)|\.(pyc|safetensors|onnx|gguf|pdparams|pdmodel|pt|pth|ckpt)$/i.test(
      path,
    ),
  );
  assert.deepEqual(trackedOffenders, [], 'no model weights, caches, or virtual environments may be tracked');
});

test('P17-T013: a specialist update stages and verifies before it can activate', async () => {
  const dataRoot = scratchRoot();
  const { provider, engineStore } = makeSpecialist(dataRoot, { revisions: { latest: 'rev-A' } });

  const staged = await provider.stageUpdate();
  assert.equal(staged.status, 'staged');
  assert.equal(staged.activated, false);
  assert.equal(engineStore.readActivation(URDU_NASTALIQ_ID).activeRevision, null, 'staging must not activate');
  assert.ok(staged.verification.ok);

  const activation = provider.activateUpdate({ revision: staged.revision });
  assert.equal(activation.activeRevision, 'rev-A');
  assert.equal(provider.version, 'rev-A');
});

test('P17-T029: a long data root provisions the specialist runtime in the short fallback root', async () => {
  const dataRoot = scratchRoot();
  const longDataRoot = join(dataRoot, 'x'.repeat(90));
  mkdirSync(longDataRoot, { recursive: true });
  const { provider } = makeSpecialist(longDataRoot, { revisions: { latest: 'rev-long' } });

  const staged = await provider.stageUpdate();
  assert.equal(staged.status, 'staged');
  const shortBase = join(
    process.env.READ_WATCH_OCR_RUNTIME_ROOT,
    URDU_NASTALIQ_ID,
    'rev-long',
  );
  assert.ok(
    existsSync(join(shortBase, 'Scripts', 'python.exe')),
    'the staged specialist runtime must live under the short external runtime root',
  );
  assert.equal(
    existsSync(join(longDataRoot, 'ocr', 'runtimes', URDU_NASTALIQ_ID, 'rev-long', 'Scripts', 'python.exe')),
    false,
  );
  const activation = provider.activateUpdate({ revision: 'rev-long' });
  assert.equal(activation.activeRevision, 'rev-long');
  assert.equal(provider.version, 'rev-long');
});

test('P17-T014: a failed specialist update leaves the previous specialist revision active', async () => {
  const dataRoot = scratchRoot();
  const { provider: first, engineStore } = makeSpecialist(dataRoot, { revisions: { latest: 'rev-A' } });
  await first.updateNow();
  assert.equal(engineStore.readActivation(URDU_NASTALIQ_ID).activeRevision, 'rev-A');

  const { provider: failing } = makeSpecialist(dataRoot, { revisions: { latest: 'rev-B' }, failAt: 'stage' });
  await assert.rejects(() => failing.updateNow(), (error) => error.code === OCR_STATE.UPDATE_FAILED);

  assert.equal(
    engineStore.readActivation(URDU_NASTALIQ_ID).activeRevision,
    'rev-A',
    'the working specialist revision must survive a failed update',
  );
  const failure = engineStore.readFailure(URDU_NASTALIQ_ID);
  assert.equal(failure.phase, 'stage');
});

test('P17-T014: a specialist smoke failure is never activated', async () => {
  const dataRoot = scratchRoot();
  const { provider: first, engineStore } = makeSpecialist(dataRoot, { revisions: { latest: 'rev-A' } });
  await first.updateNow();

  const { provider: failing } = makeSpecialist(dataRoot, { revisions: { latest: 'rev-C' }, failAt: 'smoke' });
  await assert.rejects(() => failing.updateNow(), (error) => error.code === OCR_STATE.UPDATE_FAILED);
  assert.equal(engineStore.readActivation(URDU_NASTALIQ_ID).activeRevision, 'rev-A');
  assert.equal(engineStore.readFailure(URDU_NASTALIQ_ID).phase, 'smoke');
});

test('P17-T015: specialist rollback restores the previous specialist revision, not another engine', async () => {
  const dataRoot = scratchRoot();
  const { provider: first, engineStore } = makeSpecialist(dataRoot, { revisions: { latest: 'rev-A' } });
  await first.updateNow();
  const { provider: second } = makeSpecialist(dataRoot, { revisions: { latest: 'rev-B' } });
  await second.updateNow();
  assert.equal(engineStore.readActivation(URDU_NASTALIQ_ID).activeRevision, 'rev-B');

  const rolledBack = second.rollback();
  assert.equal(rolledBack.from, 'rev-B');
  assert.equal(rolledBack.to, 'rev-A');
  assert.equal(engineStore.readActivation(URDU_NASTALIQ_ID).activeRevision, 'rev-A');
  assert.equal(
    engineStore.readActivation('paddleocr').activeRevision,
    null,
    'rolling back the specialist must never touch the other Urdu engine',
  );
});

test('P17-T016: Update All covers the specialist as an independent provider', async () => {
  const dataRoot = scratchRoot();
  const service = createOcrService({ dataRoot });
  const calls = [];
  for (const [providerId, provider] of Object.entries(service.providers)) {
    provider.updateNow = async () => {
      calls.push(providerId);
      if (providerId === URDU_NASTALIQ_ID) throw Object.assign(new Error('simulated'), { code: 'UPDATE_FAILED' });
      return { providerId, activated: true };
    };
  }
  const { handleOcrRequest } = await import('../server/ocr/ocr-http.mjs');
  const response = await handleOcrRequest({ service, method: 'POST', rest: 'update-all' });
  assert.equal(response.status, 200);
  assert.deepEqual(calls.sort(), ['paddleocr', 'unlimited-ocr', URDU_NASTALIQ_ID].sort());
  const specialistResult = response.payload.results.find((entry) => entry.providerId === URDU_NASTALIQ_ID);
  assert.equal(specialistResult.ok, false);
  assert.match(specialistResult.message, /simulated/);
});

test('P17-T017: specialist recognition performs no network call and no upload', async () => {
  const dataRoot = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: join(dataRoot, 'ocr') });
  engineStore.ensureLayout();
  engineStore.createStagingDir(URDU_NASTALIQ_ID, 'rev-A');
  engineStore.writeActivation(URDU_NASTALIQ_ID, { revision: 'rev-A', provenance: { repository: URDU_NASTALIQ_MODEL_ID } });
  const runtimeBase = join(dataRoot, 'ocr', 'runtimes', URDU_NASTALIQ_ID, 'rev-A');
  mkdirSync(join(runtimeBase, 'Scripts'), { recursive: true });
  writeFileSync(join(runtimeBase, 'Scripts', 'python.exe'), 'fake', 'utf8');
  const imagePath = join(dataRoot, 'ocr', 'temp', 'line.png');
  mkdirSync(join(dataRoot, 'ocr', 'temp'), { recursive: true });
  writeFileSync(imagePath, 'line bytes', 'utf8');

  const ops = [];
  const provider = createUrduNastaliqProvider({
    engineStore,
    dataRoot,
    driverPath: join(APP_ROOT, 'server', 'ocr', 'driver', 'engine_driver.py'),
    bridgeFactory: () => ({
      async request(op) {
        ops.push(op);
        return { ok: true, rawText: '\u06a9\u062a\u0627\u0628', blocks: [] };
      },
      async dispose() {},
    }),
  });

  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    calls.push(args[0]);
    throw new Error('network access during recognition is forbidden');
  };
  try {
    const result = await provider.recognizeLine({
      imagePath,
      pageIndex: 0,
      language: 'ur',
      sourceHash: 'e'.repeat(64),
      line: { lineId: 'p0-r0-l0', regionId: 'r0', box: { x: 0, y: 0, width: 40, height: 12 } },
    });
    assert.equal(result.ok, true);
    assert.equal(result.lineId, 'p0-r0-l0');
    assert.equal(result.providerVersion, 'rev-A');
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(calls, [], 'specialist recognition must never transmit anything');
  assert.deepEqual(ops, ['recognize_line']);
});

test('P17-T029: a host path-limit failure is surfaced as a structured platform state', async () => {
  const dataRoot = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: join(dataRoot, 'ocr') });
  const provider = createUrduNastaliqProvider({
    engineStore,
    dataRoot,
    driverPath: join(APP_ROOT, 'server', 'ocr', 'driver', 'engine_driver.py'),
    hooks: {
      async resolveUpstreamRevision() {
        return { revision: 'rev-A', provenance: {} };
      },
      async stageRevision() {
        throw Object.assign(new Error('staging path exceeds MAX_PATH'), { code: OCR_STATE.UNSUPPORTED_PLATFORM });
      },
    },
  });
  await assert.rejects(
    () => provider.stageUpdate(),
    (error) => error.code === OCR_STATE.UNSUPPORTED_PLATFORM,
  );
  const failure = engineStore.readFailure(URDU_NASTALIQ_ID);
  assert.equal(failure.phase, 'stage');
  assert.equal(failure.code, OCR_STATE.UNSUPPORTED_PLATFORM);
  // A stage failure never installs a revision: the activation pointer is untouched.
  assert.equal(engineStore.readActivation(URDU_NASTALIQ_ID).activeRevision, null);
});

test('P17-T005: the specialist runtime probe never runs an arbitrary shell', async () => {
  // The only process boundary is spawn() without a shell; prove the helper
  // refuses to interpret a command string as shell syntax.
  const result = await runCommand('node', ['-e', 'process.exit(3)'], {});
  assert.equal(result.ok, false);
  assert.equal(result.code, 3);
  const source = readFileSync(join(APP_ROOT, 'server', 'ocr', 'managed-provider.mjs'), 'utf8');
  assert.ok(!/shell\s*:\s*true/.test(source), 'no OCR process may be spawned through a shell');
  assert.ok(statSync(join(APP_ROOT, 'server', 'ocr', 'managed-provider.mjs')).isFile());
});
