import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

const SETTINGS_FORMAT_IDENTIFIER = 'read-watch.settings';
const SETTINGS_SCHEMA_VERSION = 1;
const APP_VERSION = '0.1.0';

const VALID_THEMES = ['light', 'warm', 'dark'];
const VALID_FONT_SCALES = ['compact', 'normal', 'large'];
const VALID_READER_FONTS = ['serif', 'sans', 'mono'];
const VALID_CONTENT_WIDTHS = ['compact', 'normal', 'wide'];
const VALID_LAYOUT_MODES = ['paginated', 'continuous'];
const VALID_COLLECTIONS = ['read', 'watch'];
const VALID_SORT_FIELDS = ['title', 'added', 'rating'];
const VALID_SORT_DIRECTIONS = ['asc', 'desc'];
const VALID_MOTION_PREFS = ['system', 'reduce', 'no-preference'];

const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 36;
const MIN_LINE_HEIGHT = 1.2;
const MAX_LINE_HEIGHT = 2.4;

export const DEFAULT_APP_SETTINGS = {
  format: SETTINGS_FORMAT_IDENTIFIER,
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  updatedAt: '2026-09-15T00:00:00.000Z',
  appearance: {
    theme: 'light',
    fontScale: 'normal',
  },
  reading: {
    defaultReadingTheme: 'light',
    defaultFontSize: 16,
    defaultFontFamily: 'serif',
    defaultLineHeight: 1.6,
    defaultContentWidth: 'normal',
    defaultLayoutMode: 'paginated',
    showHeaderFooter: true,
  },
  library: {
    defaultCollection: 'read',
    defaultSortField: 'title',
    defaultSortDirection: 'asc',
    confirmItemDeletion: true,
  },
  accessibility: {
    reduceMotion: 'system',
    largeTextMode: false,
    highContrastFocus: false,
  },
};

