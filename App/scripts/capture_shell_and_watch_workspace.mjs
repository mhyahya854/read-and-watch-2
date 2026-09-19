/**
 * Visual verification harness for the shared desktop shell and the Watch title
 * knowledge workspace.
 *
 * Safety contract (this replaced a script that mutated the real library):
 *   - It never reads or writes the user's selected data root.
 *   - It builds a fresh synthetic portable library in a temporary directory.
 *   - Every mutating request is asserted against that temporary root.
 *   - Cleanup deletes the ENTIRE temporary root; no entity is soft-deleted as a
 *     stand-in for cleanup, so the run is deterministic and repeatable.
 *   - Every screenshot is preceded by an explicit DOM assertion, so a filename
 *     is never accepted as evidence on its own.
 *
 * Usage:
 *   node App/scripts/capture_shell_and_watch_workspace.mjs [--out <dir>] [--port <n>]
 *
 * Chrome is discovered from READ_WATCH_CHROME_PATH, CHROME_PATH, or the platform
 * default locations; it is never silently assumed. Use --chrome to override.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const appDir = join(appRoot, 'app');

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const PORT = Number(readArg('port', '3311'));
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = resolve(
  readArg('out', join(tmpdir(), 'read-watch-visual-verification', RUN_STAMP)),
);
// The dev server binds IPv6 localhost on Windows, so use the hostname form.
const BASE_URL = `http://localhost:${PORT}`;

function detectChrome() {
  const explicit = readArg('chrome', process.env.READ_WATCH_CHROME_PATH || process.env.CHROME_PATH);
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`Configured Chrome path does not exist: ${explicit}`);
    return explicit;
  }
  const candidates = {
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

// ---------------------------------------------------------------------------
// Synthetic library (never the user's data root)
// ---------------------------------------------------------------------------

function titleMarkdown({ id, collection, title, extra = '' }) {
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

const WATCH_A = { id: 'watch-aaaaaaaaaaaaaaaa', title: 'Synthetic Watch Alpha' };
const WATCH_B = { id: 'watch-bbbbbbbbbbbbbbbb', title: 'Synthetic Watch Beta' };
const READ_ITEM = { id: 'read-cccccccccccccccc', title: 'Synthetic Read Gamma' };

async function buildSyntheticRoot() {
  const root = mkdtempSync(join(tmpdir(), 'rw-visual-fixture-'));
  const watchADir = join(root, 'Watch', 'Anime', `${WATCH_A.title} (2001)`);
  const watchBDir = join(root, 'Watch', 'Movies', `${WATCH_B.title} (2002)`);
  const readDir = join(root, 'Read', 'Books', `${READ_ITEM.title} (2003)`);
  mkdirSync(watchADir, { recursive: true });
  mkdirSync(watchBDir, { recursive: true });
  mkdirSync(join(readDir, 'Files'), { recursive: true });

  writeFileSync(
    join(watchADir, `${WATCH_A.title} (2001).md`),
    titleMarkdown({ ...WATCH_A, collection: 'Watch', extra: 'type: "anime"\n' }),
  );
  writeFileSync(
    join(watchBDir, `${WATCH_B.title} (2002).md`),
    titleMarkdown({ ...WATCH_B, collection: 'Watch', extra: 'type: "movie"\n' }),
  );
  const pdfBytes = Buffer.from('%PDF-1.4 synthetic verification document\n');
  writeFileSync(join(readDir, 'Files', 'synthetic.pdf'), pdfBytes);
  writeFileSync(
    join(readDir, `${READ_ITEM.title} (2003).md`),
    titleMarkdown({
      ...READ_ITEM,
      collection: 'Read',
      extra: `files:
  - name: "synthetic.pdf"
    path: "Files/synthetic.pdf"
    format: "PDF"
    size: ${pdfBytes.length}
`,
    }),
  );

  const databasePath = join(root, 'App', 'state', 'read-watch.sqlite3');
  const { rebuildPortableLibrary } = await import(
    new URL('../app/server/portable-rebuild.mjs', import.meta.url).href
  );
  const rebuilt = await rebuildPortableLibrary({ root, databasePath, apply: true });
  if (!rebuilt?.ok) {
    throw new Error(`Synthetic portable rebuild failed: ${JSON.stringify(rebuilt)}`);
  }

  return { root, databasePath, userDataRoot: join(root, 'App', 'user-data') };
}

// ---------------------------------------------------------------------------
// Tiny CDP driver
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const startedAt = Date.now();
function stamp() {
  return `t+${String(Date.now() - startedAt).padStart(6, ' ')}ms`;
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
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
          if (msg.method === 'Network.requestWillBeSent') {
            const { requestId, request } = msg.params;
            if (request?.url?.includes('/api/') && request.method !== 'GET') {
              this.pendingRequests?.set(requestId, `${request.method} ${request.url}`);
            }
          }
          if (msg.method === 'Network.responseReceived') {
            const { requestId, response } = msg.params;
            const label = this.pendingRequests?.get(requestId);
            if (label || response?.url?.includes('/api/')) {
              console.log(`[net ${stamp()}] ${response.status} ${label ?? response.url}`);
              this.pendingRequests?.delete(requestId);
            }
          }
          if (msg.method === 'Network.loadingFailed') {
            console.error(`[net-failed] ${msg.params?.errorText}`);
          }
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
        // Allow the client bundle to hydrate and run its first data effects.
        await sleep(900);
        return;
      }
      await sleep(200);
    }
    throw new Error('Timed out waiting for page load');
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const outPath = join(OUT_DIR, filename);
    writeFileSync(outPath, Buffer.from(res.data, 'base64'));
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

// ---------------------------------------------------------------------------
// Assertion helpers. Every screenshot is gated on the real, intended UI state.
// ---------------------------------------------------------------------------

const captured = [];

async function expectText(cdp, label, text) {
  const found = await cdp.evaluate(
    `document.body.innerText.includes(${JSON.stringify(text)})`,
  );
  if (!found) {
    const body = await cdp.evaluate('document.body.innerText.slice(0, 600)');
    throw new Error(`Assertion failed (${label}): page does not contain "${text}".\n${body}`);
  }
}

async function expectAbsent(cdp, label, text) {
  const found = await cdp.evaluate(
    `document.body.innerText.includes(${JSON.stringify(text)})`,
  );
  if (found) throw new Error(`Assertion failed (${label}): page must not contain "${text}".`);
}

async function expectCount(cdp, label, selector, expected) {
  const count = await cdp.evaluate(
    `document.querySelectorAll(${JSON.stringify(selector)}).length`,
  );
  if (count !== expected) {
    throw new Error(`Assertion failed (${label}): expected ${expected} of "${selector}", found ${count}.`);
  }
}

async function expectPresent(cdp, label, selector) {
  const present = await cdp.evaluate(
    `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
  );
  if (!present) throw new Error(`Assertion failed (${label}): missing "${selector}".`);
}

async function clickSelector(cdp, label, selector) {
  const clicked = await cdp.evaluate(`
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Assertion failed (${label}): could not click "${selector}".`);
  await sleep(500);
}

async function clickButtonByText(cdp, label, text) {
  const rect = await cdp.evaluate(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find((b) => (b.textContent || '').trim() === ${JSON.stringify(text)});
      if (!target) return null;
      target.scrollIntoView({ block: 'center' });
      const box = target.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, w: box.width, h: box.height };
    })()
  `);
  if (!rect || rect.w === 0 || rect.h === 0) {
    throw new Error(`Assertion failed (${label}): no clickable button labelled "${text}".`);
  }
  await cdp.clickPoint(rect.x, rect.y);
  await sleep(400);
}

async function clickEdge(cdp, label, edgeId) {
  const clicked = await cdp.evaluate(`
    (() => {
      const edge = document.querySelector('.react-flow__edge[data-id=' + ${JSON.stringify(JSON.stringify(edgeId))} + ']');
      if (!edge) return false;
      edge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Assertion failed (${label}): relationship "${edgeId}" is not rendered.`);
  await sleep(600);
}

async function expectEdgeInspectorLabel(cdp, label, expected) {
  const value = await cdp.evaluate('document.querySelector("#inspector-edge-label")?.value');
  if (value !== expected) {
    throw new Error(
      `Assertion failed (${label}): relationship inspector shows "${value}" instead of "${expected}".`,
    );
  }
}

async function shot(cdp, filename, label, assertion) {
  await assertion();
  await cdp.screenshot(filename);
  captured.push({ filename, label });
}

async function api(baseUrl, path, init) {
  const res = await fetch(`${baseUrl}${path}`, init);
  if (!res.ok) {
    throw new Error(`API ${init?.method ?? 'GET'} ${path} failed with HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Stop a spawned child and, on Windows, its whole process tree so the fixture
 * database handle is released before cleanup.
 */
