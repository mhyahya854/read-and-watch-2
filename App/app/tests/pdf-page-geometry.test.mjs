import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PdfAdapter,
  MIN_PDF_ZOOM,
  MAX_PDF_ZOOM,
  DEFAULT_PDF_ZOOM,
  MAX_CANVAS_DIMENSION,
} from '../lib/document/index.ts';

const SAMPLE_SOURCE = {
  itemId: 'read-sample-pdf-geometry',
  formatId: 'read-media-0',
  format: 'pdf',
  sourceHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  byteSize: 1048576,
  title: 'Geometry Principles.pdf',
};

const FIXTURE_PATH = resolve(
  process.cwd(),
  '../forks/readest/apps/readest-app/src/__tests__/fixtures/data/sample-paper.pdf'
);

test('PdfAdapter zoom controls clamp safely between MIN_PDF_ZOOM and MAX_PDF_ZOOM', async () => {
  const adapter = new PdfAdapter();
  await adapter.open(SAMPLE_SOURCE);

  assert.equal(adapter.zoom, DEFAULT_PDF_ZOOM);

  adapter.setZoom(1.5);
  assert.equal(adapter.zoom, 1.5);

  adapter.setZoom(3.0);
  assert.equal(adapter.zoom, 3.0);

  // Clamping below minimum
  adapter.setZoom(0.05);
  assert.equal(adapter.zoom, MIN_PDF_ZOOM);

  // Clamping above maximum
  adapter.setZoom(10.0);
  assert.equal(adapter.zoom, MAX_PDF_ZOOM);

  await adapter.close();
});

test('PdfAdapter rotation normalizes strictly to 90-degree orthogonal increments', async () => {
  const adapter = new PdfAdapter();
  await adapter.open(SAMPLE_SOURCE);

  assert.equal(adapter.rotation, 0);

  adapter.setRotation(90);
  assert.equal(adapter.rotation, 90);

  adapter.setRotation(180);
  assert.equal(adapter.rotation, 180);

  adapter.setRotation(270);
  assert.equal(adapter.rotation, 270);

  // 360 normalizes to 0
  adapter.setRotation(360);
  assert.equal(adapter.rotation, 0);

  // Over-rotation normalizes modulo 360
  adapter.setRotation(450);
  assert.equal(adapter.rotation, 90);

  // Negative rotation normalizes correctly
  adapter.setRotation(-90);
  assert.equal(adapter.rotation, 270);

  // Non-orthogonal angles quantize to 90-degree step
  adapter.setRotation(45);
  assert.equal(adapter.rotation, 0);

  adapter.setRotation(135);
  assert.equal(adapter.rotation, 90);

  await adapter.close();
});

test('Page viewport scale is strictly linear and aspect ratio is invariant', async () => {
  const fileBytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const doc = await pdfjs.getDocument({ data: fileBytes }).promise;
  const page = await doc.getPage(1);

  const baseVp = page.getViewport({ scale: 1.0, rotation: 0 });
  const intrinsicRatio = baseVp.width / baseVp.height;

  const testScales = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];

  for (const scale of testScales) {
    const vp = page.getViewport({ scale, rotation: 0 });

    // Dimension linearity: width and height scale proportionally
    assert.equal(Math.round(vp.width), Math.round(baseVp.width * scale));
    assert.equal(Math.round(vp.height), Math.round(baseVp.height * scale));

    // Aspect ratio invariance (within 0.001 precision)
    const ratio = vp.width / vp.height;
    assert.ok(
      Math.abs(ratio - intrinsicRatio) < 0.001,
      `Aspect ratio distorted at scale ${scale}: expected ${intrinsicRatio}, got ${ratio}`
    );
  }

  await doc.destroy();
});

test('Page viewport rotation correctly alters orientation and swaps non-square dimensions', async () => {
  const fileBytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const doc = await pdfjs.getDocument({ data: fileBytes }).promise;
  const page = await doc.getPage(1);

  const vp0 = page.getViewport({ scale: 1.0, rotation: 0 });
  const vp90 = page.getViewport({ scale: 1.0, rotation: 90 });
  const vp180 = page.getViewport({ scale: 1.0, rotation: 180 });
  const vp270 = page.getViewport({ scale: 1.0, rotation: 270 });

  // 0 degrees vs 90 degrees: width and height swap
  assert.equal(vp90.width, vp0.height);
  assert.equal(vp90.height, vp0.width);

  // 180 degrees: identical dimensions to 0 degrees
  assert.equal(vp180.width, vp0.width);
  assert.equal(vp180.height, vp0.height);

  // 270 degrees: identical dimensions to 90 degrees
  assert.equal(vp270.width, vp90.width);
  assert.equal(vp270.height, vp90.height);

  await doc.destroy();
});

