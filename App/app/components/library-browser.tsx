'use client';

/* oxlint-disable next/no-img-element -- local library assets use a constrained runtime path */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownAZ,
  BookOpen,
  Clapperboard,
  Columns3,
  FolderOpen,
  Highlighter,
  LibraryBig,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Search,
  Settings,
  Workflow,
} from 'lucide-react';

import { ItemDetail } from '@/components/item-detail';
import { PortableRecoveryNotice } from '@/components/portable-recovery-notice';
import { Button } from '@/components/ui/button';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Collection, LibraryCatalog, LibraryItem } from '@/lib/catalog';
import { libraryAssetUrl } from '@/lib/catalog';
import {
  loadLibrary,
  loadLibraryViews,
  saveLibraryView,
  type LibraryView,
} from '@/lib/library-data';

type Column = 'type' | 'status' | 'tags' | 'people' | 'rating';
type Direction = 'asc' | 'desc';
type Sort = 'title' | 'added' | 'status' | 'rating' | 'people';

const columns: Array<{ id: Column; label: string }> = [
  { id: 'type', label: 'Type' },
  { id: 'status', label: 'Status' },
  { id: 'tags', label: 'Tags' },
  { id: 'people', label: 'Author / creator' },
  { id: 'rating', label: 'Rating' },
];

const controlClass =
  'h-9 rounded-md border border-input bg-surface px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40';

function present(value: string | number | null | undefined) {
  return value === null || value === undefined || String(value).trim() === ''
    ? 'Not set'
    : String(value);
}

function itemPeople(item: LibraryItem) {
  const values = item.collection === 'read' ? item.authors : item.creators;
  return values.join(', ');
}

function Thumbnail({ item }: { item: LibraryItem }) {
  if (!item.preview) {
    const Icon = item.collection === 'read' ? BookOpen : Clapperboard;
    return (
      <span
        aria-hidden="true"
        className="grid h-11 w-8 shrink-0 place-items-center rounded-sm border border-border bg-surface-muted text-muted-foreground"
      >
        <Icon size={15} />
      </span>
    );
  }
  return (
    <img
      src={libraryAssetUrl(item.preview)}
      alt=""
      loading="lazy"
      className="h-11 w-8 shrink-0 rounded-sm border border-border bg-surface-muted object-cover"
    />
  );
}

