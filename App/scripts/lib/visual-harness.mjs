/**
 * Shared primitives for the synthetic-root visual verification harnesses.
 *
 * Safety contract for every harness built on this module:
 *   - it never reads or writes the user's selected data root;
 *   - it builds a fresh synthetic portable library in a temporary directory;
 *   - cleanup deletes the ENTIRE temporary root;
 *   - every screenshot is preceded by an explicit DOM assertion.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const scriptDir = dirname(fileURLToPath(import.meta.url));
export const appRoot = resolve(scriptDir, '..', '..');
export const appDir = join(appRoot, 'app');

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const startedAt = Date.now();
export function stamp() {
  return `t+${String(Date.now() - startedAt).padStart(6, ' ')}ms`;
}

export function detectChrome(explicit) {
  const configured =
    explicit || process.env.READ_WATCH_CHROME_PATH || process.env.CHROME_PATH;
  if (configured) {
    if (!existsSync(configured)) {
      throw new Error(`Configured Chrome path does not exist: ${configured}`);
    }
    return configured;
  }
  const candidates =
    {
      win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ],
      darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
    }[process.platform] ?? [];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      'No Chrome/Chromium binary found. Set READ_WATCH_CHROME_PATH or pass --chrome <path>.',
    );
  }
  return found;
}

export function titleMarkdown({ id, collection, title, extra = '' }) {
  return `---
schema_version: 1
id: "${id}"
collection: "${collection}"
title: "${title}"
status: "${collection === 'Read' ? 'unread' : 'to_watch'}"
${extra}---

# ${title}

## ${collection === 'Read' ? 'Overview' : 'My Description'}

Synthetic verification fixture. Not user data.
`;
}

/** Build a synthetic portable library (outside Git) and rebuild its runtime DB. */
export async function buildSyntheticRoot(files) {
  const root = mkdtempSync(join(tmpdir(), 'rw-visual-fixture-'));
  for (const file of files) {
    const target = join(root, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, file.encoding ?? undefined);
  }
  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  const { rebuildPortableLibrary } = await import(
    new URL('../../app/server/portable-rebuild.mjs', import.meta.url).href
  );
  const rebuilt = await rebuildPortableLibrary({ root, databasePath, apply: true });
  if (!rebuilt?.ok) {
    throw new Error(`Synthetic portable rebuild failed: ${JSON.stringify(rebuilt)}`);
  }
  return { root, databasePath, userDataRoot: join(root, 'App', 'user-data') };
}

export class CdpClient {
  constructor(wsUrl, { outDir }) {
    this.wsUrl = wsUrl;
    this.outDir = outDir;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.pendingRequests = new Map();
  }