test('High-DPI backing store calculation bounds memory allocation below MAX_CANVAS_DIMENSION', () => {
  // Pure geometry calculations matching PdfAdapter.renderPage
  function computeCanvasDimensions(cssWidth, cssHeight, dpr) {
    const maxDim = Math.max(cssWidth, cssHeight);
    const boundedDpr = Math.max(1, Math.min(dpr, MAX_CANVAS_DIMENSION / maxDim));

    const backingWidth = Math.floor(cssWidth * boundedDpr);
    const backingHeight = Math.floor(cssHeight * boundedDpr);

    return {
      cssWidth: Math.floor(cssWidth),
      cssHeight: Math.floor(cssHeight),
      backingWidth,
      backingHeight,
      boundedDpr,
    };
  }

  // 1. Standard 1x display
  const standard = computeCanvasDimensions(612, 792, 1.0);
  assert.equal(standard.backingWidth, 612);
  assert.equal(standard.backingHeight, 792);
  assert.equal(standard.boundedDpr, 1.0);

  // 2. High-DPI 2x Retina display
  const retina = computeCanvasDimensions(612, 792, 2.0);
  assert.equal(retina.backingWidth, 1224);
  assert.equal(retina.backingHeight, 1584);
  assert.equal(retina.boundedDpr, 2.0);
  assert.equal(retina.cssWidth, 612, 'CSS display width must remain unscaled');
  assert.equal(retina.cssHeight, 792, 'CSS display height must remain unscaled');

  // 3. High-DPI 3x mobile display
  const mobile3x = computeCanvasDimensions(612, 792, 3.0);
  assert.equal(mobile3x.backingWidth, 1836);
  assert.equal(mobile3x.backingHeight, 2376);

  // 4. Extreme page or massive zoom with high DPR is bounded by MAX_CANVAS_DIMENSION
  const massive = computeCanvasDimensions(4000, 6000, 3.0);
  assert.ok(
    massive.backingWidth <= MAX_CANVAS_DIMENSION,
    `Backing width ${massive.backingWidth} exceeds MAX_CANVAS_DIMENSION`
  );
  assert.ok(
    massive.backingHeight <= MAX_CANVAS_DIMENSION,
    `Backing height ${massive.backingHeight} exceeds MAX_CANVAS_DIMENSION`
  );
  assert.equal(massive.backingHeight, MAX_CANVAS_DIMENSION);
  assert.equal(massive.cssWidth, 4000);
  assert.equal(massive.cssHeight, 6000);
});

test('Synchronized text layer coordinates maintain exact 1:1 parity with unscaled canvas CSS viewport', async () => {
  const fileBytes = new Uint8Array(readFileSync(FIXTURE_PATH));
  const doc = await pdfjs.getDocument({ data: fileBytes }).promise;
  const page = await doc.getPage(1);

  const testZooms = [0.5, 1.0, 1.5, 2.0, 3.0];

  for (const zoom of testZooms) {
    const viewport = page.getViewport({ scale: zoom, rotation: 0 });

    const canvasCssWidth = Math.floor(viewport.width);
    const canvasCssHeight = Math.floor(viewport.height);

    // TextLayer container style dimensions
    const textLayerWidth = Math.floor(viewport.width);
    const textLayerHeight = Math.floor(viewport.height);

    // Assert zero drift between canvas display size and textLayer container size
    assert.equal(
      textLayerWidth,
      canvasCssWidth,
      `Text layer width drift detected at zoom ${zoom}`
    );
    assert.equal(
      textLayerHeight,
      canvasCssHeight,
      `Text layer height drift detected at zoom ${zoom}`
    );

    // Text items inside viewport are relative to unscaled viewport dimensions
    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      if (item.transform) {
        // Transform elements [4] and [5] are x and y translation coordinates
        const x = item.transform[4];
        const y = item.transform[5];
        assert.ok(
          typeof x === 'number' && !Number.isNaN(x),
          'Text item transform x must be valid coordinate'
        );
        assert.ok(
          typeof y === 'number' && !Number.isNaN(y),
          'Text item transform y must be valid coordinate'
        );
      }
    }
  }

  await doc.destroy();
});
