import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createEngineStore } from '../server/ocr/engine-store.mjs';
import { createOcrStore } from '../server/ocr/ocr-store.mjs';
import { createOcrService } from '../server/ocr/index.mjs';
import { OCR_PROVIDERS } from '../server/ocr/ocr-contract.mjs';

const moduleDir = resolve(fileURLToPath(import.meta.url), '..');
const APP_ROOT = resolve(moduleDir, '..');
const scratchDirs = [];

function scratchRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'rw-ocr-safety-'));
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

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const VOCALISED = '\u0627\u0644\u0652\u062d\u064e\u0645\u0652\u062f\u064f';

function fakeBridge(rawText) {
  return {
    async request(op) {
      if (op === 'health') return { ok: true };
      return {
        ok: true,
        provider: 'paddleocr',
        rawText,
        blocks: [{ text: rawText, confidence: 0.9, box: { x: 0, y: 0, width: 10, height: 10 } }],
        confidence: 0.9,
      };
    },
    async dispose() {
      return undefined;
    },
    isRunning: false,
    pid: null,
  };
}

function serviceWithFakeEngine({ dataRoot, rawText = VOCALISED } = {}) {
  const bridgeFactory = () => fakeBridge(rawText);
  return createOcrService({
    dataRoot,
    providerOptions: {
      bridgeFactory,
      'unlimited-ocr': { bridgeFactory },
      paddleocr: { bridgeFactory },
    },
  });
}

test('P17-T007: running OCR leaves the source document bit-identical', async () => {
  const dataRoot = scratchRoot();
  const service = serviceWithFakeEngine({ dataRoot });
  const pdfPath = resolve(APP_ROOT, 'tests', 'fixtures', 'pdf', 'sample-paper.pdf');
  const before = sha256(pdfPath);

  service.engineStore.createStagingDir('paddleocr', 'rev-1');
  service.engineStore.writeActivation('paddleocr', {
    revision: 'rev-1',
    provenance: { repository: 'PaddlePaddle/PaddleOCR', modelRevision: 'arabic_PP-OCRv5_mobile_rec' },
  });
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const runtimeBase = join(service.ocrRoot, 'runtimes', 'paddleocr', 'rev-1');
  mkdirSync(join(runtimeBase, 'Scripts'), { recursive: true });
  writeFileSync(join(runtimeBase, 'Scripts', 'python.exe'), '', 'utf8');

  const imagePath = join(dataRoot, 'ocr', 'temp', 'page-1.png');
  mkdirSync(join(dataRoot, 'ocr', 'temp'), { recursive: true });
  writeFileSync(imagePath, 'rendered page bytes', 'utf8');

  const result = await service.router.recognizePage({
    sourceHash: before,
    pageIndex: 1,
    language: 'ar',
    hasTextLayer: false,
    text: '',
    imagePath,
  });

  assert.equal(result.ok, true);
  assert.equal(sha256(pdfPath), before, 'the source PDF must not change');
});

test('P17-T006: an OCR result is bound to the source hash and engine identity', async () => {
  const dataRoot = scratchRoot();
  const store = createOcrStore({ ocrRoot: join(dataRoot, 'ocr') });
  const sourceHash = 'a'.repeat(64);
  store.save({
    ok: true,
    provider: 'paddleocr',
    providerVersion: 'rev-1',
    modelRevision: 'arabic_PP-OCRv5_mobile_rec',
    language: 'ar',
    pageIndex: 4,
    sourceHash,
    settingsKey: 'default',
    rawText: VOCALISED,
    displayText: VOCALISED,
    searchText: '\u0627\u0644\u062d\u0645\u062f',
    blocks: [],
    confidence: null,
  });

  const loaded = store.load({ provider: 'paddleocr', sourceHash, pageIndex: 4, language: 'ar' });
  assert.ok(loaded, 'the record must be retrievable');
  assert.equal(loaded.sourceHash, sourceHash);
  assert.equal(loaded.provider, 'paddleocr');
  assert.equal(loaded.modelRevision, 'arabic_PP-OCRv5_mobile_rec');
  assert.equal(loaded.language, 'ar');
  assert.ok(loaded.createdAt === undefined || typeof loaded.createdAt === 'string');
  assert.equal(typeof loaded.persistedAt, 'string');
});

test('P17-T006: a changed source hash invalidates the cached OCR result', () => {
  const dataRoot = scratchRoot();
  const store = createOcrStore({ ocrRoot: join(dataRoot, 'ocr') });
  const record = {
    ok: true,
    provider: 'paddleocr',
    providerVersion: 'rev-1',
    modelRevision: 'm1',
    language: 'ar',
    pageIndex: 0,
    sourceHash: 'b'.repeat(64),
    settingsKey: 'default',
  };
  assert.equal(
    store.isStale(record, { sourceHash: 'c'.repeat(64), providerVersion: 'rev-1', modelRevision: 'm1' }),
    true,
  );
  assert.equal(
    store.isStale(record, { sourceHash: 'b'.repeat(64), providerVersion: 'rev-2', modelRevision: 'm1' }),
    true,
  );
  assert.equal(
    store.isStale(record, { sourceHash: 'b'.repeat(64), providerVersion: 'rev-1', modelRevision: 'm2' }),
    true,
  );
  assert.equal(
    store.isStale(record, { sourceHash: 'b'.repeat(64), providerVersion: 'rev-1', modelRevision: 'm1' }),
    false,
  );
  assert.equal(
    store.isStale(record, {
      sourceHash: 'b'.repeat(64),
      providerVersion: 'rev-1',
      modelRevision: 'm1',
      settingsKey: 'different',
    }),
    true,
  );
});

