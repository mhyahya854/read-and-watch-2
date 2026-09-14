'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  List,
  Search,
  Type,
  AlignLeft,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  X,
  BookOpen,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  type DocumentAdapter,
  type TocEntry,
  type SearchResult,
  type DocumentLocation,
  type ReadonlyDocumentSource,
  type DocumentMetadata,
  type DocumentCapabilities,
  defaultAdapterRegistry,
  createSourceFromCandidate,
  createSampleSource,
  FoliateReflowableAdapter,
  PdfAdapter,
} from '@/lib/document';
import { getReaderStatus, type ReaderStatus } from '@/lib/reader';

export default function ReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: itemId } = use(params);

  const isSample = itemId.startsWith('sample');
  const [readerStatus, setReaderStatus] = useState<ReaderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null);
  const [toc, setToc] = useState<ReadonlyArray<TocEntry>>([]);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ReadonlyArray<SearchResult>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'paginated' | 'scrolled'>('paginated');
  const [currentProgression, setCurrentProgression] = useState(0);
  const [currentChapter, setCurrentChapter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [capabilities, setCapabilities] = useState<DocumentCapabilities | null>(null);

  const canZoom = capabilities?.has('zoom') ?? false;
  const canPaginate = capabilities?.has('pagination') ?? false;
  const canSearch = capabilities?.has('textSearch') ?? false;
  const canAdjustFont = capabilities?.has('fontControls') ?? false;

  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<DocumentAdapter | null>(null);

  // 1. Fetch reader candidate and status
  useEffect(() => {
    if (isSample) return;

    const ctrl = new AbortController();

    getReaderStatus(itemId, ctrl.signal)
      .then((status) => {
        setReaderStatus(status);
        if (status.state === 'missing' || status.state === 'no-readable-file') {
          setError('No readable book file found for this library item.');
        } else if (status.candidates.length === 0) {
          setError('No valid readable candidate attached to this item.');
        }
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to check reader status');
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [itemId, isSample]);

  // 2. Initialize and open appropriate document adapter
  useEffect(() => {
    if (!containerRef.current) return;
    if (!isSample && (!readerStatus || readerStatus.candidates.length === 0)) return;

    const source: ReadonlyDocumentSource = isSample
      ? createSampleSource(itemId)
      : createSourceFromCandidate(itemId, readerStatus!.candidates[0]);

    const adapter = defaultAdapterRegistry.createAdapter(source, {
      container: containerRef.current,
    });
    adapterRef.current = adapter;

    let mounted = true;
    void (async () => {
      try {
        await adapter.open(source);

        if (!mounted) {
          await adapter.close();
          return;
        }

        const meta = await adapter.getMetadata();
        const bookToc = await adapter.getTOC();
        const initialLoc = await adapter.getCurrentLocation();
        const caps = adapter.getCapabilities();

        setMetadata(meta);
        setToc(bookToc);
        setCapabilities(caps);

        if (adapter instanceof PdfAdapter) {
          setTotalPages(adapter.totalPages);
          setCurrentPage(adapter.currentPage);
          setZoom(adapter.zoom);
          setRotation(adapter.rotation);
          if (meta.pageCount) {
            setCurrentProgression(1 / meta.pageCount);
          }
        } else if (initialLoc.kind === 'semantic') {
          const payload = initialLoc.payload as { progression?: number; title?: string };
          setCurrentProgression(payload.progression ?? 0);
          if (payload.title) setCurrentChapter(payload.title);
        }
      } catch (openErr: unknown) {
        if (mounted) {
          setError(
            openErr instanceof Error ? openErr.message : 'Failed to load document into reader'
          );
        }
      }
    })();

    return () => {
      mounted = false;
      if (adapterRef.current) {
        void adapterRef.current.close();
      }
      adapterRef.current = null;
    };
  }, [itemId, readerStatus, isSample]);

  // Navigation helpers
  async function navigateTo(location: DocumentLocation) {
    const adapter = adapterRef.current;
    if (!adapter) return;
    try {
      await adapter.goTo(location);
      const loc = await adapter.getCurrentLocation();
      if (adapter instanceof PdfAdapter) {
        setCurrentPage(adapter.currentPage);
        if (adapter.totalPages > 0) {
          setCurrentProgression(adapter.currentPage / adapter.totalPages);
        }
      } else if (loc.kind === 'semantic') {
        const payload = loc.payload as { progression?: number; title?: string };
        setCurrentProgression(payload.progression ?? 0);
        if (payload.title) setCurrentChapter(payload.title);
      }
    } catch {
      // Navigation error handled gracefully
    }
  }

  async function handleSearch(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!adapterRef.current || !searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await adapterRef.current.search(searchQuery.trim());
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  function toggleLayoutMode() {
    const next = layoutMode === 'paginated' ? 'scrolled' : 'paginated';
    setLayoutMode(next);
    if (adapterRef.current && adapterRef.current instanceof FoliateReflowableAdapter) {
      adapterRef.current.setLayoutMode(next);
    }
  }

  async function handleZoomIn() {
    const adapter = adapterRef.current;
    if (!adapter || !(adapter instanceof PdfAdapter) || !containerRef.current) return;
    const nextZoom = Math.min(3.0, Number((zoom + 0.25).toFixed(2)));
    setZoom(nextZoom);
    adapter.setZoom(nextZoom);
    await adapter.renderPage(adapter.currentPage, containerRef.current, { zoom: nextZoom });
  }

  async function handleZoomOut() {
    const adapter = adapterRef.current;
    if (!adapter || !(adapter instanceof PdfAdapter) || !containerRef.current) return;
    const nextZoom = Math.max(0.5, Number((zoom - 0.25).toFixed(2)));
    setZoom(nextZoom);
    adapter.setZoom(nextZoom);
    await adapter.renderPage(adapter.currentPage, containerRef.current, { zoom: nextZoom });
  }

  async function handleRotate() {
    const adapter = adapterRef.current;
    if (!adapter || !(adapter instanceof PdfAdapter) || !containerRef.current) return;
    const nextRotation = (rotation + 90) % 360;
    setRotation(nextRotation);
    adapter.setRotation(nextRotation);
    await adapter.renderPage(adapter.currentPage, containerRef.current, { rotation: nextRotation });
  }

  async function goNext() {
    const adapter = adapterRef.current;
    if (!adapter) return;

    if (adapter instanceof PdfAdapter) {
      await adapter.nextPage();
      setCurrentPage(adapter.currentPage);
      if (adapter.totalPages > 0) {
        setCurrentProgression(adapter.currentPage / adapter.totalPages);
      }
    } else {
      const loc = await adapter.getCurrentLocation();
      if (loc.kind === 'semantic') {
        const payload = loc.payload as { progression?: number };
        const current = payload.progression ?? 0;
        const nextProg = Math.min(1.0, current + 0.05);
        await navigateTo({
          ...loc,
          payload: { ...payload, progression: nextProg },
        });
      }
    }
  }

  async function goPrev() {
    const adapter = adapterRef.current;
    if (!adapter) return;

    if (adapter instanceof PdfAdapter) {
      await adapter.prevPage();
      setCurrentPage(adapter.currentPage);
      if (adapter.totalPages > 0) {
        setCurrentProgression(adapter.currentPage / adapter.totalPages);
      }
    } else {
      const loc = await adapter.getCurrentLocation();
      if (loc.kind === 'semantic') {
        const payload = loc.payload as { progression?: number };
        const current = payload.progression ?? 0;
        const prevProg = Math.max(0.0, current - 0.05);
        await navigateTo({
          ...loc,
          payload: { ...payload, progression: prevProg },
        });
      }
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground select-none">
      {/* 1. Header Bar */}
      <header className="h-14 shrink-0 border-b border-border bg-surface px-4 flex items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Library</span>
          </Link>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate font-serif text-foreground">
              {metadata?.title || readerStatus?.candidates[0]?.name || 'Reading Document'}
            </h1>
            {metadata?.author && (
              <p className="text-[11px] text-muted-foreground truncate">
                {metadata.author}
              </p>
            )}
          </div>
          {metadata?.format && (
            <Badge variant="secondary" className="uppercase text-[10px] hidden md:inline-flex">
              {metadata.format}
            </Badge>
          )}
          {canPaginate && !canSearch && (
            <Badge variant="outline" className="text-[10px] hidden lg:inline-flex text-muted-foreground">
              Image Scan
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            variant={isTocOpen ? 'default' : 'secondary'}
            size="sm"
            onClick={() => {
              setIsTocOpen(!isTocOpen);
              if (isSearchOpen) setIsSearchOpen(false);
            }}
            title="Table of Contents"
          >
            <List size={15} />
            <span className="hidden lg:inline ml-1">Contents</span>
          </Button>

          <Button
            type="button"
            variant={isSearchOpen ? 'default' : 'secondary'}
            size="sm"
            disabled={!canSearch}
            onClick={() => {
              setIsSearchOpen(!isSearchOpen);
              if (isTocOpen) setIsTocOpen(false);
            }}
            title={!canSearch ? 'No searchable text in document' : 'Search Text'}
          >
            <Search size={15} />
            <span className="hidden lg:inline ml-1">Search</span>
          </Button>

          {canZoom ? (
            <div className="flex items-center gap-1 bg-surface-muted/50 p-0.5 rounded border border-border">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  void handleZoomOut();
                }}
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </Button>
              <span className="text-[11px] font-mono px-1 min-w-10 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  void handleZoomIn();
                }}
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </Button>
              <div className="h-3 w-px bg-border mx-0.5" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  void handleRotate();
                }}
                title="Rotate 90° Clockwise"
              >
                <RotateCw size={14} />
              </Button>
            </div>
          ) : canAdjustFont ? (
            <div className="flex items-center gap-1 bg-surface-muted/50 p-0.5 rounded border border-border">
              <Button
                type="button"
                variant={layoutMode === 'paginated' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={toggleLayoutMode}
                title="Toggle Paginated / Scrolled Mode"
              >
                <AlignLeft size={13} className="mr-1" />
                <span className="capitalize">{layoutMode}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs font-serif"
                title="Reader Typography: Iowan / Charter System Font"
              >
                <Type size={13} className="mr-1" />
                <span>Serif</span>
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      {/* 2. Main Reader Canvas & Overlays */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Table of Contents Drawer */}
        {isTocOpen && (
          <aside className="w-72 sm:w-80 h-full border-r border-border bg-surface flex flex-col z-30 animate-in slide-in-from-left duration-200">
            <div className="h-12 border-b border-border px-4 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Table of Contents
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setIsTocOpen(false)}
              >
                <X size={15} />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {toc.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No table of contents available for this publication.
                </div>
              ) : (
                toc.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    onClick={() => {
                      void navigateTo(entry.targetLocation);
                      setIsTocOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded hover:bg-surface-muted transition-colors flex items-center justify-between group"
                  >
                    <span className="truncate group-hover:text-foreground">
                      {entry.title}
                    </span>
                    {entry.children && entry.children.length > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                        {entry.children.length}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Search Panel */}
        {isSearchOpen && (
          <aside className="w-72 sm:w-80 h-full border-r border-border bg-surface flex flex-col z-30 animate-in slide-in-from-left duration-200">
            <div className="h-12 border-b border-border px-4 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Search Document
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setIsSearchOpen(false)}
              >
                <X size={15} />
              </Button>
            </div>
            <form onSubmit={handleSearch} className="p-3 border-b border-border">
              <div className="flex gap-2">
                <input
                  type="search"
                  placeholder="Find in text..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-surface-muted px-2.5 py-1.5 rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button type="submit" size="sm" disabled={isSearching} className="h-7 text-xs">
                  {isSearching ? '...' : 'Find'}
                </Button>
              </div>
            </form>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {searchResults.length === 0 && searchQuery && !isSearching && (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No matching text found.
                </div>
              )}
              {searchResults.map((result) => (
                <button
                  type="button"
                  key={result.id}
                  onClick={() => {
                    void navigateTo(result.location);
                    setIsSearchOpen(false);
                  }}
                  className="w-full text-left p-2.5 text-xs rounded border border-transparent hover:border-border hover:bg-surface-muted transition-all"
                >
                  <div className="font-semibold text-foreground text-[11px] mb-0.5">
                    Match in document
                  </div>
                  <p className="text-muted-foreground line-clamp-2 italic text-[11px]">
                    {result.snippet}
                  </p>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Central Reader Viewport */}
        <main className="flex-1 relative flex flex-col items-center justify-center overflow-hidden bg-background">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
              <BookOpen className="h-8 w-8 text-muted-foreground animate-pulse mb-3" />
              <p className="text-xs text-muted-foreground">Opening document...</p>
            </div>
          )}

          {error && (
            <div className="p-6 max-w-md text-center">
              <p className="text-sm font-medium text-destructive mb-2">
                Reader Error
              </p>
              <p className="text-xs text-muted-foreground mb-4">{error}</p>
              <Link href="/">
                <Button size="sm" variant="secondary">
                  Return to Library
                </Button>
              </Link>
            </div>
          )}

          {/* Mount point for engine renderer */}
          <div
            ref={containerRef}
            className="flex-1 w-full h-full relative overflow-auto bg-background p-4 flex items-center justify-center"
            style={{ minHeight: 0 }}
          />

          {/* Navigation floating buttons */}
          <button
            type="button"
            onClick={() => {
              void goPrev();
            }}
            disabled={canPaginate ? currentPage <= 1 : currentProgression <= 0}
            aria-label="Previous Page"
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface/80 border border-border text-foreground/70 hover:text-foreground hover:bg-surface shadow transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => {
              void goNext();
            }}
            disabled={canPaginate ? currentPage >= totalPages : currentProgression >= 1}
            aria-label="Next Page"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface/80 border border-border text-foreground/70 hover:text-foreground hover:bg-surface shadow transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight size={20} />
          </button>
        </main>
      </div>

      {/* 3. Footer Bar / Reading Progress */}
      <footer className="h-10 shrink-0 border-t border-border bg-surface px-4 flex items-center justify-between text-xs text-muted-foreground z-20">
        <div className="truncate max-w-sm font-serif">
          {canPaginate
            ? `Page ${currentPage} of ${totalPages}`
            : currentChapter || metadata?.title || ''}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span>{Math.round(currentProgression * 100)}%</span>
          <div className="w-24 sm:w-36 h-1.5 rounded-full bg-surface-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round(currentProgression * 100)}%` }}
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
