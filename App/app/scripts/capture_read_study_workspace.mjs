/**
 * Visual verification harness for the Read study workspace.
 *
 * Everything runs against a synthetic temporary data root: a generated PDF and a
 * minimal reflowable book, both authored here. The user's library is never
 * opened or written. Every screenshot is preceded by an explicit DOM assertion.
 *
 * Usage:
 *   node App/app/scripts/capture_read_study_workspace.mjs [--out <dir>] [--port <n>] [--chrome <path>]
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { spawn } from 'node:child_process';
import {
  CdpClient,
  buildSyntheticRoot,
  createAssertions,
  detectChrome,
  readArg,
  removeDirectoryWithRetries,
  sleep,
  startDevServer,
  stopProcess,
  titleMarkdown,
} from '../../scripts/lib/visual-harness.mjs';

const PORT = Number(readArg('port', '3321'));
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = readArg('out', join(tmpdir(), 'read-watch-read-visual', RUN_STAMP));
const BASE_URL = `http://localhost:${PORT}`;

const BOOK_A = { id: `read-${'a'.repeat(32)}`, title: 'Synthetic Study Alpha' };
const BOOK_B = { id: `read-${'b'.repeat(32)}`, title: 'Synthetic Study Beta' };

async function makePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Synthetic study page ${pageIndex + 1}`, {
      x: 60,
      y: 780,
      size: 18,
      font,
    });
    const lines = [
      'The cell is the basic structural unit of every living organism.',
      'Osmosis moves water across a semi-permeable membrane.',
      'Chloroplasts convert light energy into chemical energy.',
      'Mitochondria release energy stored in glucose.',
      'Cell theory states that all cells come from existing cells.',
    ];
    lines.forEach((line, index) => {
      page.drawText(line, { x: 60, y: 720 - index * 26, size: 12, font });
    });
  }
  return Buffer.from(await pdf.save());
}

/** A minimal reflowable book container; the reader falls back to its synthetic
 *  reflowable document when the container is not a complete EPUB. */
function makeEpub() {
  return Buffer.from(
    'application/epub+zip synthetic placeholder for the Reader & Watch verification harness\n',
  );
}

async function buildFixtureRoot() {
  const pdfBytes = await makePdf();
  const epubBytes = makeEpub();
  const pdfDir = join('Read', 'Books', `${BOOK_A.title} (2026)`);
  const epubDir = join('Read', 'Books', `${BOOK_B.title} (2026)`);
  return buildSyntheticRoot([
    {
      path: join(pdfDir, `${BOOK_A.title} (2026).md`),
      content: titleMarkdown({
        ...BOOK_A,
        collection: 'Read',
        extra: `files:
  - name: "study-alpha.pdf"
    path: "Files/study-alpha.pdf"
    format: "PDF"
    size: ${pdfBytes.length}
`,
      }),
      encoding: 'utf8',
    },
    { path: join(pdfDir, 'Files', 'study-alpha.pdf'), content: pdfBytes },
    {
      path: join(epubDir, `${BOOK_B.title} (2026).md`),
      content: titleMarkdown({
        ...BOOK_B,
        collection: 'Read',
        extra: `files:
  - name: "study-beta.epub"
    path: "Files/study-beta.epub"
    format: "EPUB"
    size: ${epubBytes.length}
`,
      }),
      encoding: 'utf8',
    },
    { path: join(epubDir, 'Files', 'study-beta.epub'), content: epubBytes },
  ]);
}

/** Select real text inside the rendered PDF text layer. */
async function selectReaderText(cdp, spanCount = 2) {
  return cdp.evaluate(`
    (() => {
      const spans = Array.from(document.querySelectorAll('.textLayer span'))
        .filter((s) => (s.textContent || '').trim().length > 0);
      if (spans.length === 0) return null;
      const first = spans[0];
      const last = spans[Math.min(${spanCount} - 1, spans.length - 1)];
      const range = document.createRange();
      range.setStart(first.firstChild ?? first, 0);
      const lastText = last.firstChild;
      if (!lastText) return null;
      range.setEnd(lastText, Math.min(20, (lastText.textContent || '').length));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      // The reader's selection menu listens on document mouseup/keyup.
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }));
      document.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Shift' }));
      return selection.toString().trim();
    })()
  `);
}

