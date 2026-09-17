import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import { createEngineStore } from '../server/ocr/engine-store.mjs';
import { createOcrStore } from '../server/ocr/ocr-store.mjs';
import { createEngineUpdateManager } from '../server/ocr/update-manager.mjs';

const scratchDirs = [];

function scratchRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'rw-ocr-update-'));
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

/**
 * Minimal provider that satisfies the contract and simulates a real engine.
 * `failAt` injects a fault at a chosen lifecycle phase.
 */
function makeProvider(engineStore, { revisions = {}, failAt = null, failTimes = Infinity } = {}) {
  let failuresLeft = failTimes;
  const provider = {
    id: 'paddleocr',
    displayName: 'PP-OCRv5 Arabic script (PaddleOCR)',
    languages: ['ar', 'ur'],
    version: null,
    modelRevision: null,
    isAvailable: () => ({ ok: true }),
    getCapabilities: async () => ({ ok: true, capabilities: [] }),
    healthCheck: async () => ({ ok: true }),
    recognizePage: async () => ({ ok: true, rawText: '' }),
    recognizeRegion: async () => ({ ok: true }),
    cancel: () => ({ ok: true }),
    install: async () => ({ ok: true }),
    async resolveUpstreamRevision() {
      const latest = revisions.latest;
      return {
        revision: latest,
        provenance: {
          repository: 'PaddlePaddle/PaddleOCR',
          authority: 'official-upstream',
          modelRevision: 'arabic_PP-OCRv5_mobile_rec',
        },
      };
    },
    async createStagedHandle() {
      return provider;
    },
    async stageRevision({ revision, stagingDir }) {
      const shouldFail = failAt === 'stage' && failuresLeft-- > 0;
      if (shouldFail) {
        throw new Error('simulated network failure during staging');
      }
      const marker = join(stagingDir, 'engine.bin');
      writeFileSync(marker, `payload:${revision}`, 'utf8');
      const { createHash } = await import('node:crypto');
      const bytes = readFileSync(marker);
      const artifact = {
        path: marker,
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      return { artifacts: [artifact] };
    },
    async verifyArtifacts({ artifacts }) {
      // Hashes are recorded after staging; the manager then re-verifies them.
      const { createHash } = await import('node:crypto');
      const problems = [];
      for (const artifact of artifacts) {
        if (!artifact.sha256) continue;
        const actual = createHash('sha256').update(readFileSync(artifact.path)).digest('hex');
        if (actual !== artifact.sha256) problems.push(`hash mismatch: ${artifact.path}`);
      }
      return { ok: problems.length === 0, checked: artifacts.length, problems };
    },
    async smokeTestStaged() {
      const shouldFail = failAt === 'smoke' && failuresLeft-- > 0;
      if (shouldFail) return { ok: false, error: 'simulated smoke failure' };
      return { ok: true, fixture: 'synthetic' };
    },
  };
  return provider;
}

test('P17: a first install stages, verifies, and only then becomes active', async () => {
  const root = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: root });
  const provider = makeProvider(engineStore, { revisions: { latest: 'rev-A' } });
  const manager = createEngineUpdateManager({ engineStore, provider });

  const check = await manager.checkForUpdates();
  assert.equal(check.status, 'not-installed');

  const staged = await manager.stageUpdate({ revision: 'rev-A' });
  assert.equal(staged.status, 'staged');
  assert.equal(staged.activated, false);
  assert.equal(engineStore.readActivation('paddleocr').activeRevision, null, 'staging must not activate');
  assert.ok(staged.verification.ok, 'verification record must be a pass');

  const activation = manager.activateUpdate({ revision: 'rev-A' });
  assert.equal(activation.activeRevision, 'rev-A');
  assert.equal(engineStore.readActivation('paddleocr').activeRevision, 'rev-A');
});

