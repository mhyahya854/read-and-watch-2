'use client';

/**
 * Unified Study & Annotation Browser.
 * Phase 11 — Study Browser, Unified Local Discovery, and Source Jumps.
 *
 * Capabilities:
 *   - Unified discovery across highlights, underlines, strikes, comments, bookmarks, canvases, and notes.
 *   - Truthful artifact counts from derived search metadata.
 *   - Debounced search input with '/' keyboard shortcut and clear button.
 *   - Type filters (All, Highlights, Underlines, Strikes, Comments, Bookmarks, Canvases, Notes).
 *   - Book filter dropdown populated dynamically with local library titles.
 *   - HTML-safe tokenized snippet rendering (no dangerouslySetInnerHTML).
 *   - "Jump to Source" navigation to exact locations in Reader or Canvas.
 *   - Rebuild index control with loading feedback and error recovery.
 *   - 100% offline, privacy-guaranteed, accessible (ARIA live regions, keyboard navigable).
 */

/* oxlint-disable react/react-compiler -- intentional effect-driven search state synchronization */

import { useState, useEffect, useRef, useId } from 'react';
import Link from 'next/link';
import {
  Search,
  X,
  Highlighter,
  MessageSquare,
  Bookmark,
  LayoutGrid,
  StickyNote,
  ExternalLink,
  RotateCw,
  BookOpen,
  AlertCircle,
  FileText,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  downloadAnnotationsJson,
  downloadAnnotationsMarkdown,
} from '@/lib/portability/client';
import {
  searchStudy,
  getSearchStatus,
  rebuildSearchIndex,
  getFilterableBooks,
} from '@/lib/search/client';
import type {
  SearchResultItem,
  SearchIndexMeta,
  FilterableBook,
  StudyFilterType,
  SnippetToken,
} from '@/lib/search/types';

