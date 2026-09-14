import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createSettingsStore,
  validateSettings,
  DEFAULT_APP_SETTINGS,
} from '../server/settings-store.mjs';
import {
  createLibraryStore,
} from '../server/library-store.mjs';
import {
  createUserDataStore,
} from '../server/user-data-store.mjs';
import {
  createAnnotationStore,
} from '../server/annotation-store.mjs';
import {
  createReaderStore,
} from '../server/reader-store.mjs';
import {
  createCanvasStore,
} from '../server/canvas-store.mjs';
import {
  createKnowledgeStore,
} from '../server/knowledge-store.mjs';
import { DatabaseSync } from 'node:sqlite';

function createTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

test('P15-T004: settings-store validates defaults, mutations, boundaries, and recovery', async (t) => {
  const tempDir = createTempDir('rw-settings-test');
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const store = createSettingsStore({ userDataRoot: tempDir });

  // 1. Returns defaults when no settings file exists
  const initial = store.getSettings();
  assert.equal(initial.schemaVersion, 1);
  assert.equal(initial.format, 'read-watch.settings');
  assert.equal(initial.appearance.theme, 'light');
  assert.equal(initial.appearance.fontScale, 'normal');
  assert.equal(initial.reading.defaultReadingTheme, 'light');
  assert.equal(initial.reading.defaultFontSize, 16);
  assert.equal(initial.reading.defaultFontFamily, 'serif');
  assert.equal(initial.reading.defaultLineHeight, 1.6);
  assert.equal(initial.reading.defaultContentWidth, 'normal');
  assert.equal(initial.reading.defaultLayoutMode, 'paginated');
  assert.equal(initial.library.defaultCollection, 'read');
  assert.equal(initial.library.defaultSortField, 'title');
  assert.equal(initial.accessibility.reduceMotion, 'system');

  // 2. Mutate settings and verify persistence across instances
  const updated = store.saveSettings({
    appearance: { theme: 'dark', fontScale: 'compact' },
    reading: { defaultFontSize: 20, defaultFontFamily: 'sans', defaultLineHeight: 1.8 },
    library: { defaultCollection: 'watch', defaultSortField: 'rating' },
    accessibility: { reduceMotion: 'reduce', highContrastFocus: true },
  });

  assert.equal(updated.appearance.theme, 'dark');
  assert.equal(updated.appearance.fontScale, 'compact');
  assert.equal(updated.reading.defaultFontSize, 20);
  assert.equal(updated.reading.defaultFontFamily, 'sans');
  assert.equal(updated.reading.defaultLineHeight, 1.8);
  assert.equal(updated.library.defaultCollection, 'watch');
  assert.equal(updated.library.defaultSortField, 'rating');
  assert.equal(updated.accessibility.reduceMotion, 'reduce');
  assert.equal(updated.accessibility.highContrastFocus, true);

  // Fresh instance reads persisted values
  const store2 = createSettingsStore({ userDataRoot: tempDir });
  const reloaded = store2.getSettings();
  assert.equal(reloaded.appearance.theme, 'dark');
  assert.equal(reloaded.reading.defaultFontSize, 20);
  assert.equal(reloaded.library.defaultCollection, 'watch');
  assert.equal(reloaded.accessibility.highContrastFocus, true);

  // 3. Clamping and validation boundaries
  const clamped = store.saveSettings({
    reading: { defaultFontSize: 100, defaultLineHeight: 5.0 },
  });
  assert.equal(clamped.reading.defaultFontSize, 36, 'Font size must clamp to MAX_FONT_SIZE (36)');
  assert.equal(clamped.reading.defaultLineHeight, 2.4, 'Line height must clamp to MAX_LINE_HEIGHT (2.4)');

  const clampedLow = store.saveSettings({
    reading: { defaultFontSize: 2, defaultLineHeight: 0.5 },
  });
  assert.equal(clampedLow.reading.defaultFontSize, 12, 'Font size must clamp to MIN_FONT_SIZE (12)');
  assert.equal(clampedLow.reading.defaultLineHeight, 1.2, 'Line height must clamp to MIN_LINE_HEIGHT (1.2)');

  // 4. Invalid enum values fall back safely to defaults
  const enumFallback = store.saveSettings({
    appearance: { theme: 'neon-purple-invalid' },
    reading: { defaultFontFamily: 'comic-sans-invalid' },
    library: { defaultCollection: 'invalid-collection' },
  });
  assert.equal(enumFallback.appearance.theme, 'light', 'Invalid theme falls back to default');
  assert.equal(enumFallback.reading.defaultFontFamily, 'serif', 'Invalid font falls back to default');
  assert.equal(enumFallback.library.defaultCollection, 'read', 'Invalid collection falls back to default');

  // 5. Corrupt file recovery
  const settingsFile = join(tempDir, 'app-settings.json');
  writeFileSync(settingsFile, '{ corrupt invalid json ...', 'utf8');
  const recovered = store.getSettings();
  assert.equal(recovered.schemaVersion, 1);
  assert.equal(recovered.appearance.theme, 'light', 'Recovers gracefully to defaults on file corruption');

  // 6. Future schema version rejected (fail closed)
  assert.throws(
    () => {
      validateSettings({ schemaVersion: 999, appearance: {} });
    },
    (err) => err.message.includes('Unsupported settings schema version 999')
  );
});

