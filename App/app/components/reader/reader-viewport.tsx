'use client';

/**
 * Unified Reader Viewport.
 * Houses the active DocumentAdapter rendering canvas/iframe mount point,
 * floating page navigation affordances, and accessible loading/error/recovery states.
 * 100% capability-driven; zero format branching.
 */

import Link from 'next/link';
import { ChevronLeft, ChevronRight, BookOpen, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReader } from './reader-context';
import { createPageLocation, createProgressionLocation } from '@/lib/document';

export function ReaderViewport() {
  const {
    containerRef,
    snapshot,
    next,
    prev,
    reload,
    goTo,
  } = useReader();

  const canPaginate = snapshot.capabilities.has('pageNavigation');
  const isStart = canPaginate ? snapshot.currentPage <= 1 : snapshot.readingProgress <= 0;
  const isEnd = canPaginate
    ? snapshot.currentPage >= Math.max(1, snapshot.totalPages)
    : snapshot.readingProgress >= 1;

  const contentWidthClass =
    snapshot.preferences.contentWidth === 'compact'
      ? 'max-w-2xl'
      : snapshot.preferences.contentWidth === 'wide'
      ? 'max-w-6xl'
      : 'max-w-4xl';

  const handleOpenAtBeginning = () => {
    if (!snapshot.source) return;
    if (canPaginate) {
      void goTo(createPageLocation(snapshot.source.sourceHash, 1));
    } else {
      void goTo(createProgressionLocation(snapshot.source.sourceHash, 0));
    }
  };

  return (
    <main
      className="flex-1 relative flex flex-col items-center justify-center overflow-hidden bg-background select-text"
      aria-label="Publication Content Viewport"
    >
      {/* 1. Loading State Presentation */}
      {snapshot.isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/85 backdrop-blur-xs z-10 transition-opacity">
          <BookOpen className="h-8 w-8 text-muted-foreground animate-pulse mb-3" />
          <p className="text-xs font-medium text-foreground">Opening publication...</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Preparing reader canvas and text layers
          </p>
        </div>
      )}

      {/* 2. Error Presentation & Real Recovery Actions */}
      {snapshot.error && !snapshot.isLoading && (
        <div className="p-6 max-w-md text-center bg-surface border border-destructive/40 rounded-lg shadow-md z-10 animate-in fade-in-0">
          <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={20} />
          </div>
          <h2 className="text-sm font-semibold text-foreground mb-1.5">
            Unable to display publication
          </h2>
          <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
            {snapshot.error.message || 'An error occurred while loading this document into the reader.'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => {
                void reload();
              }}
              className="text-xs h-8 flex items-center gap-1.5"
            >
              <RotateCcw size={13} />
              <span>Retry</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleOpenAtBeginning}
              className="text-xs h-8"
            >
              Open at Beginning
            </Button>

            <Link href="/">
              <Button variant="secondary" size="sm" className="text-xs h-8">
                Return to Library
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* 3. Mount point for engine renderer */}
      <div
        className={`flex-1 w-full h-full relative overflow-auto flex items-center justify-center p-2 sm:p-4 ${contentWidthClass}`}
        style={{ minHeight: 0 }}
      >
        <div
          ref={containerRef}
          className="w-full h-full relative flex items-center justify-center overflow-auto"
          style={{ minHeight: 0 }}
        />
      </div>

      {/* 4. Floating Navigation Affordances */}
      {snapshot.isOpen && !snapshot.isLoading && (
        <>
          <button
            type="button"
            onClick={() => {
              void prev();
            }}
            disabled={isStart}
            aria-label="Previous Page"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface/85 border border-border text-foreground/70 hover:text-foreground hover:bg-surface shadow-xs transition-all disabled:opacity-20 disabled:pointer-events-none focus-visible:outline-ring"
            title="Previous Page (Left Arrow or Shift+Space)"
          >
            <ChevronLeft size={20} />
          </button>

          <button
            type="button"
            onClick={() => {
              void next();
            }}
            disabled={isEnd}
            aria-label="Next Page"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface/85 border border-border text-foreground/70 hover:text-foreground hover:bg-surface shadow-xs transition-all disabled:opacity-20 disabled:pointer-events-none focus-visible:outline-ring"
            title="Next Page (Right Arrow or Space)"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}
    </main>
  );
}