export function StudyBrowser() {
  const toast = useToast();
  const searchInputId = useId();
  const typeFilterId = useId();
  const bookFilterId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search query & filters
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<StudyFilterType>('all');
  const [bookFilter, setBookFilter] = useState<string>('');

  // Results & status state
  const [results, setResults] = useState<ReadonlyArray<SearchResultItem>>([]);
  const [meta, setMeta] = useState<SearchIndexMeta | null>(null);
  const [filterableBooks, setFilterableBooks] = useState<ReadonlyArray<FilterableBook>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce query (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Load index status & filterable books
  const loadMetadata = async () => {
    try {
      const [statusData, booksData] = await Promise.all([
        getSearchStatus(),
        getFilterableBooks(),
      ]);
      setMeta(statusData);
      setFilterableBooks(booksData);
    } catch {
      // Quietly continue; search will still attempt query
    }
  };

  useEffect(() => {
    void loadMetadata();
  }, []);

  // Execute search whenever debounced query or filters change
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const ctrl = new AbortController();

    searchStudy(
      {
        query: debouncedQuery,
        typeFilter,
        bookFilter: bookFilter || undefined,
        limit: 100,
      },
      ctrl.signal,
    )
      .then((res) => {
        if (!cancelled) {
          setResults(res.results);
          setMeta(res.meta);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && !ctrl.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Search failed');
          setResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [debouncedQuery, typeFilter, bookFilter]);

  // Keyboard shortcut: '/' focuses search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '');
      if ((e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'k')) && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Rebuild index action
  const handleRebuild = async () => {
    setIsRebuilding(true);
    try {
      const res = await rebuildSearchIndex();
      if (res.ok) {
        toast.success('Search index rebuilt successfully');
        await loadMetadata();
        // Re-run search
        const refreshed = await searchStudy({
          query: debouncedQuery,
          typeFilter,
          bookFilter: bookFilter || undefined,
        });
        setResults(refreshed.results);
        setMeta(refreshed.meta);
      } else {
        toast.error(res.error || 'Rebuild failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rebuild failed');
    } finally {
      setIsRebuilding(false);
    }
  };

  const handleExportJson = async () => {
    try {
      const book = filterableBooks.find((b) => b.itemId === bookFilter);
      const titleHint = book ? book.title : 'library-study';
      await downloadAnnotationsJson(bookFilter || undefined, titleHint);
      toast.success(`Exported annotations JSON for ${book ? book.title : 'entire library'}.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to export annotations.');
    }
  };

  const handleExportMarkdown = async () => {
    try {
      const book = filterableBooks.find((b) => b.itemId === bookFilter);
      const titleHint = book ? book.title : 'library-study';
      await downloadAnnotationsMarkdown(bookFilter || undefined, titleHint);
      toast.success(`Exported Markdown projection for ${book ? book.title : 'entire library'}.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to export annotations.');
    }
  };

  const handleClear = () => {
    setQuery('');
    setDebouncedQuery('');
    searchInputRef.current?.focus();
  };

  // Helper: jump URL generator
  const getJumpUrl = (item: SearchResultItem): string => {
    const { target } = item;
    if (target.type === 'canvas' && target.canvasId) {
      return `/canvas-notes/${encodeURIComponent(target.canvasId)}`;
    }
    if (target.type === 'library-item' && target.itemId) {
      return `/reader/${encodeURIComponent(target.itemId)}`;
    }
    if (target.itemId) {
      if (target.annotationId) {
        return `/reader/${encodeURIComponent(target.itemId)}?annotationId=${encodeURIComponent(target.annotationId)}`;
      }
      if (target.location) {
        return `/reader/${encodeURIComponent(target.itemId)}?location=${encodeURIComponent(JSON.stringify(target.location))}`;
      }
      return `/reader/${encodeURIComponent(target.itemId)}`;
    }
    return '/';
  };

  // Helper: Kind icon
  const getKindIcon = (item: SearchResultItem) => {
    switch (item.kind) {
      case 'annotation':
        if (item.subkind === 'comment') {
          return <MessageSquare size={13} className="text-amber-500" />;
        }
        return <Highlighter size={13} className="text-yellow-500" />;
      case 'bookmark':
        return <Bookmark size={13} className="text-blue-500" />;
      case 'canvas':
        return <LayoutGrid size={13} className="text-emerald-500" />;
      case 'note':
        return <StickyNote size={13} className="text-purple-500" />;
      case 'library-item':
        return <BookOpen size={13} className="text-primary" />;
      default:
        return <FileText size={13} className="text-muted-foreground" />;
    }
  };

  const counts = meta?.counts || {
    annotations: 0,
    bookmarks: 0,
    canvases: 0,
    notes: 0,
    items: 0,
    total: 0,
  };

  return (
    <div className="flex flex-col h-full bg-surface border border-border rounded-xl shadow-xs overflow-hidden">
      {/* 1. Header & Truthful Artifact Counters */}
      <div className="p-4 sm:p-5 border-b border-border bg-surface-muted/30">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
              <Highlighter size={18} className="text-primary" />
              <span>Unified Annotation &amp; Study Browser</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Explore highlights, comments, bookmarks, canvases, and notes across all your books.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExportJson}
              className="text-xs h-7 gap-1 px-2.5 font-normal"
              title={bookFilter ? 'Export annotations for filtered book (JSON)' : 'Export all library annotations (JSON)'}
            >
              <Download size={12} />
              <span>Export JSON</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExportMarkdown}
              className="text-xs h-7 gap-1 px-2.5 font-normal"
              title={bookFilter ? 'Export human-readable Markdown notes' : 'Export all library Markdown notes'}
            >
              <FileText size={12} />
              <span>Export MD</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isRebuilding}
              onClick={handleRebuild}
              className="text-xs h-7 gap-1.5 px-2.5 font-normal"
              title="Rebuild derived search index from canonical SQLite stores"
            >
              <RotateCw size={12} className={isRebuilding ? 'animate-spin text-primary' : ''} />
              <span>{isRebuilding ? 'Rebuilding...' : 'Rebuild Index'}</span>
            </Button>
          </div>
        </div>

        {/* Counter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface rounded-md border border-border">
            <Highlighter size={12} className="text-yellow-500" />
            <span className="text-muted-foreground">Highlights &amp; Marks:</span>
            <span className="font-semibold text-foreground font-mono">{counts.annotations}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface rounded-md border border-border">
            <Bookmark size={12} className="text-blue-500" />
            <span className="text-muted-foreground">Bookmarks:</span>
            <span className="font-semibold text-foreground font-mono">{counts.bookmarks}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface rounded-md border border-border">
            <LayoutGrid size={12} className="text-emerald-500" />
            <span className="text-muted-foreground">Canvases:</span>
            <span className="font-semibold text-foreground font-mono">{counts.canvases}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface rounded-md border border-border">
            <StickyNote size={12} className="text-purple-500" />
            <span className="text-muted-foreground">Book Notes:</span>
            <span className="font-semibold text-foreground font-mono">{counts.notes}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface rounded-md border border-border ml-auto">
            <span className="text-muted-foreground">Total Artifacts:</span>
            <span className="font-semibold text-foreground font-mono">{counts.total}</span>
          </div>
        </div>
      </div>

      {/* 2. Search Input & Filter Controls */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search Field */}
        <div className="relative flex-1">
          <label htmlFor={searchInputId} className="sr-only">Search study artifacts</label>
          <input
            id={searchInputId}
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, quotes, comments, tags, or book titles... (Press '/' to focus)"
            className="w-full bg-surface-muted/60 pl-8 pr-8 py-2 rounded-lg text-xs sm:text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground"
          />
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded"
              title="Clear search query"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-2">
          <label htmlFor={typeFilterId} className="sr-only">Filter by artifact type</label>
          <select
            id={typeFilterId}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as StudyFilterType)}
            className="bg-surface-muted/60 text-xs px-2.5 py-2 rounded-lg border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="all">All Types</option>
            <option value="highlight">Highlights</option>
            <option value="underline">Underlines</option>
            <option value="strike">Strikethroughs</option>
            <option value="comment">Comments</option>
            <option value="excerpt">Excerpts</option>
            <option value="bookmark">Bookmarks</option>
            <option value="canvas">Canvases</option>
            <option value="note">Notes</option>
            <option value="library-item">Books</option>
          </select>

          {/* Book Filter */}
          <label htmlFor={bookFilterId} className="sr-only">Filter by book</label>
          <select
            id={bookFilterId}
            value={bookFilter}
            onChange={(e) => setBookFilter(e.target.value)}
            className="bg-surface-muted/60 text-xs px-2.5 py-2 rounded-lg border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 max-w-[180px] truncate"
          >
            <option value="">All Books ({filterableBooks.length})</option>
            {filterableBooks.map((b) => (
              <option key={b.itemId} value={b.itemId}>
                {b.title} ({b.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. Live Match Count (Accessible ARIA live region) */}
      <output
        className="px-4 py-2 border-b border-border/60 bg-surface-muted/20 flex items-center justify-between text-[11px] text-muted-foreground"
        aria-live="polite"
      >
        <span>
          {isLoading ? (
            'Searching artifacts...'
          ) : results.length === 1 ? (
            '1 artifact match found'
          ) : (
            `${results.length} artifact matches found`
          )}
        </span>

        {meta?.lastRebuiltAtUtc && (
          <span className="text-[10px] text-muted-foreground/70">
            Index updated {new Date(meta.lastRebuiltAtUtc).toLocaleTimeString()}
          </span>
        )}
      </output>

      {/* 4. Results List */}
      <section className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5" aria-label="Study Results">
        {isLoading && results.length === 0 && (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <RotateCw size={18} className="animate-spin text-primary" />
            <span>Searching local index...</span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-xs text-destructive flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {!isLoading && results.length === 0 && !error && (
          <div className="py-16 text-center text-muted-foreground max-w-sm mx-auto">
            <Highlighter size={28} className="mx-auto opacity-30 mb-2.5" />
            <p className="text-sm font-semibold text-foreground">
              {debouncedQuery || typeFilter !== 'all' || bookFilter
                ? 'No matching artifacts found'
                : 'No study artifacts yet'}
            </p>
            <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
              {debouncedQuery || typeFilter !== 'all' || bookFilter
                ? 'Try adjusting your search terms or filters.'
                : 'Open any book in your library to create highlights, bookmark key passages, append notes, and design linked canvases.'}
            </p>
            {(debouncedQuery || typeFilter !== 'all' || bookFilter) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setDebouncedQuery('');
                  setTypeFilter('all');
                  setBookFilter('');
                }}
                className="text-xs h-7 mt-4"
              >
                Reset Filters
              </Button>
            )}
          </div>
        )}

        {results.map((item) => {
          const jumpUrl = getJumpUrl(item);
          return (
            <div
              key={item.id}
              className="p-3.5 rounded-lg border border-border/80 bg-surface hover:border-primary/50 hover:bg-surface-muted/30 transition-all group flex flex-col gap-2"
            >
              {/* Card Header: Kind badge, Book title, Jump button */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="p-1 rounded bg-surface-muted border border-border shrink-0">
                    {getKindIcon(item)}
                  </span>
                  <Badge variant="secondary" className="text-[10px] capitalize shrink-0 font-normal">
                    {item.subkind || item.kind}
                  </Badge>
                  {item.bookTitle && (
                    <span className="text-xs font-medium text-foreground truncate">
                      {item.bookTitle}
                    </span>
                  )}
                  {item.secondaryLabel && (
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                      {item.secondaryLabel}
                    </span>
                  )}
                </div>

                <Link
                  href={jumpUrl}
                  className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 shrink-0 px-2 py-1 rounded bg-primary/10 hover:bg-primary/15 transition-colors"
                  title="Jump to location in reader or canvas"
                >
                  <span>Jump to Source</span>
                  <ExternalLink size={11} />
                </Link>
              </div>

              {/* Title / Main content */}
              {item.title && (
                <p className="text-xs font-semibold text-foreground/90 leading-snug">
                  {item.title}
                </p>
              )}

              {/* Tokenized snippet with HTML-safe markup */}
              {item.snippetTokens && item.snippetTokens.length > 0 ? (
                <div className="text-xs text-muted-foreground font-serif italic leading-relaxed bg-surface-muted/40 p-2 rounded border border-border/50">
                  &ldquo;
                  {item.snippetTokens.map((tok: SnippetToken, tIdx: number) =>
                    tok.match ? (
                      <mark
                        key={tIdx}
                        className="bg-yellow-200 text-yellow-900 dark:bg-yellow-900/60 dark:text-yellow-100 rounded px-0.5 not-italic font-sans font-medium"
                      >
                        {tok.text}
                      </mark>
                    ) : (
                      <span key={tIdx}>{tok.text}</span>
                    ),
                  )}
                  &rdquo;
                </div>
              ) : (
                item.snippet && (
                  <div className="text-xs text-muted-foreground font-serif italic leading-relaxed bg-surface-muted/40 p-2 rounded border border-border/50">
                    &ldquo;{item.snippet}&rdquo;
                  </div>
                )
              )}

              {/* Footer: Date */}
              {item.updatedAt && (
                <div className="text-[10px] text-muted-foreground/60 flex items-center justify-end">
                  <span>Modified {new Date(item.updatedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
