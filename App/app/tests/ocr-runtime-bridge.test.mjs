import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { createRuntimeBridge } from '../server/ocr/runtime-bridge.mjs';

const FAKE_DRIVER = resolve(process.cwd(), 'tests', 'fixtures', 'ocr', 'fake-engine-driver.mjs');

function fakeBridge({ provider = 'paddleocr', mode = 'ok', requestTimeoutMs = 5000 } = {}) {
  return createRuntimeBridge({
    command: process.execPath,
    args: [FAKE_DRIVER, '--provider', provider, '--mode', mode],
    requestTimeoutMs,
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('P17-T005: the bridge starts a runtime and completes a request', async () => {
  const bridge = fakeBridge();
  try {
    const health = await bridge.request('health', {});
    assert.equal(health.ok, true);
    assert.equal(health.provider, 'paddleocr');
    assert.ok(bridge.isRunning);
  } finally {
    await bridge.dispose();
  }
});

test('P17-T005: a request carrying the wrong session token is refused', async () => {
  // Speak the protocol directly, bypassing the bridge, with a forged token.
  const child = spawn(process.execPath, [FAKE_DRIVER, '--provider', 'paddleocr', '--token', 'real-token'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const reader = createInterface({ input: child.stdout });
  const reply = new Promise((resolveReply) => {
    reader.on('line', (line) => {
      const parsed = JSON.parse(line);
      if (parsed.id === 42) resolveReply(parsed);
    });
  });
  child.stdin.write(`${JSON.stringify({ id: 42, op: 'health', token: 'forged-token', payload: {} })}\n`);
  const forged = await reply;
  assert.equal(forged.ok, false);
  assert.equal(forged.error.code, 'RUNTIME_UNAVAILABLE');
  assert.match(forged.error.message, /session token/i);
  child.kill('SIGKILL');
  reader.close();
});

test('P17-T005: a runtime that never reports ready times out instead of hanging forever', async () => {
  const bridge = fakeBridge({ mode: 'no-ready', requestTimeoutMs: 700 });
  try {
    await assert.rejects(
      () => bridge.request('health', {}),
      (error) => /did not report ready/.test(error.message),
    );
  } finally {
    await bridge.dispose();
  }
});

test('P17-T005: an engine failure surfaces as a structured code, not fabricated text', async () => {
  const bridge = fakeBridge({ mode: 'recognize-fail' });
  try {
    await assert.rejects(
      () => bridge.request('recognize_page', { language: 'ar' }),
      (error) => error.code === 'OCR_FAILED',
    );
  } finally {
    await bridge.dispose();
  }
});

test('P17-T005: cancellation abandons in-flight work safely', async () => {
  const bridge = fakeBridge({ mode: 'hang-cancellable' });
  try {
    const controller = new AbortController();
    const pending = bridge.request('recognize_page', { language: 'ar' }, { signal: controller.signal });
    await delay(120);
    controller.abort();
    await assert.rejects(pending, (error) => error.code === 'CANCELLED');
    // The runtime is still usable after a cancellation.
    const health = await bridge.request('health', {});
    assert.equal(health.ok, true);
  } finally {
    await bridge.dispose();
  }
});

test('P17-T021: dispose terminates the runtime so no orphan process survives app shutdown', async () => {
  const bridge = fakeBridge();
  await bridge.request('health', {});
  const pid = bridge.pid;
  assert.ok(typeof pid === 'number' && pid > 0);
  await bridge.dispose();
  assert.equal(bridge.isRunning, false);
  for (let attempt = 0; attempt < 20 && isAlive(pid); attempt += 1) {
    await delay(50);
  }
  assert.equal(isAlive(pid), false, `OCR runtime pid ${pid} survived dispose()`);
  await assert.rejects(() => bridge.request('health', {}), (error) => /disposed/.test(error.message));
});

test('P17-T020: a runtime that dies mid-session fails pending work instead of stalling', async () => {
  const bridge = fakeBridge({ mode: 'hang', requestTimeoutMs: 400 });
  try {
    await assert.rejects(
      () => bridge.request('recognize_page', { language: 'ar' }),
      (error) => error.code === 'RUNTIME_UNAVAILABLE' || /timed out/.test(error.message),
    );
  } finally {
    await bridge.dispose();
  }
});