test('P17-T028: recognition performs no network call and no document upload', async () => {
  const dataRoot = scratchRoot();
  const service = serviceWithFakeEngine({ dataRoot });
  const { mkdirSync, writeFileSync } = await import('node:fs');
  service.engineStore.createStagingDir('paddleocr', 'rev-1');
  service.engineStore.writeActivation('paddleocr', { revision: 'rev-1', provenance: {} });
  const runtimeBase = join(service.ocrRoot, 'runtimes', 'paddleocr', 'rev-1');
  mkdirSync(join(runtimeBase, 'Scripts'), { recursive: true });
  writeFileSync(join(runtimeBase, 'Scripts', 'python.exe'), '', 'utf8');
  mkdirSync(join(dataRoot, 'ocr', 'temp'), { recursive: true });
  const imagePath = join(dataRoot, 'ocr', 'temp', 'page.png');
  writeFileSync(imagePath, 'bytes', 'utf8');

  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    calls.push(args[0]);
    throw new Error('network access during recognition is forbidden');
  };
  try {
    const result = await service.router.recognizePage({
      sourceHash: 'd'.repeat(64),
      pageIndex: 0,
      language: 'ar',
      hasTextLayer: false,
      text: '',
      imagePath,
    });
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(calls, [], 'recognition must never transmit anything');
});

test('P17-T028: the engine driver imports no network client', () => {
  const driver = readFileSync(resolve(APP_ROOT, 'server', 'ocr', 'driver', 'engine_driver.py'), 'utf8');
  for (const forbidden of ['requests', 'urllib', 'httpx', 'aiohttp', 'socket', 'http.client']) {
    assert.ok(!driver.includes(`import ${forbidden}`), `driver must not import ${forbidden}`);
    assert.ok(!driver.includes(`from ${forbidden}`), `driver must not import from ${forbidden}`);
  }
  assert.ok(driver.includes('No network call is ever made'), 'the privacy contract must be documented in place');
});

test('P17-T023: OCR sources contain no absolute developer machine paths', () => {
  const roots = [
    resolve(APP_ROOT, 'server', 'ocr'),
    resolve(APP_ROOT, 'lib', 'ocr'),
  ];
  const offenders = [];
  const windowsUserPath = /[A-Za-z]:[\\/]+Users[\\/]+/;
  const unixHomePath = /\/(?:home|Users)\/[A-Za-z0-9._-]+\//;

  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const text = readFileSync(full, 'utf8');
        if (windowsUserPath.test(text) || unixHomePath.test(text)) offenders.push(full);
      }
    }
  };
  for (const root of roots) walk(root);
  assert.deepEqual(offenders, []);
});

test('P17-T028: provider metadata records the verified upstream and model identities', () => {
  const unlimited = OCR_PROVIDERS['unlimited-ocr'];
  assert.equal(unlimited.officialUpstream, 'baidu/Unlimited-OCR');
  assert.equal(unlimited.userFork, 'mhyahya854/Unlimited-OCR');
  assert.equal(unlimited.codeLicense, 'MIT');
  assert.equal(unlimited.modelId, 'baidu/Unlimited-OCR');
  assert.equal(unlimited.runtimeRequirements.accelerator, 'cuda');
  assert.equal(unlimited.runtimeRequirements.cpuSupported, false, 'CPU support must not be claimed for Unlimited-OCR');

  const paddle = OCR_PROVIDERS.paddleocr;
  assert.equal(paddle.officialUpstream, 'PaddlePaddle/PaddleOCR');
  assert.equal(paddle.userFork, 'mhyahya854/PaddleOCR');
  assert.equal(paddle.codeLicense, 'Apache-2.0');
  assert.equal(paddle.models.ar.recognition, 'arabic_PP-OCRv5_mobile_rec');
  assert.equal(paddle.models.ur.recognition, 'arabic_PP-OCRv5_mobile_rec');
  assert.equal(paddle.models.ar.detection, 'PP-OCRv5_server_det');
  assert.equal(paddle.models.ar.dictionary, 'ppocr/utils/dict/ppocrv5_arabic_dict.txt');
  assert.deepEqual([...paddle.languages], ['ar', 'ur']);
});

test('P17-T015: engine storage is external and never inside the repository', () => {
  const dataRoot = scratchRoot();
  const service = createOcrService({ dataRoot });
  const repositoryRoot = resolve(APP_ROOT, '..', '..');
  assert.ok(
    !service.ocrRoot.startsWith(repositoryRoot),
    'OCR engines, models, runtimes, and cache must stay outside Git',
  );
  const layout = service.engineStore.ensureLayout();
  for (const key of ['engines', 'models', 'runtimes', 'cache', 'temp', 'evidence']) {
    assert.ok(layout[key].startsWith(service.ocrRoot), `${key} must live under the OCR external root`);
  }
});

test('P17-T003: the engine store refuses path-escaping identifiers', () => {
  const dataRoot = scratchRoot();
  const store = createEngineStore({ ocrRoot: join(dataRoot, 'ocr') });
  for (const bad of ['..', '../../etc', 'a/b', 'with space', '']) {
    assert.throws(() => store.versionDir('paddleocr', bad));
  }
  assert.throws(() => store.versionDir('../../escape', 'rev'));
});

test('P17-T005: the shipped driver exists and is reachable from the service', () => {
  const dataRoot = scratchRoot();
  const service = createOcrService({ dataRoot });
  assert.equal(service.driverAvailable, true, 'the Read & Watch-owned engine driver must ship with the app');
});