test('P17: activation is refused while no passing verification record exists', () => {
  const root = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: root });
  const provider = makeProvider(engineStore, { revisions: { latest: 'rev-A' } });
  const manager = createEngineUpdateManager({ engineStore, provider });
  engineStore.createStagingDir('paddleocr', 'rev-B');

  assert.throws(
    () => manager.activateUpdate({ revision: 'rev-B' }),
    (error) => error.code === 'UPDATE_FAILED',
  );
  assert.equal(engineStore.readActivation('paddleocr').activeRevision, null);
});

test('P17: a failed staged update leaves the current working revision intact', async () => {
  const root = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: root });
  const provider = makeProvider(engineStore, { revisions: { latest: 'rev-A' } });
  const manager = createEngineUpdateManager({ engineStore, provider });

  await manager.stageUpdate({ revision: 'rev-A' });
  manager.activateUpdate({ revision: 'rev-A' });
  assert.equal(engineStore.readActivation('paddleocr').activeRevision, 'rev-A');

  const failing = makeProvider(engineStore, {
    revisions: { latest: 'rev-B' },
    failAt: 'stage',
  });
  const failingManager = createEngineUpdateManager({ engineStore, provider: failing });

  await assert.rejects(() => failingManager.updateNow(), (error) => error.code === 'UPDATE_FAILED');

  const activation = engineStore.readActivation('paddleocr');
  assert.equal(activation.activeRevision, 'rev-A', 'current engine must survive a failed update');
  assert.equal(engineStore.hasRevision('paddleocr', 'rev-B'), false, 'the failed staging tree is removed');
  const failure = engineStore.readFailure('paddleocr');
  assert.equal(failure.phase, 'stage');
  assert.match(failure.message, /simulated network failure/);
});

test('P17: a smoke-test failure is recorded and never activated', async () => {
  const root = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: root });
  const provider = makeProvider(engineStore, { revisions: { latest: 'rev-A' } });
  const manager = createEngineUpdateManager({ engineStore, provider });
  await manager.stageUpdate({ revision: 'rev-A' });
  manager.activateUpdate({ revision: 'rev-A' });

  const failing = makeProvider(engineStore, { revisions: { latest: 'rev-C' }, failAt: 'smoke' });
  const failingManager = createEngineUpdateManager({ engineStore, provider: failing });
  await assert.rejects(() => failingManager.updateNow(), (error) => error.code === 'UPDATE_FAILED');

  assert.equal(engineStore.readActivation('paddleocr').activeRevision, 'rev-A');
  assert.equal(engineStore.readFailure('paddleocr').phase, 'smoke');
});

test('P17: a successful update moves the activation pointer atomically and keeps the previous revision', async () => {
  const root = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: root });
  const provider = makeProvider(engineStore, { revisions: { latest: 'rev-A' } });
  const manager = createEngineUpdateManager({ engineStore, provider });
  await manager.stageUpdate({ revision: 'rev-A' });
  manager.activateUpdate({ revision: 'rev-A' });

  const next = makeProvider(engineStore, { revisions: { latest: 'rev-B' } });
  const nextManager = createEngineUpdateManager({ engineStore, provider: next });
  const result = await nextManager.updateNow();
  assert.equal(result.activated, true);

  const activation = engineStore.readActivation('paddleocr');
  assert.equal(activation.activeRevision, 'rev-B');
  assert.equal(activation.previousRevision, 'rev-A', 'previous revision must be retained for rollback');
  assert.equal(
    JSON.parse(readFileSync(engineStore.activePointerPath('paddleocr'), 'utf8')).activeRevision,
    'rev-B',
    'the activation pointer must be the durable record of what is live',
  );
});

test('P17: rollback restores the previous revision', async () => {
  const root = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: root });
  let provider = makeProvider(engineStore, { revisions: { latest: 'rev-A' } });
  let manager = createEngineUpdateManager({ engineStore, provider });
  await manager.stageUpdate({ revision: 'rev-A' });
  manager.activateUpdate({ revision: 'rev-A' });

  provider = makeProvider(engineStore, { revisions: { latest: 'rev-B' } });
  manager = createEngineUpdateManager({ engineStore, provider });
  await manager.updateNow();
  assert.equal(engineStore.readActivation('paddleocr').activeRevision, 'rev-B');

  const rolledBack = manager.rollback();
  assert.equal(rolledBack.from, 'rev-B');
  assert.equal(rolledBack.to, 'rev-A');
  assert.equal(engineStore.readActivation('paddleocr').activeRevision, 'rev-A');
});

