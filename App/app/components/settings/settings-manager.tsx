'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Download,
  Upload,
  RotateCcw,
  ShieldCheck,
  Folder,
  Sliders,
  Palette,
  BookOpen,
  Eye,
  Info,
  Laptop,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { PortabilitySettings } from './portability-settings';
import {
  fetchAppSettings,
  updateAppSettings,
  resetAppSettings,
  downloadSettingsExport,
  uploadAndApplySettings,
} from '@/lib/settings/client';
import {
  type AppSettings,
  type AppTheme,
  type FontScale,
  type ReaderFontFamily,
  type ReaderContentWidth,
  type ReaderLayoutMode,
  type LibraryCollection,
  type LibrarySortField,
  type LibrarySortDirection,
  type MotionPreference,
} from '@/lib/settings/types';
import { DEFAULT_APP_SETTINGS } from '@/lib/settings/schema';
import { APP_VERSION, LEGAL_EFFECTIVE_DATE } from '@/lib/legal-metadata';
import type { DesktopAppPaths } from '@/lib/desktop/types';

function applyPreferencesToDocument(s: AppSettings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('theme-warm', 'theme-dark');
  if (s.appearance.theme === 'warm') {
    root.classList.add('theme-warm');
    root.setAttribute('data-theme', 'warm');
  } else if (s.appearance.theme === 'dark') {
    root.classList.add('theme-dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.setAttribute('data-theme', 'light');
  }

  root.setAttribute('data-font-scale', s.appearance.fontScale);
  root.setAttribute('data-reduce-motion', s.accessibility.reduceMotion);
  root.setAttribute('data-high-contrast-focus', String(s.accessibility.highContrastFocus));
}

export function SettingsManager() {
  const toast = useToast();
  const importFileRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [desktopPaths, setDesktopPaths] = useState<DesktopAppPaths | null>(null);

  // Reset confirmation state
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Export / Import state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Initial load
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const loaded = await fetchAppSettings();
        if (active) {
          setSettings(loaded);
          applyPreferencesToDocument(loaded);
        }
      } catch {
        // Fallback to defaults
      } finally {
        if (active) setLoading(false);
      }

      if (typeof window !== 'undefined' && window.readWatchDesktop) {
        try {
          const paths = await window.readWatchDesktop.getAppPaths();
          if (active) setDesktopPaths(paths);
        } catch {}
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function handlePatch(patch: Partial<AppSettings>) {
    try {
      setSaveStatus('Saving changes...');
      const updated = await updateAppSettings(patch);
      setSettings(updated);
      applyPreferencesToDocument(updated);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      setSaveStatus('Error saving settings');
      toast.error(err instanceof Error ? err.message : 'Could not save settings.');
    }
  }

  async function handleResetConfirm() {
    setIsResetting(true);
    try {
      const defaults = await resetAppSettings();
      setSettings(defaults);
      applyPreferencesToDocument(defaults);
      setShowResetDialog(false);
      toast.success('Preference settings restored to defaults. Your library and notes remain intact.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset settings.');
    } finally {
      setIsResetting(false);
    }
  }

  async function handleExportSettings() {
    setIsExporting(true);
    try {
      await downloadSettingsExport(settings);
      toast.success('Settings exported successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export settings.');
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const imported = await uploadAndApplySettings(file);
      setSettings(imported);
      applyPreferencesToDocument(imported);
      toast.success('Settings imported and applied successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import settings file.');
    } finally {
      setIsImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  }

  async function handleChangeDataLocation() {
    if (typeof window === 'undefined' || !window.readWatchDesktop) {
      toast.info('Data location can be configured via READ_WATCH_DATA_ROOT in this environment.');
      return;
    }
    try {
      const res = await window.readWatchDesktop.chooseDataRoot();
      if (res.canceled) return;
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.path) {
        toast.success(`Data location selected: ${res.path}. Restart the application to load this library.`);
        const refreshed = await window.readWatchDesktop.getAppPaths();
        setDesktopPaths(refreshed);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not choose data location.');
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Live save indicator */}
      <div aria-live="polite" className="sr-only">
        {saveStatus}
      </div>

      {/* SECTION 1: Appearance */}
      <section className="space-y-3" aria-labelledby="heading-appearance">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="size-5 text-primary" aria-hidden="true" />
            <h2 id="heading-appearance" className="font-editorial text-xl font-semibold text-foreground">
              Appearance
            </h2>
          </div>
          {saveStatus && (
            <span className="text-xs font-medium text-primary">
              {saveStatus}
            </span>
          )}
        </div>
        <div className="rounded-md border border-border bg-surface">
          <div className="divide-y divide-border text-sm">
            {/* Theme */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <label htmlFor="appearance-theme" className="font-medium text-foreground">
                  Color Scheme
                </label>
                <p className="text-xs text-muted-foreground">Overall application interface palette</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  id="appearance-theme"
                  value={settings.appearance.theme}
                  onChange={(e) =>
                    handlePatch({
                      appearance: { ...settings.appearance, theme: e.target.value as AppTheme },
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="light">Light (Warm Neutral)</option>
                  <option value="warm">Warm (Sepia)</option>
                  <option value="dark">Dark (Charcoal)</option>
                </select>
              </div>
            </div>

            {/* Font Scale */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <label htmlFor="appearance-font-scale" className="font-medium text-foreground">
                  Interface Scale
                </label>
                <p className="text-xs text-muted-foreground">Density and sizing of controls</p>
              </div>
              <div>
                <select
                  id="appearance-font-scale"
                  value={settings.appearance.fontScale}
                  onChange={(e) =>
                    handlePatch({
                      appearance: { ...settings.appearance, fontScale: e.target.value as FontScale },
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="compact">Compact Density</option>
                  <option value="normal">Standard Density</option>
                  <option value="large">Spacious Density</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: Reading Defaults */}
      <section className="space-y-3" aria-labelledby="heading-reading">
        <div className="flex items-center gap-2">
          <BookOpen className="size-5 text-primary" aria-hidden="true" />
          <h2 id="heading-reading" className="font-editorial text-xl font-semibold text-foreground">
            Reading Defaults
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Default typography and layout applied when opening publications in the unified reader.
        </p>
        <div className="rounded-md border border-border bg-surface">
          <div className="divide-y divide-border text-sm">
            {/* Reading Theme */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <label htmlFor="reading-theme" className="font-medium text-foreground">
                  Reader Theme
                </label>
                <p className="text-xs text-muted-foreground">Page background and contrast</p>
              </div>
              <div>
                <select
                  id="reading-theme"
                  value={settings.reading.defaultReadingTheme}
                  onChange={(e) =>
                    handlePatch({
                      reading: { ...settings.reading, defaultReadingTheme: e.target.value as AppTheme },
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="light">Light</option>
                  <option value="warm">Warm Sepia</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>

            {/* Font Family */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <label htmlFor="reading-font-family" className="font-medium text-foreground">
                  Font Family
                </label>
                <p className="text-xs text-muted-foreground">Default typeface for book text</p>
              </div>
              <div>
                <select
                  id="reading-font-family"
                  value={settings.reading.defaultFontFamily}
                  onChange={(e) =>
                    handlePatch({
                      reading: { ...settings.reading, defaultFontFamily: e.target.value as ReaderFontFamily },
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="serif">Editorial Serif</option>
                  <option value="sans">Clean UI Sans</option>
                  <option value="mono">Monospace</option>
                </select>
              </div>
            </div>

            {/* Font Size */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <label htmlFor="reading-font-size" className="font-medium text-foreground">
                  Default Font Size
                </label>
                <p className="text-xs text-muted-foreground">Base reading text size (12 to 36 px)</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="reading-font-size"
                  type="range"
                  min="12"
                  max="36"
                  step="1"
                  value={settings.reading.defaultFontSize}
                  onChange={(e) =>
                    handlePatch({
                      reading: { ...settings.reading, defaultFontSize: Number(e.target.value) },
                    })
                  }
                  className="h-2 w-48 cursor-pointer rounded-lg bg-border accent-primary"
                />
                <span className="w-12 text-xs font-semibold tabular-nums text-foreground">
                  {settings.reading.defaultFontSize} px
                </span>
              </div>
            </div>

            {/* Line Height */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <label htmlFor="reading-line-height" className="font-medium text-foreground">
                  Line Spacing
                </label>
                <p className="text-xs text-muted-foreground">Vertical text line height (1.2 to 2.4)</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="reading-line-height"
                  type="range"
                  min="1.2"
                  max="2.4"
                  step="0.1"
                  value={settings.reading.defaultLineHeight}
                  onChange={(e) =>
                    handlePatch({
                      reading: { ...settings.reading, defaultLineHeight: Number(e.target.value) },
                    })
                  }
                  className="h-2 w-48 cursor-pointer rounded-lg bg-border accent-primary"
                />
                <span className="w-12 text-xs font-semibold tabular-nums text-foreground">
                  {settings.reading.defaultLineHeight.toFixed(1)}
                </span>
              </div>
            </div>

            {/* Content Width */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <label htmlFor="reading-content-width" className="font-medium text-foreground">
                  Content Width
                </label>
                <p className="text-xs text-muted-foreground">Reading column margins</p>
              </div>
              <div>
                <select
                  id="reading-content-width"
                  value={settings.reading.defaultContentWidth}
                  onChange={(e) =>
                    handlePatch({
                      reading: { ...settings.reading, defaultContentWidth: e.target.value as ReaderContentWidth },
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="compact">Compact (Narrow)</option>
                  <option value="normal">Standard (Balanced)</option>
                  <option value="wide">Wide (Full Page)</option>
                </select>
              </div>
            </div>

            {/* Layout Mode */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <label htmlFor="reading-layout-mode" className="font-medium text-foreground">
                  Pagination Mode
                </label>
                <p className="text-xs text-muted-foreground">Page turning presentation</p>
              </div>
              <div>
                <select
                  id="reading-layout-mode"
                  value={settings.reading.defaultLayoutMode}
                  onChange={(e) =>
                    handlePatch({
                      reading: { ...settings.reading, defaultLayoutMode: e.target.value as ReaderLayoutMode },
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="paginated">Paginated (Standard)</option>
                  <option value="continuous">Continuous Scroll</option>
                </select>
              </div>
            </div>

            {/* Header & Footer */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <span className="font-medium text-foreground">Reading Chrome</span>
                <p className="text-xs text-muted-foreground">Show document header and footer overlays</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="reading-show-header-footer"
                  type="checkbox"
                  checked={settings.reading.showHeaderFooter}
                  onChange={(e) =>
                    handlePatch({
                      reading: { ...settings.reading, showHeaderFooter: e.target.checked },
                    })
                  }
                  className="size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
                />
                <label htmlFor="reading-show-header-footer" className="text-sm text-foreground">
                  Show title bar and reading progress bar
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Library Behavior */}
      <section className="space-y-3" aria-labelledby="heading-library">
        <div className="flex items-center gap-2">
          <Sliders className="size-5 text-primary" aria-hidden="true" />
          <h2 id="heading-library" className="font-editorial text-xl font-semibold text-foreground">
            Library Behavior
          </h2>
        </div>
        <div className="rounded-md border border-border bg-surface">
          <div className="divide-y divide-border text-sm">
            {/* Default Collection */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <label htmlFor="library-default-collection" className="font-medium text-foreground">
                  Default Collection
                </label>
                <p className="text-xs text-muted-foreground">Collection selected when opening the library</p>
              </div>
              <div>
                <select
                  id="library-default-collection"
                  value={settings.library.defaultCollection}
                  onChange={(e) =>
                    handlePatch({
                      library: { ...settings.library, defaultCollection: e.target.value as LibraryCollection },
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="read">Read (Books &amp; Documents)</option>
                  <option value="watch">Watch (Films &amp; Series)</option>
                </select>
              </div>
            </div>

            {/* Default Sort */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <label htmlFor="library-sort-field" className="font-medium text-foreground">
                  Default Sorting
                </label>
                <p className="text-xs text-muted-foreground">Initial sorting order for catalog items</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="library-sort-field"
                  value={settings.library.defaultSortField}
                  onChange={(e) =>
                    handlePatch({
                      library: { ...settings.library, defaultSortField: e.target.value as LibrarySortField },
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="title">Title</option>
                  <option value="added">Date Added</option>
                  <option value="rating">Rating</option>
                </select>
                <select
                  id="library-sort-dir"
                  aria-label="Sort direction"
                  value={settings.library.defaultSortDirection}
                  onChange={(e) =>
                    handlePatch({
                      library: { ...settings.library, defaultSortDirection: e.target.value as LibrarySortDirection },
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>

            {/* Confirm deletion */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <span className="font-medium text-foreground">Item Deletion</span>
                <p className="text-xs text-muted-foreground">Safety confirmation for deleting catalog items</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="library-confirm-deletion"
                  type="checkbox"
                  checked={settings.library.confirmItemDeletion}
                  onChange={(e) =>
                    handlePatch({
                      library: { ...settings.library, confirmItemDeletion: e.target.checked },
                    })
                  }
                  className="size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
                />
                <label htmlFor="library-confirm-deletion" className="text-sm text-foreground">
                  Confirm before removing an item from the library
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: Accessibility */}
      <section className="space-y-3" aria-labelledby="heading-accessibility">
        <div className="flex items-center gap-2">
          <Eye className="size-5 text-primary" aria-hidden="true" />
          <h2 id="heading-accessibility" className="font-editorial text-xl font-semibold text-foreground">
            Accessibility
          </h2>
        </div>
        <div className="rounded-md border border-border bg-surface">
          <div className="divide-y divide-border text-sm">
            {/* Reduce Motion */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <label htmlFor="accessibility-motion" className="font-medium text-foreground">
                  Motion Preference
                </label>
                <p className="text-xs text-muted-foreground">Transitions and viewport movement</p>
              </div>
              <div>
                <select
                  id="accessibility-motion"
                  value={settings.accessibility.reduceMotion}
                  onChange={(e) =>
                    handlePatch({
                      accessibility: { ...settings.accessibility, reduceMotion: e.target.value as MotionPreference },
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="system">Respect System (Default)</option>
                  <option value="reduce">Always Reduce Motion</option>
                  <option value="no-preference">Allow Motion</option>
                </select>
              </div>
            </div>

            {/* High Contrast Focus */}
            <div className="grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:items-center">
              <div>
                <span className="font-medium text-foreground">Keyboard Focus Indicator</span>
                <p className="text-xs text-muted-foreground">Visible high-contrast focus rings</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="accessibility-high-contrast"
                  type="checkbox"
                  checked={settings.accessibility.highContrastFocus}
                  onChange={(e) =>
                    handlePatch({
                      accessibility: { ...settings.accessibility, highContrastFocus: e.target.checked },
                    })
                  }
                  className="size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
                />
                <label htmlFor="accessibility-high-contrast" className="text-sm text-foreground">
                  Enforce bold, high-contrast outlines on focused controls
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: Storage & Data Location */}
      <section className="space-y-3" aria-labelledby="heading-storage">
        <div className="flex items-center gap-2">
          <Folder className="size-5 text-primary" aria-hidden="true" />
          <h2 id="heading-storage" className="font-editorial text-xl font-semibold text-foreground">
            Library &amp; Storage
          </h2>
        </div>
        <div className="rounded-md border border-border bg-surface">
          <dl className="divide-y divide-border text-sm">
            <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr]">
              <dt className="font-medium text-foreground">Storage model</dt>
              <dd className="text-muted-foreground">Local SQLite runtime with file-first recoverability</dd>
            </div>
            <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr] sm:items-center">
              <dt className="font-medium text-foreground">Data location</dt>
              <dd className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground">
                <span className="break-all font-mono text-xs">
                  {desktopPaths?.dataRoot || 'Local storage root configured'}
                </span>
                {desktopPaths?.isDesktop && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleChangeDataLocation}
                    className="shrink-0"
                  >
                    Change Data Location
                  </Button>
                )}
              </dd>
            </div>
            <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr]">
              <dt className="font-medium text-foreground">Cloud synchronization</dt>
              <dd className="text-muted-foreground">Disabled. Standalone local-first operation without remote servers.</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* SECTION 6: Portability & Backups */}
      <section className="space-y-4" aria-labelledby="heading-portability">
        <PortabilitySettings />

        {/* Settings-Specific Export / Import */}
        <div className="rounded-md border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-foreground">Settings Portability</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Export or import application preferences as a human-readable JSON file.
            This transfers interface and reading settings between devices without copying your library.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportSettings}
              disabled={isExporting}
            >
              <Download className="mr-1.5 size-4" />
              {isExporting ? 'Exporting...' : 'Export Settings JSON'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => importFileRef.current?.click()}
              disabled={isImporting}
            >
              <Upload className="mr-1.5 size-4" />
              {isImporting ? 'Importing...' : 'Import Settings JSON'}
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
              aria-label="Select settings JSON file to import"
            />
          </div>
        </div>
      </section>

      {/* SECTION 7: Reset Preferences (Safe) */}
      <section className="space-y-3" aria-labelledby="heading-reset">
        <div className="flex items-center gap-2">
          <RotateCcw className="size-5 text-destructive" aria-hidden="true" />
          <h2 id="heading-reset" className="font-editorial text-xl font-semibold text-foreground">
            Reset Preferences
          </h2>
        </div>
        <div className="rounded-md border border-border bg-surface p-5">
          <p className="text-sm text-foreground">
            Restore default appearance, reading defaults, and accessibility settings.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Resetting preferences is completely safe. Your books, media files, reading notes,
            highlights, bookmarks, canvases, and knowledge diagrams are preserved and will never be removed.
          </p>
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResetDialog(true)}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <RotateCcw className="mr-1.5 size-4" />
              Reset All Preferences to Defaults
            </Button>
          </div>
        </div>
      </section>

      {/* SECTION 8: Desktop & Updates */}
      <section className="space-y-3" aria-labelledby="heading-desktop-updates">
        <div className="flex items-center gap-2">
          <Laptop className="size-5 text-primary" aria-hidden="true" />
          <h2 id="heading-desktop-updates" className="font-editorial text-xl font-semibold text-foreground">
            Desktop &amp; Updates
          </h2>
        </div>
        <div className="rounded-md border border-border bg-surface">
          <dl className="divide-y divide-border text-sm">
            <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr]">
              <dt className="font-medium text-foreground">Runtime environment</dt>
              <dd className="text-muted-foreground">
                {desktopPaths?.isDesktop ? 'Desktop native application (Electron)' : 'Local web application'}
              </dd>
            </div>
            <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr]">
              <dt className="font-medium text-foreground">Update policy</dt>
              <dd className="text-muted-foreground">
                Strict non-silent policy. Background auto-updating is disabled. Updates require explicit user confirmation.
              </dd>
            </div>
            <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr]">
              <dt className="font-medium text-foreground">Distribution format</dt>
              <dd className="text-muted-foreground">
                {desktopPaths?.isPackaged ? 'Packaged Windows x64 installation' : 'Standalone development build'}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* SECTION 9: About & Legal */}
      <section className="space-y-3" aria-labelledby="heading-about">
        <div className="flex items-center gap-2">
          <Info className="size-5 text-primary" aria-hidden="true" />
          <h2 id="heading-about" className="font-editorial text-xl font-semibold text-foreground">
            About &amp; Legal
          </h2>
        </div>
        <div className="rounded-md border border-border bg-surface">
          <dl className="divide-y divide-border text-sm">
            <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr]">
              <dt className="font-medium text-foreground">Application</dt>
              <dd className="text-muted-foreground">Read &amp; Watch v{APP_VERSION}</dd>
            </div>
            <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr]">
              <dt className="font-medium text-foreground">Effective Date</dt>
              <dd className="text-muted-foreground">{LEGAL_EFFECTIVE_DATE}</dd>
            </div>
            <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr] sm:items-center">
              <dt className="font-medium text-foreground">Privacy Policy</dt>
              <dd>
                <Link
                  href="/privacy"
                  className="font-medium text-primary hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View Privacy Policy &rarr;
                </Link>
              </dd>
            </div>
            <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[14rem_1fr] sm:items-center">
              <dt className="font-medium text-foreground">Terms &amp; Conditions</dt>
              <dd>
                <Link
                  href="/terms"
                  className="font-medium text-primary hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View Terms &amp; Conditions &rarr;
                </Link>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* RESET CONFIRMATION MODAL */}
      <Dialog
        open={showResetDialog}
        onClose={() => setShowResetDialog(false)}
        title="Reset All Preferences?"
        description="This will restore all appearance, reading, library, and accessibility settings to default values."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-border bg-surface-muted p-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-5 shrink-0 text-success" />
            <p>
              <strong className="text-foreground">Your data is safe:</strong> Resetting
              preferences will NOT delete books, annotations, notes, canvases, or diagrams.
              Only your interface choices will be restored to defaults.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResetDialog(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleResetConfirm}
              disabled={isResetting}
            >
              {isResetting ? 'Resetting...' : 'Yes, Reset Preferences'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
