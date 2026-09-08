'use client';

/* oxlint-disable next/no-img-element -- local library assets use a runtime path, not an image host */

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Clapperboard,
  FileText,
  ImageIcon,
  LibraryBig,
  Search,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ReaderControl } from '@/components/reader-control';
import { Input } from '@/components/ui/input';
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
import { UserDataEditor } from '@/components/user-data-editor';

const titleFields = new Set(['Book', 'Show']);

function valueOrDash(value: string | undefined) {
  return value?.trim() || '—';
}

function Thumbnail({
  item,
  large = false,
}: {
  item: LibraryItem;
  large?: boolean;
}) {
  const className = large ? 'h-36 w-24 rounded-md' : 'h-10 w-8 rounded-[4px]';

  if (!item.preview) {
    return (
      <span
        aria-hidden="true"
        className={`${className} grid shrink-0 place-items-center border border-white/8 bg-white/[0.035] text-muted-foreground`}
      >
        {item.collection === 'read' ? (
          <BookOpen size={large ? 24 : 14} />
        ) : (
          <Clapperboard size={large ? 24 : 14} />
        )}
      </span>
    );
  }

  return (
    <img
      src={libraryAssetUrl(item.preview)}
      alt=""
      loading="lazy"
      className={`${className} shrink-0 border border-white/10 bg-black/20 object-cover shadow-sm`}
    />
  );
}