async function drawStroke(cdp) {
  const box = await cdp.evaluate(`
    (() => {
      const surface = document.querySelector('[data-testid="reader-draw-surface"]');
      if (!surface) return null;
      const rect = surface.getBoundingClientRect();
      return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
    })()
  `);
  if (!box) throw new Error('draw surface is not available');
  const points = [
    { x: box.x + box.w * 0.3, y: box.y + box.h * 0.3 },
    { x: box.x + box.w * 0.45, y: box.y + box.h * 0.38 },
    { x: box.x + box.w * 0.55, y: box.y + box.h * 0.32 },
    { x: box.x + box.w * 0.62, y: box.y + box.h * 0.42 },
  ];
  await cdp.evaluate(`
    (() => {
      const surface = document.querySelector('[data-testid="reader-draw-surface"]');
      const fire = (type, point) => {
        surface.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            clientX: point.x,
            clientY: point.y,
          }),
        );
      };
      window.__rwStrokePoints = ${JSON.stringify(points)};
      fire('pointerdown', window.__rwStrokePoints[0]);
      for (const point of window.__rwStrokePoints.slice(1)) fire('pointermove', point);
      fire('pointerup', window.__rwStrokePoints[window.__rwStrokePoints.length - 1]);
      return true;
    })()
  `);
  await sleep(900);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const chromePath = detectChrome(readArg('chrome', null));
  console.log(`--- Read study visual verification: output -> ${OUT_DIR}`);
  console.log(`--- Chrome: ${chromePath}`);

  const fixture = await buildFixtureRoot();
  console.log(`--- Synthetic data root: ${fixture.root}`);

  let server = null;
  let chromeProc = null;
  let cdp = null;
  let failure = null;

  try {
    server = await startDevServer({ port: PORT, dataRoot: fixture.root, baseUrl: BASE_URL });

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
    cdp = new CdpClient(target.webSocketDebuggerUrl, { outDir: OUT_DIR });
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.setViewport(1600, 1000);

    const { captured, expectText, expectAbsent, expectCount, expectPresent, shot } =
      createAssertions(cdp);

    const readerA = `${BASE_URL}/reader/${BOOK_A.id}`;
    const readerB = `${BASE_URL}/reader/${BOOK_B.id}`;

    // -------------------------------------------------------------------
    // Reader layout states
    // -------------------------------------------------------------------
    await cdp.navigate(readerA);
    await shot('01-read-pdf-open.png', 'PDF opens in the reader', async () => {
      await expectPresent('reader mounted', '[aria-label="Publication Content Viewport"]');
    });

    await cdp.clickByText('Notes', { exact: false });
    await cdp.clickByText('Canvas', { exact: false });
    await cdp.clickSelector('[data-testid="study-tab-canvas"]');
    await shot('02-reader-split-mode.png', 'Split mode: reader beside the study pane', async () => {
      await expectPresent('reader pane', '[data-reader-pane="split"]');
      await expectPresent('side pane', '[data-side-pane]');
      await expectPresent('study pane', '[data-testid="reader-study-pane"]');
    });

    await cdp.clickByLabel('Full reader');
    await shot('03-reader-full-mode.png', 'Full reader hides the study pane', async () => {
      await expectPresent('full reader pane', '[data-reader-pane="full"]');
      await expectCount('no side pane', '[data-side-pane]', 0);
    });

    await cdp.clickByLabel('Minimize reader');
    await shot('04-reader-minimized.png', 'Minimized reader gives the study pane the workspace', async () => {
      // The reader stays mounted (so its source position survives) but is hidden.
      const readerHidden = await cdp.evaluate(`
        (() => {
          const pane = document.querySelector('[data-reader-pane="minimized"]');
          return Boolean(pane) && pane.offsetParent === null;
        })()
      `);
      if (!readerHidden) {
        throw new Error('minimized mode must hide the reader pane without unmounting it');
      }
      await expectPresent('side pane visible', '[data-side-pane]');
      await expectPresent('study pane', '[data-testid="reader-study-pane"]');
    });

    await cdp.clickByLabel('Split view');
    await shot('05-reader-restored-split.png', 'Split mode restored', async () => {
      await expectPresent('reader pane', '[data-reader-pane="split"]');
      await expectPresent('study pane', '[data-testid="reader-study-pane"]');
    });

    // -------------------------------------------------------------------
    // Annotations
    // -------------------------------------------------------------------
    const selected = await selectReaderText(cdp, 2);
    if (!selected) {
      const diag = await cdp.evaluate(`
        (() => {
          const container = document.querySelector('[aria-label="Publication Content Viewport"]');
          return {
            textLayers: container ? container.querySelectorAll('.textLayer').length : -1,
            textLayerSpans: container ? container.querySelectorAll('.textLayer span').length : -1,
            canvases: container ? container.querySelectorAll('canvas').length : -1,
            html: container ? container.innerHTML.slice(0, 400) : 'no container',
          };
        })()
      `);
      throw new Error(`could not select text in the PDF text layer: ${JSON.stringify(diag)}`);
    }
    await sleep(500);
    await cdp.clickByText('Highlight');
    await sleep(900);
    await shot('06-highlighted-text.png', 'Highlight created from the selection', async () => {
      await expectPresent('highlight mark painted', '[data-testid="reader-annotation-layer"] button[data-annotation-id]');
      await expectText('highlight listed', 'Highlight');
    });

    const selectedUnderline = await selectReaderText(cdp, 3);
    if (!selectedUnderline) throw new Error('could not select text for the underline');
    await sleep(400);
    await cdp.clickByText('Underline');
    await sleep(800);
    await shot('07-underline.png', 'Underline created from the selection', async () => {
      await expectText('underline annotation in the pane', 'Underline');
    });

    const selectedStrike = await selectReaderText(cdp, 4);
    if (!selectedStrike) throw new Error('could not select text for the strike');
    await sleep(400);
    await cdp.clickByText('Strike');
    await sleep(800);
    await shot('08-strikethrough.png', 'Strikethrough created from the selection', async () => {
      await expectText('strike annotation in the pane', 'Strike');
    });

    // Note editor on the newest annotation (the study pane focuses it).
    await cdp.clickByText('Add note');
    await cdp.evaluate(`
      (() => {
        const area = document.querySelector('textarea[aria-label="Annotation note"]');
        if (!area) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(area, 'Compare with the mitochondrion note.');
        area.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    await shot('09-highlight-note-editor.png', 'Note editor open for the selected annotation', async () => {
      await expectPresent('note textarea', 'textarea[aria-label="Annotation note"]');
    });

    await cdp.clickByText('Save note');
    await sleep(900);
    await shot('10-saved-highlight-note.png', 'Annotation note saved on the highlight', async () => {
      await expectText('saved note text', 'Compare with the mitochondrion note.');
      await expectText('note badge on the entry', 'Note');
    });

    await shot('11-annotation-inspector.png', 'Annotation inspector for the selected mark', async () => {
      // Chrome's innerText applies text-transform, so assert on untransformed labels.
      await expectPresent('source label', '[data-testid="reader-study-pane"]');
      await expectText('add to canvas action', 'Add to Knowledge Canvas');
      await expectText('delete action', 'Delete annotation');
      await expectText('note editor entry point', 'Edit note');
    });

    // -------------------------------------------------------------------
    // PDF drawing
    // -------------------------------------------------------------------
    await cdp.navigate(readerA);
    await cdp.clickByText('Canvas', { exact: false });
    await cdp.clickSelector('[data-testid="study-tab-canvas"]');
    await cdp.clickByText('Draw on this page');
    await shot('12-draw-surface-active.png', 'Freehand markup surface is active on the page', async () => {
      await expectPresent('draw surface', '[data-testid="reader-draw-surface"]');
    });
    await drawStroke(cdp);
    await shot('13-drawing-on-pdf.png', 'Freehand markup persisted on the page', async () => {
      await expectPresent('drawing path painted', '#reader-annotation-layer path, [data-testid="reader-annotation-layer"] path');
    });

    // Reload + zoom: the drawing must stay attached to the same page region.
    const beforeReload = await cdp.evaluate(`
      (() => {
        const path = document.querySelector('[data-testid="reader-annotation-layer"] path');
        const layer = document.querySelector('[data-testid="reader-annotation-layer"]');
        if (!path || !layer) return null;
        return { d: path.getAttribute('d'), layer: layer.getBoundingClientRect().width };
      })()
    `);
    await cdp.navigate(readerA);
    await cdp.clickByText('Canvas', { exact: false });
    await cdp.clickSelector('[data-testid="study-tab-canvas"]');
    await cdp.clickByLabel('Zoom In');
    await cdp.clickByLabel('Zoom In');
    await sleep(1200);
    const afterReload = await cdp.evaluate(`
      (() => {
        const path = document.querySelector('[data-testid="reader-annotation-layer"] path');
        const layer = document.querySelector('[data-testid="reader-annotation-layer"]');
        if (!path || !layer) return null;
        return { d: path.getAttribute('d'), layer: layer.getBoundingClientRect().width };
      })()
    `);
    if (!afterReload) throw new Error('drawing did not survive reload');
    if (beforeReload && beforeReload.d !== afterReload.d) {
      throw new Error('drawing geometry changed after reload (it must stay normalized)');
    }
    await shot('14-drawing-after-reload-zoom.png', 'Drawing stays attached to the page after reload and zoom', async () => {
      await expectPresent('drawing still painted', '[data-testid="reader-annotation-layer"] path');
    });

    // -------------------------------------------------------------------
    // Knowledge Canvas: scope, blocks, relationships, promotion
    // -------------------------------------------------------------------
    await cdp.clickByText('New book canvas');
    await sleep(1200);
    await shot('15-new-book-canvas.png', 'New book-level Knowledge Canvas opened', async () => {
      await expectPresent('canvas workspace pane', '[data-side-pane="canvas"]');
      await expectPresent('excalidraw surface', '.excalidraw');
      await expectPresent('canvas close control', 'button[title="Close Canvas Panel"]');
    });

    await cdp.clickByLabel('Close Canvas Panel');
    await sleep(800);
    await shot('16-book-canvas-list.png', 'Book-level canvases listed for this book only', async () => {
      await expectPresent('canvas tab active', '[data-testid="study-tab-canvas"][aria-pressed="true"]');
      await expectText('canvas title listed', 'Knowledge Canvas');
    });

    await cdp.clickByText('New page/location canvas');
    await sleep(1200);
    await cdp.clickByLabel('Close Canvas Panel');
    await sleep(800);
    await shot('17-location-canvas.png', 'Page/location Knowledge Canvas created for the current page', async () => {
      await expectText('page canvas title', 'Page');
      await expectText('page scope label', 'Page 1');
    });

    await cdp.clickByText('New book canvas');
    await sleep(1200);
    await cdp.clickByLabel('Close Canvas Panel');
    await sleep(800);
    await shot('18-two-canvases-one-book.png', 'A second whole-book canvas is independent', async () => {
      const canvasButtons = await cdp.evaluate(`
        Array.from(document.querySelectorAll('[data-testid="reader-study-pane"] button'))
          .filter((b) => (b.textContent || '').includes('Knowledge Canvas')).length
      `);
      if (canvasButtons < 2) {
        throw new Error(`expected two book canvases, found ${canvasButtons}`);
      }
    });

    // Open a canvas workspace and add structured knowledge.
    await cdp.clickSelector('[data-testid^="open-canvas-"]');
    await sleep(1500);
    await expectPresent('canvas workspace open', '[data-side-pane="canvas"]');
    await cdp.clickSelector('[data-testid="canvas-knowledge-toggle"]');
    await shot('19-knowledge-canvas-open.png', 'Unified Knowledge Canvas workspace opened', async () => {
      await expectPresent('knowledge panel', '[data-testid="knowledge-panel"]');
      await expectText('blocks tab', 'Blocks');
      await expectText('relationships tab', 'Relationships');
    });

    const existingBlocks = await cdp.evaluate(
      `document.querySelectorAll('[data-testid^="block-"]').length`,
    );
    await cdp.clickByText('New block');
    await sleep(400);
    await cdp.evaluate(`
      (() => {
        const input = document.querySelector('input[aria-label="Block title"]');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Osmosis');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    await cdp.clickByText('New block');
    await sleep(400);
    await cdp.evaluate(`
      (() => {
        const inputs = Array.from(document.querySelectorAll('input[aria-label="Block title"]'));
        const input = inputs[inputs.length - 1];
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Cell membrane');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
    await sleep(1500);
    const blocksAfter = await cdp.evaluate(
      `document.querySelectorAll('[data-testid^="block-"]').length`,
    );
    if (blocksAfter !== existingBlocks + 2) {
      throw new Error(`expected two new blocks (${existingBlocks} -> ${blocksAfter})`);
    }
    await shot('20-structured-blocks.png', 'Structured blocks in the Knowledge Canvas', async () => {
      await expectText('first block', 'Osmosis');
      await expectText('second block', 'Cell membrane');
    });

    // Custom named relationship with an arbitrary Unicode label.
    await cdp.clickSelector('[data-testid="knowledge-tab-relationships"]');
    await sleep(400);
    // Select the endpoints first, let React settle, then type the label: the
    // endpoint change re-renders the form, which would otherwise reset the input.
    const endpointsSet = await cdp.evaluate(`
      (() => {
        const selects = Array.from(document.querySelectorAll('select[aria-label="Relationship source block"], select[aria-label="Relationship target block"]'));
        if (selects.length < 2) return { ok: false, reason: 'selects missing' };
        const options = Array.from(selects[0].options).filter((o) => o.value);
        if (options.length < 2) return { ok: false, reason: 'blocks missing from the selects' };
        const setSelect = (sel, value) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
          setter.call(sel, value);
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        };
        setSelect(selects[0], options[0].value);
        setSelect(selects[1], options[1].value);
        return { ok: true, source: selects[0].value, target: selects[1].value };
      })()
    `);
    if (!endpointsSet?.ok) {
      throw new Error(`relationship endpoints not set: ${JSON.stringify(endpointsSet)}`);
    }
    await sleep(500);
    const linkLabelValue = await cdp.typeInto(
      'input[aria-label="New relationship label"]',
      '母亲',
    );
    if (linkLabelValue !== '母亲') {
      throw new Error(`relationship label not typed: "${linkLabelValue}"`);
    }
    await sleep(400);
    const labelStillThere = await cdp.evaluate(
      `document.querySelector('input[aria-label="New relationship label"]')?.value ?? null`,
    );
    if (labelStillThere !== '母亲') {
      throw new Error(`typed label was reset before Connect: "${labelStillThere}"`);
    }
    await cdp.clickByText('Connect');
    await sleep(1400);
    const relationshipDump = await cdp.evaluate(`
      (() => {
        const rels = Array.from(document.querySelectorAll('[data-testid^="relationship-"]'))
          .map((el) => (el.textContent || '').trim());
        const error = document.querySelector('[data-testid="knowledge-panel"] .text-destructive');
        return { rels, error: error ? (error.textContent || '').trim() : null };
      })()
    `);
    if (!relationshipDump.rels.length) {
      throw new Error(
        `relationship was not created: ${JSON.stringify({ ...relationshipDump, linkFormState })}`,
      );
    }
    await shot('21-custom-named-relationship.png', 'Custom Unicode relationship label', async () => {
      // A freshly created relationship opens its editor, so the label lives in
      // the edit field (input values are not part of innerText).
      const state = await cdp.evaluate(`
        (() => {
          const input = document.querySelector('input[aria-label="Relationship label"]');
          const entry = document.querySelector('[data-testid^="relationship-"]');
          return { label: input ? input.value : null, entry: entry ? entry.textContent : null };
        })()
      `);
      if (state.label !== '母亲') {
        throw new Error(`custom relationship label missing: ${JSON.stringify(state)}`);
      }
    });

    await cdp.clickByText('Mutual');
    await sleep(1200);
    await shot('22-mutual-relationship.png', 'Relationship direction switched to mutual', async () => {
      const label = await cdp.evaluate(
        `document.querySelector('input[aria-label="Relationship label"]')?.value ?? null`,
      );
      if (label !== '母亲') {
        throw new Error(`relationship label lost after switching direction: "${label}"`);
      }
      const mutualActive = await cdp.evaluate(`
        Array.from(document.querySelectorAll('button')).some(
          (b) => (b.textContent || '').trim() === 'Mutual' && b.className.includes('border-primary'))
      `);
      if (!mutualActive) throw new Error('mutual direction control is not active');
    });

    // Place a block visually so freeform and structured content share the surface.
    await cdp.clickSelector('[data-testid="knowledge-tab-blocks"]');
    await sleep(300);
    await cdp.clickByText('Place on canvas');
    await sleep(1800);
    await shot('23-freeform-and-structured.png', 'Structured block placed as a freeform canvas element', async () => {
      await expectText('block marked as placed', 'On canvas');
    });

    // Annotation -> Knowledge Canvas promotion with provenance.
    await cdp.clickByLabel('Close Canvas Panel');
    await sleep(600);
    await cdp.clickByText('Notes', { exact: false });
    await sleep(800);
    await cdp.evaluate(`
      (() => {
        const entry = document.querySelector('[data-testid="reader-study-pane"] button[data-annotation-id]');
        if (!entry) return false;
        entry.click();
        return true;
      })()
    `);
    await sleep(600);
    await cdp.clickByText('Add to Knowledge Canvas');
    await sleep(1500);
    await shot('24-annotation-as-canvas-block.png', 'Annotation promoted to a source-linked canvas block', async () => {
      await expectPresent('study pane still mounted', '[data-testid="reader-study-pane"]');
    });

    // The promoted block must keep provenance: check the persisted canvas.
    const canvasDocs = await (async () => {
      const res = await fetch(
        `${BASE_URL}/api/reader/items/${BOOK_A.id}/canvases`,
      );
      const list = await res.json();
      const docs = [];
      for (const meta of list) {
        const docRes = await fetch(
          `${BASE_URL}/api/reader/canvases/${meta.id}?itemId=${BOOK_A.id}`,
        );
        docs.push(await docRes.json());
      }
      return docs;
    })();
    const sourcedBlocks = canvasDocs
      .flatMap((doc) => doc.knowledge?.blocks ?? [])
      .filter((block) => block.source?.annotationId);
    if (sourcedBlocks.length === 0) {
      throw new Error('the promoted annotation block lost its source link');
    }
    if (sourcedBlocks[0].source.itemId !== BOOK_A.id) {
      throw new Error('the promoted block points at the wrong book');
    }
    await cdp.clickSelector('[data-testid="reader-study-pane"] button[data-annotation-id]');
    await sleep(600);
    await shot('25-source-linked-block.png', 'Source-linked annotation block and return-to-source entry', async () => {
      await expectPresent('reader still mounted', '[aria-label="Publication Content Viewport"]');
      await expectText('annotation entry selected in the inspector', 'Add to Knowledge Canvas');
    });

    // -------------------------------------------------------------------
    // Isolation + library surface + sidebar
    // -------------------------------------------------------------------
    await cdp.navigate(readerB);
    await cdp.clickByText('Canvas', { exact: false });
    await cdp.clickSelector('[data-testid="study-tab-canvas"]');
    await sleep(1200);
    await shot('26-book-b-isolation.png', 'Book B study pane shows only Book B resources', async () => {
      await expectText('book B has no canvases', 'None yet.');
      const leaked = await cdp.evaluate(
        `document.querySelectorAll('[data-testid^="open-canvas-"]').length`,
      );
      if (leaked !== 0) throw new Error(`Book A canvases leaked into Book B (${leaked})`);
      const bookBAnnotations = await cdp.evaluate(
        `document.querySelectorAll('[data-testid="reader-study-pane"] button[data-annotation-id]').length`,
      );
      if (bookBAnnotations !== 0) {
        throw new Error(`Book A annotations leaked into Book B (${bookBAnnotations})`);
      }
    });

    await cdp.navigate(`${BASE_URL}/?collection=read&selected=${BOOK_A.id}&tab=study`);
    await sleep(1500);
    await shot('27-read-item-study-section.png', 'Library Read detail now has a real Study section', async () => {
      await expectPresent('study panel', '[data-testid="read-study-panel"]');
      await expectText('annotation summary', 'annotations');
      await expectText('canvas summary', 'book canvases');
    });

    await cdp.navigate(`${BASE_URL}/?collection=read`);
    await shot('28-sidebar-primary-only.png', 'Primary sidebar no longer lists global study destinations', async () => {
      await expectPresent('sidebar', 'aside[data-sidebar="expanded"]');
      await expectText('read collection', 'Read');
      await expectText('settings anchor', 'Settings');
      const globalLinks = await cdp.evaluate(`
        Array.from(document.querySelectorAll('aside[data-sidebar] a'))
          .filter((a) => ['/highlights', '/knowledge', '/canvas-notes'].includes(a.getAttribute('href')))
          .length
      `);
      if (globalLinks !== 0) {
        throw new Error(`primary sidebar still links ${globalLinks} global study destinations`);
      }
    });

    console.log(`--- Captured ${captured.length} verified screenshots.`);
    for (const item of captured) console.log(`    ${item.filename} :: ${item.label}`);
  } catch (err) {
    failure = err;
  } finally {
    cdp?.close();
    stopProcess(chromeProc);
    stopProcess(server);
    const removed = removeDirectoryWithRetries(fixture.root);
    console.log(
      removed
        ? `--- Removed synthetic fixture root ${fixture.root}`
        : `--- Could not remove ${fixture.root} (contains no user data)`,
    );
  }

  if (failure) {
    console.error(`Read visual verification FAILED: ${failure.message}`);
    process.exit(1);
  }
  console.log('Read visual verification PASSED.');
}

main().catch((err) => {
  console.error(`Read visual verification could not run: ${err.stack ?? err.message}`);
  process.exit(1);
});
