'use client';

/**
 * Reader Search Panel.
 * Shared search grammar across reflowable and PDF engines.
 *
 * Native document text stays the first choice. When a page has derived OCR
 * results those become searchable here too, but a machine-transcribed hit is
 * labelled as such, keeps every mandatory provider's own text, and is never
 * presented as document text. A page whose native text layer is usable is
 * matched once, from native text (the server refuses to duplicate it from OCR).
 */

import { useState, useRef, useEffect } from 'react';
import { Search, X, Loader2, FileQuestion, ScanText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createPageLocation, type SearchResult } from '@/lib/document';
import { searchOcrDerivedText, type OcrDerivedSearchResult } from '@/lib/ocr';
import { useReader } from './reader-context';

/** A search hit as shown in the panel, with machine-transcription provenance. */
interface ReaderSearchEntry extends SearchResult {
  /** Provider ids of a machine transcription that matched the same page. */
  alsoMachineTranscribedBy?: ReadonlyArray<string>;
  ocrDerived?: OcrDerivedSearchResult;
}

function providerLabel(result: OcrDerivedSearchResult): string {
  return result.providerIds.length > 0 ? result.providerIds.join(' + ') : 'unknown provider';
}

export function ReaderSearch() {
  const { session, snapshot, goTo, setActiveSidebar } = useReader();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReadonlyArray<ReaderSearchEntry>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [ocrNotice, setOcrNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);

  const canSearch = snapshot.capabilities.has('textSearch');
  const sourceHash = snapshot.source?.sourceHash ?? null;

  // Focus search input when mounted
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSearch = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setIsSearching(true);
    setHasSearched(true);
    setOcrNotice(null);

    try {
      const nativeResults = canSearch
        ? await session.search(cleanQuery, undefined, ctrl.signal)
        : [];

      let derived: ReadonlyArray<OcrDerivedSearchResult> = [];
      if (sourceHash) {
        try {
          const response = await searchOcrDerivedText({
            sourceHash,
            query: cleanQuery,
            signal: ctrl.signal,
          });
          derived = response.results;
          if (derived.some((hit) => hit.partial)) {
            setOcrNotice(
              'Some machine-transcribed hits come from a partially completed OCR run and are labelled as such.',
            );
          }
        } catch {
          // Derived search is an additional capability: a failure here never
          // blocks native search and is never reported as "no results found".
          setOcrNotice('Machine transcription could not be searched in this session.');
        }
      }

      const nativePageNumbers = new Set(
        nativeResults
          .filter((result) => result.location.kind === 'page')
          .map((result) => (result.location.payload as { pageNumber?: number }).pageNumber),
      );

      const merged: ReaderSearchEntry[] = nativeResults.map((result) => ({ ...result }));
      const standalone: ReaderSearchEntry[] = [];
      for (const hit of derived) {
        const pageNumber = hit.pageIndex + 1;
        const host =
          nativePageNumbers.size > 0
            ? merged.find(
                (entry) =>
                  entry.location.kind === 'page' &&
                  (entry.location.payload as { pageNumber?: number }).pageNumber === pageNumber,
              )
            : undefined;
        if (host) {
          // Same page and same query: presented once, with both provenances kept.
          host.alsoMachineTranscribedBy = [
            ...new Set([...(host.alsoMachineTranscribedBy ?? []), ...hit.providerIds]),
          ];
          continue;
        }
        standalone.push({
          id: hit.id,
          matchText: hit.matchText,
          snippet: hit.snippet,
          location: createPageLocation(sourceHash ?? '', pageNumber),
          provenance: 'OCR_DERIVED',
          providers: hit.providers.map((provider) => ({
            providerId: provider.providerId,
            providerVersion: provider.providerVersion,
            modelRevision: provider.modelRevision,
            text: provider.displayText,
          })),
          completionState: hit.completionState,
          partial: hit.partial,
          ocrDerived: hit,
        });
      }

      setResults([...merged, ...standalone]);
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
    setOcrNotice(null);
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
            placeholder={canSearch ? 'Search text in document...' : 'Search machine transcription...'}
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
          <output
            className="flex items-center justify-between mt-2 px-1 text-[11px] text-muted-foreground"
            aria-live="polite"
          >
            <span>
              {results.length === 1 ? '1 match found' : `${results.length} matches found`}
            </span>
            {results.length > 0 && (
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {results.length}
              </Badge>
            )}
          </output>
        )}
      </form>

      {!canSearch && (
        <div className="mx-2 mt-2 rounded border border-border/70 bg-surface-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground/90">
            <FileQuestion className="h-3.5 w-3.5 opacity-70" />
            No usable native text layer
          </p>
          <p className="mt-1">
            This publication contains image-only pages or does not declare extractable text
            streams. Search matches local machine transcription for pages that have been OCR&apos;d;
            nothing is uploaded.
          </p>
        </div>
      )}

      {ocrNotice && <p className="px-4 pt-3 text-[11px] text-muted-foreground">{ocrNotice}</p>}

      {/* Results List */}
      <section className="flex-1 overflow-y-auto p-2 space-y-1" aria-label="Search results">
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
              {canSearch
                ? 'Check spelling or try a shorter phrase.'
                : 'Pages without a native text layer must be OCR\u2019d before their text can be searched.'}
            </p>
          </div>
        )}

        {!isSearching &&
          results.map((result, index) => {
            const pageNum =
              result.location.kind === 'page'
                ? (result.location.payload as { pageNumber?: number }).pageNumber
                : undefined;
            const semanticPayload =
              result.location.kind === 'semantic'
                ? (result.location.payload as { title?: string; spineIndex?: number })
                : undefined;
            const progPayload =
              result.location.kind === 'progression'
                ? (result.location.payload as { label?: string; fraction?: number })
                : undefined;
            const ocrDerived = result.ocrDerived;

            return (
              <button
                type="button"
                key={result.id || `res-${index}`}
                onClick={() => handleSelectResult(result)}
                className="w-full text-left p-2.5 text-xs rounded border border-transparent hover:border-border hover:bg-surface-muted transition-all group"
              >
                <div className="flex items-center justify-between text-[11px] font-medium text-foreground/90 group-hover:text-primary mb-1">
                  <span>Result {index + 1}</span>
                  {pageNum !== undefined && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Page {pageNum}
                    </span>
                  )}
                  {semanticPayload && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {semanticPayload.title ||
                        (semanticPayload.spineIndex !== undefined
                          ? `Section ${semanticPayload.spineIndex + 1}`
                          : 'Section')}
                    </span>
                  )}
                  {progPayload && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {progPayload.label ||
                        `${Math.round((progPayload.fraction ?? 0) * 100)}%`}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground line-clamp-2 italic text-[11px] leading-relaxed">
                  {result.snippet}
                </p>
                {ocrDerived && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                      <ScanText className="h-3 w-3" />
                      Machine transcription
                    </span>
                    <span className="font-mono">{providerLabel(ocrDerived)}</span>
                    {ocrDerived.partial && (
                      <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                        Partial: {ocrDerived.completionState.replaceAll('_', ' ')}
                      </Badge>
                    )}
                  </div>
                )}
                {result.alsoMachineTranscribedBy && result.alsoMachineTranscribedBy.length > 0 && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Also matched by machine transcription:{' '}
                    <span className="font-mono">
                      {result.alsoMachineTranscribedBy.join(' + ')}
                    </span>
                  </p>
                )}
              </button>
            );
          })}
      </section>
    </div>
  );
}
