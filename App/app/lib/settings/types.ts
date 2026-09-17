/**
 * Read & Watch Canonical Application Settings Types.
 * Phase 15 — Privacy, Terms, Settings, and Product Polish.
 *
 * Defines validated, versioned global preferences:
 * - Appearance
 * - Reading defaults
 * - Library behavior
 * - Accessibility
 * - OCR (Phase 17, opt-in)
 * Excludes machine-specific paths, credentials, and session tokens.
 */

export const SETTINGS_FORMAT_IDENTIFIER = 'read-watch.settings';
export const SETTINGS_SCHEMA_VERSION = 1;

export type AppTheme = 'light' | 'warm' | 'dark';
export type FontScale = 'compact' | 'normal' | 'large';
export type ReaderFontFamily = 'serif' | 'sans' | 'mono';
export type ReaderContentWidth = 'compact' | 'normal' | 'wide';
export type ReaderLayoutMode = 'paginated' | 'continuous';
export type LibraryCollection = 'read' | 'watch';
export type LibrarySortField = 'title' | 'added' | 'rating';
export type LibrarySortDirection = 'asc' | 'desc';
export type MotionPreference = 'system' | 'reduce' | 'no-preference';
export type OcrLanguage = 'en' | 'ar' | 'ur';
/**
 * OCR engines are never auto-activated. 'manual' waits for an explicit update
 * click; 'check-only' additionally polls official upstream for a new revision
 * without installing anything.
 */
export type OcrUpdatePolicy = 'manual' | 'check-only';

export interface AppearanceSettings {
  theme: AppTheme;
  fontScale: FontScale;
}

export interface ReadingDefaultsSettings {
  defaultReadingTheme: AppTheme;
  defaultFontSize: number;
  defaultFontFamily: ReaderFontFamily;
  defaultLineHeight: number;
  defaultContentWidth: ReaderContentWidth;
  defaultLayoutMode: ReaderLayoutMode;
  showHeaderFooter: boolean;
}

export interface LibrarySettings {
  defaultCollection: LibraryCollection;
  defaultSortField: LibrarySortField;
  defaultSortDirection: LibrarySortDirection;
  confirmItemDeletion: boolean;
}

export interface AccessibilitySettings {
  reduceMotion: MotionPreference;
  largeTextMode: boolean;
  highContrastFocus: boolean;
}

/**
 * OCR preferences. Deliberately small: the language -> engine mapping is an
 * authorised architectural decision, not a user preference, so it is not
 * exposed here. `preserveTashkeel` is fixed true and carried for provenance.
 */
export interface OcrSettings {
  enabled: boolean;
  defaultLanguage: OcrLanguage;
  updatePolicy: OcrUpdatePolicy;
  preserveTashkeel: true;
}

export interface AppSettings {
  format: typeof SETTINGS_FORMAT_IDENTIFIER;
  schemaVersion: number;
  updatedAt: string;
  appearance: AppearanceSettings;
  reading: ReadingDefaultsSettings;
  library: LibrarySettings;
  accessibility: AccessibilitySettings;
  ocr: OcrSettings;
}

export type AppSettingsUpdate = {
  appearance?: Partial<AppearanceSettings>;
  reading?: Partial<ReadingDefaultsSettings>;
  library?: Partial<LibrarySettings>;
  accessibility?: Partial<AccessibilitySettings>;
  ocr?: Partial<OcrSettings>;
};

export interface SettingsExportPackage {
  format: typeof SETTINGS_FORMAT_IDENTIFIER;
  schemaVersion: number;
  exportedAt: string;
  applicationVersion: string;
  settings: {
    appearance: AppearanceSettings;
    reading: ReadingDefaultsSettings;
    library: LibrarySettings;
    accessibility: AccessibilitySettings;
    ocr: OcrSettings;
  };
}
