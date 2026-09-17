import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import { createSettingsStore } from '../server/settings-store.mjs';
import { createOcrStore } from '../server/ocr/ocr-store.mjs';

const scratchDirs = [];

function scratchRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'rw-ocr-settings-'));
  scratchDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of scratchDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }
});

test('P17-T012: OCR preferences default to off with tashkeel preservation fixed on', () => {
  const store = createSettingsStore({ userDataRoot: scratchRoot() });
  const settings = store.getSettings();
  assert.equal(settings.ocr.enabled, false, 'OCR must be opt-in');
  assert.equal(settings.ocr.defaultLanguage, 'en');
  assert.equal(settings.ocr.updatePolicy, 'manual', 'engines are never auto-activated');
  assert.equal(settings.ocr.preserveTashkeel, true);
});

test('P17-T012: an OCR preference patch merges without discarding other sections', () => {
  const store = createSettingsStore({ userDataRoot: scratchRoot() });
  store.saveSettings({ appearance: { theme: 'dark' } });
  const updated = store.saveSettings({ ocr: { enabled: true, defaultLanguage: 'ar' } });
  assert.equal(updated.ocr.enabled, true);
  assert.equal(updated.ocr.defaultLanguage, 'ar');
  assert.equal(updated.ocr.updatePolicy, 'manual');
  assert.equal(updated.ocr.preserveTashkeel, true);
  assert.equal(updated.appearance.theme, 'dark', 'unrelated sections must survive');
});

test('P17-T012: an invalid OCR language falls back instead of persisting nonsense', () => {
  const store = createSettingsStore({ userDataRoot: scratchRoot() });
  const updated = store.saveSettings({ ocr: { defaultLanguage: 'klingon', updatePolicy: 'auto' } });
  assert.equal(updated.ocr.defaultLanguage, 'en');
  assert.equal(updated.ocr.updatePolicy, 'manual');
});

test('P17-T024: resetting preferences never deletes derived OCR transcription data', () => {
  const root = scratchRoot();
  const userDataRoot = join(root, 'user-data');
  const ocrRoot = join(root, 'ocr');
  const store = createSettingsStore({ userDataRoot });
  store.saveSettings({ ocr: { enabled: true, defaultLanguage: 'ar' } });

  const ocrStore = createOcrStore({ ocrRoot });
  const sourceHash = 'e'.repeat(64);
  const saved = ocrStore.save({
    ok: true,
    provider: 'paddleocr',
    providerVersion: 'rev-1',
    modelRevision: 'arabic_PP-OCRv5_mobile_rec',
    language: 'ar',
    pageIndex: 0,
    sourceHash,
    settingsKey: 'default',
    rawText: '\u0627\u0644\u0652\u062d\u064e\u0645\u0652\u062f\u064f',
    displayText: '\u0627\u0644\u0652\u062d\u064e\u0645\u0652\u062f\u064f',
    searchText: '\u0627\u0644\u062d\u0645\u062f',
    blocks: [],
    confidence: null,
  });
  assert.ok(existsSync(saved.path));

  const reset = store.resetSettings();
  assert.equal(reset.ocr.enabled, false, 'preferences return to defaults');
  assert.ok(
    existsSync(saved.path),
    'settings reset must not destroy derived OCR transcription data',
  );
  assert.equal(
    ocrStore.load({ provider: 'paddleocr', sourceHash, pageIndex: 0, language: 'ar' })?.displayText,
    '\u0627\u0644\u0652\u062d\u064e\u0645\u0652\u062f\u064f',
  );
});

test('P17-T025: settings export carries OCR preferences and no recognised text', () => {
  const store = createSettingsStore({ userDataRoot: scratchRoot() });
  store.saveSettings({ ocr: { enabled: true, defaultLanguage: 'ur' } });
  const exported = store.exportSettings();
  assert.equal(exported.settings.ocr.enabled, true);
  assert.equal(exported.settings.ocr.defaultLanguage, 'ur');
  const serialized = JSON.stringify(exported);
  assert.ok(!/rawText|displayText|searchText/.test(serialized), 'exports must not embed OCR text');
});

test('P17-T025: OCR preferences round-trip through settings import', () => {
  const source = createSettingsStore({ userDataRoot: scratchRoot() });
  source.saveSettings({ ocr: { enabled: true, defaultLanguage: 'ar', updatePolicy: 'check-only' } });
  const exported = source.exportSettings();

  const target = createSettingsStore({ userDataRoot: scratchRoot() });
  const imported = target.importSettings(exported);
  assert.equal(imported.ocr.enabled, true);
  assert.equal(imported.ocr.defaultLanguage, 'ar');
  assert.equal(imported.ocr.updatePolicy, 'check-only');
  assert.equal(imported.ocr.preserveTashkeel, true);
});
