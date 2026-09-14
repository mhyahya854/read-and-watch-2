'use client';

/**
 * Reader Search Panel.
 * Shared search grammar across reflowable and PDF engines.
 * Missing-text PDFs truthfully display unavailable capability without invoking OCR.
 */

import { useState, useRef, useEffect } from 'react';
import { Search, X, Loader2, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type SearchResult } from '@/lib/document';
import { useReader } from './reader-context';

export function ReaderSearch() {
  const { session, snapshot, goTo, setActiveSidebar } = useReader();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReadonlyArray<SearchResult>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const canSearch = snapshot.capabilities.has('textSearch');

  // Focus search input when mounted
  useEffect(() => {
    if (canSearch && inputRef.current) {
      inputRef.current.focus();
    }
  }, [canSearch]);

  const handleSearch = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const cleanQuery = query.trim();
    if (!canSearch || !cleanQuery) return;

    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const matchResults = await session.search(cleanQuery, undefined, ctrl.signal);
      setResults(matchResults);
    } catch {
      if (!ctrl.signal.aborted) {
        setResults([]);
      }
    } finally {
      if (!ctrl.signal.aborted) {
        setIsSearching(false);
      }
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
    inputRef.current?.focus();
  };

  const handleSelectResult = (result: SearchResult) => {
    void goTo(result.location);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setActiveSidebar(null);
    }
  };

  // 1. Missing-Text / Scanned PDF fallback
  if (!canSearch) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <FileQuestion className="w-8 h-8 opacity-40 mb-2" />
        <p className="text-xs font-medium text-foreground">
          Text search isn&apos;t available for this document.
        </p>
        <p className="text-[11px] text-muted-foreground/80 mt-1 max-w-xs leading-relaxed">
          This publication contains image-only pages or does not declare extractable text streams.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search Input Bar */}
      <form onSubmit={handleSearch} className="p-3 border-b border-border/80 shrink-0">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search text in document..."
            className="w-full bg-surface-muted/60 pl-8 pr-16 py-1.5 rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />
          <Search size={14} className="absolute left-2.5 text-muted-foreground pointer-events-none" />

          <div className="absolute right-1.5 flex items-center gap-1">
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
                title="Clear query"
              >
                <X size={13} />
              </button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={isSearching || !query.trim()}
              className="h-6 px-2 text-[11px]"
            >
              {isSearching ? <Loader2 size={11} className="animate-spin" /> : 'Find'}
            </Button>
          </div>
        </div>

        {hasSearched && !isSearching && (
          <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-muted-foreground">
            <span>
              {results.length === 1 ? '1 match found' : `${results.length} matches found`}
            </span>
            {results.length > 0 && (
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {results.length}
              </Badge>
            )}
          </div>
        )}
      </form>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isSearching && (
          <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-primary" />
            <span>Searching publication...</span>
          </div>
        )}

        {!isSearching && hasSearched && results.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            <p className="font-medium text-foreground/80">No matching text found</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              Check spelling or try a shorter phrase.
            </p>
          </div>
        )}

        {!isSearching &&
          results.map((result, index) => (
            <button
              type="button"
              key={result.id || `res-${index}`}
              onClick={() => handleSelectResult(result)}
              className="w-full text-left p-2.5 text-xs rounded border border-transparent hover:border-border hover:bg-surface-muted transition-all group"
            >
              <div className="flex items-center justify-between text-[11px] font-medium text-foreground/90 group-hover:text-primary mb-1">
                <span>Result {index + 1}</span>
                {result.location.kind === 'page' && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Page {(result.location.payload as { pageNumber: number }).pageNumber}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground line-clamp-2 italic text-[11px] leading-relaxed">
                {result.snippet}
              </p>
            </button>
          ))}
      </div>
    </div>
  );
}
