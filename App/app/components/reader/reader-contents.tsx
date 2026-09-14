'use client';

/**
 * Reader Table of Contents Panel.
 * Renders hierarchical document navigation entries regardless of whether
 * they originate from an EPUB navigation document or a PDF outline.
 */

import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, BookOpen } from 'lucide-react';
import { type TocEntry } from '@/lib/document';
import { useReader } from './reader-context';

function TocItem({
  entry,
  depth = 0,
  onSelect,
}: {
  entry: TocEntry;
  depth?: number;
  onSelect: (entry: TocEntry) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = Boolean(entry.children && entry.children.length > 0);

  return (
    <div className="text-xs">
      <div
        className="flex items-center gap-1 group rounded hover:bg-surface-muted transition-colors py-1 px-2"
        style={{ paddingLeft: `${Math.max(0.5, depth * 0.85 + 0.5)}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 text-muted-foreground hover:text-foreground rounded shrink-0"
            aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onSelect(entry)}
          className="flex-1 text-left truncate text-foreground/80 hover:text-foreground group-hover:text-primary transition-colors py-0.5"
          title={entry.title}
        >
          <span className="truncate">{entry.title}</span>
        </button>

        {hasChildren && (
          <span className="text-[10px] text-muted-foreground/60 shrink-0 font-mono pr-1">
            {entry.children!.length}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="border-l border-border/40 ml-3.5 my-0.5">
          {entry.children!.map((child) => (
            <TocItem
              key={child.id}
              entry={child}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function filterTocEntries(entries: readonly TocEntry[], query: string): TocEntry[] {
  const q = query.toLowerCase();
  function matchEntry(e: TocEntry): boolean {
    if (e.title.toLowerCase().includes(q)) return true;
    if (e.children && e.children.some(matchEntry)) return true;
    return false;
  }
  return entries.filter(matchEntry);
}

export function ReaderContents() {
  const { snapshot, goTo, setActiveSidebar } = useReader();
  const [filterQuery, setFilterQuery] = useState('');

  const filteredToc = useMemo(() => {
    if (!filterQuery.trim()) return snapshot.toc;
    return filterTocEntries(snapshot.toc, filterQuery);
  }, [snapshot.toc, filterQuery]);

  const handleSelect = (entry: TocEntry) => {
    void goTo(entry.targetLocation);
    // On narrow viewports, close sidebar upon selection
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setActiveSidebar(null);
    }
  };

  if (snapshot.toc.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <BookOpen className="w-8 h-8 opacity-40 mb-2" />
        <p className="text-xs font-medium">No contents outline</p>
        <p className="text-[11px] text-muted-foreground/70 mt-1 max-w-xs">
          This publication does not declare a structured table of contents.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {snapshot.toc.length > 0 && (
        <div className="p-2 border-b border-border/80 shrink-0">
          <input
            type="search"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter contents..."
            className="w-full bg-surface-muted/60 px-2.5 py-1 rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {filteredToc.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No sections match your filter.
          </div>
        ) : (
          filteredToc.map((entry) => (
            <TocItem key={entry.id} entry={entry} onSelect={handleSelect} />
          ))
        )}
      </div>
    </div>
  );
}
