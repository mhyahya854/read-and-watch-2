import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DocumentError,
  DocumentAdapterRegistry,
  ReaderSession,
  FakePdfAdapter,
  FakeReflowableAdapter,
} from '../lib/document/index.ts';

function createConfiguredSession() {
  const registry = new DocumentAdapterRegistry();
  registry.register({
    format: 'pdf',
    family: 'pdf',
    factory: () => new FakePdfAdapter(),
  });
  registry.register({
    format: 'epub',
    family: 'reflowable',
    factory: () => new FakeReflowableAdapter(),
  });

  return new ReaderSession(registry);
}

const PDF_SOURCE = {
  itemId: 'item-pdf-1',
  formatId: 'media-0',
  format: 'pdf',
  sourceHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  title: 'Engineering Mechanics.pdf',
};

const EPUB_SOURCE = {
  itemId: 'item-epub-1',
  formatId: 'media-1',
  format: 'epub',
  sourceHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  title: 'Clean Architecture.epub',
};

test('ReaderSession derives UI feature flags from adapter capabilities, not file format', async () => {
  const session = createConfiguredSession();

  // Initially closed
  assert.equal(session.isOpen, false);
  assert.equal(session.canZoom, false);
  assert.equal(session.canSearch, false);

  // 1. Open PDF source
  await session.open(PDF_SOURCE);
  assert.equal(session.isOpen, true);
  assert.equal(session.canZoom, true, 'PDF adapter supports zoom');
  assert.equal(session.canAdjustFont, false, 'PDF adapter does NOT support font adjustment');
  assert.equal(session.canAdjustTheme, false, 'PDF adapter does NOT support theme controls');
  assert.equal(session.canPageNavigate, true, 'PDF adapter supports page navigation');
  assert.equal(session.canContinuousScroll, false, 'PDF adapter does NOT support continuous layout');
  assert.equal(session.canSearch, true, 'PDF adapter supports text search');
  assert.equal(session.hasToc, true, 'PDF adapter provides TOC');
  assert.equal(session.canAnchorText, true, 'PDF adapter supports text anchors');

  // Verify location is page-based
  assert.equal(session.location?.kind, 'page');

  // 2. Switch to EPUB source
  await session.open(EPUB_SOURCE);
  assert.equal(session.isOpen, true);
  assert.equal(session.canZoom, false, 'Reflowable adapter does NOT support zoom');
  assert.equal(session.canAdjustFont, true, 'Reflowable adapter supports font adjustment');
  assert.equal(session.canAdjustTheme, true, 'Reflowable adapter supports theme controls');
  assert.equal(session.canPageNavigate, false, 'Reflowable adapter does NOT use fixed page navigation');
  assert.equal(session.canContinuousScroll, true, 'Reflowable adapter supports continuous scroll');
  assert.equal(session.canSearch, true, 'Reflowable adapter supports text search');
  assert.equal(session.hasToc, true, 'Reflowable adapter provides TOC');

  // Verify location is semantic
  assert.equal(session.location?.kind, 'semantic');

  await session.close();
  assert.equal(session.isOpen, false);
});

test('ReaderSession supports navigation, search, selection, and anchor round-trip', async () => {
  const session = createConfiguredSession();
  await session.open(PDF_SOURCE);

  // Navigation
  const toc = session.toc;
  assert.ok(toc.length > 1);
  const chapter1 = toc[1];
  await session.goTo(chapter1.targetLocation);
  assert.equal(session.location?.payload?.pageNumber, 5);

  // Search
  const results = await session.search('Chapter');
  assert.ok(results.length > 0);
  assert.equal(results[0].location.kind, 'page');

  // Selection & Anchoring
  const anchor = await session.createAnchorFromSelection();
  assert.ok(anchor);
  assert.equal(anchor.kind, 'pdf-geometry');

  // Resolve anchor
  const resolved = await session.resolveAnchor(anchor);
  assert.equal(resolved.status, 'exact');
  assert.equal(resolved.confidence, 1.0);

  await session.close();
});

test('ReaderSession manages state subscriptions and notifies on state transitions', async () => {
  const session = createConfiguredSession();
  const states = [];

  const unsubscribe = session.subscribe((snap) => {
    states.push({ isOpen: snap.isOpen, isLoading: snap.isLoading });
  });

  await session.open(EPUB_SOURCE);
  await session.close();
  unsubscribe();

  // Verify transitions were captured
  assert.ok(states.length >= 3);
  // Initial state was closed, not loading
  assert.equal(states[0].isOpen, false);
  // Transitioned to open
  assert.ok(states.some((s) => s.isOpen === true));
  // Ended closed
  assert.equal(states[states.length - 1].isOpen, false);
});

test('ReaderSession rejects operations when closed or cancelled', async () => {
  const session = createConfiguredSession();

  // Navigation while closed throws ADAPTER_CLOSED
  await assert.rejects(
    () => session.goTo({ schemaVersion: 1, kind: 'page', sourceHash: 'h', payload: {} }),
    (err) => DocumentError.isDocumentError(err) && err.code === 'ADAPTER_CLOSED'
  );

  // Cancellation during open
  const abortCtrl = new AbortController();
  abortCtrl.abort();
  await assert.rejects(
    () => session.open(PDF_SOURCE, abortCtrl.signal),
    (err) => DocumentError.isDocumentError(err) && err.code === 'CANCELLED'
  );
  assert.equal(session.isOpen, false);
});
