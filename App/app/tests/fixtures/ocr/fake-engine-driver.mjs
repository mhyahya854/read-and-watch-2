#!/usr/bin/env node
/**
 * Test double for the real OCR engine driver.
 *
 * Speaks the same newline-delimited JSON protocol as
 * server/ocr/driver/engine_driver.py so the runtime bridge, canceller, and
 * no-orphan guarantees can be exercised without downloading model weights.
 *
 * It is NOT a model. It cannot recognise text. It exists to prove transport,
 * token enforcement, structured failures, cancellation, and shutdown.
 */

import process from 'node:process';

const args = process.argv.slice(2);
const flag = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};

const token = flag('--token');
const mode = flag('--mode', 'ok');
let nextId = 1;
const children = [];

function emit(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

if (mode === 'no-ready') {
  // Simulates a runtime that starts but never reports readiness.
  setInterval(() => {}, 1000);
} else {
  emit({ type: 'ready', protocol: 1, provider: flag('--provider', 'paddleocr'), pid: process.pid });
}

async function handle(request) {
  const { id, op, payload = {}, token: supplied } = request;
  if (supplied !== token) {
    emit({ id, ok: false, error: { code: 'RUNTIME_UNAVAILABLE', message: 'Bad session token' } });
    return;
  }
  if (op === 'health') {
    emit({
      id,
      ok: true,
      result: {
        ok: true,
        provider: flag('--provider', 'paddleocr'),
        python: '3.12.0',
        platform: process.platform,
        packages: { paddleocr: '3.2.0' },
        accelerator: { cuda: false, cudaDevices: 0, deviceName: null },
      },
    });
    return;
  }
  if (op === 'smoke') {
    if (mode === 'smoke-fail') {
      emit({ id, ok: false, error: { code: 'MODEL_NOT_INSTALLED', message: 'fixture failure' } });
      return;
    }
    emit({
      id,
      ok: true,
      result: { ok: true, fixture: 'synthetic-white-canvas', hardware: { cuda: false } },
    });
    return;
  }
  if (op === 'recognize_page' || op === 'recognize_region') {
    if (mode === 'recognize-fail') {
      emit({ id, ok: false, error: { code: 'OCR_FAILED', message: 'fixture inference failure' } });
      return;
    }
    if (mode === 'hang' || mode === 'hang-cancellable') {
      children.push(id);
      // Wait until explicitly cancelled (or forever in 'hang' mode).
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (!children.includes(id)) {
            clearInterval(check);
            resolve();
          }
        }, 10);
        check.unref();
      });
      emit({ id, ok: false, error: { code: 'CANCELLED', message: 'cancelled by host' } });
      return;
    }
    const rawText = payload.language === 'ar' || payload.language === 'ur'
      ? '\u0627\u0644\u0652\u062d\u064e\u0645\u0652\u062f\u064f \u0644\u0650\u0644\u0651\u064e\u0647\u0650 \u0631\u064e\u0628\u0651\u0650 \u0627\u0644\u0652\u0639\u064e\u0627\u0644\u064e\u0645\u0650\u064a\u0646\u064e'
      : 'fixture english line';
    emit({
      id,
      ok: true,
      result: {
        ok: true,
        provider: flag('--provider', 'paddleocr'),
        language: payload.language,
        rawText,
        blocks: [{ text: rawText.split(' ')[0], confidence: 0.87, box: { x: 1, y: 2, width: 3, height: 4 } }],
        confidence: 0.87,
      },
    });
    return;
  }
  if (op === 'cancel') {
    const target = payload.targetId;
    const index = children.indexOf(target);
    if (index >= 0) children.splice(index, 1);
    emit({ id, ok: true, result: { ok: true, cancelled: target ?? null } });
    return;
  }
  emit({ id, ok: false, error: { code: 'INVALID_INPUT', message: `Unknown op: ${op}` } });
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf('\n');
  while (newline !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) {
      try {
        void handle(JSON.parse(line));
      } catch {
        // ignore unparsable fixture input
      }
    }
    newline = buffer.indexOf('\n');
  }
});
process.stdin.on('end', () => process.exit(0));
nextId += 1;
