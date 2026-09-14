export interface AppSettings {
  format: string;
  schemaVersion: number;
  updatedAt: string;
  appearance: {
    theme: 'light' | 'warm' | 'dark';
    fontScale: 'compact' | 'normal' | 'large';
  };
  reading: {
    defaultReadingTheme: 'light' | 'warm' | 'dark';
    defaultFontSize: number;
    defaultFontFamily: 'serif' | 'sans' | 'mono';
    defaultLineHeight: number;
    defaultContentWidth: 'compact' | 'normal' | 'wide';
    defaultLayoutMode: 'paginated' | 'continuous';
    showHeaderFooter: boolean;
  };
  library: {
    defaultCollection: 'read' | 'watch';
    defaultSortField: 'title' | 'added' | 'rating';
    defaultSortDirection: 'asc' | 'desc';
    confirmItemDeletion: boolean;
  };
  accessibility: {
    reduceMotion: 'system' | 'reduce' | 'no-preference';
    largeTextMode: boolean;
    highContrastFocus: boolean;
  };
}

export interface SettingsStore {
  getSettings(): AppSettings;
  saveSettings(patch: unknown): AppSettings;
  resetSettings(): AppSettings;
  exportSettings(): unknown;
  importSettings(imported: unknown): AppSettings;
}

export function createSettingsStore(options: { userDataRoot: string }): SettingsStore;
export function validateSettings(raw: unknown): AppSettings;
export const DEFAULT_APP_SETTINGS: AppSettings;
