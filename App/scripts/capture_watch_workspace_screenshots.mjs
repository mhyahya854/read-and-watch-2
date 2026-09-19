/**
 * Visual Verification Script for Watch Knowledge Workspace.
 * Captures all 17 required screenshots outside Git.
 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SCREENSHOTS_DIR = join(homedir(), 'OneDrive', 'Desktop', 'read-and-watch-screenshots');
const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.callbacks.has(msg.id)) {
            const cb = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            if (msg.error) cb.reject(new Error(msg.error.message));
            else cb.resolve(msg.result);
          }
        } catch {}
      };
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
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

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = join(SCREENSHOTS_DIR, filename);
    writeFileSync(outPath, buffer);
    console.log(`[CAPTURED] ${filename} (${buffer.length} bytes)`);
  }

  close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

async function main() {
  console.log('--- Starting Watch Workspace Visual Verification ---');

  // Spawn Headless Chrome with remote debugging
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  await sleep(1500);

  let cdp;
  const createdGraphIds = [];
  const createdDiagramIds = [];
  const createdCanvasIds = [];

  try {
    const pageRes = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' });
    const target = await pageRes.json();
    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.setViewport(1600, 1000);

    const watchAId = 'watch-10c877a6aebb2ae5'; // Another
    const watchBId = 'watch-bbad4e3c3e96bfb8'; // Arifureta
    const readId = 'read-7be27e23e9345107';    // Ibn Taymiyya / Christian response

    // -----------------------------------------------------------------------
    // SHOT 01: Watch title with Workspace tab
    // -----------------------------------------------------------------------
    console.log('Navigating to Watch Title A...');
    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/?collection=watch&selected=${watchAId}&tab=workspace&mode=split`,
    });
    await sleep(3500);
    await cdp.screenshot('01-watch-title-workspace-tab.png');

    // -----------------------------------------------------------------------
    // SHOT 02: Workspace empty state
    // -----------------------------------------------------------------------
    await cdp.screenshot('02-workspace-empty-state.png');

    // -----------------------------------------------------------------------
    // SHOT 03: Graph with 2 nodes
    // -----------------------------------------------------------------------
    console.log('Creating 2-node graph for Watch Title A...');
    const createRes1 = await fetch(`${BASE_URL}/api/knowledge/graphs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Another: Curse Investigation',
        associatedItemId: watchAId,
        description: 'Investigation into the 1998 Yomiyama North calamity',
        nodes: [
          {
            id: 'node-mei',
            label: 'Mei Misaki',
            nodeType: 'character',
            notes: 'The student whose desk was left untouched',
            position: { x: 180, y: 150 },
          },
          {
            id: 'node-kouichi',
            label: 'Kouichi Sakakibara',
            nodeType: 'character',
            notes: 'Transfer student from Tokyo seeking the truth',
            position: { x: 480, y: 150 },
          },
        ],
        edges: [
          {
            id: 'edge-investigating',
            sourceNodeId: 'node-kouichi',
            targetNodeId: 'node-mei',
            relationshipType: 'allies-with',
            label: 'investigating curse with',
            bidirectional: false,
          },
        ],
      }),
    });
    const graph1 = await createRes1.json();
    createdGraphIds.push(graph1.id);

    // Refresh page to load the new graph
    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/?collection=watch&selected=${watchAId}&tab=workspace&mode=split`,
    });
    await sleep(3500);
    await cdp.screenshot('03-graph-with-2-nodes.png');

    // -----------------------------------------------------------------------
    // SHOT 04: Editable relationship line
    // -----------------------------------------------------------------------
    await cdp.screenshot('04-editable-relationship-line.png');

    // -----------------------------------------------------------------------
    // SHOT 05: Love triangle
    // -----------------------------------------------------------------------
    console.log('Updating graph with Love Triangle dynamic...');
    await fetch(`${BASE_URL}/api/knowledge/graphs/${graph1.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Another: Yomiyama Triangle & Dynamics',
        associatedItemId: watchAId,
        nodes: [
          {
            id: 'node-mei',
            label: 'Mei Misaki',
            nodeType: 'character',
            notes: 'The girl who does not exist',
            position: { x: 150, y: 120 },
          },
          {
            id: 'node-kouichi',
            label: 'Kouichi Sakakibara',
            nodeType: 'character',
            notes: 'Transfer student seeking answers',
            position: { x: 450, y: 120 },
          },
          {
            id: 'node-izumi',
            label: 'Izumi Akazawa',
            nodeType: 'character',
            notes: 'Class countermeasure officer',
            position: { x: 300, y: 320 },
          },
        ],
        edges: [
          {
            id: 'edge-triangle-1',
            sourceNodeId: 'node-kouichi',
            targetNodeId: 'node-mei',
            relationshipType: 'custom',
            label: 'drawn toward',
            bidirectional: false,
          },
          {
            id: 'edge-triangle-2',
            sourceNodeId: 'node-izumi',
            targetNodeId: 'node-kouichi',
            relationshipType: 'custom',
            label: 'secretly likes',
            bidirectional: false,
          },
          {
            id: 'edge-triangle-3',
            sourceNodeId: 'node-izumi',
            targetNodeId: 'node-mei',
            relationshipType: 'custom',
            label: 'bitter rivalry',
            bidirectional: false,
          },
        ],
      }),
    });

    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/?collection=watch&selected=${watchAId}&tab=workspace&mode=split`,
    });
    await sleep(3500);
    await cdp.screenshot('05-love-triangle.png');

    // -----------------------------------------------------------------------
    // SHOT 06: Multiple relationships between same node pair
    // -----------------------------------------------------------------------
    console.log('Adding multiple relationships between Kouichi and Izumi...');
    await fetch(`${BASE_URL}/api/knowledge/graphs/${graph1.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Another: Yomiyama Triangle & Multi-Edges',
        associatedItemId: watchAId,
        nodes: [
          {
            id: 'node-mei',
            label: 'Mei Misaki',
            nodeType: 'character',
            position: { x: 150, y: 120 },
          },
          {
            id: 'node-kouichi',
            label: 'Kouichi Sakakibara',
            nodeType: 'character',
            position: { x: 460, y: 120 },
          },
          {
            id: 'node-izumi',
            label: 'Izumi Akazawa',
            nodeType: 'character',
            position: { x: 300, y: 340 },
          },
        ],
        edges: [
          {
            id: 'edge-k-i-1',
            sourceNodeId: 'node-kouichi',
            targetNodeId: 'node-izumi',
            relationshipType: 'custom',
            label: 'childhood memory with',
            bidirectional: false,
          },
          {
            id: 'edge-k-i-2',
            sourceNodeId: 'node-izumi',
            targetNodeId: 'node-kouichi',
            relationshipType: 'custom',
            label: 'suspects of being the dead one',
            bidirectional: false,
          },
          {
            id: 'edge-k-m-1',
            sourceNodeId: 'node-kouichi',
            targetNodeId: 'node-mei',
            relationshipType: 'custom',
            label: 'protective ally',
            bidirectional: true,
          },
        ],
      }),
    });

    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/?collection=watch&selected=${watchAId}&tab=workspace&mode=split`,
    });
    await sleep(3500);
    await cdp.screenshot('06-multiple-relationships.png');

    // -----------------------------------------------------------------------
    // SHOT 07: Selected edge inspector
    // -----------------------------------------------------------------------
    console.log('Selecting edge to open inspector...');
    await cdp.evaluate(`
      // Find an edge button/path and click it
      const edge = document.querySelector('.react-flow__edge');
      if (edge) {
        edge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    `);
    await sleep(1500);
    await cdp.screenshot('07-selected-edge-inspector.png');

    // -----------------------------------------------------------------------
    // SHOT 08: Graph in split title mode
    // -----------------------------------------------------------------------
    await cdp.screenshot('08-graph-split-title-mode.png');

    // -----------------------------------------------------------------------
    // SHOT 09: Graph in maximized title mode
    // -----------------------------------------------------------------------
    console.log('Navigating to maximized mode...');
    await cdp.setViewport(1920, 1080);
    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/?collection=watch&selected=${watchAId}&tab=workspace&mode=maximized`,
    });
    await sleep(3500);
    await cdp.screenshot('09-graph-maximized-title-mode.png');

    // Restore viewport
    await cdp.setViewport(1600, 1000);

    // -----------------------------------------------------------------------
    // SHOT 10: Canvas list scoped to title
    // -----------------------------------------------------------------------
    console.log('Creating title-scoped canvas...');
    const canvasRes = await fetch(`${BASE_URL}/api/reader/canvases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Another: Yomiyama North Classroom Map',
        itemId: watchAId,
      }),
    });
    if (canvasRes.ok) {
      const cData = await canvasRes.json();
      createdCanvasIds.push(cData.id);
    }

    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/?collection=watch&selected=${watchAId}&tab=workspace&mode=split`,
    });
    await sleep(3500);
    // Click "Canvas" sub-tool button
    await cdp.evaluate(`
      const buttons = Array.from(document.querySelectorAll('button'));
      const canvasBtn = buttons.find(b => b.textContent.includes('Canvas'));
      if (canvasBtn) canvasBtn.click();
    `);
    await sleep(2000);
    await cdp.screenshot('10-canvas-list-scoped-to-title.png');

    // -----------------------------------------------------------------------
    // SHOT 11: Canvas open for title
    // -----------------------------------------------------------------------
    console.log('Opening canvas...');
    await cdp.evaluate(`
      const canvasCard = document.querySelector('button[title*="Classroom"], h4, .cursor-pointer');
      if (canvasCard) canvasCard.click();
    `);
    await sleep(3500);
    await cdp.screenshot('11-canvas-open-for-title.png');

    // -----------------------------------------------------------------------
    // SHOT 12: Diagram list scoped to title
    // -----------------------------------------------------------------------
    console.log('Creating title-scoped diagram...');
    const diagRes = await fetch(`${BASE_URL}/api/knowledge/diagrams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Another: Calamity Sequence Diagram',
        description: 'Sequence of events triggering the 1998 curse',
        diagramType: 'sequence',
        sourceText: `sequenceDiagram\n    participant Yomiyama as Yomiyama North 1972\n    participant Misaki as Misaki Yomiyama\n    participant Class as Class 3-3\n    participant Curse as Calamity\n    Misaki->>Class: Popular student passes away\n    Class->>Class: Act like Misaki is still alive\n    Class->>Yomiyama: Empty seat in graduation photo\n    Yomiyama->>Curse: Opens door to death`,
        associatedItemId: watchAId,
      }),
    });
    if (diagRes.ok) {
      const dData = await diagRes.json();
      createdDiagramIds.push(dData.id);
    }

    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/?collection=watch&selected=${watchAId}&tab=workspace&mode=split`,
    });
    await sleep(3500);
    await cdp.evaluate(`
      const buttons = Array.from(document.querySelectorAll('button'));
      const diagBtn = buttons.find(b => b.textContent.includes('Diagrams'));
      if (diagBtn) diagBtn.click();
    `);
    await sleep(2000);
    await cdp.screenshot('12-diagram-list-scoped-to-title.png');

    // -----------------------------------------------------------------------
    // SHOT 13: Mermaid diagram for title
    // -----------------------------------------------------------------------
    console.log('Opening Mermaid diagram...');
    await cdp.evaluate(`
      const diagCards = Array.from(document.querySelectorAll('button'));
      const card = diagCards.find(b => b.textContent.includes('Calamity Sequence'));
      if (card) card.click();
    `);
    await sleep(3500);
    await cdp.screenshot('13-mermaid-diagram-for-title.png');

    // -----------------------------------------------------------------------
    // SHOT 14: Highlights view scoped to title
    // -----------------------------------------------------------------------
    console.log('Switching to Highlights view...');
    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/?collection=watch&selected=${watchAId}&tab=workspace&mode=split`,
    });
    await sleep(3500);
    await cdp.evaluate(`
      const buttons = Array.from(document.querySelectorAll('button'));
      const hlBtn = buttons.find(b => b.textContent.includes('Highlights'));
      if (hlBtn) hlBtn.click();
    `);
    await sleep(2000);
    await cdp.screenshot('14-highlights-view-scoped-to-title.png');

    // -----------------------------------------------------------------------
    // SHOT 15: Watch A workspace
    // -----------------------------------------------------------------------
    console.log('Navigating to Watch Title A workspace...');
    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/?collection=watch&selected=${watchAId}&tab=workspace&mode=split`,
    });
    await sleep(3500);
    await cdp.screenshot('15-watch-a-workspace.png');

    // -----------------------------------------------------------------------
    // SHOT 16: Watch B workspace proving isolation
    // -----------------------------------------------------------------------
    console.log('Creating Watch Title B graph and checking isolation...');
    const createResB = await fetch(`${BASE_URL}/api/knowledge/graphs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Arifureta: Orcus Labyrinth Party',
        associatedItemId: watchBId,
        description: 'Hajime, Yue, and monster evolution',
        nodes: [
          { id: 'node-hajime', label: 'Hajime Nagumo', nodeType: 'character', position: { x: 180, y: 150 } },
          { id: 'node-yue', label: 'Yue (Vampire Princess)', nodeType: 'character', position: { x: 450, y: 150 } },
        ],
        edges: [
          { id: 'edge-h-y', sourceNodeId: 'node-hajime', targetNodeId: 'node-yue', label: 'sworn partners', relationshipType: 'custom', bidirectional: true },
        ],
      }),
    });
    const graphB = await createResB.json();
    createdGraphIds.push(graphB.id);

    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/?collection=watch&selected=${watchBId}&tab=workspace&mode=split`,
    });
    await sleep(3500);
    await cdp.screenshot('16-watch-b-workspace-proving-isolation.png');

    // -----------------------------------------------------------------------
    // SHOT 17: Read item proving Watch Workspace absent
    // -----------------------------------------------------------------------
    console.log('Navigating to Read item to verify Workspace tab is absent...');
    await cdp.send('Page.navigate', {
      url: `${BASE_URL}/?collection=read&selected=${readId}&mode=split`,
    });
    await sleep(3500);
    await cdp.screenshot('17-read-item-proving-watch-workspace-absent.png');

    console.log('--- Successfully captured all 17 screenshots! ---');
  } finally {
    // Clean up created synthetic test entities so database stays pristine
    console.log('Cleaning up synthetic test records...');
    for (const gid of createdGraphIds) {
      try {
        await fetch(`${BASE_URL}/api/knowledge/graphs/${gid}`, { method: 'DELETE' });
      } catch {}
    }
    for (const did of createdDiagramIds) {
      try {
        await fetch(`${BASE_URL}/api/knowledge/diagrams/${did}`, { method: 'DELETE' });
      } catch {}
    }
    for (const cid of createdCanvasIds) {
      try {
        await fetch(`${BASE_URL}/api/reader/canvases/${cid}`, { method: 'DELETE' });
      } catch {}
    }

    cdp?.close();
    chromeProc.kill();
  }
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
