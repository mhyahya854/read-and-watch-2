'use client';

/**
 * Unified Reader Status & Progress Footer.
 * Displays truthful location metrics: Page X of Y for paginated publications,
 * or chapter title for semantic publications, alongside precise progression.
 * Capability-driven without format branching.
 */

import { useReader } from './reader-context';

export function ReaderStatus() {
  const { snapshot } = useReader();

  const canPaginate = snapshot.capabilities.has('pageNavigation');
  const percent = Math.max(0, Math.min(100, Math.round(snapshot.readingProgress * 100)));

  const locationLabel = canPaginate
    ? `Page ${snapshot.currentPage} of ${Math.max(1, snapshot.totalPages)}`
    : snapshot.currentChapter || snapshot.metadata?.title || '';

  return (
    <footer className="h-10 shrink-0 border-t border-border bg-surface px-3 sm:px-4 flex items-center justify-between text-xs text-muted-foreground z-20 select-none">
      {/* Location / Section Indicator */}
      <div className="truncate max-w-xs sm:max-w-md font-serif text-foreground/85 text-[11px] sm:text-xs">
        {locationLabel}
      </div>

      {/* Reading Progress Indicator */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        <span className="font-mono text-[11px] text-muted-foreground min-w-8 text-right">
          {percent}%
        </span>
        <progress
          className="w-20 sm:w-36 h-1.5 rounded-full bg-surface-muted overflow-hidden border border-border/60 appearance-none [&::-webkit-progress-bar]:bg-surface-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
          value={percent}
          max={100}
          aria-label="Reading progress"
        />
      </div>
    </footer>
  );
}
