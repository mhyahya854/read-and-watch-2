import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { createEngineStore } from '../server/ocr/engine-store.mjs';
import { createPaddleOcrProvider } from '../server/ocr/provider-paddleocr.mjs';
import { createUrduNastaliqProvider } from '../server/ocr/provider-urdu-nastaliq.mjs';
import { createRuntimeBridge } from '../server/ocr/runtime-bridge.mjs';
import { createUrduPipeline } from '../server/ocr/urdu-pipeline.mjs';

const moduleDir = resolve(fileURLToPath(import.meta.url), '..');
const APP_ROOT = resolve(moduleDir, '..');
const FAKE_DRIVER = resolve(APP_ROOT, 'tests', 'fixtures', 'ocr', 'fake-engine-driver.mjs');
const DRIVER_PATH = resolve(APP_ROOT, 'server', 'ocr', 'driver', 'engine_driver.py');
const scratchDirs = [];

function scratchRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'rw-ocr-cancel-'));
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

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForDeath(pid) {
  for (let attempt = 0; attempt < 40 && isAlive(pid); attempt += 1) {
    await delay(50);
  }
  return !isAlive(pid);
}

/**
 * Waits until the supervised workers have actually spawned before the test
 * cancels, so the assertion tests cancellation rather than process start-up
 * under load.
 */
async function waitForWorkers(bridges, expectedPids) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const observed = bridges.flatMap((entry) => entry.pids);
    if (observed.length >= expectedPids) return observed;
    await delay(50);
  }
  return bridges.flatMap((entry) => entry.pids);
}

/**
 * Real supervised worker processes driven by the shipped transport, with the
 * test double standing in for the multi-gigabyte engine runtimes.
 */
function makeProviders(dataRoot, { paddleMode, specialistMode }) {
  const engineStore = createEngineStore({ ocrRoot: join(dataRoot, 'ocr') });
  engineStore.ensureLayout();
  const bridges = [];

  function bridgeFactory(options) {
    const providerIndex = options.args.indexOf('--provider');
    const providerId = providerIndex === -1 ? 'paddleocr' : options.args[providerIndex + 1];
    const mode = providerId === 'paddleocr' ? paddleMode : specialistMode;
    const inner = createRuntimeBridge({
      command: process.execPath,
      args: [FAKE_DRIVER, '--provider', providerId, '--mode', mode],
      requestTimeoutMs: 30_000,
    });
    const record = { providerId, bridge: inner, pids: [] };
    const capture = () => {
      const pid = inner.pid;
      if (typeof pid === 'number' && !record.pids.includes(pid)) record.pids.push(pid);
    };
    bridges.push(record);
    // The supervisor clears its child handle on dispose, so the worker pid has
    // to be captured while it is alive for the orphan check to mean anything.
    return {
      get sessionToken() {
        return inner.sessionToken;
      },
      get isRunning() {
        return inner.isRunning;
      },
      async start() {
        const ready = await inner.start();
        capture();
        return ready;
      },
      async request(op, payload, requestOptions) {
        const pending = inner.request(op, payload, requestOptions);
        capture();
        return await pending;
      },
      async dispose() {
        capture();
        return await inner.dispose();
      },
    };
  }

  function fakeRuntime(providerId, revision) {
    const base = join(dataRoot, 'ocr', 'runtimes', providerId, revision);
    mkdirSync(join(base, 'Scripts'), { recursive: true });
    writeFileSync(join(base, 'Scripts', 'python.exe'), 'fake interpreter', 'utf8');
    engineStore.createStagingDir(providerId, revision);
    engineStore.writeActivation(providerId, { revision, provenance: {} });
  }

  fakeRuntime('paddleocr', 'paddle-rev');
  fakeRuntime('urdu-nastaliq-trocr', 'spec-rev');
  writeFileSync(join(dataRoot, 'page.png'), 'rendered page bytes', 'utf8');

  const providers = {
    paddleocr: createPaddleOcrProvider({
      engineStore,
      dataRoot,
      driverPath: DRIVER_PATH,
      bridgeFactory,
    }),
    'urdu-nastaliq-trocr': createUrduNastaliqProvider({
      engineStore,
      dataRoot,
      driverPath: DRIVER_PATH,
      bridgeFactory,
    }),
  };
  return { providers, bridges };
}