test('P17: rollback without a previous revision is refused', async () => {
  const root = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: root });
  const provider = makeProvider(engineStore, { revisions: { latest: 'rev-A' } });
  const manager = createEngineUpdateManager({ engineStore, provider });
  await manager.stageUpdate({ revision: 'rev-A' });
  manager.activateUpdate({ revision: 'rev-A' });
  assert.throws(() => manager.rollback(), (error) => error.code === 'UPDATE_FAILED');
});

test('P17: a corrupted or incomplete download is rejected with no active change', async () => {
  const root = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: root });
  const provider = makeProvider(engineStore, { revisions: { latest: 'rev-A' } });
  const manager = createEngineUpdateManager({ engineStore, provider });

  // Stage honestly, then corrupt the staged payload before verification.
  const original = provider.stageRevision.bind(provider);
  provider.stageRevision = async (args) => {
    const manifest = await original(args);
    const artifact = manifest.artifacts[0];
    artifact.sha256 = 'f'.repeat(64); // recorded hash no longer matches the bytes
    writeFileSync(artifact.path, 'tampered payload', 'utf8');
    return manifest;
  };

  await assert.rejects(
    () => manager.stageUpdate({ revision: 'rev-A' }),
    (error) => error.code === 'UPDATE_FAILED' && /integrity/i.test(error.message),
  );
  assert.equal(engineStore.readActivation('paddleocr').activeRevision, null);
  assert.equal(engineStore.hasRevision('paddleocr', 'rev-A'), false, 'the corrupt tree must not remain');
});

test('P17: provenance is persisted alongside the activation record', async () => {
  const root = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: root });
  const provider = makeProvider(engineStore, { revisions: { latest: 'rev-A' } });
  const manager = createEngineUpdateManager({ engineStore, provider });
  const staged = await manager.updateNow();

  const activation = engineStore.readActivation('paddleocr');
  assert.equal(activation.provenance.repository, 'PaddlePaddle/PaddleOCR');
  assert.equal(activation.provenance.authority, 'official-upstream');
  assert.equal(activation.provenance.modelRevision, 'arabic_PP-OCRv5_mobile_rec');
  assert.equal(manager.readVerification('rev-A').provenance.modelRevision, 'arabic_PP-OCRv5_mobile_rec');
  assert.equal(staged.activated, true);
});

test('P17: an already-verified revision is not re-staged unnecessarily', async () => {
  const root = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: root });
  const provider = makeProvider(engineStore, { revisions: { latest: 'rev-A' } });
  const manager = createEngineUpdateManager({ engineStore, provider });
  await manager.stageUpdate({ revision: 'rev-A' });
  manager.activateUpdate({ revision: 'rev-A' });

  const again = await manager.stageUpdate({ revision: 'rev-A' });
  assert.equal(again.status, 'already-staged');
  assert.equal(again.activated, false);
});

test('P17: the OCR result store rejects a result that is not bound to a source hash', () => {
  const root = scratchRoot();
  const store = createOcrStore({ ocrRoot: root });
  assert.throws(
    () => store.save({ ok: true, provider: 'paddleocr', sourceHash: 'not-a-hash', pageIndex: 0, language: 'ar' }),
    (error) => error.code === 'INVALID_INPUT',
  );
});

test('P17: the update manager never treats a staged tree as repository content', () => {
  const root = scratchRoot();
  const engineStore = createEngineStore({ ocrRoot: root });
  assert.ok(engineStore.layout.root.startsWith(root));
  assert.ok(engineStore.versionDir('paddleocr', 'rev-A').startsWith(root));
});
