import {
  type AppSettings,
  type SettingsExportPackage,
  type AppTheme,
  type FontScale,
  type ReaderFontFamily,
  type ReaderContentWidth,
  type ReaderLayoutMode,
  type LibraryCollection,
  type LibrarySortField,
  type LibrarySortDirection,
  type MotionPreference,
  SETTINGS_FORMAT_IDENTIFIER,
  SETTINGS_SCHEMA_VERSION,
} from './types';
import { APP_VERSION } from '../legal-metadata';

export const VALID_THEMES: ReadonlyArray<AppTheme> = ['light', 'warm', 'dark'];
export const VALID_FONT_SCALES: ReadonlyArray<FontScale> = ['compact', 'normal', 'large'];
export const VALID_READER_FONTS: ReadonlyArray<ReaderFontFamily> = ['serif', 'sans', 'mono'];
export const VALID_CONTENT_WIDTHS: ReadonlyArray<ReaderContentWidth> = ['compact', 'normal', 'wide'];
export const VALID_LAYOUT_MODES: ReadonlyArray<ReaderLayoutMode> = ['paginated', 'continuous'];
export const VALID_COLLECTIONS: ReadonlyArray<LibraryCollection> = ['read', 'watch'];
export const VALID_SORT_FIELDS: ReadonlyArray<LibrarySortField> = ['title', 'added', 'rating'];
export const VALID_SORT_DIRECTIONS: ReadonlyArray<LibrarySortDirection> = ['asc', 'desc'];
export const VALID_MOTION_PREFS: ReadonlyArray<MotionPreference> = ['system', 'reduce', 'no-preference'];

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 36;
export const MIN_LINE_HEIGHT = 1.2;
export const MAX_LINE_HEIGHT = 2.4;

