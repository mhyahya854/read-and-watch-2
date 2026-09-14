'use client';

/**
 * Reader Bookmarks Panel.
 * Manages user bookmarks stored as canonical Read & Watch data.
 * Bookmarks are navigation waypoints (distinct from Phase 09 text annotations).
 */

import { Bookmark as BookmarkIcon, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Bookmark } from '@/lib/document';
import { useReader } from './reader-context';

export function ReaderBookmarks() {
  const {
    snapshot,
    goTo,
    toggleBookmark,
    removeBookmark,
    isCurrentLocationBookmarked,
    setActiveSidebar,
  } = useReader();

  const handleSelectBookmark = (bookmark: Bookmark) => {
    void goTo(bookmark.location);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setActiveSidebar(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Add Bookmark Action Bar */}
      <div className="p-3 border-b border-border/80 shrink-0">
        <Button
          type="button"
          variant={isCurrentLocationBookmarked ? 'secondary' : 'default'}
          size="sm"
          onClick={() => {
            void toggleBookmark();
          }}
          className="w-full text-xs h-8 flex items-center justify-center gap-1.5"
        >
          {isCurrentLocationBookmarked ? (
            <>
              <BookmarkIcon size={14} className="fill-current" />
              <span>Remove Bookmark for This Page</span>
            </>
          ) : (
            <>
              <Plus size={14} />
              <span>Bookmark Current Location (B)</span>
            </>
          )}
        </Button>
      </div>

      {/* Bookmarks List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {snapshot.bookmarks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <BookmarkIcon className="w-8 h-8 opacity-40 mb-2" />
            <p className="text-xs font-medium text-foreground">No bookmarks yet</p>
            <p className="text-[11px] text-muted-foreground/80 mt-1 max-w-xs leading-relaxed">
              Click the button above or press B while reading to save your place.
            </p>
          </div>
        ) : (
          snapshot.bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="w-full p-2.5 text-xs rounded border border-border/60 hover:border-border hover:bg-surface-muted/60 transition-all flex items-start justify-between gap-2 group"
            >
              <button
                type="button"
                onClick={() => handleSelectBookmark(bm)}
                className="flex-1 text-left min-w-0"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <BookmarkIcon size={12} className="text-primary fill-primary shrink-0" />
                  <span className="font-semibold text-foreground text-[11px] truncate">
                    {bm.label || (bm.pageNumber ? `Page ${bm.pageNumber}` : 'Saved Position')}
                  </span>
                  {bm.pageNumber && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      p. {bm.pageNumber}
                    </span>
                  )}
                </div>
                {bm.snippet && (
                  <p className="text-muted-foreground line-clamp-2 italic text-[11px] pl-5 leading-relaxed">
                    {bm.snippet}
                  </p>
                )}
                <div className="text-[10px] text-muted-foreground/60 pl-5 mt-1">
                  {formatDate(bm.createdAt)}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  void removeBookmark(bm.id);
                }}
                className="p-1 text-muted-foreground hover:text-destructive rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete bookmark"
                aria-label="Delete bookmark"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
