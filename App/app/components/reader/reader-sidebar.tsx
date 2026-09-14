'use client';

/**
 * Unified Reader Sidebar.
 * Houses Contents (TOC), Search, and Bookmarks within a single coherent panel.
 * Coexists alongside reading content on desktop (>= 1024px) and becomes an overlay
 * drawer on tablet/mobile (< 1024px) with accessible keyboard and focus behavior.
 */

import { useEffect, useRef } from 'react';
import { List, Search, Bookmark, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReader, type SidebarTab } from './reader-context';
import { ReaderContents } from './reader-contents';
import { ReaderSearch } from './reader-search';
import { ReaderBookmarks } from './reader-bookmarks';

export function ReaderSidebar() {
  const { activeSidebar, setActiveSidebar, snapshot } = useReader();
  const sidebarRef = useRef<HTMLElement>(null);

  // Close with Escape key
  useEffect(() => {
    if (!activeSidebar) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveSidebar(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSidebar, setActiveSidebar]);

  if (!activeSidebar) return null;

  const tabs: Array<{ id: SidebarTab; label: string; icon: typeof List; badge?: number | string }> = [
    {
      id: 'contents',
      label: 'Contents',
      icon: List,
      badge: snapshot.toc.length > 0 ? snapshot.toc.length : undefined,
    },
    {
      id: 'search',
      label: 'Search',
      icon: Search,
    },
    {
      id: 'bookmarks',
      label: 'Bookmarks',
      icon: Bookmark,
      badge: snapshot.bookmarks.length > 0 ? snapshot.bookmarks.length : undefined,
    },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay (below 1024px) */}
      <div
        className="fixed inset-0 bg-background/60 backdrop-blur-xs z-30 lg:hidden"
        onClick={() => setActiveSidebar(null)}
        aria-hidden="true"
      />

      {/* Main Sidebar Panel */}
      <aside
        ref={sidebarRef}
        className="fixed inset-y-0 left-0 w-80 sm:w-88 border-r border-border bg-surface flex flex-col z-40 lg:static lg:z-10 shadow-lg lg:shadow-none animate-in slide-in-from-left duration-200"
        aria-label="Reader Navigation and Utilities"
      >
        {/* Header with Navigation Tabs and Close Button */}
        <div className="h-12 border-b border-border px-2 flex items-center justify-between gap-1 shrink-0 bg-surface">
          <nav className="flex items-center gap-1 min-w-0" aria-label="Sidebar Sections">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSidebar === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveSidebar(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-surface-muted text-foreground border border-border/80'
                      : 'text-muted-foreground hover:text-foreground hover:bg-surface-muted/50'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={14} className={isActive ? 'text-primary' : ''} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className="text-[10px] font-mono px-1 py-0 bg-surface-muted rounded text-muted-foreground ml-0.5">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setActiveSidebar(null)}
            title="Close sidebar (Esc)"
            aria-label="Close sidebar"
          >
            <X size={15} />
          </Button>
        </div>

        {/* Panel Content Body */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {activeSidebar === 'contents' && <ReaderContents />}
          {activeSidebar === 'search' && <ReaderSearch />}
          {activeSidebar === 'bookmarks' && <ReaderBookmarks />}
        </div>
      </aside>
    </>
  );
}