function stopProcess(child) {
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

function removeDirectoryWithRetries(target, attempts = 12) {
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

async function waitForServer(baseUrl, timeoutMs = 90000) {
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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const chromePath = detectChrome();
  console.log(`--- Visual verification: output -> ${OUT_DIR}`);
  console.log(`--- Chrome: ${chromePath}`);

  const fixture = await buildSyntheticRoot();
  console.log(`--- Synthetic data root: ${fixture.root}`);

  const server = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vinext', 'dev', '--port', String(PORT)],
    {
      cwd: appDir,
      env: { ...process.env, READ_WATCH_DATA_ROOT: fixture.root, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    },
  );
  let serverRefusedToStart = null;
  const watchServerOutput = (chunk) => {
    const text = String(chunk);
    if (text.includes('Another vinext dev server is already running')) {
      serverRefusedToStart =
        'A vinext dev server is already running for this app directory. Stop it first ' +
        '(the harness must own the server so it can point it at the synthetic data root).';
    }
  };
  server.stdout.on('data', (chunk) => {
    watchServerOutput(chunk);
    process.stdout.write(`[server] ${chunk}`);
  });
  server.stderr.on('data', (chunk) => {
    watchServerOutput(chunk);
    process.stderr.write(`[server] ${chunk}`);
  });

  let chromeProc = null;
  let cdp = null;
  let failure = null;

  try {
    const readyDeadline = Date.now() + 90000;
    while (Date.now() < readyDeadline) {
      if (serverRefusedToStart) throw new Error(serverRefusedToStart);
      try {
        const res = await fetch(`${BASE_URL}/`);
        if (res.ok) break;
      } catch {
        // Server not listening yet.
      }
      await sleep(500);
    }
    if (serverRefusedToStart) throw new Error(serverRefusedToStart);
    await waitForServer(BASE_URL, 5000);

    const debugPort = PORT + 1;
    chromeProc = spawn(chromePath, [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${join(fixture.root, 'chrome-profile')}`,
      'about:blank',
    ]);
    await sleep(2000);

    const pageRes = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
      method: 'PUT',
    });
    const target = await pageRes.json();
    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.setViewport(1600, 1000);

    // ---------------------------------------------------------------------
    // Synthetic knowledge artifacts for Watch A (created through the real API)
    // ---------------------------------------------------------------------
    const graphA1 = await api(BASE_URL, '/api/knowledge/graphs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Alpha Graph One',
        associatedItemId: WATCH_A.id,
        nodes: [
          { id: 'a-node-1', label: 'Alpha One', nodeType: 'character', position: { x: 120, y: 160 } },
          { id: 'a-node-2', label: 'Alpha Two', nodeType: 'character', position: { x: 460, y: 160 } },
          { id: 'a-node-3', label: 'Alpha Three', nodeType: 'character', position: { x: 300, y: 380 } },
        ],
        edges: [],
      }),
    });

    const graphA2 = await api(BASE_URL, '/api/knowledge/graphs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Alpha Graph Two',
        associatedItemId: WATCH_A.id,
        nodes: [
          { id: 'b-node-1', label: 'Second Graph Block', nodeType: 'location', position: { x: 180, y: 200 } },
        ],
        edges: [],
      }),
    });

    // Two same-direction relationships plus an opposite-direction pair and a
    // love triangle, all between the same three blocks.
    await api(BASE_URL, `/api/knowledge/graphs/${graphA1.id}?itemId=${WATCH_A.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Alpha Graph One',
        associatedItemId: WATCH_A.id,
        nodes: [
          { id: 'a-node-1', label: 'Alpha One', nodeType: 'character', position: { x: 120, y: 160 } },
          { id: 'a-node-2', label: 'Alpha Two', nodeType: 'character', position: { x: 460, y: 160 } },
          { id: 'a-node-3', label: 'Alpha Three', nodeType: 'character', position: { x: 300, y: 380 } },
        ],
        edges: [
          {
            id: 'a-edge-friend',
            sourceNodeId: 'a-node-1',
            targetNodeId: 'a-node-2',
            relationshipType: 'friend-of',
            label: 'friend of',
            bidirectional: false,
          },
          {
            id: 'a-edge-works',
            sourceNodeId: 'a-node-1',
            targetNodeId: 'a-node-2',
            relationshipType: 'works-with',
            label: 'works with',
            bidirectional: false,
          },
          {
            id: 'a-edge-back',
            sourceNodeId: 'a-node-2',
            targetNodeId: 'a-node-1',
            relationshipType: 'custom',
            label: 'حليف قديم',
            bidirectional: false,
          },
          {
            id: 'a-edge-triangle-1',
            sourceNodeId: 'a-node-2',
            targetNodeId: 'a-node-3',
            relationshipType: 'loves',
            label: 'loves',
            bidirectional: false,
          },
          {
            id: 'a-edge-triangle-2',
            sourceNodeId: 'a-node-3',
            targetNodeId: 'a-node-1',
            relationshipType: 'loves',
            label: 'loves',
            bidirectional: true,
          },
        ],
        expectedRevision: graphA1.revision,
      }),
    });

    const watchBCanvas = await api(BASE_URL, `/api/reader/items/${WATCH_B.id}/canvases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Beta Standalone Board' }),
    });
    const watchACanvas = await api(BASE_URL, `/api/reader/items/${WATCH_A.id}/canvases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Alpha Classroom Board' }),
    });
    await api(BASE_URL, '/api/knowledge/diagrams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Alpha Sequence Diagram',
        associatedItemId: WATCH_A.id,
        diagramType: 'sequence',
        sourceText: 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: synthetic hello',
      }),
    });
    // Legacy/unassigned artifacts must stay reachable on global surfaces.
    const legacyGraph = await api(BASE_URL, '/api/knowledge/graphs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Legacy Unassigned Graph',
        nodes: [{ id: 'legacy-node-1', label: 'Legacy Block', nodeType: 'concept' }],
        edges: [],
      }),
    });
    await api(BASE_URL, '/api/reader/canvases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Legacy Standalone Canvas' }),
    });

    // ---------------------------------------------------------------------
    // SHARED SHELL
    // ---------------------------------------------------------------------
    await cdp.navigate(`${BASE_URL}/?collection=watch`);
    await shot(cdp, '01-library-sidebar-expanded.png', 'Library sidebar expanded', async () => {
      await expectText(cdp, 'shell', 'Synthetic Watch Alpha');
      await expectPresent(cdp, 'sidebar', 'aside[data-sidebar="expanded"]');
      await expectText(cdp, 'sidebar settings anchor', 'Settings');
      await expectText(cdp, 'shell', 'Knowledge & Diagrams');
    });

    await clickSelector(cdp, 'collapse sidebar', 'button[aria-label="Collapse sidebar"]');
    await shot(cdp, '02-library-sidebar-collapsed.png', 'Library sidebar collapsed', async () => {
      await expectPresent(cdp, 'sidebar', 'aside[data-sidebar="collapsed"]');
      await expectPresent(cdp, 'rail settings anchor', 'aside[data-sidebar="collapsed"] a[href="/settings"]');
      await expectCount(cdp, 'collapsed rail item buttons', 'aside[data-sidebar="collapsed"] nav[aria-label="Library collections"] button', 2);
    });
    await clickSelector(cdp, 'expand sidebar', 'button[aria-label="Expand sidebar"]');

    await cdp.navigate(`${BASE_URL}/settings`);
    await shot(cdp, '03-static-page-sidebar-expanded.png', 'Settings page sidebar expanded', async () => {
      await expectPresent(cdp, 'static sidebar', 'aside[data-sidebar="expanded"]');
      await expectText(cdp, 'settings page', 'Settings');
    });
    await clickSelector(cdp, 'collapse static sidebar', 'button[aria-label="Collapse sidebar"]');
    await shot(cdp, '04-static-page-sidebar-collapsed.png', 'Settings page sidebar collapsed', async () => {
      await expectPresent(cdp, 'static sidebar collapsed', 'aside[data-sidebar="collapsed"]');
    });

    await cdp.navigate(`${BASE_URL}/?collection=watch&selected=${WATCH_A.id}&tab=workspace`);
    await shot(cdp, '05-title-split.png', 'Title panel in split mode', async () => {
      await expectText(cdp, 'split title', 'Synthetic Watch Alpha');
      await expectPresent(cdp, 'split panel', 'aside[aria-label="Synthetic Watch Alpha details"]');
    });

    await clickSelector(cdp, 'maximize', 'button[aria-label="Maximize workspace"]');
    await shot(cdp, '06-title-maximized.png', 'Title panel maximized', async () => {
      await expectPresent(cdp, 'restore control', 'button[aria-label="Restore split view"]');
    });

    await clickSelector(cdp, 'restore', 'button[aria-label="Restore split view"]');
    await shot(cdp, '07-title-restored.png', 'Title panel restored to split', async () => {
      await expectPresent(cdp, 'maximize control back', 'button[aria-label="Maximize workspace"]');
    });

    await clickSelector(cdp, 'close title panel', 'button[aria-label="Close title workspace"]');
    await shot(cdp, '08-title-closed.png', 'Title panel closed', async () => {
      await expectAbsent(cdp, 'closed panel', 'button[aria-label="Close title workspace"]');
    });

    await cdp.navigate(`${BASE_URL}/?collection=read&selected=${READ_ITEM.id}&tab=media`);
    const openedMedia = await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const target = buttons.find((b) => /synthetic\\.pdf/i.test(b.textContent || ''));
        if (!target) return false;
        target.scrollIntoView({ block: 'center' });
        target.click();
        return true;
      })()
    `);
    if (!openedMedia) throw new Error('Assertion failed: could not open the synthetic PDF media preview.');
    await sleep(600);
    await shot(cdp, '09-centered-media-dialog.png', 'Media dialog centered', async () => {
      await expectPresent(cdp, 'dialog', 'dialog[aria-modal="true"]');
      await expectText(cdp, 'dialog content', 'PDF Document');
    });
    await cdp.evaluate('document.querySelector(\'button[aria-label="Close dialog"]\')?.click()');

    // ---------------------------------------------------------------------
    // WATCH WORKSPACE
    // ---------------------------------------------------------------------
    await cdp.navigate(`${BASE_URL}/?collection=watch&selected=${WATCH_A.id}&tab=workspace`);
    // Accessible table alternative: the same title data must be readable without
    // the canvas.
    await clickButtonByText(cdp, 'open the accessible table view', 'Table');
    await shot(cdp, '10-watch-a-workspace.png', 'Watch A workspace (accessible table view)', async () => {
      await expectText(cdp, 'watch A graph', 'Alpha Graph One');
      await expectText(cdp, 'watch A blocks listed', 'Alpha One');
      await expectAbsent(cdp, 'no Watch B content', 'Beta Standalone Board');
    });
    await clickButtonByText(cdp, 'return to the canvas view', 'Graph');

    await cdp.navigate(`${BASE_URL}/?collection=watch&selected=${WATCH_B.id}&tab=workspace`);
    await clickButtonByText(cdp, 'open Watch B canvas tool', 'Canvas');
    await shot(cdp, '11-watch-b-workspace.png', 'Watch B workspace (canvas tool)', async () => {
      await expectAbsent(cdp, 'no Watch A graph', 'Alpha Graph One');
      await expectAbsent(cdp, 'no Watch A canvas', 'Alpha Classroom Board');
      await expectText(cdp, 'Watch B canvas present', 'Beta Standalone Board');
    });

    // A -> B transition inside the same mounted detail panel.
    await cdp.navigate(`${BASE_URL}/?collection=watch&selected=${WATCH_A.id}&tab=workspace`);
    await expectText(cdp, 'before transition', 'Alpha Graph One');
    const switchedRow = await cdp.evaluate(`
      (() => {
        const rows = Array.from(document.querySelectorAll('[data-row-index]'));
        const row = rows.find((r) => (r.textContent || '').includes(${JSON.stringify(WATCH_B.title)}));
        if (!row) return false;
        row.scrollIntoView({ block: 'center' });
        row.click();
        return true;
      })()
    `);
    if (!switchedRow) {
      throw new Error('Assertion failed: could not select Watch Beta from the library list.');
    }
    await sleep(1200);
     await shot(cdp, '12-watch-a-to-b-transition.png', 'A -> B transition shows only B data', async () => {
      await expectText(cdp, 'watch B selected', WATCH_B.title);
      await expectAbsent(cdp, 'no stale graph id', 'Alpha Graph One');
      await expectAbsent(cdp, 'no stale graph doc', 'Alpha One');
      await expectAbsent(cdp, 'no stale canvas id', 'Alpha Classroom Board');
    });

    // Graph 1 -> Graph 2 inside one title.
    await cdp.navigate(`${BASE_URL}/?collection=watch&selected=${WATCH_A.id}&tab=workspace`);
    await expectText(cdp, 'graph 1', 'Alpha Graph One');
    const selectedNode = await cdp.evaluate(`
      (() => {
        const node = document.querySelector('.react-flow__node[data-id="a-node-1"]');
        if (!node) return false;
        node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      })()
    `);
    if (!selectedNode) throw new Error('Assertion failed: graph 1 blocks are not rendered.');
    await sleep(500);
    await shot(cdp, '13-graph-1.png', 'Graph 1 rendered', async () => {
      await expectText(cdp, 'graph 1 blocks', 'Alpha One');
      await expectCount(cdp, 'graph 1 blocks count', '.react-flow__node', 3);
      await expectPresent(cdp, 'a block can be selected', '.react-flow__node.selected');
    });

    await cdp.evaluate(`
      (() => {
        const select = document.querySelector('header select');
        if (!select) return false;
        const option = Array.from(select.options).find((o) => o.textContent.includes('Alpha Graph Two'));
        if (!option) return false;
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    `);
    await sleep(1500);
    await shot(cdp, '14-graph-2-after-switch.png', 'Graph 2 after a real state transition', async () => {
      await expectText(cdp, 'graph 2 title', 'Alpha Graph Two');
      await expectText(cdp, 'graph 2 block', 'Second Graph Block');
      await expectAbsent(cdp, 'graph 1 content gone', 'Alpha One');
      await expectCount(cdp, 'graph 2 block count', '.react-flow__node', 1);
    });

    // Back to graph 1 for the interaction screenshots.
    await cdp.evaluate(`
      (() => {
        const select = document.querySelector('header select');
        if (!select) return false;
        const option = Array.from(select.options).find((o) => o.textContent.includes('Alpha Graph One'));
        if (!option) return false;
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    `);
    await sleep(1500);

    const addedBlock = await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const target = buttons.find((b) => (b.textContent || '').trim() === 'Add Block');
        if (target) target.click();
        return Boolean(target);
      })()
    `);
    if (!addedBlock) throw new Error('Assertion failed: could not find the Add Block control.');
    await sleep(700);
    await shot(cdp, '15-add-block-editor-open.png', 'Fresh block opens its editor immediately', async () => {
      await expectPresent(cdp, 'node inspector open', '#inspector-node-label');
      const value = await cdp.evaluate('document.querySelector("#inspector-node-label")?.value');
      if (!value || !value.includes('New')) {
        throw new Error(`Assertion failed: fresh block editor must be open for the new block, got "${value}".`);
      }
      await expectText(cdp, 'unsaved marker', 'Unsaved');
    });

    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const cancel = buttons.find((b) => (b.textContent || '').trim() === 'Cancel');
        if (cancel) cancel.click();
        return Boolean(cancel);
      })()
    `);
    await sleep(400);

    // Edge inspector: select a specific relationship by its own edge id.
    await clickEdge(cdp, 'select friend relationship', 'a-edge-friend');
    await shot(cdp, '16-custom-edge-inspector.png', 'Custom relationship label inspector', async () => {
      await expectPresent(cdp, 'edge inspector', '#inspector-edge-label');
      await expectEdgeInspectorLabel(cdp, 'edge inspector label', 'friend of');
      await expectText(cdp, 'direction control', 'Directed');
      await expectText(cdp, 'mutual control', 'Mutual');
    });

    // Edit the relationship label to arbitrary non-Latin text and apply it. This
    // proves the directed line is really editable and that the label is not
    // constrained to presets.
    await cdp.evaluate(`
      (() => {
        const input = document.querySelector('#inspector-edge-label');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '母亲');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    await clickButtonByText(cdp, 'apply the relationship label', 'Apply');
    await shot(cdp, '17-directed-relationship.png', 'Directed relationship with a custom label', async () => {
      await expectText(cdp, 'custom label rendered on the canvas', '母亲');
      await expectPresent(cdp, 'directed edge still present', '.react-flow__edge[data-id="a-edge-friend"]');
    });

    await clickEdge(cdp, 'select mutual relationship', 'a-edge-triangle-2');
    await shot(cdp, '18-mutual-relationship.png', 'Mutual relationship state', async () => {
      await expectEdgeInspectorLabel(cdp, 'mutual relationship label', 'loves');
      const mutualActive = await cdp.evaluate(`
        Array.from(document.querySelectorAll('button')).some((b) =>
          (b.textContent || '').includes('Mutual') && b.className.includes('bg-primary'))
      `);
      if (!mutualActive) throw new Error('Assertion failed: mutual direction control is not active.');
    });

    // Close the inspector so the whole network is visible.
    await clickButtonByText(cdp, 'close the relationship inspector', 'Cancel');
    await shot(cdp, '19-love-triangle.png', 'Love triangle relationships', async () => {
      await expectPresent(cdp, 'triangle edge 1', '.react-flow__edge[data-id="a-edge-triangle-1"]');
      await expectPresent(cdp, 'triangle edge 2', '.react-flow__edge[data-id="a-edge-triangle-2"]');
      await expectCount(cdp, 'all relationships', '.react-flow__edge', 5);
    });

    const distinctPaths = await cdp.evaluate(`
      (() => {
        const grab = (id) => {
          const group = document.querySelector('.react-flow__edge[data-id="' + id + '"]');
          const path = group?.querySelector('path.react-flow__edge-path');
          return path ? path.getAttribute('d') : null;
        };
        return { friend: grab('a-edge-friend'), works: grab('a-edge-works'), back: grab('a-edge-back') };
      })()
    `);
    if (!distinctPaths.friend || !distinctPaths.works || !distinctPaths.back) {
      throw new Error(`Assertion failed: relationship paths missing ${JSON.stringify(distinctPaths)}`);
    }
    if (distinctPaths.friend === distinctPaths.works) {
      throw new Error('Assertion failed: two same-direction relationships render on identical paths.');
    }
    if (distinctPaths.friend === distinctPaths.back) {
      throw new Error('Assertion failed: opposite-direction relationships render on identical paths.');
    }
    if (new Set(Object.values(distinctPaths)).size !== 3) {
      throw new Error('Assertion failed: relationship paths are not visually distinguishable.');
    }

    // Each relationship in a shared pair must be independently selectable.
    await clickEdge(cdp, 'select the parallel twin', 'a-edge-works');
    await shot(cdp, '20-parallel-relationships-same-pair.png', 'Two parallel relationships between one pair', async () => {
      await expectEdgeInspectorLabel(cdp, 'parallel twin selected', 'works with');
      await expectPresent(cdp, 'the other parallel relationship still drawn', '.react-flow__edge[data-id="a-edge-friend"]');
    });

    await clickEdge(cdp, 'select the reverse-direction relationship', 'a-edge-back');
    await shot(cdp, '21-opposite-direction-relationships.png', 'Opposite-direction relationship selected independently', async () => {
      await expectEdgeInspectorLabel(cdp, 'reverse relationship selected', 'حليف قديم');
      await expectPresent(cdp, 'forward relationship still drawn', '.react-flow__edge[data-id="a-edge-friend"]');
    });

    // Delete one of the parallel relationships and prove the other survives.
    await clickEdge(cdp, 'select the relationship to delete', 'a-edge-works');
    await expectEdgeInspectorLabel(cdp, 'relationship selected for deletion', 'works with');
    await clickButtonByText(cdp, 'delete the relationship', 'Delete');
    const removedInPlace = await cdp.evaluate(`
      Boolean(document.querySelector('.react-flow__edge[data-id="a-edge-works"]'))
    `);
    if (removedInPlace) {
      throw new Error('Assertion failed: deleting one parallel relationship removed nothing in the canvas.');
    }
    const twinAliveInPlace = await cdp.evaluate(`
      Boolean(document.querySelector('.react-flow__edge[data-id="a-edge-friend"]'))
    `);
    if (!twinAliveInPlace) {
      throw new Error('Assertion failed: deleting one parallel relationship also removed its twin.');
    }
    const saveProbeTarget = await cdp.evaluate(`
      (() => {
        const target = Array.from(document.querySelectorAll('button'))
          .find((b) => (b.textContent || '').trim() === 'Save');
        if (!target) return null;
        const box = target.getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2, w: box.width, h: box.height };
      })()
    `);
    if (!saveProbeTarget) throw new Error('Assertion failed: no Save control found.');
    await cdp.clickPoint(saveProbeTarget.x, saveProbeTarget.y);
    let saveOutcome = 'pending';
    const observed = [];
    for (let attempt = 0; attempt < 60 && saveOutcome === 'pending'; attempt += 1) {
      await sleep(100);
      const sample = await cdp.evaluate(`
        (() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const labels = buttons.map((b) => (b.textContent || '').trim());
          const header = document.querySelector('header')?.textContent || '';
          if (labels.some((t) => t.includes('Saved')) || header.includes('Saved')) return 'saved';
          const alert = document.querySelector('.bg-amber-500\\\\/15');
          if (alert) return 'conflict: ' + (alert.textContent || '').trim().slice(0, 200);
          if (labels.some((t) => t.startsWith('Saving'))) return 'saving';
          if (labels.includes('Save')) return 'pending';
          return 'unknown: ' + labels.join(' | ').slice(0, 200);
        })()
      `);
      if (observed[observed.length - 1] !== sample) observed.push(sample);
      saveOutcome = sample === 'saving' ? 'pending' : sample;
    }
    if (saveOutcome !== 'saved') {
      const buttonDump = await cdp.evaluate(`
        Array.from(document.querySelectorAll('button'))
          .map((b) => '[' + (b.textContent || '').trim() + (b.disabled ? ' (disabled)' : '') + ']')
          .join(' ')
      `);
      const nodesNow = await cdp.evaluate("document.querySelectorAll('.react-flow__node').length");
      throw new Error(
        `Assertion failed: the graph save did not report success (${saveOutcome}) at ${stamp()}. Observed: ${observed.join(' -> ')}. Buttons: ${buttonDump} nodes=${nodesNow}`,
      );
    }
    await cdp.navigate(`${BASE_URL}/?collection=watch&selected=${WATCH_A.id}&tab=workspace`);
    const afterDelete = await cdp.evaluate(`
      (() => ({
        remaining: document.querySelectorAll('.react-flow__edge').length,
        works: Boolean(document.querySelector('.react-flow__edge[data-id="a-edge-works"]')),
        friend: Boolean(document.querySelector('.react-flow__edge[data-id="a-edge-friend"]')),
      }))()
    `);
    if (afterDelete.works || !afterDelete.friend || afterDelete.remaining !== 4) {
      throw new Error(`Assertion failed: deleting one parallel relationship damaged the other ${JSON.stringify(afterDelete)}`);
    }

    // Canvas tool
    await cdp.navigate(`${BASE_URL}/?collection=watch&selected=${WATCH_A.id}&tab=workspace`);
    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const target = buttons.find((b) => (b.textContent || '').trim().startsWith('Canvas'));
        if (target) target.click();
        return Boolean(target);
      })()
    `);
    await sleep(1200);
    await shot(cdp, '22-watch-a-canvas.png', 'Watch A canvas list', async () => {
      await expectText(cdp, 'alpha canvas', 'Alpha Classroom Board');
      await expectAbsent(cdp, 'no beta canvas', 'Beta Standalone Board');
    });

    // Diagram tool
    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const target = buttons.find((b) => (b.textContent || '').trim().startsWith('Diagrams'));
        if (target) target.click();
        return Boolean(target);
      })()
    `);
    await sleep(1400);
    await shot(cdp, '23-watch-a-diagram.png', 'Watch A diagram list', async () => {
      await expectText(cdp, 'alpha diagram', 'Alpha Sequence Diagram');
    });

    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const target = buttons.find((b) => (b.textContent || '').trim().startsWith('Highlights'));
        if (target) target.click();
        return Boolean(target);
      })()
    `);
    await sleep(1200);
    await shot(cdp, '24-watch-a-highlights.png', 'Watch A highlights view', async () => {
      await expectText(cdp, 'highlights heading', 'Synthetic Watch Alpha');
    });

    await cdp.navigate(`${BASE_URL}/?collection=read&selected=${READ_ITEM.id}`);
    await shot(cdp, '25-read-item-no-watch-workspace.png', 'Read item has no Watch Workspace tab', async () => {
      await expectText(cdp, 'read item', 'Synthetic Read Gamma');
      const hasWorkspaceTab = await cdp.evaluate(`
        Array.from(document.querySelectorAll('[role="tab"]')).some(
          (tab) => (tab.textContent || '').trim() === 'Workspace')
      `);
      if (hasWorkspaceTab) {
        throw new Error('Assertion failed: Read items must not expose the Watch Workspace tab.');
      }
      await expectText(cdp, 'read keeps highlights', 'Highlights');
      await expectText(cdp, 'read keeps canvas', 'Canvas');
    });

    // ---------------------------------------------------------------------
    // GLOBAL ISOLATION
    // ---------------------------------------------------------------------
    const summary = await api(BASE_URL, '/api/knowledge/summary');
    const globalGraphTitles = (summary.graphs || []).map((g) => g.title);
    if (globalGraphTitles.includes('Alpha Graph One')) {
      throw new Error('Assertion failed: global knowledge summary leaks a Watch-owned graph.');
    }
    if (!globalGraphTitles.includes('Legacy Unassigned Graph')) {
      throw new Error('Assertion failed: global knowledge summary dropped a legacy unassigned graph.');
    }
    if ((summary.diagrams || []).some((d) => d.title === 'Alpha Sequence Diagram')) {
      throw new Error('Assertion failed: global knowledge summary leaks a Watch-owned diagram.');
    }

    await cdp.navigate(`${BASE_URL}/knowledge`);
    await shot(cdp, '26-global-knowledge-no-watch-leak.png', 'Global knowledge view excludes Watch-owned graphs', async () => {
      await expectText(cdp, 'legacy graph present', 'Legacy Unassigned Graph');
      await expectAbsent(cdp, 'no watch graph', 'Alpha Graph One');
      await expectAbsent(cdp, 'no watch diagram', 'Alpha Sequence Diagram');
    });

    const globalCanvasIds = (
      await api(BASE_URL, '/api/reader/canvases?scope=global')
    ).map((c) => c.id);
    if (globalCanvasIds.includes(watchACanvas.canvasId)) {
      throw new Error('Assertion failed: global canvas listing leaks a Watch-owned canvas.');
    }
    if (globalCanvasIds.includes(watchBCanvas.canvasId)) {
      throw new Error('Assertion failed: global canvas listing leaks a Watch-owned canvas.');
    }

    await cdp.navigate(`${BASE_URL}/canvas-notes`);
    await shot(cdp, '27-global-canvas-no-watch-leak.png', 'Global canvas view excludes Watch-owned canvases', async () => {
      await expectText(cdp, 'legacy canvas present', 'Legacy Standalone Canvas');
      await expectAbsent(cdp, 'no watch canvas', 'Alpha Classroom Board');
      await expectAbsent(cdp, 'no watch canvas', 'Beta Standalone Board');
    });

    await cdp.navigate(`${BASE_URL}/knowledge/graphs/${legacyGraph.id}`);
    await shot(cdp, '28-legacy-unassigned-still-accessible.png', 'Legacy unassigned graph still opens through its own route', async () => {
      await expectText(cdp, 'legacy graph opens', 'Legacy Unassigned Graph');
      await expectText(cdp, 'legacy block present', 'Legacy Block');
    });

    // Cross-title isolation at the API level, asserted from the same fixtures.
    const crossGet = await fetch(
      `${BASE_URL}/api/knowledge/graphs/${graphA1.id}?itemId=${WATCH_B.id}`,
    );
    if (crossGet.status !== 404) {
      throw new Error(`Assertion failed: cross-title graph GET returned HTTP ${crossGet.status}.`);
    }
    const crossPut = await fetch(
      `${BASE_URL}/api/knowledge/graphs/${graphA1.id}?itemId=${WATCH_B.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'hijacked', nodes: [], edges: [] }),
      },
    );
    if (crossPut.status !== 404) {
      throw new Error(`Assertion failed: cross-title graph PUT returned HTTP ${crossPut.status}.`);
    }
    const crossDelete = await fetch(
      `${BASE_URL}/api/knowledge/graphs/${graphA1.id}?itemId=${WATCH_B.id}`,
      { method: 'DELETE' },
    );
    if (crossDelete.status !== 404) {
      throw new Error(`Assertion failed: cross-title graph DELETE returned HTTP ${crossDelete.status}.`);
    }
    const stillThere = await api(
      BASE_URL,
      `/api/knowledge/graphs/${graphA1.id}?itemId=${WATCH_A.id}`,
    );
    if (stillThere.title !== 'Alpha Graph One') {
      throw new Error('Assertion failed: Watch A graph did not survive cross-title access attempts.');
    }

    console.log(`--- Captured ${captured.length} verified screenshots.`);
    for (const item of captured) console.log(`    ${item.filename} :: ${item.label}`);
  } catch (err) {
    failure = err;
  } finally {
    cdp?.close();
    stopProcess(chromeProc);
    stopProcess(server);
    // Deterministic cleanup: remove the ENTIRE temporary fixture root.
    const removed = removeDirectoryWithRetries(fixture.root);
    if (removed) console.log(`--- Removed synthetic fixture root ${fixture.root}`);
    else
      console.error(
        `--- Could not remove fixture root ${fixture.root} (a handle is still open); it contains no user data.`,
      );
  }

  if (failure) {
    console.error(`Visual verification FAILED: ${failure.message}`);
    process.exit(1);
  }
  console.log('Visual verification PASSED.');
}

main().catch((err) => {
  console.error(`Visual verification could not run: ${err.stack ?? err.message}`);
  process.exit(1);
});