export const DEFAULT_APP_SETTINGS: AppSettings = {
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

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Validates and normalizes an incoming AppSettings object or raw storage record.
 * Falls back safely to defaults for missing or invalid fields.
 * Fails closed (throws) if format is invalid or schemaVersion > SETTINGS_SCHEMA_VERSION.
 */
export function validateAppSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_APP_SETTINGS, updatedAt: new Date().toISOString() };
  }

  const candidate = raw as Record<string, unknown>;

  // Reject future schema version (fail-closed guard)
  if (
    typeof candidate.schemaVersion === 'number' &&
    candidate.schemaVersion > SETTINGS_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported settings schema version ${candidate.schemaVersion}. Please upgrade Read & Watch.`
    );
  }

  const appearanceRaw = (typeof candidate.appearance === 'object' && candidate.appearance !== null
    ? candidate.appearance
    : {}) as Record<string, unknown>;

  const theme: AppTheme = VALID_THEMES.includes(appearanceRaw.theme as AppTheme)
    ? (appearanceRaw.theme as AppTheme)
    : DEFAULT_APP_SETTINGS.appearance.theme;

  const fontScale: FontScale = VALID_FONT_SCALES.includes(appearanceRaw.fontScale as FontScale)
    ? (appearanceRaw.fontScale as FontScale)
    : DEFAULT_APP_SETTINGS.appearance.fontScale;

  const readingRaw = (typeof candidate.reading === 'object' && candidate.reading !== null
    ? candidate.reading
    : {}) as Record<string, unknown>;

  const defaultReadingTheme: AppTheme = VALID_THEMES.includes(readingRaw.defaultReadingTheme as AppTheme)
    ? (readingRaw.defaultReadingTheme as AppTheme)
    : DEFAULT_APP_SETTINGS.reading.defaultReadingTheme;

  const rawFontSize = typeof readingRaw.defaultFontSize === 'number'
    ? readingRaw.defaultFontSize
    : DEFAULT_APP_SETTINGS.reading.defaultFontSize;
  const defaultFontSize = Math.round(clamp(rawFontSize, MIN_FONT_SIZE, MAX_FONT_SIZE));

  const defaultFontFamily: ReaderFontFamily = VALID_READER_FONTS.includes(readingRaw.defaultFontFamily as ReaderFontFamily)
    ? (readingRaw.defaultFontFamily as ReaderFontFamily)
    : DEFAULT_APP_SETTINGS.reading.defaultFontFamily;

  const rawLineHeight = typeof readingRaw.defaultLineHeight === 'number'
    ? readingRaw.defaultLineHeight
    : DEFAULT_APP_SETTINGS.reading.defaultLineHeight;
  const defaultLineHeight = roundTo(clamp(rawLineHeight, MIN_LINE_HEIGHT, MAX_LINE_HEIGHT), 2);

  const defaultContentWidth: ReaderContentWidth = VALID_CONTENT_WIDTHS.includes(readingRaw.defaultContentWidth as ReaderContentWidth)
    ? (readingRaw.defaultContentWidth as ReaderContentWidth)
    : DEFAULT_APP_SETTINGS.reading.defaultContentWidth;

  const defaultLayoutMode: ReaderLayoutMode = VALID_LAYOUT_MODES.includes(readingRaw.defaultLayoutMode as ReaderLayoutMode)
    ? (readingRaw.defaultLayoutMode as ReaderLayoutMode)
    : DEFAULT_APP_SETTINGS.reading.defaultLayoutMode;

  const showHeaderFooter = typeof readingRaw.showHeaderFooter === 'boolean'
    ? readingRaw.showHeaderFooter
    : DEFAULT_APP_SETTINGS.reading.showHeaderFooter;

  const libraryRaw = (typeof candidate.library === 'object' && candidate.library !== null
    ? candidate.library
    : {}) as Record<string, unknown>;

  const defaultCollection: LibraryCollection = VALID_COLLECTIONS.includes(libraryRaw.defaultCollection as LibraryCollection)
    ? (libraryRaw.defaultCollection as LibraryCollection)
    : DEFAULT_APP_SETTINGS.library.defaultCollection;

  const defaultSortField: LibrarySortField = VALID_SORT_FIELDS.includes(libraryRaw.defaultSortField as LibrarySortField)
    ? (libraryRaw.defaultSortField as LibrarySortField)
    : DEFAULT_APP_SETTINGS.library.defaultSortField;

  const defaultSortDirection: LibrarySortDirection = VALID_SORT_DIRECTIONS.includes(libraryRaw.defaultSortDirection as LibrarySortDirection)
    ? (libraryRaw.defaultSortDirection as LibrarySortDirection)
    : DEFAULT_APP_SETTINGS.library.defaultSortDirection;

  const confirmItemDeletion = typeof libraryRaw.confirmItemDeletion === 'boolean'
    ? libraryRaw.confirmItemDeletion
    : DEFAULT_APP_SETTINGS.library.confirmItemDeletion;

  const a11yRaw = (typeof candidate.accessibility === 'object' && candidate.accessibility !== null
    ? candidate.accessibility
    : {}) as Record<string, unknown>;

  const reduceMotion: MotionPreference = VALID_MOTION_PREFS.includes(a11yRaw.reduceMotion as MotionPreference)
    ? (a11yRaw.reduceMotion as MotionPreference)
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
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt ? candidate.updatedAt : new Date().toISOString(),
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

/**
 * Creates a portable, sanitized export package from current settings.
 * Strictly omits local machine paths, tokens, or runtime environment data.
 */
export function createSettingsExportPackage(settings: AppSettings): SettingsExportPackage {
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

/**
 * Validates an imported settings package.
 * Fails closed on format mismatch or schemaVersion > current.
 */
export function validateImportedSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid settings file: Expected a JSON object.');
  }

  const pkg = raw as Record<string, unknown>;

  if (pkg.format !== SETTINGS_FORMAT_IDENTIFIER) {
    throw new Error(
      `Invalid settings format: expected '${SETTINGS_FORMAT_IDENTIFIER}', got '${String(pkg.format)}'.`
    );
  }

  if (typeof pkg.schemaVersion !== 'number') {
    throw new Error('Invalid settings file: schemaVersion is missing or non-numeric.');
  }

  if (pkg.schemaVersion > SETTINGS_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported settings schema version ${pkg.schemaVersion}. This version of Read & Watch supports up to version ${SETTINGS_SCHEMA_VERSION}.`
    );
  }

  // The payload may be a SettingsExportPackage (under .settings) or direct AppSettings
  const targetSettings = (typeof pkg.settings === 'object' && pkg.settings !== null) ? pkg.settings : pkg;
  return validateAppSettings(targetSettings);
}