test('P15-T004: settings export and import with machine isolation', async (t) => {
  const tempDir = createTempDir('rw-settings-export-test');
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const store = createSettingsStore({ userDataRoot: tempDir });
  store.saveSettings({
    appearance: { theme: 'warm' },
    reading: { defaultFontSize: 18, defaultFontFamily: 'mono' },
    accessibility: { reduceMotion: 'reduce' },
  });

  // Export
  const exported = store.exportSettings();
  assert.equal(exported.format, 'read-watch.settings');
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.applicationVersion, '0.1.0');
  assert.ok(typeof exported.exportedAt === 'string');

  // Crucial: verify machine-specific paths and secrets are NOT in export
  const exportedJson = JSON.stringify(exported);
  assert.equal(exportedJson.includes(tempDir), false, 'Machine paths must be excluded');
  assert.equal(exportedJson.includes('token'), false, 'Session tokens must be excluded');
  assert.equal(exportedJson.includes('password'), false);

  // Import into a fresh location
  const tempDir2 = createTempDir('rw-settings-import-test');
  t.after(() => rmSync(tempDir2, { recursive: true, force: true }));

  const store2 = createSettingsStore({ userDataRoot: tempDir2 });
  const imported = store2.importSettings(exported);
  assert.equal(imported.appearance.theme, 'warm');
  assert.equal(imported.reading.defaultFontSize, 18);
  assert.equal(imported.reading.defaultFontFamily, 'mono');
  assert.equal(imported.accessibility.reduceMotion, 'reduce');

  // Reject malformed imports
  assert.throws(
    () => store2.importSettings('not-an-object'),
    (err) => err.message.includes('Expected JSON object')
  );
  assert.throws(
    () => store2.importSettings({ format: 'wrong.format', schemaVersion: 1 }),
    (err) => err.message.includes('Invalid settings format')
  );
  assert.throws(
    () => store2.importSettings({ format: 'read-watch.settings', schemaVersion: 2 }),
    (err) => err.message.includes('Unsupported settings schema version 2')
  );
});

import { writeTestDatabase } from './test-database.mjs';