function DetailPanel({
  item,
  onClose,
  onDirtyChange,
}: {
  item: LibraryItem;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [thoughtsDirty, setThoughtsDirty] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);

  useEffect(() => {
    onDirtyChange?.(thoughtsDirty || notesDirty);
  }, [thoughtsDirty, notesDirty, onDirtyChange]);

  return (
    <aside
      aria-label={`${item.title} details`}
      className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[480px] flex-col border-l border-white/10 bg-[oklch(0.17_0.01_265)] shadow-[-24px_0_60px_rgb(0_0_0/28%)] sm:w-[min(480px,44vw)]"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 px-4">
        <span className="text-xs text-muted-foreground">Item details</span>
        <Button
          aria-label="Close details"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      <div className="overflow-y-auto px-6 py-6 sm:px-8">
        <div className="flex items-start gap-5">
          <Thumbnail item={item} large />
          <div className="min-w-0 pt-1">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
              {item.collection}
            </p>
            <h2 className="break-words text-2xl font-semibold leading-tight tracking-[-0.02em]">
              {item.title}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {valueOrDash(item.type)}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          {item.collection === 'read' && (
            <ReaderControl key={item.id} itemId={item.id} />
          )}
          <Button disabled variant="secondary" className="w-full justify-start">
            <FileText /> Open diagram
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Mermaid integration is reserved for a later task.
        </p>

        <div className="mt-8 space-y-8">
          <section>
            <h3 className="mb-2 text-sm font-semibold">Overview</h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {item.summary || 'No overview text was included in the export.'}
            </p>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">My Thoughts</h3>
            <UserDataEditor
              key={`${item.id}-thoughts`}
              itemId={item.id}
              type="thoughts"
              title="My Thoughts"
              onDirtyChange={setThoughtsDirty}
            />
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Notes</h3>
            <UserDataEditor
              key={`${item.id}-notes`}
              itemId={item.id}
              type="notes"
              title="Notes"
              onDirtyChange={setNotesDirty}
            />
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Relationships</h3>
            <p className="text-sm text-muted-foreground">
              {item.relationshipIds.length
                ? `${item.relationshipIds.length} imported relationship${item.relationshipIds.length === 1 ? '' : 's'}`
                : 'No imported relationships.'}
            </p>
          </section>
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ImageIcon size={15} /> Media{' '}
              <span className="font-normal text-muted-foreground">
                {item.media.length}
              </span>
            </h3>
            {item.media.length ? (
              <div className="grid grid-cols-3 gap-2">
                {item.media.map((media) => (
                  <a
                    key={media.path}
                    href={libraryAssetUrl(media.path)}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-md border border-white/8 bg-black/20 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    title={media.name}
                  >
                    {[
                      '.jpg',
                      '.jpeg',
                      '.png',
                      '.gif',
                      '.webp',
                      '.avif',
                    ].includes(media.extension) ? (
                      <img
                        src={libraryAssetUrl(media.path)}
                        alt={media.name}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span className="grid aspect-[4/3] place-items-center text-xs text-muted-foreground">
                        {media.extension || 'file'}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No attached media.
              </p>
            )}
          </section>
          <section>
            <h3 className="mb-3 text-sm font-semibold">Metadata</h3>
            <dl className="space-y-2.5">
              {Object.entries(item.notionProperties).map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-[120px_1fr] gap-3 text-sm"
                >
                  <dt className="truncate text-muted-foreground">{key}</dt>
                  <dd className="break-words text-foreground/90">
                    {valueOrDash(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </aside>
  );
}

export function LibraryBrowser({ catalog }: { catalog: LibraryCatalog }) {
  const [collection, setCollection] = useState<Collection>('watch');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const collectionItems = useMemo(
    () => catalog.items.filter((item) => item.collection === collection),
    [catalog.items, collection],
  );
  const properties = useMemo(() => {
    const keys = new Set<string>();
    collectionItems.forEach((item) =>
      Object.keys(item.notionProperties).forEach((key) => {
        if (!titleFields.has(key)) keys.add(key);
      }),
    );
    return [...keys];
  }, [collectionItems]);
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return collectionItems;
    return collectionItems.filter((item) =>
      [item.title, item.type, ...Object.values(item.notionProperties)]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [collectionItems, query]);
  const selectedItem =
    catalog.items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function confirmDiscard() {
    return !dirty || window.confirm('Discard unsaved changes?');
  }

  function chooseCollection(next: Collection) {
    if (!confirmDiscard()) return;
    setCollection(next);
    setQuery('');
    setSelectedId(null);
  }

  function closeDetails() {
    if (!confirmDiscard()) return;
    setSelectedId(null);
  }

  function selectItem(itemId: string) {
    if (!confirmDiscard()) return;
    setSelectedId(itemId);
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      <aside className="hidden w-[214px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-2.5 py-3 md:flex">
        <div className="flex h-9 items-center gap-2 px-2 text-sm font-semibold">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
            <LibraryBig size={14} />
          </span>
          Read & Watch
        </div>
        <p className="mb-3 mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Library
        </p>
        <nav aria-label="Library collections" className="space-y-0.5">
          {(
            [
              ['read', 'Read', BookOpen, catalog.counts.read],
              ['watch', 'Watch', Clapperboard, catalog.counts.watch],
            ] as const
          ).map(([value, label, Icon, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => chooseCollection(value)}
              aria-current={collection === value ? 'page' : undefined}
              className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition ${
                collection === value
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/75 hover:bg-white/5 hover:text-sidebar-foreground'
              }`}
            >
              <Icon size={15} />
              <span className="flex-1">{label}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {count}
              </span>
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-md border border-white/7 bg-white/[0.025] px-3 py-2.5">
          <p className="text-[11px] font-medium">Local library</p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
            {catalog.counts.total} library items · files stay local
          </p>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-white/8 px-3 md:px-5">
          <div className="flex items-center gap-1 md:hidden">
            <Button
              variant={collection === 'read' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => chooseCollection('read')}
            >
              Read
            </Button>
            <Button
              variant={collection === 'watch' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => chooseCollection('watch')}
            >
              Watch
            </Button>
          </div>
          <span className="hidden text-xs text-muted-foreground md:inline">
            Personal library
          </span>
          <span className="hidden text-muted-foreground/40 md:inline">/</span>
          <span className="hidden text-xs capitalize md:inline">
            {collection}
          </span>
          <div className="relative ml-auto w-full max-w-[280px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={`Search ${collection}`}
              placeholder={`Search ${collection}`}
              className="h-7 border-white/8 bg-white/[0.025] pl-8 text-xs"
            />
          </div>
        </header>

        <div className="shrink-0 px-4 pb-4 pt-6 md:px-7 md:pt-8">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <div className="mb-2 grid size-9 place-items-center rounded-lg bg-white/[0.045] text-foreground/80">
                {collection === 'read' ? (
                  <BookOpen size={19} />
                ) : (
                  <Clapperboard size={19} />
                )}
              </div>
              <h1 className="text-[26px] font-semibold capitalize tracking-[-0.03em]">
                {collection}
              </h1>
            </div>
            <p
              aria-live="polite"
              className="pb-1 text-xs tabular-nums text-muted-foreground"
            >
              {filteredItems.length} of {collectionItems.length}
            </p>
          </div>
          <div className="h-px bg-white/8" />
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 pb-8 md:px-7">
          <div className="min-w-[760px] overflow-hidden rounded-md border border-white/8 bg-card/35">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-[oklch(0.175_0.009_265)]">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 min-w-[280px] border-r border-white/7 px-3 text-[11px] font-normal text-muted-foreground">
                    Name
                  </TableHead>
                  {properties.map((property, index) => (
                    <TableHead
                      key={property}
                      className={`h-8 min-w-[160px] border-r border-white/7 px-3 text-[11px] font-normal text-muted-foreground ${index > 2 ? 'hidden xl:table-cell' : ''}`}
                    >
                      {property}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow
                    key={item.id}
                    tabIndex={0}
                    aria-label={`Open ${item.title}`}
                    aria-selected={selectedId === item.id}
                    onClick={() => selectItem(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectItem(item.id);
                      }
                    }}
                    className="group cursor-pointer outline-none focus-visible:bg-accent/70"
                  >
                    <TableCell className="h-[54px] max-w-[380px] border-r border-white/7 px-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Thumbnail item={item} />
                        <span className="truncate text-[13px] font-medium text-foreground/92 group-hover:text-foreground">
                          {item.title}
                        </span>
                      </div>
                    </TableCell>
                    {properties.map((property, index) => (
                      <TableCell
                        key={property}
                        className={`h-[54px] max-w-[240px] border-r border-white/7 px-3 text-xs text-foreground/65 ${index > 2 ? 'hidden xl:table-cell' : ''}`}
                      >
                        <span className="block truncate">
                          {valueOrDash(item.notionProperties[property])}
                        </span>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!filteredItems.length && (
              <div className="grid h-36 place-items-center text-sm text-muted-foreground">
                No matching items.
              </div>
            )}
          </div>
        </div>

        {selectedItem && (
          <DetailPanel
            item={selectedItem}
            onClose={closeDetails}
            onDirtyChange={setDirty}
          />
        )}
      </section>
    </main>
  );
}
