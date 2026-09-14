'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns,
  List,
  Loader2,
  Search,
  ScrollText,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  FoliateReflowableAdapter,
  type TocEntry,
  type SearchResult,
  type DocumentLocation,
  type ReadonlyDocumentSource,
  type DocumentMetadata,
  type DocumentFormat,
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
  const [loading, setLoading] = useState(!isSample);
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

  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<FoliateReflowableAdapter | null>(null);

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
        } else {
          const candidate = status.candidates[0];
          if (candidate.format.toLowerCase() === 'pdf') {
            setError(
              `Attached file "${candidate.name}" is a PDF (fixed-layout document reserved for Phase 06). The Phase 05 Reflowable Book Engine supports EPUB, MOBI, AZW, AZW3, FB2, and CBZ.`
            );
          }
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

  // 2. Initialize and open reflowable document adapter
  useEffect(() => {
    if (!containerRef.current) return;

    let source: ReadonlyDocumentSource;

    if (itemId.startsWith('sample')) {
      source = {
        itemId,
        formatId: 'media-sample',
        format: 'epub',
        sourceHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        byteSize: 524288,
        title: 'Domain Driven Reader Systems.epub',
      };
    } else {
      if (!readerStatus || readerStatus.candidates.length === 0) return;
      const candidate = readerStatus.candidates[0];
      const fmt = candidate.format.toLowerCase();
      if (fmt === 'pdf') {
        return; // Fixed layout PDF deferred to Phase 06
      }
      source = {
        itemId,
        formatId: candidate.id,
        format: (fmt as DocumentFormat) || 'epub',
        sourceHash: candidate.id, // verified file identifier
        byteSize: candidate.sizeBytes,
        title: candidate.name,
        resolverRef: `/api/reader/items/${encodeURIComponent(itemId)}/file?candidateId=${encodeURIComponent(candidate.id)}`,
      };
    }

    const adapter = new FoliateReflowableAdapter({
      container: containerRef.current,
    });
    adapterRef.current = adapter;

    let mounted = true;
    void (async () => {
      try {
        await adapter.open(source, undefined, {
          container: containerRef.current,
        });

        if (!mounted) {
          await adapter.close();
          return;
        }

        const meta = await adapter.getMetadata();
        const bookToc = await adapter.getTOC();
        const initialLoc = await adapter.getCurrentLocation();

        setMetadata(meta);
        setToc(bookToc);

        if (initialLoc.kind === 'semantic') {
          const payload = initialLoc.payload as { progression?: number; title?: string };
          setCurrentProgression(payload.progression ?? 0);
          if (payload.title) setCurrentChapter(payload.title);
        }
      } catch (openErr: unknown) {
        if (mounted) {
          setError(
            openErr instanceof Error ? openErr.message : 'Failed to open book in viewer'
          );
        }
      }
    })();

    return () => {
      mounted = false;
      adapter.close().catch(() => {});
      adapterRef.current = null;
    };
  }, [itemId, readerStatus]);

  // Navigation helpers
  async function navigateTo(location: DocumentLocation) {
    if (!adapterRef.current) return;
    try {
      await adapterRef.current.goTo(location);
      const loc = await adapterRef.current.getCurrentLocation();
      if (loc.kind === 'semantic') {
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
    if (adapterRef.current) {
      adapterRef.current.setLayoutMode(next);
    }
  }

  async function goNext() {
    if (!adapterRef.current) return;
    const loc = await adapterRef.current.getCurrentLocation();
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

  async function goPrev() {
    if (!adapterRef.current) return;
    const loc = await adapterRef.current.getCurrentLocation();
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
              {metadata?.title || readerStatus?.candidates[0]?.name || 'Reading Book'}
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
            onClick={() => {
              setIsSearchOpen(!isSearchOpen);
              if (isTocOpen) setIsTocOpen(false);
            }}
            title="Search Text"
          >
            <Search size={15} />
            <span className="hidden lg:inline ml-1">Search</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={toggleLayoutMode}
            title={`Toggle layout mode (current: ${layoutMode})`}
          >
            {layoutMode === 'paginated' ? <Columns size={15} /> : <ScrollText size={15} />}
            <span className="hidden xl:inline ml-1 capitalize">{layoutMode}</span>
          </Button>
        </div>
      </header>

      {/* 2. Main Content Area */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Table of Contents Drawer */}
        {isTocOpen && (
          <aside className="w-80 border-r border-border bg-surface shrink-0 flex flex-col z-10 shadow-lg animate-in slide-in-from-left duration-200">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-primary" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Table of Contents
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsTocOpen(false)}
              >
                <X size={15} />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {toc.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  No table of contents available.
                </p>
              ) : (
                toc.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      void navigateTo(entry.targetLocation);
                      setIsTocOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded text-xs font-serif text-foreground hover:bg-surface-muted transition-colors truncate"
                    title={entry.title}
                  >
                    {entry.title}
                  </button>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Search Panel */}
        {isSearchOpen && (
          <aside className="w-80 border-r border-border bg-surface shrink-0 flex flex-col z-10 shadow-lg animate-in slide-in-from-left duration-200">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search size={16} className="text-primary" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Search Book
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsSearchOpen(false)}
              >
                <X size={15} />
              </Button>
            </div>
            <form
              onSubmit={(e) => {
                void handleSearch(e);
              }}
              className="p-3 border-b border-border flex gap-2"
            >
              <Input
                type="text"
                placeholder="Find in publication..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" disabled={isSearching || !searchQuery.trim()}>
                {isSearching ? <Loader2 size={13} className="animate-spin" /> : 'Find'}
              </Button>
            </form>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {searchResults.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  {searchQuery ? 'No occurrences found.' : 'Enter text to search.'}
                </p>
              ) : (
                searchResults.map((res) => (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => {
                      void navigateTo(res.location);
                      setIsSearchOpen(false);
                    }}
                    className="w-full text-left p-2.5 rounded border border-border bg-surface-muted/30 hover:bg-surface-muted text-xs transition-colors"
                  >
                    <p className="font-serif text-foreground line-clamp-2">
                      {res.snippet}
                    </p>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Document Viewport */}
        <main className="flex-1 relative flex flex-col h-full bg-background overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 z-20">
              <Loader2 className="animate-spin text-primary" size={28} />
              <p className="text-xs text-muted-foreground font-serif">
                Opening publication in reflowable engine...
              </p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-20 bg-background">
              <div className="max-w-md space-y-3">
                <h3 className="text-base font-semibold text-destructive font-serif">
                  Document Loading Notice
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {error}
                </p>
                <div className="pt-2">
                  <Link href="/">
                    <Button variant="secondary" size="sm">
                      Return to Library
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Foliate-JS mount container - Read & Watch owns outer frame, zero Foliate chrome */}
          <div
            ref={containerRef}
            className="flex-1 w-full h-full relative overflow-hidden bg-background"
            style={{ minHeight: 0 }}
          />

          {/* Navigation floating buttons */}
          <button
            type="button"
            onClick={() => {
              void goPrev();
            }}
            aria-label="Previous Page"
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface/80 border border-border text-foreground/70 hover:text-foreground hover:bg-surface shadow transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => {
              void goNext();
            }}
            aria-label="Next Page"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface/80 border border-border text-foreground/70 hover:text-foreground hover:bg-surface shadow transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </main>
      </div>

      {/* 3. Footer Bar / Reading Progress */}
      <footer className="h-10 shrink-0 border-t border-border bg-surface px-4 flex items-center justify-between text-xs text-muted-foreground z-20">
        <div className="truncate max-w-sm font-serif">
          {currentChapter || metadata?.title || ''}
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
