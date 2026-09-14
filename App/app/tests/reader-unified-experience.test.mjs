/**
 * Phase 07: Unified Reader Experience Test Suite
 *
 * Tests:
 * 1. Bounded Reader History (push, deduplicate, back, forward, truncation, bounds).
 * 2. Canonical Bookmark Model (creation, validation, serialization, deduplication).
 * 3. Reader Preferences (defaults, validation, clamping, fallback).
 * 4. ReaderSession Integration (history tracking, metrics sync, bookmarks, preferences, capabilities).
 * 5. Cross-Format Parity (FakePdfAdapter vs FakeReflowableAdapter through identical session contracts).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ReaderHistory,
  createBookmark,
  validateBookmark,
  DEFAULT_READER_PREFERENCES,
  validateReaderPreferences,
  ReaderSession,
  createPageLocation,
  createProgressionLocation,
  createSemanticLocation,
  areDocumentLocationsEqual,
  DocumentAdapterRegistry,
  FakePdfAdapter,
  FakeReflowableAdapter,
} from '../lib/document/index.ts';

const SAMPLE_HASH = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function createTestSession() {
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

test('ReaderHistory manages bounded navigation stack with deduplication and forward truncation', () => {
  const history = new ReaderHistory(5); // Small limit for testing

  assert.equal(history.canGoBack, false);
  assert.equal(history.canGoForward, false);
  assert.equal(history.current, null);

  const loc1 = createPageLocation(SAMPLE_HASH, 1);
  const loc2 = createPageLocation(SAMPLE_HASH, 2);
  const loc3 = createPageLocation(SAMPLE_HASH, 3);

  // Push loc1
  history.push(loc1);
  assert.equal(history.size, 1);
  assert.deepEqual(history.current, loc1);
  assert.equal(history.canGoBack, false);
  assert.equal(history.canGoForward, false);

  // Deduplication: pushing the same location consecutively should not add entry
  history.push(createPageLocation(SAMPLE_HASH, 1));
  assert.equal(history.size, 1);

  // Push loc2 and loc3
  history.push(loc2);
  history.push(loc3);
  assert.equal(history.size, 3);
  assert.equal(history.canGoBack, true);
  assert.equal(history.canGoForward, false);
  assert.deepEqual(history.current, loc3);

  // Back to loc2
  const backLoc = history.back();
  assert.deepEqual(backLoc, loc2);
  assert.equal(history.canGoBack, true);
  assert.equal(history.canGoForward, true);
  assert.deepEqual(history.current, loc2);

  // Back to loc1
  assert.deepEqual(history.back(), loc1);
  assert.equal(history.canGoBack, false);
  assert.equal(history.canGoForward, true);

  // Attempt to go back past start
  assert.equal(history.back(), null);
  assert.deepEqual(history.current, loc1);

  // Forward to loc2
  assert.deepEqual(history.forward(), loc2);
  assert.equal(history.canGoBack, true);
  assert.equal(history.canGoForward, true);

  // Forward truncation: pushing new location when forward history exists
  const loc4 = createPageLocation(SAMPLE_HASH, 4);
  history.push(loc4);
  assert.equal(history.canGoForward, false); // loc3 was truncated!
  assert.deepEqual(history.current, loc4);
  assert.equal(history.size, 3); // loc1, loc2, loc4

  // Bounded capacity enforcement
  const loc5 = createPageLocation(SAMPLE_HASH, 5);
  const loc6 = createPageLocation(SAMPLE_HASH, 6);
  const loc7 = createPageLocation(SAMPLE_HASH, 7);
  history.push(loc5);
  history.push(loc6);
  history.push(loc7); // Exceeds max 5 entries, oldest should be evicted
  assert.equal(history.size, 5);
  assert.deepEqual(history.current, loc7);
});

test('Bookmark model creates, validates, and serializes canonical bookmarks', () => {
  const loc = createPageLocation(SAMPLE_HASH, 42);
  const bookmark = createBookmark('sample-item-1', loc, { label: 'Chapter IV: The Discovery' });

  assert.equal(typeof bookmark.id, 'string');
  assert.equal(bookmark.label, 'Chapter IV: The Discovery');
  assert.deepEqual(bookmark.location, loc);
  assert.equal(typeof bookmark.createdAt, 'string');

  const validated = validateBookmark(bookmark);
  assert.equal(validated.id, bookmark.id);
  assert.equal(validated.label, 'Chapter IV: The Discovery');

  // Rejection of invalid bookmarks
  assert.throws(() => validateBookmark(null));
  assert.throws(() => validateBookmark({}));
  assert.throws(() => validateBookmark({ id: 'bad', location: loc }));
  assert.throws(() => validateBookmark({ ...bookmark, location: { type: 'invalid' } }));
});

test('Reader preferences validate, clamp ranges, and supply safe defaults', () => {
  assert.equal(DEFAULT_READER_PREFERENCES.theme, 'light');
  assert.equal(DEFAULT_READER_PREFERENCES.fontSize, 16);
  assert.equal(DEFAULT_READER_PREFERENCES.lineHeight, 1.6);
  assert.equal(DEFAULT_READER_PREFERENCES.contentWidth, 'normal');
  assert.equal(DEFAULT_READER_PREFERENCES.layoutMode, 'paginated');

  // Valid partial preferences merge with defaults
  const valid = validateReaderPreferences({
    theme: 'warm',
    fontSize: 22,
    lineHeight: 1.8,
    fontFamily: 'sans',
  });
  assert.equal(valid.theme, 'warm');
  assert.equal(valid.fontSize, 22);
  assert.equal(valid.lineHeight, 1.8);
  assert.equal(valid.fontFamily, 'sans');
  assert.equal(valid.contentWidth, 'normal'); // Default preserved

  // Clamping of out-of-range numeric preferences
  const clamped = validateReaderPreferences({
    fontSize: 100, // max is 28
    lineHeight: 0.5, // min is 1.2
  });
  assert.equal(clamped.fontSize, 28);
  assert.equal(clamped.lineHeight, 1.2);

  // Fallback for unrecognized values
  const fallback = validateReaderPreferences({
    theme: 'neon-purple',
    fontFamily: 'comic-sans',
    contentWidth: 'ultra-wide',
    layoutMode: 'vr-spiral',
  });
  assert.equal(fallback.theme, 'light');
  assert.equal(fallback.fontFamily, 'serif');
  assert.equal(fallback.contentWidth, 'normal');
  assert.equal(fallback.layoutMode, 'paginated');
});

test('ReaderSession Phase 07 features: history, metrics sync, bookmarks, and preferences', async () => {
  const session = createTestSession();

  const source = {
    itemId: 'sample-item-1',
    formatId: 'media-0',
    format: 'pdf',
    sourceHash: SAMPLE_HASH,
    title: 'document.pdf',
  };

  await session.open(source);

  const initialSnap = session.getSnapshot();
  assert.equal(initialSnap.currentPage, 1);
  assert.equal(initialSnap.totalPages, 50);
  assert.equal(initialSnap.canGoBack, false);
  assert.equal(initialSnap.canGoForward, false);

  // Navigate forward to page 2
  await session.next();
  const snapPage2 = session.getSnapshot();
  assert.equal(snapPage2.currentPage, 2);
  assert.equal(snapPage2.canGoBack, true);
  assert.equal(snapPage2.canGoForward, false);

  // Navigate to page 5
  await session.goTo(createPageLocation(SAMPLE_HASH, 5));
  const snapPage5 = session.getSnapshot();
  assert.equal(snapPage5.currentPage, 5);
  assert.equal(snapPage5.readingProgress, 0.1);

  // Bounded History Back
  await session.goBack();
  const snapAfterBack = session.getSnapshot();
  assert.equal(snapAfterBack.currentPage, 2);
  assert.equal(snapAfterBack.canGoForward, true);

  // Bounded History Forward
  await session.goForward();
  const snapAfterForward = session.getSnapshot();
  assert.equal(snapAfterForward.currentPage, 5);

  // Bookmarks management
  assert.equal(session.getSnapshot().bookmarks.length, 0);
  const bm1 = createBookmark('sample-item-1', snapAfterForward.currentLocation, {
    label: 'Page 5 Milestone',
  });
  session.addBookmark(bm1);
  assert.equal(session.getSnapshot().bookmarks.length, 1);
  assert.equal(session.getSnapshot().bookmarks[0].label, 'Page 5 Milestone');

  // Remove bookmark
  session.removeBookmark(bm1.id);
  assert.equal(session.getSnapshot().bookmarks.length, 0);

  // Preferences updates
  session.setTheme('dark');
  assert.equal(session.getSnapshot().preferences.theme, 'dark');

  session.setFontSize(20);
  assert.equal(session.getSnapshot().preferences.fontSize, 20);

  session.setLayoutMode('scrolled');
  assert.equal(session.getSnapshot().preferences.layoutMode, 'scrolled');

  // Zoom controls (PDF capability)
  assert.equal(session.getSnapshot().capabilities.has('zoom'), true);
  session.setZoom(1.5);
  assert.equal(session.getSnapshot().zoom, 1.5);

  session.zoomIn();
  assert.equal(session.getSnapshot().zoom, 1.75);

  session.zoomOut();
  assert.equal(session.getSnapshot().zoom, 1.5);

  // Rotation controls (available when canZoom / fixed-layout)
  assert.equal(session.canZoom, true);
  assert.equal(session.getSnapshot().rotation, 0);
  session.rotate();
  assert.equal(session.getSnapshot().rotation, 90);
  session.rotate();
  assert.equal(session.getSnapshot().rotation, 180);

  await session.close();
});

test('Cross-format parity: identical ReaderSession lifecycle for PDF and Reflowable adapters', async () => {
  const pdfSession = createTestSession();
  const reflowSession = createTestSession();

  const pdfSource = {
    itemId: 'pdf-item',
    formatId: 'media-0',
    format: 'pdf',
    sourceHash: SAMPLE_HASH,
    title: 'document.pdf',
  };

  const reflowSource = {
    itemId: 'epub-item',
    formatId: 'media-1',
    format: 'epub',
    sourceHash: SAMPLE_HASH,
    title: 'novel.epub',
  };

  await pdfSession.open(pdfSource);
  await reflowSession.open(reflowSource);

  // Both have truth-derived capabilities without format branching
  assert.equal(pdfSession.getSnapshot().capabilities.has('zoom'), true);
  assert.equal(pdfSession.getSnapshot().capabilities.has('fontControls'), false);

  assert.equal(reflowSession.getSnapshot().capabilities.has('zoom'), false);
  assert.equal(reflowSession.getSnapshot().capabilities.has('fontControls'), true);

  // Both support next/prev navigation
  await pdfSession.next();
  await reflowSession.next();
  assert.equal(pdfSession.getSnapshot().canGoBack, true);
  assert.equal(reflowSession.getSnapshot().canGoBack, true);

  // Both support TOC search and jump
  assert.ok(pdfSession.getSnapshot().toc.length > 0);
  assert.ok(reflowSession.getSnapshot().toc.length > 0);

  // Both support bookmarking at current location
  const pdfBm = createBookmark(pdfSource.itemId, pdfSession.getSnapshot().currentLocation, {
    label: 'PDF Mark',
  });
  const reflowBm = createBookmark(reflowSource.itemId, reflowSession.getSnapshot().currentLocation, {
    label: 'EPUB Mark',
  });
  pdfSession.addBookmark(pdfBm);
  reflowSession.addBookmark(reflowBm);
  assert.equal(pdfSession.getSnapshot().bookmarks.length, 1);
  assert.equal(reflowSession.getSnapshot().bookmarks.length, 1);

  await pdfSession.close();
  await reflowSession.close();
});