  async connect() {
    return new Promise((resolveConnect, rejectConnect) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolveConnect();
      this.ws.onerror = (err) => rejectConnect(err);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.method === 'Runtime.exceptionThrown') {
            const details = msg.params?.exceptionDetails;
            console.error(
              `[page-error] ${details?.exception?.description ?? details?.text ?? 'unknown'}`,
            );
          }
          if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
            const text = (msg.params.args ?? [])
              .map((arg) => arg.value ?? arg.description ?? '')
              .join(' ');
            console.error(`[page-console-error] ${text}`);
          }
          if (msg.method === 'Network.requestWillBeSent') {
            const { requestId, request } = msg.params;
            if (request?.url?.includes('/api/') && request.method !== 'GET') {
              this.pendingRequests.set(requestId, `${request.method} ${request.url}`);
              if (request.method === 'PUT' && request.url.includes('/canvases/') && request.postData) {
                try {
                  const body = JSON.parse(request.postData);
                  console.log(
                    `[net-body ${stamp()}] expectedRevision=${body.expectedRevision} ` +
                      `blocks=${body.knowledge?.blocks?.length ?? 'n/a'} ` +
                      `relationships=${body.knowledge?.relationships?.length ?? 'n/a'} ` +
                      `elements=${body.scene?.elements?.length ?? 'n/a'}`,
                  );
                } catch {
                  // Non-JSON canvas payloads are not interesting here.
                }
              }
            }
          }
          if (msg.method === 'Network.responseReceived') {
            const { requestId, response } = msg.params;
            const label = this.pendingRequests.get(requestId);
            if (label) {
              console.log(`[net ${stamp()}] ${response.status} ${label}`);
              this.pendingRequests.delete(requestId);
            }
          }
          if (msg.id && this.callbacks.has(msg.id)) {
            const cb = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            if (msg.error) cb.reject(new Error(msg.error.message));
            else cb.resolve(msg.result);
          }
        } catch {
          // Non-JSON frames are not part of the CDP response stream.
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolveSend, rejectSend) => {
      this.callbacks.set(id, { resolve: resolveSend, reject: rejectSend });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res?.exceptionDetails) {
      throw new Error(`Page evaluation failed: ${res.exceptionDetails.text}`);
    }
    return res?.result?.value;
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  /** Real mouse click at viewport coordinates (not a synthetic DOM event). */
  async clickPoint(x, y) {
    const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  }

  async clickSelector(selector) {
    const clicked = await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ block: 'center' });
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      })()
    `);
    if (!clicked) throw new Error(`could not click "${selector}"`);
    await sleep(400);
  }

  async clickByText(text, { exact = true } = {}) {
    const rect = await this.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const target = buttons.find((b) => {
          const label = (b.textContent || '').trim();
          return ${exact ? `label === ${JSON.stringify(text)}` : `label.includes(${JSON.stringify(text)})`};
        });
        if (!target) return null;
        target.scrollIntoView({ block: 'center' });
        const box = target.getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2, w: box.width, h: box.height };
      })()
    `);
    if (!rect || rect.w === 0 || rect.h === 0) {
      throw new Error(`no clickable button labelled "${text}"`);
    }
    await this.clickPoint(rect.x, rect.y);
    await sleep(400);
  }

  /** Click an icon-only control by its accessible name (aria-label / title). */
  async clickByLabel(label) {
    const rect = await this.evaluate(`
      (() => {
        const all = Array.from(document.querySelectorAll('button, [role="button"]'));
        const target = all.find(
          (b) => b.getAttribute('aria-label') === ${JSON.stringify(label)} ||
                 b.getAttribute('title') === ${JSON.stringify(label)},
        );
        if (!target) return null;
        target.scrollIntoView({ block: 'center' });
        const box = target.getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2, w: box.width, h: box.height };
      })()
    `);
    if (!rect || rect.w === 0 || rect.h === 0) {
      const available = await this.evaluate(`
        Array.from(document.querySelectorAll('button, [role="button"]'))
          .map((b) => b.getAttribute('aria-label') || b.getAttribute('title') || (b.textContent || '').trim().slice(0, 30))
          .filter(Boolean)
          .join(' | ')
          .slice(0, 500)
      `);
      throw new Error(`no clickable control labelled "${label}". Available: ${available}`);
    }
    await this.clickPoint(rect.x, rect.y);
    await sleep(400);
  }

  /**
   * Type into a controlled React field through the real input pipeline
   * (`Input.insertText`), which is what a human keystroke produces.
   */
  async typeInto(selector, text, { clear = true } = {}) {
    const found = await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.focus();
        if (${clear} && typeof el.select === 'function') el.select();
        return document.activeElement === el;
      })()
    `);
    if (!found) throw new Error(`cannot focus "${selector}" for typing`);
    if (clear) {
      // Clear any existing value through the same input pipeline.
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        windowsVirtualKeyCode: 46,
        key: 'Delete',
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        windowsVirtualKeyCode: 46,
        key: 'Delete',
      });
    }
    await this.send('Input.insertText', { text });
    await sleep(200);
    return this.evaluate(
      `document.querySelector(${JSON.stringify(selector)})?.value ?? null`,
    );
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await sleep(700);
    await this.waitForLoad();
  }

  async waitForLoad(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ready = await this.evaluate('document.readyState === "complete"');
      if (ready) {
        await sleep(900);
        return;
      }
      await sleep(200);
    }
    throw new Error('Timed out waiting for page load');
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(this.outDir, filename), Buffer.from(res.data, 'base64'));
    console.log(`[CAPTURED] ${filename}`);
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // Closing an already-closed socket is not an error.
    }
  }
}

export function createAssertions(cdp) {
  const captured = [];

  const expectText = async (label, text, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = await cdp.evaluate(
        `document.body.innerText.includes(${JSON.stringify(text)})`,
      );
      if (found) return;
      await sleep(250);
    }
    const body = await cdp.evaluate('document.body.innerText.slice(0, 600)');
    throw new Error(`Assertion failed (${label}): page does not contain "${text}".\n${body}`);
  };

  const expectAbsent = async (label, text) => {
    const found = await cdp.evaluate(
      `document.body.innerText.includes(${JSON.stringify(text)})`,
    );
    if (found) throw new Error(`Assertion failed (${label}): page must not contain "${text}".`);
  };

  const expectCount = async (label, selector, expected) => {
    const count = await cdp.evaluate(
      `document.querySelectorAll(${JSON.stringify(selector)}).length`,
    );
    if (count !== expected) {
      throw new Error(
        `Assertion failed (${label}): expected ${expected} of "${selector}", found ${count}.`,
      );
    }
  };

  const expectPresent = async (label, selector, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const present = await cdp.evaluate(
        `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
      );
      if (present) return;
      await sleep(250);
    }
    throw new Error(`Assertion failed (${label}): missing "${selector}".`);
  };

  const shot = async (filename, label, assertion) => {
    await assertion();
    await cdp.screenshot(filename);
    captured.push({ filename, label });
  };

  return { captured, expectText, expectAbsent, expectCount, expectPresent, shot };
}

