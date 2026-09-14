/**
 * Read & Watch Canonical Reader Preferences.
 * Format-independent visual and reading interface configuration.
 * Adheres strictly to the Design Constitution: warm editorial, charcoal typography,
 * muted deep teal accents, no neon/glassmorphism, clean typography scaling.
 */

export type ReaderTheme = 'light' | 'warm' | 'dark';
export type ReaderFontFamily = 'serif' | 'sans' | 'mono';
export type ReaderContentWidth = 'compact' | 'normal' | 'wide';
export type ReaderLayoutMode = 'paginated' | 'scrolled';

export interface ReaderPreferences {
  readonly schemaVersion: 1;
  readonly theme: ReaderTheme;
  readonly fontSize: number; // 12 - 28px
  readonly fontFamily: ReaderFontFamily;
  readonly lineHeight: number; // 1.2 - 2.2
  readonly contentWidth: ReaderContentWidth;
  readonly layoutMode: ReaderLayoutMode;
  readonly showHeaderFooter: boolean;
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  schemaVersion: 1,
  theme: 'light',
  fontSize: 16,
  fontFamily: 'serif',
  lineHeight: 1.6,
  contentWidth: 'normal',
  layoutMode: 'paginated',
  showHeaderFooter: true,
};

export function validateReaderPreferences(input: unknown): ReaderPreferences {
  if (typeof input !== 'object' || input === null) {
    return DEFAULT_READER_PREFERENCES;
  }

  const p = input as Record<string, unknown>;

  const theme: ReaderTheme =
    p.theme === 'warm' || p.theme === 'dark' || p.theme === 'light'
      ? p.theme
      : DEFAULT_READER_PREFERENCES.theme;

  const rawSize = typeof p.fontSize === 'number' ? p.fontSize : DEFAULT_READER_PREFERENCES.fontSize;
  const fontSize = Math.max(12, Math.min(28, Math.round(rawSize)));

  const fontFamily: ReaderFontFamily =
    p.fontFamily === 'sans' || p.fontFamily === 'mono' || p.fontFamily === 'serif'
      ? p.fontFamily
      : DEFAULT_READER_PREFERENCES.fontFamily;

  const rawLine = typeof p.lineHeight === 'number' ? p.lineHeight : DEFAULT_READER_PREFERENCES.lineHeight;
  const lineHeight = Math.max(1.2, Math.min(2.2, Number(rawLine.toFixed(2))));

  const contentWidth: ReaderContentWidth =
    p.contentWidth === 'compact' || p.contentWidth === 'wide' || p.contentWidth === 'normal'
      ? p.contentWidth
      : DEFAULT_READER_PREFERENCES.contentWidth;

  const layoutMode: ReaderLayoutMode =
    p.layoutMode === 'scrolled' || p.layoutMode === 'paginated'
      ? p.layoutMode
      : DEFAULT_READER_PREFERENCES.layoutMode;

  const showHeaderFooter =
    typeof p.showHeaderFooter === 'boolean'
      ? p.showHeaderFooter
      : DEFAULT_READER_PREFERENCES.showHeaderFooter;

  return {
    schemaVersion: 1,
    theme,
    fontSize,
    fontFamily,
    lineHeight,
    contentWidth,
    layoutMode,
    showHeaderFooter,
  };
}
