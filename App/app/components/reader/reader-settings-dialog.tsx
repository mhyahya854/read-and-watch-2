'use client';

/**
 * Unified Reader Settings Dialog.
 * Shared organizational grammar for Appearance, Typography, Layout, and Shortcuts.
 * Generic controls query adapter capabilities (canAdjustFont, canContinuousScroll, canZoom)
 * without format-conditional branching.
 */

import { useEffect, useRef } from 'react';
import {
  X,
  Sun,
  Moon,
  Coffee,
  Type,
  Columns,
  Keyboard,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReader } from './reader-context';
import { type ReaderTheme, type ReaderFontFamily, type ReaderContentWidth } from '@/lib/document';

export function ReaderSettingsDialog() {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    snapshot,
    setTheme,
    setFontSize,
    setFontFamily,
    setLineHeight,
    setContentWidth,
    setLayoutMode,
    setZoom,
    rotate,
  } = useReader();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const canAdjustFont = snapshot.capabilities.has('fontControls');
  const canContinuousScroll = snapshot.capabilities.has('continuousLayout');
  const canZoom = snapshot.capabilities.has('zoom');
  const prefs = snapshot.preferences;

  // Escape key handler and focus management
  useEffect(() => {
    if (!isSettingsOpen) return;

    const previousActive = document.activeElement as HTMLElement | null;
    triggerRef.current = previousActive;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [isSettingsOpen, setIsSettingsOpen]);

  if (!isSettingsOpen) return null;

  const themeOptions: Array<{ id: ReaderTheme; label: string; icon: typeof Sun; bg: string; text: string }> = [
    {
      id: 'light',
      label: 'Light',
      icon: Sun,
      bg: 'bg-[#fbfaf7] border-[#d8d5cc]',
      text: 'text-[#1e2022]',
    },
    {
      id: 'warm',
      label: 'Warm',
      icon: Coffee,
      bg: 'bg-[#f5efe6] border-[#d4c8b8]',
      text: 'text-[#2b241e]',
    },
    {
      id: 'dark',
      label: 'Dark',
      icon: Moon,
      bg: 'bg-[#1c1b1a] border-[#363432]',
      text: 'text-[#e5e2dc]',
    },
  ];

  const fontOptions: Array<{ id: ReaderFontFamily; label: string; fontClass: string }> = [
    { id: 'serif', label: 'Serif', fontClass: 'font-serif' },
    { id: 'sans', label: 'Sans', fontClass: 'font-sans' },
    { id: 'mono', label: 'Mono', fontClass: 'font-mono' },
  ];

  const widthOptions: Array<{ id: ReaderContentWidth; label: string }> = [
    { id: 'compact', label: 'Compact' },
    { id: 'normal', label: 'Normal' },
    { id: 'wide', label: 'Wide' },
  ];

  return (
    <div
      role="presentation"
      className="fixed inset-0 bg-background/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsSettingsOpen(false);
      }}
    >
      <dialog
        ref={dialogRef}
        open
        aria-modal="true"
        aria-label="Reader Settings"
        className="w-full max-w-md bg-surface border border-border rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in-0 zoom-in-95 duration-150 m-0 p-0 text-foreground"
      >
        {/* Modal Header */}
        <div className="h-12 border-b border-border px-4 flex items-center justify-between shrink-0 bg-surface">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-sans">
            Reader Settings
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setIsSettingsOpen(false)}
            title="Close settings (Esc)"
            aria-label="Close settings"
          >
            <X size={15} />
          </Button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
          {/* Section 1: Appearance & Themes */}
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Sun size={13} />
              <span>Theme</span>
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map((t) => {
                const Icon = t.icon;
                const isSelected = prefs.theme === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`p-2.5 rounded border text-left flex flex-col justify-between gap-2 transition-all ${t.bg} ${t.text} ${
                      isSelected
                        ? 'ring-2 ring-primary border-primary shadow-xs'
                        : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Icon size={14} />
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                    <span className="font-medium text-xs">{t.label}</span>
                  </button>
                );
              })}
            </div>
            {canZoom && (
              <p className="text-[10px] text-muted-foreground/70 mt-1.5 leading-normal">
                Fixed-layout pages preserve original document color accuracy. Themes apply to surrounding reader chrome.
              </p>
            )}
          </div>

          {/* Section 2: Typography (Shown when font controls capability exists) */}
          {canAdjustFont && (
            <div className="border-t border-border/80 pt-4 space-y-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Type size={13} />
                <span>Typography</span>
              </h2>

              {/* Font Family */}
              <div>
                <span className="text-[11px] font-medium text-muted-foreground block mb-1.5">Typeface</span>
                <div className="grid grid-cols-3 gap-2">
                  {fontOptions.map((f) => (
                    <button
                      type="button"
                      key={f.id}
                      onClick={() => setFontFamily(f.id)}
                      className={`py-1.5 px-2 rounded border text-center transition-colors ${f.fontClass} ${
                        prefs.fontFamily === f.id
                          ? 'bg-surface-muted text-foreground border-primary font-semibold'
                          : 'bg-surface text-muted-foreground border-border hover:bg-surface-muted/40'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size Stepper */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Font Size</span>
                  <span className="text-[11px] font-mono text-foreground font-semibold">
                    {prefs.fontSize}px
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={() => setFontSize(prefs.fontSize - 1)}
                    disabled={prefs.fontSize <= 12}
                  >
                    A-
                  </Button>
                  <input
                    type="range"
                    min="12"
                    max="28"
                    step="1"
                    value={prefs.fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="flex-1 accent-primary cursor-pointer"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 px-3 text-xs font-semibold"
                    onClick={() => setFontSize(prefs.fontSize + 1)}
                    disabled={prefs.fontSize >= 28}
                  >
                    A+
                  </Button>
                </div>
              </div>

              {/* Line Spacing */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Line Height</span>
                  <span className="text-[11px] font-mono text-foreground">
                    {prefs.lineHeight.toFixed(1)}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1.4, 1.6, 1.8, 2.0].map((lh) => (
                    <button
                      type="button"
                      key={lh}
                      onClick={() => setLineHeight(lh)}
                      className={`py-1 rounded border text-center text-xs font-mono transition-colors ${
                        Math.abs(prefs.lineHeight - lh) < 0.05
                          ? 'bg-surface-muted text-foreground border-primary font-semibold'
                          : 'bg-surface text-muted-foreground border-border hover:bg-surface-muted/40'
                      }`}
                    >
                      {lh.toFixed(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reading Column Width */}
              <div>
                <span className="text-[11px] font-medium text-muted-foreground block mb-1.5">Page Width</span>
                <div className="grid grid-cols-3 gap-2">
                  {widthOptions.map((w) => (
                    <button
                      type="button"
                      key={w.id}
                      onClick={() => setContentWidth(w.id)}
                      className={`py-1.5 px-2 rounded border text-center text-xs transition-colors ${
                        prefs.contentWidth === w.id
                          ? 'bg-surface-muted text-foreground border-primary font-semibold'
                          : 'bg-surface text-muted-foreground border-border hover:bg-surface-muted/40'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Layout Mode (Continuous vs Paginated, or PDF Zoom Presets) */}
          <div className="border-t border-border/80 pt-4 space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Columns size={13} />
              <span>Layout</span>
            </h2>

            {canContinuousScroll && (
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">Reading Presentation</div>
                  <div className="text-[11px] text-muted-foreground">
                    Switch between page turning and continuous vertical flow
                  </div>
                </div>
                <div className="flex rounded border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setLayoutMode('paginated')}
                    className={`px-2.5 py-1 text-xs transition-colors ${
                      prefs.layoutMode === 'paginated'
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-surface text-muted-foreground hover:bg-surface-muted'
                    }`}
                  >
                    Paginated
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('scrolled')}
                    className={`px-2.5 py-1 text-xs transition-colors border-l border-border ${
                      prefs.layoutMode === 'scrolled'
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-surface text-muted-foreground hover:bg-surface-muted'
                    }`}
                  >
                    Scrolled
                  </button>
                </div>
              </div>
            )}

            {canZoom && (
              <div className="space-y-2">
                <span className="text-[11px] font-medium text-muted-foreground block">Zoom Presets</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0.75, 1.0, 1.25, 1.5].map((z) => (
                    <button
                      type="button"
                      key={z}
                      onClick={() => setZoom(z)}
                      className={`py-1 rounded border text-center text-xs font-mono transition-colors ${
                        Math.abs(snapshot.zoom - z) < 0.05
                          ? 'bg-surface-muted text-foreground border-primary font-semibold'
                          : 'bg-surface text-muted-foreground border-border hover:bg-surface-muted/40'
                      }`}
                    >
                      {Math.round(z * 100)}%
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs flex items-center gap-1"
                    onClick={rotate}
                  >
                    <RotateCcw size={12} />
                    <span>Rotate 90°</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => setZoom(1.0)}
                  >
                    Reset Zoom
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Keyboard Shortcuts Reference */}
          <div className="border-t border-border/80 pt-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Keyboard size={13} />
              <span>Keyboard Shortcuts</span>
            </h2>
            <div className="bg-surface-muted/50 rounded border border-border/60 p-2.5 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Previous / Next Page</span>
                <span className="font-mono text-foreground bg-surface px-1.5 py-0.5 rounded border border-border/60">
                  ← / → or Space
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Search in Document</span>
                <span className="font-mono text-foreground bg-surface px-1.5 py-0.5 rounded border border-border/60">
                  Ctrl+F / ⌘F
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Bookmark Current Place</span>
                <span className="font-mono text-foreground bg-surface px-1.5 py-0.5 rounded border border-border/60">
                  B
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Close Overlays / Drawers</span>
                <span className="font-mono text-foreground bg-surface px-1.5 py-0.5 rounded border border-border/60">
                  Esc
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="h-11 border-t border-border px-4 flex items-center justify-end shrink-0 bg-surface">
          <Button
            type="button"
            size="sm"
            onClick={() => setIsSettingsOpen(false)}
            className="h-7 px-3 text-xs"
          >
            Done
          </Button>
        </div>
      </dialog>
    </div>
  );
}
