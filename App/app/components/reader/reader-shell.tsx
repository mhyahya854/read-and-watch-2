'use client';

/**
 * Reader Shell Component.
 * Orchestrates the top toolbar, collapsible sidebar, central viewport,
 * bottom status footer, and settings dialog under a single unified theme.
 * Dispatches keyboard and touch gestures to reader actions without format branching.
 */

import { useEffect, useRef } from 'react';
import { useReader } from './reader-context';
import { ReaderToolbar } from './reader-toolbar';
import { ReaderSidebar } from './reader-sidebar';
import { ReaderViewport } from './reader-viewport';
import { ReaderStatus } from './reader-status';
import { ReaderSettingsDialog } from './reader-settings-dialog';
import { ReaderStudyPane } from './reader-study-pane';
import { ReadWatchCanvas, CanvasList } from '@/components/canvas';
import {
  readerPaneClass,
  readerPaneVisible,
  sidePaneClass,
  sidePaneVisible,
} from '@/lib/reader/layout';

export function ReaderShell() {
  const {
    snapshot,
    itemId,
    readerStatus,
    next,
    prev,
    toggleBookmark,
    activeSidebar,
    setActiveSidebar,
    isSettingsOpen,
    setIsSettingsOpen,
    isCanvasOpen,
    setIsCanvasOpen,
    activeCanvasId,
    setActiveCanvasId,
    readerLayout,
    studyPane,
    setStudyPane,
  } = useReader();

  const themeClass =
    snapshot.preferences.theme === 'warm'
      ? 'theme-warm'
      : snapshot.preferences.theme === 'dark'
      ? 'theme-dark'
      : 'theme-light';

  // Global Keyboard Navigation Model
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keystrokes when typing inside inputs or textareas
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // 1. Search shortcut (Ctrl+F / Cmd+F)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setActiveSidebar('search');
        return;
      }

      // 2. Escape closes modals and sidebars
      if (e.key === 'Escape') {
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
          return;
        }
        if (activeSidebar) {
          setActiveSidebar(null);
          return;
        }
      }

      if (isInput) return;

      // 3. Arrow / Page / Space navigation
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        void next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        void prev();
      } else if (e.key === ' ' && !e.shiftKey) {
        e.preventDefault();
        void next();
      } else if (e.key === ' ' && e.shiftKey) {
        e.preventDefault();
        void prev();
      } else if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        void toggleBookmark();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [next, prev, toggleBookmark, activeSidebar, setActiveSidebar, isSettingsOpen, setIsSettingsOpen]);

  // Touch swipe support with deliberate thresholds
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Must be a quick swipe (> 60px horizontal, < 40px vertical, < 500ms)
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40 && dt < 500) {
      if (dx < 0) {
        void next();
      } else {
        void prev();
      }
    }
  };

  const bookTitle = snapshot.metadata?.title || readerStatus?.candidates[0]?.name || 'Book';
  const showSide =
    readerLayout !== 'full' && (isCanvasOpen || studyPane !== 'none');

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground select-none transition-colors duration-150 ${themeClass}`}
      data-theme={snapshot.preferences.theme}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <ReaderToolbar />

      <div className="flex-1 relative flex overflow-hidden">
        <ReaderSidebar />

        {/* Reader Viewport Pane. Hidden entirely in minimized mode; the reader
            keeps its live session and source position either way. */}
        {/* Always mounted: minimizing hides this pane with CSS so the document
            adapter keeps its container and the live source position. */}
        <div
          data-reader-pane={readerLayout}
          aria-hidden={readerPaneVisible(readerLayout) ? undefined : true}
          className={`h-full overflow-hidden transition-all duration-150 ${readerPaneClass(
            readerLayout,
            showSide,
          )}`}
        >
          <ReaderViewport />
        </div>

        {/* Side surface: the book's Knowledge Canvas when one is open, otherwise
            its annotation/study pane. Hidden in full-reader mode. */}
        {sidePaneVisible(readerLayout, showSide) && (
          <div
            data-side-pane={
              activeCanvasId ? 'canvas' : isCanvasOpen ? 'canvas-list' : 'study'
            }
            className={`h-full overflow-hidden bg-surface transition-all duration-150 ${sidePaneClass(
              readerLayout,
            )}`}
          >
            {activeCanvasId ? (
              <ReadWatchCanvas
                canvasId={activeCanvasId}
                bookTitle={bookTitle}
                itemId={itemId}
                isBesideReader={true}
                onClose={() => {
                  setActiveCanvasId(null);
                  setIsCanvasOpen(false);
                  setStudyPane('canvas');
                }}
              />
            ) : isCanvasOpen ? (
              <div className="flex flex-col h-full w-full">
                <div className="p-3 border-b border-border bg-surface flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">Knowledge Canvas</span>
                    <span className="text-[11px] text-muted-foreground font-mono">({bookTitle})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCanvasOpen(false);
                      setStudyPane('canvas');
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground p-1 rounded"
                    title="Close Canvas"
                    aria-label="Close canvas workspace"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <CanvasList
                    itemId={itemId}
                    bookTitle={bookTitle}
                    onSelectCanvas={(id) => setActiveCanvasId(id)}
                  />
                </div>
              </div>
            ) : (
              <ReaderStudyPane />
            )}
          </div>
        )}
      </div>

      <ReaderStatus />
      <ReaderSettingsDialog />
    </div>
  );
}