const REGIONS = [
  {
    regionId: 'declared-body',
    regionType: 'body',
    language: 'ur',
    box: { x: 0, y: 0, width: 320, height: 100 },
    lines: [{ lineId: 'declared-line-1', box: { x: 10, y: 10, width: 300, height: 30 } }],
  },
];

test('P17-T025: cancelling Urdu OCR terminates the outstanding PP-OCRv5 worker', async () => {
  const dataRoot = scratchRoot();
  const { providers, bridges } = makeProviders(dataRoot, {
    paddleMode: 'hang-cancellable',
    specialistMode: 'ok',
  });
  const pipeline = createUrduPipeline({ providers });
  const controller = new AbortController();
  const pending = pipeline.recognizePage({
    sourceHash: 'c'.repeat(64),
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: join(dataRoot, 'page.png'),
    regions: REGIONS,
    signal: controller.signal,
  });
  await waitForWorkers(bridges, 1);
  controller.abort();
  const result = await pending;

  assert.notEqual(result.executionState, 'COMPLETE', 'a cancelled job is never COMPLETE');
  assert.equal(result.cancelled, true);
  const paddle = bridges.find((entry) => entry.providerId === 'paddleocr');
  assert.ok(paddle, 'the PP-OCRv5 worker must have been started');
  assert.ok(paddle.pids.length >= 1, 'the PP-OCRv5 worker pid must have been observed');
  for (const pid of paddle.pids) {
    assert.equal(await waitForDeath(pid), true, `PP-OCRv5 worker ${pid} survived cancellation`);
  }
});

test('P17-T025: cancelling Urdu OCR terminates the Nastaliq specialist worker', async () => {
  const dataRoot = scratchRoot();
  const { providers, bridges } = makeProviders(dataRoot, {
    paddleMode: 'ok',
    specialistMode: 'hang-cancellable',
  });
  const pipeline = createUrduPipeline({ providers });
  const controller = new AbortController();
  const pending = pipeline.recognizePage({
    sourceHash: 'd'.repeat(64),
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: join(dataRoot, 'page.png'),
    regions: REGIONS,
    signal: controller.signal,
  });
  await waitForWorkers(bridges, 2);
  controller.abort();
  const result = await pending;

  assert.equal(result.cancelled, true);
  assert.notEqual(result.executionState, 'COMPLETE');
  const specialist = bridges.find((entry) => entry.providerId === 'urdu-nastaliq-trocr');
  assert.ok(specialist, 'the specialist worker must have been started');
  assert.ok(specialist.pids.length >= 1, 'the specialist worker pid must have been observed');
  for (const pid of specialist.pids) {
    assert.equal(await waitForDeath(pid), true, `specialist worker ${pid} survived cancellation`);
  }
  // Already-completed engine output is preserved rather than destroyed.
  const paddle = result.engines.find((engine) => engine.providerId === 'paddleocr');
  assert.equal(paddle.ok, true);
});

test('P17-T025: a cancelled dual-engine Urdu job leaves no orphan worker behind', async () => {
  const dataRoot = scratchRoot();
  const { providers, bridges } = makeProviders(dataRoot, {
    paddleMode: 'ok',
    specialistMode: 'hang-cancellable',
  });
  const pipeline = createUrduPipeline({ providers });
  const controller = new AbortController();
  const pending = pipeline.recognizePage({
    sourceHash: 'e'.repeat(64),
    pageIndex: 0,
    language: 'ur',
    hasTextLayer: false,
    imagePath: join(dataRoot, 'page.png'),
    regions: REGIONS,
    signal: controller.signal,
  });
  await waitForWorkers(bridges, 2);
  controller.abort();
  await pending;

  const pids = bridges.flatMap((entry) => entry.pids);
  assert.ok(pids.length >= 2, 'both mandatory engines were engaged before cancellation');
  for (const pid of pids) {
    assert.equal(await waitForDeath(pid), true, `worker ${pid} survived the cancelled Urdu job`);
  }
  for (const entry of bridges) {
    assert.equal(entry.bridge.isRunning, false, `${entry.providerId} supervisor must not stay running`);
  }
});