test('P15-G002 & Section 182: RESET SETTINGS DATA PROTECTION HARD GATE', async (t) => {
  const tempDir = createTempDir('rw-reset-safety-gate');
  const dbPath = join(tempDir, 'read-watch.sqlite3');
  const testItemId = 'read-00000000000000000000000000000001';

  writeTestDatabase(dbPath, [
    {
      id: testItemId,
      collection: 'read',
      itemPath: 'books/test.pdf',
      title: 'User Important Book',
    },
  ]);

  // Create real stores
  const libraryStore = createLibraryStore({ databasePath: dbPath });
  const userDataStore = createUserDataStore({ userDataRoot: tempDir, libraryDatabasePath: dbPath });
  const annotationStore = createAnnotationStore({ databasePath: dbPath, userDataRoot: tempDir });
  const readerStore = createReaderStore({ libraryRoot: tempDir, libraryDatabasePath: dbPath, userDataRoot: tempDir });
  const canvasStore = createCanvasStore({ databasePath: dbPath, userDataRoot: tempDir });
  const knowledgeStore = createKnowledgeStore({ databasePath: dbPath, userDataRoot: tempDir });
  const settingsStore = createSettingsStore({ userDataRoot: tempDir });

  // Notes and thoughts
  userDataStore.save('notes', testItemId, '# My Critical Research Notes\nDo not delete.');
  userDataStore.save('thoughts', testItemId, 'Insight about chapter 1.');

  // Annotation
  const annotation = annotationStore.createAnnotation({
    itemId: testItemId,
    assetId: 'asset-1',
    kind: 'highlight',
    anchor: { type: 'pdf', pageNumber: 1 },
    content: { text: 'Key quote from book' },
    sourceHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });

  // Bookmark
  const bookmark = readerStore.addBookmark(testItemId, {
    label: 'Crucial Bookmark',
    pageNumber: 15,
  });

  // Canvas
  const canvas = canvasStore.createCanvas({
    title: 'Visual Research Board',
    elements: [{ id: 'el-1', type: 'rectangle', x: 10, y: 10, width: 100, height: 50 }],
  });

  // Knowledge graph
  const graph = knowledgeStore.createGraph({
    title: 'Concept Architecture Graph',
    description: 'Relational map of book concepts',
  });

  // Custom user settings
  settingsStore.saveSettings({
    appearance: { theme: 'dark' },
    reading: { defaultFontSize: 24 },
  });

  // PRE-CONDITION ASSERTIONS: Verify all synthetic data exists
  const itemBeforeReset = libraryStore.getCatalog().items.find((i) => i.id === testItemId);
  assert.equal(itemBeforeReset?.title, 'User Important Book');
  assert.equal(userDataStore.load('notes', testItemId).content.includes('Critical Research'), true);
  assert.equal(userDataStore.load('thoughts', testItemId).content.includes('Insight about chapter'), true);
  assert.ok(annotationStore.getAnnotation(annotation.id));
  assert.equal(readerStore.getBookmarks(testItemId).length, 1);
  assert.ok(canvasStore.getCanvas(canvas.canvasId));
  assert.ok(knowledgeStore.getGraph(graph.id));
  assert.equal(settingsStore.getSettings().appearance.theme, 'dark');

  // =========================================================================
  // EXECUTE SETTINGS RESET (The Hard Gate Test)
  // =========================================================================
  const resetResult = settingsStore.resetSettings();
  assert.equal(resetResult.appearance.theme, 'light', 'Settings must be reset to light default');
  assert.equal(resetResult.reading.defaultFontSize, 16, 'Reading font size must be reset to 16 default');

  // =========================================================================
  // POST-RESET DATA PRESERVATION VERIFICATION
  // Every piece of canonical user data must be 100% UNCHANGED
  // =========================================================================
  // 1. Library catalog item intact
  const itemAfterReset = libraryStore.getCatalog().items.find((i) => i.id === testItemId);
  assert.ok(itemAfterReset, 'Library item must survive reset');
  assert.equal(itemAfterReset.title, 'User Important Book');

  // 2. Notes & thoughts intact
  const notesAfter = userDataStore.load('notes', testItemId);
  assert.ok(notesAfter.content.includes('# My Critical Research Notes'), 'Notes must survive reset');
  const thoughtsAfter = userDataStore.load('thoughts', testItemId);
  assert.ok(thoughtsAfter.content.includes('Insight about chapter 1'), 'Thoughts must survive reset');

  // 3. Annotations intact
  const annotationAfter = annotationStore.getAnnotation(annotation.id);
  assert.ok(annotationAfter, 'Annotation must survive reset');
  assert.equal(annotationAfter.content.text, 'Key quote from book');

  // 4. Bookmarks intact
  const bookmarksAfter = readerStore.getBookmarks(testItemId);
  assert.equal(bookmarksAfter.length, 1, 'Bookmark must survive reset');
  assert.equal(bookmarksAfter[0].label, 'Crucial Bookmark');

  // 5. Canvas intact
  const canvasAfter = canvasStore.getCanvas(canvas.canvasId);
  assert.ok(canvasAfter, 'Canvas must survive reset');
  assert.equal(canvasAfter.title, 'Visual Research Board');

  // 6. Knowledge graph intact
  const graphAfter = knowledgeStore.getGraph(graph.id);
  assert.ok(graphAfter, 'Knowledge graph must survive reset');
  assert.equal(graphAfter.title, 'Concept Architecture Graph');

  // Close database connections before removing temp directory on Windows
  try { libraryStore.close(); } catch {}
  try { userDataStore.close(); } catch {}
  try { annotationStore.close(); } catch {}
  try { canvasStore.close(); } catch {}
  try { knowledgeStore.close(); } catch {}
  rmSync(tempDir, { recursive: true, force: true });
});

