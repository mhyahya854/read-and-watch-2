'use client';

/**
 * Unified Reader Top Toolbar.
 * Restrained editorial toolbar offering navigation affordances, document identity,
 * sidebar disclosures, capability-driven zoom/rotation controls, and settings trigger.
 * 100% capability-driven; zero format-conditional branching.
 */

import Link from 'next/link';
import {
  ArrowLeft,
  List,
  Search,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  SlidersHorizontal,
  PenTool,
  Download,
  FileJson,
  FileText,
  StickyNote,
  FileDown,
  Highlighter,
  Underline,
  Strikethrough,
  PenLine,
  NotebookPen,
  Columns2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/toast';
import {
  downloadAnnotationsJson,
  downloadAnnotationsMarkdown,
  downloadNotes,
} from '@/lib/portability/client';
import { useReader } from './reader-context';
import { locationsEqual } from '@/lib/document/location-key.mjs';

export function ReaderToolbar() {
  const toast = useToast();
  const {
    snapshot,
    itemId,
    readerStatus,
    activeSidebar,
    setActiveSidebar,
    setIsSettingsOpen,
    isCanvasOpen,
    mobileViewTab,
    setMobileViewTab,
    isCurrentLocationBookmarked,
    goBack,
    goForward,
    zoomIn,
    zoomOut,
    rotate,
    toggleBookmark,
    readerLayout,
    setReaderLayout,
    studyPane,
    setStudyPane,
    annotations,
    createTextMark,
    drawMode,
    setDrawMode,
    canvases,
  } = useReader();

  const canZoom = snapshot.capabilities.has('zoom');
  const canSearch = snapshot.capabilities.has('textSearch');
  const canPaginate = snapshot.capabilities.has('pageNavigation');

  const title =
    snapshot.metadata?.title ||
    readerStatus?.candidates[0]?.name ||
    'Reading Publication';

  const author = snapshot.metadata?.author;
  const formatBadge = snapshot.metadata?.format || readerStatus?.candidates[0]?.format;
  const canMark = snapshot.capabilities.has('textAnnotations');
  const canDraw = snapshot.capabilities.has('surfaceMarkup');

  /** Canvases scoped to the exact location the reader is currently showing. */
  const currentLocationCanvasCount = snapshot.currentLocation
    ? canvases.filter((canvas) => {
        if (canvas.scopeKind !== 'location' || !canvas.scopeAnchor?.location) return false;
        return locationsEqual(canvas.scopeAnchor.location, snapshot.currentLocation);
      }).length
    : 0;

  const openStudyPane = (pane: 'annotations' | 'canvas') => {
    if (readerLayout === 'full') setReaderLayout('split');
    setStudyPane(studyPane === pane ? 'none' : pane);
  };

  const handleExportJson = async () => {
    try {
      await downloadAnnotationsJson(itemId, title);
      toast.success('Annotations JSON downloaded.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleExportMarkdown = async () => {
    try {
      await downloadAnnotationsMarkdown(itemId, title);
      toast.success('Annotations Markdown downloaded.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleExportNotes = async () => {
    try {
      await downloadNotes(itemId, title);
      toast.success('Notes & Thoughts JSON downloaded.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleExportAnnotatedPdf = () => {
    const url = `/api/portability/pdf/${encodeURIComponent(itemId)}/annotated`;
    window.open(url, '_blank');
  };

  return (
    <header className="h-14 shrink-0 border-b border-border bg-surface px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 z-20">
      {/* 1. Left: Back to Library & Title Metadata */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1.5 rounded hover:bg-surface-muted focus-visible:outline-ring"
          title="Return to Library"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Library</span>
        </Link>

        <div className="h-4 w-px bg-border hidden sm:block shrink-0" />

        <div className="min-w-0">
          <h1
            className="text-xs sm:text-sm font-semibold truncate font-serif text-foreground leading-tight"
            title={title}
          >
            {title}
          </h1>
          {author && (
            <p className="text-[11px] text-muted-foreground truncate leading-tight">
              {author}
            </p>
          )}
        </div>

        {formatBadge && (
          <Badge
            variant="secondary"
            className="uppercase text-[10px] tracking-wider hidden md:inline-flex shrink-0 font-mono"
          >
            {formatBadge}
          </Badge>
        )}

        {canPaginate && !canSearch && (
          <Badge
            variant="outline"
            className="text-[10px] hidden lg:inline-flex text-muted-foreground shrink-0"
            title="This document is an image scan without extractable text"
          >
            Image Scan
          </Badge>
        )}
      </div>

      {/* 2. Center: Location History Affordances */}
      <div className="hidden md:flex items-center gap-1 bg-surface-muted/40 p-0.5 rounded border border-border/80">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!snapshot.canGoBack}
          onClick={() => {
            void goBack();
          }}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
          title="Back to Previous Location"
          aria-label="Back to Previous Location"
        >
          <ChevronLeft size={15} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!snapshot.canGoForward}
          onClick={() => {
            void goForward();
          }}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
          title="Forward in Location History"
          aria-label="Forward in Location History"
        >
          <ChevronRight size={15} />
        </Button>
      </div>

      {/* 2b. Annotation tools: kept at hand, never behind a second menu */}
      <fieldset
        className="hidden lg:flex items-center gap-0.5 bg-surface-muted/40 p-0.5 rounded border border-border/80"
      >
        <legend className="sr-only">Annotation tools</legend>
        {canMark && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => void createTextMark('highlight')}
              title="Highlight selection"
              aria-label="Highlight selection"
            >
              <Highlighter size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => void createTextMark('underline')}
              title="Underline selection"
              aria-label="Underline selection"
            >
              <Underline size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => void createTextMark('strike')}
              title="Strike through selection"
              aria-label="Strike through selection"
            >
              <Strikethrough size={14} />
            </Button>
          </>
        )}
        {canDraw && (
          <Button
            type="button"
            variant={drawMode ? 'default' : 'ghost'}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setDrawMode(!drawMode)}
            aria-pressed={drawMode}
            title="Freehand markup on this page"
            aria-label="Freehand markup"
          >
            <PenLine size={14} />
          </Button>
        )}
      </fieldset>

      {/* 3. Right: Sidebar Toggles, Capability-Driven Controls, and Settings */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Contents Drawer Toggle */}
        <Button
          type="button"
          variant={activeSidebar === 'contents' ? 'default' : 'secondary'}
          size="sm"
          onClick={() => {
            setActiveSidebar(activeSidebar === 'contents' ? null : 'contents');
          }}
          className="h-8 px-2 sm:px-2.5 text-xs"
          title="Table of Contents"
          aria-expanded={activeSidebar === 'contents'}
        >
          <List size={15} />
          <span className="hidden xl:inline ml-1.5">Contents</span>
        </Button>

        {/* Search Drawer Toggle */}
        <Button
          type="button"
          variant={activeSidebar === 'search' ? 'default' : 'secondary'}
          size="sm"
          onClick={() => {
            setActiveSidebar(activeSidebar === 'search' ? null : 'search');
          }}
          className="h-8 px-2 sm:px-2.5 text-xs"
          title={
            !canSearch
              ? "Search (Text search isn't available for this document)"
              : 'Search Text (Ctrl+F)'
          }
          aria-expanded={activeSidebar === 'search'}
        >
          <Search size={15} />
          <span className="hidden xl:inline ml-1.5">Search</span>
        </Button>

        {/* Bookmark Action & Sidebar Toggle */}
        <div className="inline-flex rounded border border-border overflow-hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void toggleBookmark();
            }}
            className={`h-8 px-2 text-xs hover:bg-surface-muted ${
              isCurrentLocationBookmarked ? 'text-primary font-medium' : 'text-muted-foreground'
            }`}
            title={
              isCurrentLocationBookmarked
                ? 'Remove Bookmark for this location'
                : 'Bookmark this location (B)'
            }
            aria-label="Bookmark Location"
          >
            <Bookmark
              size={15}
              className={isCurrentLocationBookmarked ? 'fill-primary text-primary' : ''}
            />
          </Button>
          <Button
            type="button"
            variant={activeSidebar === 'bookmarks' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveSidebar(activeSidebar === 'bookmarks' ? null : 'bookmarks');
            }}
            className="h-8 px-1.5 text-xs border-l border-border"
            title="View All Bookmarks"
            aria-expanded={activeSidebar === 'bookmarks'}
          >
            <span className="text-[11px] font-mono px-0.5">
              {snapshot.bookmarks.length}
            </span>
          </Button>
        </div>

        {/* Zoom Controls (Capability-Driven: only shown when canZoom is true) */}
        {canZoom && (
          <div className="flex items-center gap-0.5 bg-surface-muted/50 p-0.5 rounded border border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={zoomOut}
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <ZoomOut size={14} />
            </Button>
            <span className="text-[11px] font-mono px-1 min-w-9 text-center text-foreground">
              {Math.round(snapshot.zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={zoomIn}
              title="Zoom In"
              aria-label="Zoom In"
            >
              <ZoomIn size={14} />
            </Button>
            <div className="h-3 w-px bg-border mx-0.5" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={rotate}
              title="Rotate 90° Clockwise"
              aria-label="Rotate Clockwise"
            >
              <RotateCw size={14} />
            </Button>
          </div>
        )}

        {/* Beside-Reader Canvas Notes Toggle (Phase 10 — P10-T006) */}
        <Button
          type="button"
          variant={studyPane === 'annotations' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => openStudyPane('annotations')}
          className="h-8 px-2 sm:px-2.5 text-xs"
          title="This book's annotations"
          aria-label="Annotations"
          aria-pressed={studyPane === 'annotations'}
        >
          <NotebookPen size={14} />
          <span className="hidden md:inline ml-1.5">Notes</span>
          {annotations.length > 0 && (
            <span className="ml-1 font-mono text-[10px]">{annotations.length}</span>
          )}
        </Button>

        {/* Knowledge Canvas toggle, with the current-location canvas count */}
        <Button
          type="button"
          variant={isCanvasOpen || studyPane === 'canvas' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => {
            if (readerLayout === 'full') setReaderLayout('split');
            if (studyPane === 'canvas' && !isCanvasOpen) {
              setStudyPane('none');
              return;
            }
            setStudyPane('canvas');
          }}
          className="h-8 px-2 sm:px-2.5 text-xs"
          title="Knowledge Canvas for this book"
          aria-label="Knowledge Canvas"
          aria-pressed={studyPane === 'canvas'}
          data-testid="knowledge-canvas-toggle"
        >
          <PenTool size={14} />
          <span className="hidden md:inline ml-1.5">Canvas</span>
          {currentLocationCanvasCount > 0 && (
            <span
              className="ml-1 rounded-full bg-primary/15 px-1.5 font-mono text-[10px] text-primary"
              data-testid="page-canvas-count"
              title={`${currentLocationCanvasCount} canvas(es) linked to this location`}
            >
              {currentLocationCanvasCount}
            </span>
          )}
        </Button>

        {/* Reader layout states: split / full / minimized */}
        <div className="hidden md:flex items-center gap-0.5 bg-surface-muted/40 p-0.5 rounded border border-border/80">
          <Button
            type="button"
            variant={readerLayout === 'split' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setReaderLayout('split')}
            aria-pressed={readerLayout === 'split'}
            title="Split reader and study workspace"
            aria-label="Split view"
          >
            <Columns2 size={14} />
          </Button>
          <Button
            type="button"
            variant={readerLayout === 'full' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setReaderLayout('full')}
            aria-pressed={readerLayout === 'full'}
            title="Full reader"
            aria-label="Full reader"
          >
            <Maximize2 size={14} />
          </Button>
          <Button
            type="button"
            variant={readerLayout === 'minimized' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => {
              setReaderLayout('minimized');
              if (studyPane === 'none' && !isCanvasOpen) setStudyPane('annotations');
            }}
            aria-pressed={readerLayout === 'minimized'}
            title="Minimize reader, expand the study workspace"
            aria-label="Minimize reader"
          >
            <Minimize2 size={14} />
          </Button>
        </div>

        {/* Mobile Tab Switcher when Canvas is open on narrow screens */}
        {isCanvasOpen && (
          <div className="flex md:hidden items-center bg-surface-muted p-0.5 rounded border border-border text-[10px]">
            <button
              type="button"
              onClick={() => setMobileViewTab('reader')}
              className={`px-2 py-0.5 rounded font-medium ${
                mobileViewTab === 'reader'
                  ? 'bg-surface text-foreground shadow-xs'
                  : 'text-muted-foreground'
              }`}
            >
              Book
            </button>
            <button
              type="button"
              onClick={() => setMobileViewTab('canvas')}
              className={`px-2 py-0.5 rounded font-medium ${
                mobileViewTab === 'canvas'
                  ? 'bg-surface text-foreground shadow-xs'
                  : 'text-muted-foreground'
              }`}
            >
              Canvas
            </button>
          </div>
        )}

        {/* Export Dropdown Menu (Phase 12 — P12-T002 / P12-T003 / P12-T005) */}
        <DropdownMenu
          trigger={(open, toggle) => (
            <Button
              type="button"
              variant={open ? 'secondary' : 'ghost'}
              size="sm"
              onClick={toggle}
              className="h-8 px-2 sm:px-2.5 text-xs"
              title="Export Annotations, Notes, or Derivative"
              aria-label="Export Menu"
            >
              <Download size={14} />
              <span className="hidden lg:inline ml-1.5">Export</span>
            </Button>
          )}
        >
          {(close) => (
            <div className="py-1">
              <DropdownMenuItem
                onClick={() => {
                  close();
                  void handleExportJson();
                }}
              >
                <FileJson size={13} className="text-warning" />
                <span>Export Annotations (JSON)</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => {
                  close();
                  void handleExportMarkdown();
                }}
              >
                <FileText size={13} className="text-primary" />
                <span>Export Annotations (Markdown)</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => {
                  close();
                  void handleExportNotes();
                }}
              >
                <StickyNote size={13} className="text-warning" />
                <span>Export Notes &amp; Thoughts (JSON)</span>
              </DropdownMenuItem>

              {formatBadge === 'PDF' && (
                <DropdownMenuItem
                  onClick={() => {
                    close();
                    handleExportAnnotatedPdf();
                  }}
                >
                  <FileDown size={13} className="text-success" />
                  <span>Export Annotated PDF</span>
                </DropdownMenuItem>
              )}
            </div>
          )}
        </DropdownMenu>

        {/* Reader Settings Drawer Trigger */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setIsSettingsOpen(true)}
          className="h-8 px-2 sm:px-2.5 text-xs"
          title="Reader Settings & Typography"
          aria-label="Reader Settings"
        >
          <SlidersHorizontal size={15} />
          <span className="hidden xl:inline ml-1.5">Settings</span>
        </Button>
      </div>
    </header>
  );
}
