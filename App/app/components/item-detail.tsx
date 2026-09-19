'use client';

/* oxlint-disable next/no-img-element -- local library assets use a constrained runtime path */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Clapperboard,
  ExternalLink,
  File,
  FileText,
  ImageIcon,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';

import { MetadataEditor } from '@/components/metadata-editor';
import { ReaderControl } from '@/components/reader-control';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { UserDataEditor } from '@/components/user-data-editor';
import { WatchWorkspace } from '@/components/watch/watch-workspace';
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
  | 'canvas'
  | 'workspace';

function present(value: string | number | null | undefined) {
  return value === null || value === undefined || String(value).trim() === ''
    ? 'Not set'
    : String(value);
}

export function ItemDetail({
  item,
  catalogItems = [],
  initialTab = 'overview',
  initialPreviewIndex,
  mode = 'split',
  onToggleMaximize,
  onClose,
  onDirtyChange,
  onItemUpdated,
  onReload,
  onSelectItem,
}: {
  item: LibraryItem;
  catalogItems?: LibraryItem[];
  initialTab?: DetailTab;
  initialPreviewIndex?: number;
  mode?: 'split' | 'maximized';
  onToggleMaximize?: () => void;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onItemUpdated: (item: LibraryItem) => void;
  onReload: () => void;
  onSelectItem?: (id: string) => void;
}) {
  const [selectedTab, setSelectedTab] = useState<DetailTab>(initialTab);
  const [thoughtsDirty, setThoughtsDirty] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);
  const [metadataDirty, setMetadataDirty] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<CatalogMedia | null>(
    typeof initialPreviewIndex === 'number' && item.media[initialPreviewIndex]
      ? item.media[initialPreviewIndex]
      : null,
  );
  const [mediaLoadErrorPath, setMediaLoadErrorPath] = useState<string | null>(
    null,
  );
  const mediaLoadError = Boolean(
    previewMedia && mediaLoadErrorPath === previewMedia.path,
  );

  useEffect(
    () => onDirtyChange(thoughtsDirty || notesDirty || metadataDirty),
    [metadataDirty, notesDirty, onDirtyChange, thoughtsDirty],
  );

  // Compute effective tab based on collection constraints
  const tab: DetailTab =
    item.collection === 'read' && selectedTab === 'workspace'
      ? 'overview'
      : item.collection === 'watch' && (selectedTab === 'highlights' || selectedTab === 'canvas')
        ? 'workspace'
        : selectedTab;

  const people = item.collection === 'read' ? item.authors : item.creators;
  const tabs: Array<[DetailTab, string]> =
    item.collection === 'watch'
      ? [
          ['overview', 'Overview'],
          ['thoughts', 'Thoughts'],
          ['notes', 'Notes'],
          ['metadata', 'Metadata'],
          ['media', `Media (${item.media.length})`],
          ['relationships', `Links (${item.relationshipIds.length})`],
          ['workspace', 'Workspace'],
        ]
      : [
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
      className={
        mode === 'maximized'
          ? 'flex min-w-0 flex-1 flex-col bg-surface overflow-hidden'
          : 'w-full sm:w-[28rem] lg:w-[32rem] xl:w-[34rem] max-w-[50vw] shrink-0 flex flex-col border-l border-border bg-surface overflow-hidden'
      }
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 bg-surface">
        <div className="flex items-center gap-2 min-w-0 mr-2">
          <Badge variant={item.collection === 'read' ? 'teal' : 'default'}>
            {item.collection.toUpperCase()}
          </Badge>
          <span
            className="text-xs font-medium text-foreground truncate max-w-[14rem] sm:max-w-[20rem]"
            title={item.title}
          >
            {item.title}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onToggleMaximize && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={mode === 'maximized' ? 'Restore split view' : 'Maximize workspace'}
              title={mode === 'maximized' ? 'Restore split view' : 'Maximize workspace'}
              onClick={onToggleMaximize}
            >
              {mode === 'maximized' ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </Button>
          )}
          <Button
            aria-label="Close title workspace"
            title="Close title workspace"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-border bg-surface">
          <div className={mode === 'maximized' ? 'mx-auto max-w-4xl px-6 py-6' : 'px-5 py-5'}>
            <div className="flex items-start gap-4 sm:gap-6">
              {item.preview ? (
                <img
                  src={libraryAssetUrl(item.preview)}
                  alt=""
                  className={
                    mode === 'maximized'
                      ? 'h-40 w-28 shrink-0 rounded-md border border-border bg-surface-muted object-cover shadow-sm'
                      : 'h-32 w-24 shrink-0 rounded-sm border border-border bg-surface-muted object-cover shadow-sm'
                  }
                />
              ) : (
                <span
                  aria-hidden="true"
                  className={
                    mode === 'maximized'
                      ? 'grid h-40 w-28 shrink-0 place-items-center rounded-md border border-border bg-surface-muted text-muted-foreground'
                      : 'grid h-32 w-24 shrink-0 place-items-center rounded-sm border border-border bg-surface-muted text-muted-foreground'
                  }
                >
                  {item.collection === 'read' ? (
                    <BookOpen size={32} />
                  ) : (
                    <Clapperboard size={32} />
                  )}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <Badge variant="outline">{present(item.type)}</Badge>
                  {item.status && <Badge variant="secondary">{item.status}</Badge>}
                </div>
                <h2
                  className={
                    mode === 'maximized'
                      ? 'font-editorial break-words text-2xl md:text-3xl font-semibold leading-tight text-foreground'
                      : 'font-editorial break-words text-xl font-semibold leading-snug text-foreground'
                  }
                >
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
          </div>
        </div>

        <div className="border-b border-border bg-surface-muted/40">
          <div
            role="tablist"
            aria-label="Item sections"
            className={
              mode === 'maximized' && tab !== 'workspace'
                ? 'mx-auto flex max-w-4xl overflow-x-auto px-4 scrollbar-none'
                : 'flex overflow-x-auto px-3 sm:px-4 scrollbar-none'
            }
          >
            {tabs.map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setSelectedTab(value)}
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
        </div>

        {tab === 'workspace' && item.collection === 'watch' ? (
          <div className="h-[calc(100vh-14rem)] min-h-[38rem] w-full p-2 sm:p-4">
            <WatchWorkspace item={item} mode={mode} />
          </div>
        ) : (
          <div className={mode === 'maximized' ? 'mx-auto max-w-4xl p-6 md:p-8' : 'p-5'}>
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
                <div
                  className={
                    mode === 'maximized'
                      ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-2'
                      : 'grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2'
                  }
                >
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
        )}
      </div>

      {/* Lightbox Dialog for Media */}
      <Dialog
        open={Boolean(previewMedia)}
        onClose={() => setPreviewMedia(null)}
        title={previewMedia?.name ?? 'Media preview'}
        description={
          previewMedia
            ? ['.pdf'].includes(previewMedia.extension.toLowerCase())
              ? 'PDF Document'
              : ['.epub', '.mobi', '.azw', '.azw3', '.fb2', '.cbz'].includes(previewMedia.extension.toLowerCase())
                ? 'Publication Document'
                : ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'].includes(previewMedia.extension.toLowerCase())
                  ? `${previewMedia.extension.replace('.', '').toUpperCase()} Image`
                  : `${previewMedia.extension.replace('.', '').toUpperCase()} File`
            : undefined
        }
        maxWidth="max-w-2xl"
        footer={
          previewMedia ? (
            <>
              {['.pdf', '.epub', '.mobi', '.azw', '.azw3', '.fb2', '.cbz'].includes(previewMedia.extension.toLowerCase()) &&
                item.collection === 'read' && (
                  <Link
                    href={`/reader/${encodeURIComponent(item.id)}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <BookOpen size={14} />
                    Open in Reader
                  </Link>
                )}
              <a
                href={libraryAssetUrl(previewMedia.path)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink size={13} />
                Open original
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewMedia(null)}
                className="h-8 text-xs"
              >
                Close
              </Button>
            </>
          ) : undefined
        }
      >
        {previewMedia && (
          <div className="space-y-4">
            <div className="flex min-h-[16rem] max-h-[50vh] items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted/30 p-4">
              {['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'].includes(previewMedia.extension.toLowerCase()) &&
              !mediaLoadError ? (
                <img
                  src={libraryAssetUrl(previewMedia.path)}
                  alt={previewMedia.name}
                  onError={() => setMediaLoadErrorPath(previewMedia.path)}
                  className="max-h-[46vh] w-auto max-w-full rounded object-contain shadow-xs"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <span className="grid size-14 place-items-center rounded-lg border border-border bg-surface text-primary shadow-xs">
                    {previewMedia.extension.toLowerCase() === '.pdf' ||
                    ['.epub', '.mobi', '.txt', '.md'].includes(previewMedia.extension.toLowerCase()) ? (
                      <FileText size={28} />
                    ) : ['.mp4', '.webm', '.mkv'].includes(previewMedia.extension.toLowerCase()) ? (
                      <Clapperboard size={28} />
                    ) : (
                      <File size={28} />
                    )}
                  </span>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {previewMedia.extension.replace('.', '').toUpperCase()} Document
                    </p>
                    <p
                      className="font-editorial text-base font-semibold text-foreground max-w-md break-words"
                      title={previewMedia.name}
                    >
                      {previewMedia.name}
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                      {previewMedia.extension.toLowerCase() === '.pdf'
                        ? 'PDF documents are read using the integrated Reader or external viewer.'
                        : 'Direct visual preview is not supported for this file format.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-muted/20 px-3 py-2 text-xs">
              <span className="text-muted-foreground font-medium shrink-0">Path:</span>
              <span
                className="font-mono text-[11px] text-muted-foreground truncate flex-1 select-all"
                title={previewMedia.path}
              >
                {previewMedia.path}
              </span>
            </div>
          </div>
        )}
      </Dialog>
    </aside>
  );
}
