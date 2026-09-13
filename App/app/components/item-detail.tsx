'use client';

/* oxlint-disable next/no-img-element -- local library assets use a constrained runtime path */

import { useEffect, useState } from 'react';
import {
  BookOpen,
  Clapperboard,
  ExternalLink,
  ImageIcon,
  X,
} from 'lucide-react';

import { MetadataEditor } from '@/components/metadata-editor';
import { ReaderControl } from '@/components/reader-control';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { UserDataEditor } from '@/components/user-data-editor';
import type { CatalogMedia, LibraryItem } from '@/lib/catalog';
import { libraryAssetUrl } from '@/lib/catalog';

export type DetailTab =
  | 'overview'
  | 'thoughts'
  | 'notes'
  | 'metadata'
  | 'media'
  | 'relationships'
  | 'highlights'
  | 'canvas';

function present(value: string | number | null | undefined) {
  return value === null || value === undefined || String(value).trim() === ''
    ? 'Not set'
    : String(value);
}

export function ItemDetail({
  item,
  catalogItems = [],
  initialTab = 'overview',
  onClose,
  onDirtyChange,
  onItemUpdated,
  onReload,
  onSelectItem,
}: {
  item: LibraryItem;
  catalogItems?: LibraryItem[];
  initialTab?: DetailTab;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onItemUpdated: (item: LibraryItem) => void;
  onReload: () => void;
  onSelectItem?: (id: string) => void;
}) {
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [thoughtsDirty, setThoughtsDirty] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);
  const [metadataDirty, setMetadataDirty] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<CatalogMedia | null>(null);

  useEffect(
    () => onDirtyChange(thoughtsDirty || notesDirty || metadataDirty),
    [metadataDirty, notesDirty, onDirtyChange, thoughtsDirty],
  );

  const people = item.collection === 'read' ? item.authors : item.creators;
  const tabs: Array<[DetailTab, string]> = [
    ['overview', 'Overview'],
    ['thoughts', 'Thoughts'],
    ['notes', 'Notes'],
    ['metadata', 'Metadata'],
    ['media', `Media (${item.media.length})`],
    ['relationships', `Links (${item.relationshipIds.length})`],
    ['highlights', 'Highlights'],
    ['canvas', 'Canvas'],
  ];

  const relatedItems = item.relationshipIds
    .map((id) => catalogItems.find((c) => c.id === id))
    .filter((c): c is LibraryItem => Boolean(c));

  return (
    <aside
      aria-label={`${item.title} details`}
      className="absolute inset-0 z-30 flex w-full flex-col border-l border-border bg-surface shadow-xl sm:left-auto sm:w-[min(var(--detail-width),92vw)] xl:static xl:w-[var(--detail-width)] xl:shrink-0 xl:shadow-none"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Badge variant={item.collection === 'read' ? 'teal' : 'default'}>
            {item.collection.toUpperCase()}
          </Badge>
          <span className="text-xs text-muted-foreground truncate max-w-[12rem]">
            {item.title}
          </span>
        </div>
        <Button
          aria-label="Close details"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
        >
          <X size={16} />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="flex items-start gap-4 border-b border-border px-5 py-5 bg-surface">
          {item.preview ? (
            <img
              src={libraryAssetUrl(item.preview)}
              alt=""
              className="h-32 w-24 shrink-0 rounded-sm border border-border bg-surface-muted object-cover shadow-sm"
            />
          ) : (
            <span
              aria-hidden="true"
              className="grid h-32 w-24 shrink-0 place-items-center rounded-sm border border-border bg-surface-muted text-muted-foreground"
            >
              {item.collection === 'read' ? (
                <BookOpen size={28} />
              ) : (
                <Clapperboard size={28} />
              )}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <Badge variant="outline">{present(item.type)}</Badge>
              {item.status && <Badge variant="secondary">{item.status}</Badge>}
            </div>
            <h2 className="font-editorial break-words text-xl font-semibold leading-snug text-foreground">
              {item.title}
            </h2>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {present(people.join(', '))}
            </p>
            {item.collection === 'read' && (
              <div className="mt-3.5">
                <ReaderControl key={item.id} itemId={item.id} />
              </div>
            )}
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Item sections"
          className="flex overflow-x-auto border-b border-border px-3 bg-surface-muted/40 scrollbar-none"
        >
          {tabs.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                tab === value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'overview' && (
            <div className="space-y-6">
              <section>
                <h3 className="font-editorial text-base font-semibold text-foreground">
                  Overview
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {item.summary || 'No overview has been added.'}
                </p>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Properties
                </h3>
                <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-2.5 text-xs border border-border rounded-md p-3.5 bg-surface">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-medium text-foreground">{present(item.status)}</dd>
                  <dt className="text-muted-foreground">Rating</dt>
                  <dd className="font-medium text-foreground">{present(item.rating)}</dd>
                  <dt className="text-muted-foreground">Tags</dt>
                  <dd className="flex flex-wrap gap-1">
                    {item.tags.length ? (
                      item.tags.map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </dd>
                  {item.series && (
                    <>
                      <dt className="text-muted-foreground">Series</dt>
                      <dd className="font-medium text-foreground">
                        {item.series.name}
                        {item.series.position ? `, #${item.series.position}` : ''}
                      </dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Provenance</dt>
                  <dd className="capitalize text-foreground">
                    {item.provenanceKind.replace('_', ' ')}
                  </dd>
                </dl>
              </section>
            </div>
          )}

          {tab === 'thoughts' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-editorial text-base font-semibold text-foreground">
                  My Thoughts
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Personal reflections and impressions for this work.
                </p>
              </div>
              <UserDataEditor
                key={`${item.id}-thoughts`}
                itemId={item.id}
                type="thoughts"
                title="My Thoughts"
                onDirtyChange={setThoughtsDirty}
              />
            </div>
          )}

          {tab === 'notes' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-editorial text-base font-semibold text-foreground">
                  Study Notes
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Structured notes, quotes, outlines, and takeaways.
                </p>
              </div>
              <UserDataEditor
                key={`${item.id}-notes`}
                itemId={item.id}
                type="notes"
                title="Notes"
                onDirtyChange={setNotesDirty}
              />
            </div>
          )}

          {tab === 'metadata' && (
            <div className="space-y-7">
              <section>
                <h3 className="font-editorial text-base font-semibold text-foreground mb-1">
                  Manual metadata
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Edit library records safely with optimistic revisions and conflict detection.
                </p>
                <MetadataEditor
                  key={`${item.id}-${item.revision}`}
                  item={item}
                  onDirtyChange={setMetadataDirty}
                  onSaved={onItemUpdated}
                  onReload={onReload}
                />
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Imported Notion properties
                </h3>
                <div className="rounded-md border border-border bg-surface overflow-hidden">
                  <dl className="divide-y divide-border text-xs">
                    {Object.entries(item.notionProperties).length ? (
                      Object.entries(item.notionProperties).map(([key, value]) => (
                        <div
                          key={key}
                          className="grid grid-cols-[8rem_1fr] gap-3 px-3 py-2"
                        >
                          <dt className="truncate text-muted-foreground font-medium">{key}</dt>
                          <dd className="break-words text-foreground">{present(value)}</dd>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-muted-foreground text-xs">
                        No imported properties.
                      </div>
                    )}
                  </dl>
                </div>
              </section>
            </div>
          )}

          {tab === 'media' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-editorial text-base font-semibold text-foreground">
                    Media assets
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Covers, posters, screenshots, and attached documents.
                  </p>
                </div>
                <Badge variant="secondary">{item.media.length} items</Badge>
              </div>

              {item.media.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                  {item.media.map((media) => {
                    const isImage = [
                      '.jpg',
                      '.jpeg',
                      '.png',
                      '.gif',
                      '.webp',
                      '.avif',
                    ].includes(media.extension.toLowerCase());
                    return (
                      <div
                        key={media.path}
                        className="group relative rounded-md border border-border bg-surface overflow-hidden text-left"
                      >
                        <button
                          type="button"
                          onClick={() => setPreviewMedia(media)}
                          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {isImage ? (
                            <div className="aspect-[4/3] w-full overflow-hidden bg-surface-muted">
                              <img
                                src={libraryAssetUrl(media.path)}
                                alt={media.name}
                                loading="lazy"
                                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                              />
                            </div>
                          ) : (
                            <div className="grid aspect-[4/3] place-items-center bg-surface-muted text-muted-foreground">
                              <ImageIcon size={24} />
                            </div>
                          )}
                          <div className="p-2">
                            <p className="text-[11px] font-medium text-foreground truncate" title={media.name}>
                              {media.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground uppercase mt-0.5">
                              {media.extension.replace('.', '')}
                            </p>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-border bg-surface-muted/40 p-6 text-center text-xs text-muted-foreground">
                  No media files attached to this item.
                </div>
              )}
            </div>
          )}

          {tab === 'relationships' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-editorial text-base font-semibold text-foreground">
                  Linked items &amp; relationships
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connections between books, films, series, and study materials.
                </p>
              </div>

              {relatedItems.length ? (
                <div className="space-y-2">
                  {relatedItems.map((rel) => (
                    <button
                      type="button"
                      key={rel.id}
                      onClick={() => onSelectItem?.(rel.id)}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={rel.collection === 'read' ? 'teal' : 'default'}>
                            {rel.collection}
                          </Badge>
                          <span className="text-xs font-medium text-foreground truncate">
                            {rel.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {present(rel.type)}
                        </p>
                      </div>
                      <ExternalLink size={14} className="text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-border bg-surface-muted/40 p-6 text-center text-xs text-muted-foreground">
                  No linked items recorded for this entry.
                </div>
              )}
            </div>
          )}

          {tab === 'highlights' && (
            <div className="rounded-md border border-border bg-surface-muted/40 p-6 text-center">
              <h3 className="font-editorial text-base font-semibold text-foreground">
                No highlights yet
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground max-w-sm mx-auto">
                Highlights will appear here when annotation support is available.
                Your library and notes continue to work independently.
              </p>
            </div>
          )}

          {tab === 'canvas' && (
            <div className="rounded-md border border-border bg-surface-muted/40 p-6 text-center">
              <h3 className="font-editorial text-base font-semibold text-foreground">
                Canvas Notes are not available yet
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground max-w-sm mx-auto">
                This entry point is ready, but drawing and linked-canvas tools
                are scheduled for a future release.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Dialog for Media */}
      <Dialog
        open={Boolean(previewMedia)}
        onClose={() => setPreviewMedia(null)}
        title={previewMedia?.name ?? 'Media preview'}
        description={`Format: ${previewMedia?.extension.toUpperCase() ?? ''}`}
        maxWidth="max-w-2xl"
      >
        {previewMedia && (
          <div className="flex flex-col items-center gap-4">
            <div className="max-h-[60vh] overflow-hidden rounded-md border border-border bg-surface-muted">
              <img
                src={libraryAssetUrl(previewMedia.path)}
                alt={previewMedia.name}
                className="max-h-[60vh] w-auto object-contain"
              />
            </div>
            <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
              <span>{previewMedia.path}</span>
              <a
                href={libraryAssetUrl(previewMedia.path)}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline flex items-center gap-1"
              >
                Open original <ExternalLink size={12} />
              </a>
            </div>
          </div>
        )}
      </Dialog>
    </aside>
  );
}