function compareItems(left: LibraryItem, right: LibraryItem, sort: Sort) {
  if (sort === 'rating') return (left.rating ?? -1) - (right.rating ?? -1);
  const values: Record<Exclude<Sort, 'rating'>, [string, string]> = {
    title: [left.title, right.title],
    added: [left.added, right.added],
    status: [left.status, right.status],
    people: [itemPeople(left), itemPeople(right)],
  };
  const [a, b] = values[sort];
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function LibraryBrowser({
  initialCollection = 'read',
  initialSelectedId = null,
  initialDetailMode = 'split',
  initialSidebarCollapsed = false,
  initialTab = 'overview',
  initialPreviewIndex,
}: {
  initialCollection?: Collection;
  initialSelectedId?: string | null;
  initialDetailMode?: 'split' | 'maximized' | 'closed';
  initialSidebarCollapsed?: boolean;
  initialTab?: 'overview' | 'thoughts' | 'notes' | 'metadata' | 'media' | 'relationships' | 'highlights' | 'canvas';
  initialPreviewIndex?: number;
}) {
  const toast = useToast();
  const [catalog, setCatalog] = useState<LibraryCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [collection, setCollection] = useState<Collection>(initialCollection);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<Sort>('title');
  const [direction, setDirection] = useState<Direction>('asc');
  const [visibleColumns, setVisibleColumns] = useState<Set<Column>>(
    () => new Set(['type', 'status', 'tags', 'people']),
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [detailMode, setDetailMode] = useState<'split' | 'maximized' | 'closed'>(
    initialDetailMode,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed);
  const [dirty, setDirty] = useState(false);
  const [views, setViews] = useState<LibraryView[]>([]);
  const [viewName, setViewName] = useState('');
  const [showViewForm, setShowViewForm] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isDesktop = typeof window !== 'undefined' && Boolean(window.readWatchDesktop);
  const confirmDiscard = () =>
    !dirty || window.confirm('Discard unsaved changes?');

  const handleOpenBook = async () => {
    if (typeof window !== 'undefined' && window.readWatchDesktop) {
      try {
        const res = await window.readWatchDesktop.chooseBookFiles({ multiple: false });
        if (!res.canceled && res.files && res.files.length > 0) {
          window.dispatchEvent(new CustomEvent('readwatch:open-file', { detail: res.files[0] }));
        }
      } catch {
        // Dialog cancelled or unhandled
      }
    }
  };

  async function refreshLibrary() {
    try {
      const next = await loadLibrary();
      setCatalog(next);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Library could not load',
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    loadLibrary()
      .then((next) => {
        if (!cancelled) setCatalog(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Library could not load',
          );
        }
      });
    loadLibraryViews()
      .then((next) => {
        if (!cancelled) setViews(next);
      })
      .catch(() => {
        if (!cancelled) setViews([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (
        (event.key === '/' ||
          (event.ctrlKey && event.key.toLowerCase() === 'k')) &&
        !editing
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && !editing) {
        if (detailMode === 'maximized') {
          event.preventDefault();
          setDetailMode('split');
        } else if (selectedId && detailMode !== 'closed' && confirmDiscard()) {
          event.preventDefault();
          setDetailMode('closed');
        }
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });

  const collectionItems = useMemo(
    () =>
      catalog?.items.filter((item) => item.collection === collection) ?? [],
    [catalog, collection],
  );
  const options = useMemo(
    () => ({
      types: [
        ...new Set(collectionItems.map((item) => item.type).filter(Boolean)),
      ].sort(),
      statuses: [
        ...new Set(collectionItems.map((item) => item.status).filter(Boolean)),
      ].sort(),
      tags: [...new Set(collectionItems.flatMap((item) => item.tags))].sort(),
    }),
    [collectionItems],
  );
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const result = collectionItems.filter((item) => {
      if (type && item.type !== type) return false;
      if (status && item.status !== status) return false;
      if (
        tag &&
        !item.tags.some(
          (value) => value.toLocaleLowerCase() === tag.toLocaleLowerCase(),
        )
      )
        return false;
      if (!needle) return true;
      return [
        item.title,
        item.type,
        item.status,
        item.summary,
        ...item.tags,
        ...item.authors,
        ...item.creators,
        ...Object.values(item.notionProperties),
        ...Object.values(item.customProperties),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle);
    });
    return result.sort(
      (a, b) =>
        compareItems(a, b, sort) * (direction === 'asc' ? 1 : -1),
    );
  }, [collectionItems, direction, query, sort, status, tag, type]);
  const selectedItem =
    catalog?.items.find((item) => item.id === selectedId) ?? null;

  function chooseCollection(next: Collection) {
    if (!confirmDiscard()) return;
    setCollection(next);
    setType('');
    setStatus('');
    setTag('');
    setSelectedId(null);
    setDetailMode('split');
    window.history.replaceState(null, '', `/?collection=${next}`);
  }

  function resetView() {
    setQuery('');
    setType('');
    setStatus('');
    setTag('');
    setSort('title');
    setDirection('asc');
  }

  function applyView(view: LibraryView) {
    if (!confirmDiscard()) return;
    const definition = view.definition;
    if (
      definition.collection === 'read' ||
      definition.collection === 'watch'
    ) {
      setCollection(definition.collection);
    }
    setType(typeof definition.type === 'string' ? definition.type : '');
    setStatus(
      typeof definition.status === 'string' ? definition.status : '',
    );
    setTag(typeof definition.tag === 'string' ? definition.tag : '');
    setSort(
      ['title', 'added', 'status', 'rating', 'people'].includes(
        String(definition.sort),
      )
        ? (definition.sort as Sort)
        : 'title',
    );
    setDirection(definition.direction === 'desc' ? 'desc' : 'asc');
    if (Array.isArray(definition.columns)) {
      setVisibleColumns(
        new Set(
          definition.columns.filter((value): value is Column =>
            columns.some(({ id }) => id === value),
          ),
        ),
      );
    }
    toast.info(`Applied view "${view.name}"`);
  }

  async function saveView() {
    if (!viewName.trim()) return;
    setViewError(null);
    try {
      const saved = await saveLibraryView(viewName.trim(), {
        collection,
        type,
        status,
        tag,
        sort,
        direction,
        columns: [...visibleColumns],
      });
      setViews((current) =>
        [...current.filter(({ id }) => id !== saved.id), saved].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      toast.success(`Saved view "${saved.name}"`);
      setViewName('');
      setShowViewForm(false);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'View could not be saved';
      setViewError(msg);
      toast.error(msg);
    }
  }

  function updateItem(item: LibraryItem) {
    setCatalog((current) =>
      current
        ? {
            ...current,
            items: current.items.map((existing) =>
              existing.id === item.id ? item : existing,
            ),
          }
        : current,
    );
    setDirty(false);
  }

  return (
    <main
      id="main-content"
      className="flex h-dvh min-h-[32rem] flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-surface px-3 md:px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <LibraryBig size={17} />
          </span>
          <span className="font-editorial text-lg font-semibold tracking-tight">
            Read &amp; Watch
          </span>
        </Link>
        <nav aria-label="Product" className="ml-auto flex items-center gap-1 text-sm">
          {isDesktop && collection === 'read' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleOpenBook()}
              className="mr-1 hidden h-8 text-xs sm:inline-flex"
            >
              <FolderOpen size={14} className="mr-1.5" />
              Open Book...
            </Button>
          )}
          <Link
            href="/"
            aria-current="page"
            className="hidden rounded-md bg-surface-muted px-3 py-2 font-medium sm:block"
          >
            Library
          </Link>
          <Link
            href="/privacy"
            className="hidden rounded-md px-3 py-2 text-muted-foreground hover:bg-surface-muted hover:text-foreground md:block"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="hidden rounded-md px-3 py-2 text-muted-foreground hover:bg-surface-muted hover:text-foreground md:block"
          >
            Terms
          </Link>
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Application navigation"
          className={`hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-150 md:flex ${
            sidebarCollapsed
              ? 'w-14 px-2 py-3'
              : 'w-[var(--sidebar-width)] px-3 py-4'
          }`}
        >
          <div
            className={`flex items-center ${
              sidebarCollapsed
                ? 'justify-center pb-2'
                : 'justify-between px-2 pb-2'
            }`}
          >
            {!sidebarCollapsed && (
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Collections
              </p>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
              }
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </Button>
          </div>

          <nav aria-label="Library collections" className="space-y-1">
            {(
              [
                ['read', 'Read', BookOpen, catalog?.counts.read],
                ['watch', 'Watch', Clapperboard, catalog?.counts.watch],
              ] as const
            ).map(([value, label, Icon, count]) => {
              const isActive = collection === value;
              if (sidebarCollapsed) {
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chooseCollection(value)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={`${label} (${count ?? 0})`}
                    title={`${label} (${count ?? 0})`}
                    className={`grid size-9 place-items-center mx-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
                      isActive
                        ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-surface-muted'
                    }`}
                  >
                    <Icon size={17} />
                  </button>
                );
              }
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseCollection(value)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
                    isActive
                      ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-surface-muted'
                  }`}
                >
                  <Icon size={16} />
                  <span className="flex-1">{label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {count ?? ''}
                  </span>
                </button>
              );
            })}
          </nav>

          {sidebarCollapsed && (
            <div className="my-2 h-px w-6 mx-auto bg-sidebar-border" />
          )}

          {!sidebarCollapsed && (
            <p className="mb-2 mt-5 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Workspace
            </p>
          )}
          <nav aria-label="Workspace" className="space-y-1 text-sm">
            {[
              ['/highlights', 'Highlights', Highlighter],
              ['/knowledge', 'Knowledge & Diagrams', Workflow],
              ['/canvas-notes', 'Canvas Notes', PenTool],
            ].map(([href, label, Icon]) => {
              if (sidebarCollapsed) {
                return (
                  <Link
                    key={href as string}
                    href={href as string}
                    aria-label={label as string}
                    title={label as string}
                    className="grid size-9 place-items-center mx-auto rounded-md text-sidebar-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  >
                    <Icon size={17} />
                  </Link>
                );
              }
              return (
                <Link
                  key={href as string}
                  href={href as string}
                  className="flex h-9 items-center gap-2 rounded-md px-2 text-sidebar-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  <Icon size={16} />
                  {label as string}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1 min-h-6" />

          <div className="border-t border-sidebar-border pt-2">
            {sidebarCollapsed ? (
              <Link
                href="/settings"
                aria-label="Settings"
                title="Settings"
                className="grid size-9 place-items-center mx-auto rounded-md text-sidebar-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <Settings size={17} />
              </Link>
            ) : (
              <Link
                href="/settings"
                className="flex h-9 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <Settings size={16} />
                Settings
              </Link>
            )}
            {!sidebarCollapsed && (
              <div className="px-2 pt-2 text-xs leading-5 text-muted-foreground">
                {catalog
                  ? `${catalog.counts.total} local library items`
                  : 'Local library'}
              </div>
            )}
          </div>
        </aside>

        <div className="relative flex min-w-0 flex-1 overflow-hidden">
          <section
            className={`min-w-0 flex-1 flex-col overflow-hidden ${
              detailMode === 'maximized' && selectedItem ? 'hidden' : 'flex'
            }`}
            aria-labelledby="library-title"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2 md:hidden">
              <Button
                variant={collection === 'read' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => chooseCollection('read')}
              >
                <BookOpen /> Read
              </Button>
              <Button
                variant={collection === 'watch' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => chooseCollection('watch')}
              >
                <Clapperboard /> Watch
              </Button>
              <Link
                href="/settings"
                className="ml-auto rounded-md p-2 text-muted-foreground"
              >
                <Settings size={17} />
                <span className="sr-only">Settings</span>
              </Link>
            </div>

            <div className="shrink-0 border-b border-border px-4 py-5 md:px-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-primary">
                    {collection === 'read'
                      ? 'Books and documents'
                      : 'Films and series'}
                  </p>
                  <h1
                    id="library-title"
                    className="font-editorial text-3xl font-semibold tracking-tight"
                  >
                    {collection === 'read' ? 'Read library' : 'Watch library'}
                  </h1>
                </div>
                <p
                  aria-live="polite"
                  className="text-xs tabular-nums text-muted-foreground"
                >
                  {catalog
                    ? `${filteredItems.length} of ${collectionItems.length}`
                    : ''}
                </p>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[13rem] flex-1 basis-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label={`Search ${collection} library`}
                    placeholder="Search title, creator, tag, or property"
                    className="pl-9"
                  />
                </div>
                <select
                  aria-label="Filter by type"
                  className={controlClass}
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option value="">All types</option>
                  {options.types.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <select
                  aria-label="Filter by status"
                  className={controlClass}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">All statuses</option>
                  {options.statuses.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <select
                  aria-label="Filter by tag"
                  className={controlClass}
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                >
                  <option value="">All tags</option>
                  {options.tags.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <select
                  aria-label="Sort library"
                  className={controlClass}
                  value={sort}
                  onChange={(event) => setSort(event.target.value as Sort)}
                >
                  <option value="title">Title</option>
                  <option value="added">Recently added</option>
                  <option value="status">Status</option>
                  <option value="rating">Rating</option>
                  <option value="people">Author / creator</option>
                </select>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  aria-label={`Sort ${direction === 'asc' ? 'descending' : 'ascending'}`}
                  onClick={() =>
                    setDirection((value) =>
                      value === 'asc' ? 'desc' : 'asc',
                    )
                  }
                >
                  <ArrowDownAZ
                    className={direction === 'desc' ? 'rotate-180' : ''}
                  />
                </Button>
                <DropdownMenu
                  align="right"
                  trigger={(open, toggle) => (
                    <button
                      type="button"
                      onClick={toggle}
                      aria-label="Toggle column visibility"
                      aria-expanded={open}
                      className={`${controlClass} flex cursor-pointer items-center gap-2`}
                    >
                      <Columns3 size={15} /> Columns
                    </button>
                  )}
                >
                  {() => (
                    <div className="space-y-0.5 p-1 w-48">
                      {columns.map((column) => (
                        <label
                          key={column.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-muted"
                        >
                          <input
                            type="checkbox"
                            checked={visibleColumns.has(column.id)}
                            onChange={() =>
                              setVisibleColumns((current) => {
                                const next = new Set(current);
                                if (next.has(column.id)) next.delete(column.id);
                                else next.add(column.id);
                                return next;
                              })
                            }
                            className="size-3.5 rounded border-border accent-primary"
                          />
                          {column.label}
                        </label>
                      ))}
                    </div>
                  )}
                </DropdownMenu>
              </div>

              <div className="mt-3 flex min-h-8 flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={resetView}>
                  All items
                </Button>
                {views.map((view) => (
                  <Button
                    key={view.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => applyView(view)}
                  >
                    {view.name}
                  </Button>
                ))}
                {showViewForm ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={viewName}
                      onChange={(event) => setViewName(event.target.value)}
                      aria-label="Saved view name"
                      placeholder="View name"
                      className="w-40"
                    />
                    <Button size="sm" onClick={() => void saveView()}>
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowViewForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowViewForm(true)}
                  >
                    Save current view
                  </Button>
                )}
                {viewError && (
                  <span className="text-xs text-destructive">{viewError}</span>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6">
              <PortableRecoveryNotice
                onRecovered={() => void refreshLibrary()}
              />
              {loadError ? (
                <div
                  role="alert"
                  className="mx-auto mt-12 max-w-md rounded-md border border-destructive/30 bg-surface p-5 text-center"
                >
                  <h2 className="font-editorial text-xl font-semibold">
                    Library could not load
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {loadError}
                  </p>
                  <Button className="mt-4" onClick={() => void refreshLibrary()}>
                    Try again
                  </Button>
                </div>
              ) : !catalog ? (
                <div
                  className="grid h-40 place-items-center text-sm text-muted-foreground"
                  aria-live="polite"
                >
                  Loading library...
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-border bg-surface">
                  <Table aria-label={`${collection} library items`}>
                    <TableHeader className="sticky top-0 z-10 bg-surface-muted">
                      <TableRow className="hover:bg-surface-muted">
                        <TableHead className="min-w-[18rem]">Title</TableHead>
                        {visibleColumns.has('type') && (
                          <TableHead className="min-w-32">Type</TableHead>
                        )}
                        {visibleColumns.has('status') && (
                          <TableHead className="min-w-32">Status</TableHead>
                        )}
                        {visibleColumns.has('tags') && (
                          <TableHead className="min-w-40">Tags</TableHead>
                        )}
                        {visibleColumns.has('people') && (
                          <TableHead className="min-w-44">
                            {collection === 'read' ? 'Author' : 'Creator'}
                          </TableHead>
                        )}
                        {visibleColumns.has('rating') && (
                          <TableHead className="w-24">Rating</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item, index) => (
                        <TableRow
                          key={item.id}
                          data-state={selectedId === item.id ? 'selected' : undefined}
                          data-row-index={index}
                          tabIndex={0}
                          aria-label={`Open ${item.title}`}
                          aria-selected={selectedId === item.id}
                          onClick={() => {
                            if (confirmDiscard()) {
                              setSelectedId(item.id);
                              if (detailMode === 'closed') {
                                setDetailMode('split');
                              }
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              if (confirmDiscard()) {
                                setSelectedId(item.id);
                                if (detailMode === 'closed') {
                                  setDetailMode('split');
                                }
                              }
                            }
                            if (
                              event.key === 'ArrowDown' ||
                              event.key === 'ArrowUp'
                            ) {
                              event.preventDefault();
                              const next = Math.max(
                                0,
                                Math.min(
                                  filteredItems.length - 1,
                                  index + (event.key === 'ArrowDown' ? 1 : -1),
                                ),
                              );
                              document
                                .querySelector<HTMLElement>(
                                  `[data-row-index="${next}"]`,
                                )
                                ?.focus();
                            }
                          }}
                          className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-3">
                              <Thumbnail item={item} />
                              <span className="max-w-[24rem] truncate text-sm font-medium">
                                {item.title}
                              </span>
                            </div>
                          </TableCell>
                          {visibleColumns.has('type') && (
                            <TableCell className="max-w-40 truncate text-sm text-muted-foreground">
                              {present(item.type)}
                            </TableCell>
                          )}
                          {visibleColumns.has('status') && (
                            <TableCell className="max-w-40 truncate text-sm text-muted-foreground">
                              {present(item.status)}
                            </TableCell>
                          )}
                          {visibleColumns.has('tags') && (
                            <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                              {present(item.tags.join(', '))}
                            </TableCell>
                          )}
                          {visibleColumns.has('people') && (
                            <TableCell className="max-w-52 truncate text-sm text-muted-foreground">
                              {present(itemPeople(item))}
                            </TableCell>
                          )}
                          {visibleColumns.has('rating') && (
                            <TableCell className="text-sm text-muted-foreground">
                              {present(item.rating)}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!filteredItems.length && (
                    <div className="flex flex-col items-center justify-center border-t border-border bg-surface p-8 text-center sm:p-12">
                      {collectionItems.length === 0 ? (
                        <div className="max-w-md space-y-3">
                          <div className="mx-auto grid size-12 place-items-center rounded-lg border border-border bg-surface-muted text-muted-foreground">
                            {collection === 'read' ? (
                              <BookOpen size={24} />
                            ) : (
                              <Clapperboard size={24} />
                            )}
                          </div>
                          <h2 className="font-editorial text-lg font-semibold text-foreground">
                            {collection === 'read'
                              ? 'No books in your Read library yet'
                              : 'No items in your Watch library yet'}
                          </h2>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {collection === 'read'
                              ? 'Read & Watch reads publications directly from your local filesystem. Add supported books (EPUB, PDF, MOBI, Comic formats) to your local library folder to begin reading, highlighting, and taking notes.'
                              : 'Films, series, and video recordings in your configured local library directory appear here.'}
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                            {isDesktop && collection === 'read' && (
                              <Button
                                size="sm"
                                onClick={() => void handleOpenBook()}
                              >
                                <FolderOpen size={14} className="mr-1.5" />
                                Open Book File
                              </Button>
                            )}
                            <Link href="/settings">
                              <Button variant="outline" size="sm">
                                <Settings size={14} className="mr-1.5" />
                                Library Settings
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-sm space-y-3">
                          <div className="mx-auto grid size-10 place-items-center rounded-lg border border-border bg-surface-muted text-muted-foreground">
                            <Search size={20} />
                          </div>
                          <h2 className="font-editorial text-base font-semibold text-foreground">
                            No matching items found
                          </h2>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            No items match your active search and filter criteria.
                          </p>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setQuery('');
                              setType('');
                              setStatus('');
                              setTag('');
                            }}
                            className="text-xs"
                          >
                            Reset filters
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {selectedItem && detailMode !== 'closed' && (
            <ItemDetail
              item={selectedItem}
              catalogItems={catalog?.items ?? []}
              initialTab={initialTab}
              initialPreviewIndex={initialPreviewIndex}
              mode={detailMode}
              onToggleMaximize={() =>
                setDetailMode((m) =>
                  m === 'maximized' ? 'split' : 'maximized',
                )
              }
              onClose={() => {
                if (confirmDiscard()) {
                  setDetailMode('closed');
                }
              }}
              onDirtyChange={setDirty}
              onItemUpdated={updateItem}
              onReload={() => void refreshLibrary()}
              onSelectItem={(id) => {
                if (confirmDiscard()) {
                  setSelectedId(id);
                }
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