function clamp(value, min, max) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function writeAtomic(target, content) {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = join(
    dirname(target),
    `.${basename(target)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
}

export function validateSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_APP_SETTINGS, updatedAt: new Date().toISOString() };
  }

  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SETTINGS_SCHEMA_VERSION) {
    const error = new Error(
      `Unsupported settings schema version ${raw.schemaVersion}. Please upgrade Read & Watch.`
    );
    error.status = 422;
    throw error;
  }

  const appearanceRaw = (typeof raw.appearance === 'object' && raw.appearance !== null)
    ? raw.appearance
    : {};

  const theme = VALID_THEMES.includes(appearanceRaw.theme)
    ? appearanceRaw.theme
    : DEFAULT_APP_SETTINGS.appearance.theme;

  const fontScale = VALID_FONT_SCALES.includes(appearanceRaw.fontScale)
    ? appearanceRaw.fontScale
    : DEFAULT_APP_SETTINGS.appearance.fontScale;

  const readingRaw = (typeof raw.reading === 'object' && raw.reading !== null)
    ? raw.reading
    : {};

  const defaultReadingTheme = VALID_THEMES.includes(readingRaw.defaultReadingTheme)
    ? readingRaw.defaultReadingTheme
    : DEFAULT_APP_SETTINGS.reading.defaultReadingTheme;

  const rawFontSize = typeof readingRaw.defaultFontSize === 'number'
    ? readingRaw.defaultFontSize
    : DEFAULT_APP_SETTINGS.reading.defaultFontSize;
  const defaultFontSize = Math.round(clamp(rawFontSize, MIN_FONT_SIZE, MAX_FONT_SIZE));

  const defaultFontFamily = VALID_READER_FONTS.includes(readingRaw.defaultFontFamily)
    ? readingRaw.defaultFontFamily
    : DEFAULT_APP_SETTINGS.reading.defaultFontFamily;

  const rawLineHeight = typeof readingRaw.defaultLineHeight === 'number'
    ? readingRaw.defaultLineHeight
    : DEFAULT_APP_SETTINGS.reading.defaultLineHeight;
  const defaultLineHeight = roundTo(clamp(rawLineHeight, MIN_LINE_HEIGHT, MAX_LINE_HEIGHT), 2);

  const defaultContentWidth = VALID_CONTENT_WIDTHS.includes(readingRaw.defaultContentWidth)
    ? readingRaw.defaultContentWidth
    : DEFAULT_APP_SETTINGS.reading.defaultContentWidth;

  const defaultLayoutMode = VALID_LAYOUT_MODES.includes(readingRaw.defaultLayoutMode)
    ? readingRaw.defaultLayoutMode
    : DEFAULT_APP_SETTINGS.reading.defaultLayoutMode;

  const showHeaderFooter = typeof readingRaw.showHeaderFooter === 'boolean'
    ? readingRaw.showHeaderFooter
    : DEFAULT_APP_SETTINGS.reading.showHeaderFooter;

  const libraryRaw = (typeof raw.library === 'object' && raw.library !== null)
    ? raw.library
    : {};

  const defaultCollection = VALID_COLLECTIONS.includes(libraryRaw.defaultCollection)
    ? libraryRaw.defaultCollection
    : DEFAULT_APP_SETTINGS.library.defaultCollection;

  const defaultSortField = VALID_SORT_FIELDS.includes(libraryRaw.defaultSortField)
    ? libraryRaw.defaultSortField
    : DEFAULT_APP_SETTINGS.library.defaultSortField;

  const defaultSortDirection = VALID_SORT_DIRECTIONS.includes(libraryRaw.defaultSortDirection)
    ? libraryRaw.defaultSortDirection
    : DEFAULT_APP_SETTINGS.library.defaultSortDirection;

  const confirmItemDeletion = typeof libraryRaw.confirmItemDeletion === 'boolean'
    ? libraryRaw.confirmItemDeletion
    : DEFAULT_APP_SETTINGS.library.confirmItemDeletion;

  const a11yRaw = (typeof raw.accessibility === 'object' && raw.accessibility !== null)
    ? raw.accessibility
    : {};

  const reduceMotion = VALID_MOTION_PREFS.includes(a11yRaw.reduceMotion)
    ? a11yRaw.reduceMotion
    : DEFAULT_APP_SETTINGS.accessibility.reduceMotion;

  const largeTextMode = typeof a11yRaw.largeTextMode === 'boolean'
    ? a11yRaw.largeTextMode
    : DEFAULT_APP_SETTINGS.accessibility.largeTextMode;

  const highContrastFocus = typeof a11yRaw.highContrastFocus === 'boolean'
    ? a11yRaw.highContrastFocus
    : DEFAULT_APP_SETTINGS.accessibility.highContrastFocus;

  return {
    format: SETTINGS_FORMAT_IDENTIFIER,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : new Date().toISOString(),
    appearance: {
      theme,
      fontScale,
    },
    reading: {
      defaultReadingTheme,
      defaultFontSize,
      defaultFontFamily,
      defaultLineHeight,
      defaultContentWidth,
      defaultLayoutMode,
      showHeaderFooter,
    },
    library: {
      defaultCollection,
      defaultSortField,
      defaultSortDirection,
      confirmItemDeletion,
    },
    accessibility: {
      reduceMotion,
      largeTextMode,
      highContrastFocus,
    },
  };
}

export function createSettingsStore({ userDataRoot }) {
  const target = join(userDataRoot, 'app-settings.json');

  function getSettings() {
    if (!existsSync(target)) {
      return { ...DEFAULT_APP_SETTINGS };
    }
    try {
      const text = readFileSync(target, 'utf8');
      const parsed = JSON.parse(text);
      return validateSettings(parsed);
    } catch {
      // Resilient fallback to validated defaults on file corruption
      return { ...DEFAULT_APP_SETTINGS };
    }
  }

  function saveSettings(patch) {
    if (!patch || typeof patch !== 'object') {
      const err = new Error('Invalid settings payload');
      err.status = 400;
      throw err;
    }

    const current = getSettings();
    const merged = {
      ...current,
      appearance: { ...current.appearance, ...patch.appearance },
      reading: { ...current.reading, ...patch.reading },
      library: { ...current.library, ...patch.library },
      accessibility: { ...current.accessibility, ...patch.accessibility },
      updatedAt: new Date().toISOString(),
    };

    const validated = validateSettings(merged);
    writeAtomic(target, JSON.stringify(validated, null, 2));
    return validated;
  }

  function resetSettings() {
    const fresh = {
      ...DEFAULT_APP_SETTINGS,
      updatedAt: new Date().toISOString(),
    };
    writeAtomic(target, JSON.stringify(fresh, null, 2));
    return fresh;
  }

  function exportSettings() {
    const settings = getSettings();
    return {
      format: SETTINGS_FORMAT_IDENTIFIER,
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      applicationVersion: APP_VERSION,
      settings: {
        appearance: { ...settings.appearance },
        reading: { ...settings.reading },
        library: { ...settings.library },
        accessibility: { ...settings.accessibility },
      },
    };
  }

  function importSettings(imported) {
    if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
      const err = new Error('Invalid settings payload: Expected JSON object.');
      err.status = 400;
      throw err;
    }

    if (imported.format && imported.format !== SETTINGS_FORMAT_IDENTIFIER) {
      const err = new Error(`Invalid settings format: expected '${SETTINGS_FORMAT_IDENTIFIER}'`);
      err.status = 400;
      throw err;
    }

    if (typeof imported.schemaVersion === 'number' && imported.schemaVersion > SETTINGS_SCHEMA_VERSION) {
      const err = new Error(`Unsupported settings schema version ${imported.schemaVersion}`);
      err.status = 422;
      throw err;
    }

    const targetPayload = (typeof imported.settings === 'object' && imported.settings !== null)
      ? imported.settings
      : imported;

    const validated = validateSettings({
      ...targetPayload,
      updatedAt: new Date().toISOString(),
    });

    writeAtomic(target, JSON.stringify(validated, null, 2));
    return validated;
  }

  return {
    getSettings,
    saveSettings,
    resetSettings,
    exportSettings,
    importSettings,
  };
}