export async function api(baseUrl, path, init) {
  const res = await fetch(`${baseUrl}${path}`, init);
  if (!res.ok) {
    throw new Error(`API ${init?.method ?? 'GET'} ${path} failed with HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function waitForServer(baseUrl, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.ok) return;
    } catch {
      // Server not listening yet.
    }
    await sleep(500);
  }
  throw new Error(`Dev server did not become ready at ${baseUrl}`);
}

/**
 * Start the dev server against a synthetic root and wait until it answers.
 * Fails fast (instead of timing out) when another dev server owns this app dir.
 */
export async function startDevServer({ port, dataRoot, baseUrl }) {
  const server = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vinext', 'dev', '--port', String(port)],
    {
      cwd: appDir,
      env: { ...process.env, READ_WATCH_DATA_ROOT: dataRoot, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    },
  );

  let refused = null;
  const watch = (chunk) => {
    const text = String(chunk);
    if (text.includes('Another vinext dev server is already running')) {
      refused =
        'A vinext dev server is already running for this app directory. Stop it first ' +
        '(the harness must own the server so it can point it at the synthetic data root).';
    }
  };
  server.stdout.on('data', (chunk) => {
    watch(chunk);
    process.stdout.write(`[server] ${chunk}`);
  });
  server.stderr.on('data', (chunk) => {
    watch(chunk);
    process.stderr.write(`[server] ${chunk}`);
  });

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (refused) {
      stopProcess(server);
      throw new Error(refused);
    }
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.ok) return server;
    } catch {
      // Not listening yet.
    }
    await sleep(500);
  }
  stopProcess(server);
  throw new Error(`Dev server did not become ready at ${baseUrl}`);
}

export function stopProcess(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // Best effort: the process may already have exited.
  }
}

export function removeDirectoryWithRetries(target, attempts = 12) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      rmSync(target, { recursive: true, force: true });
      return true;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  return false;
}

export function readArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}
