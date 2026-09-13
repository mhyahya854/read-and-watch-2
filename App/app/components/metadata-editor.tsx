'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import type { LibraryItem } from '@/lib/catalog';
import { saveLibraryItem } from '@/lib/library-data';

type Status = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

function propertiesText(properties: Record<string, string>) {
  return Object.entries(properties)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

function parseProperties(source: string) {
  return Object.fromEntries(
    source
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(':');
        if (separator < 1)
          throw new Error('Custom properties must follow "Name: value" syntax');
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim(),
        ];
      }),
  );
}

export function MetadataEditor({
  item,
  onDirtyChange,
  onSaved,
  onReload,
}: {
  item: LibraryItem;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (item: LibraryItem) => void;
  onReload: () => void;
}) {
  const toast = useToast();
  const initial = useMemo(
    () => ({
      title: item.title,
      type: item.type,
      status: item.status,
      rating: item.rating?.toString() ?? '',
      summary: item.summary,
      people: (item.collection === 'read' ? item.authors : item.creators).join(
        ', ',
      ),
      tags: item.tags.join(', '),
      seriesName: item.series?.name ?? '',
      seriesPosition: item.series?.position ?? '',
      properties: propertiesText(item.customProperties),
    }),
    [item],
  );
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function field(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus('idle');
    setError(null);
  }

  async function save() {
    // Client-side validation
    if (!draft.title.trim()) {
      setStatus('error');
      setError('Title is required and cannot be empty.');
      return;
    }
    if (draft.rating.trim()) {
      const num = Number(draft.rating);
      if (Number.isNaN(num) || num < 0 || num > 5) {
        setStatus('error');
        setError('Rating must be a number between 0 and 5.');
        return;
      }
    }

    let parsedCustomProps: Record<string, string>;
    try {
      parsedCustomProps = parseProperties(draft.properties);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Invalid custom properties');
      return;
    }

    setStatus('saving');
    setError(null);
    try {
      const saved = await saveLibraryItem(item.id, item.revision, {
        title: draft.title.trim(),
        type: draft.type.trim(),
        status: draft.status.trim(),
        rating: draft.rating.trim() ? Number(draft.rating) : null,
        summary: draft.summary,
        people: draft.people
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        tags: draft.tags
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        ...(item.collection === 'read'
          ? {
              series: {
                name: draft.seriesName,
                position: draft.seriesPosition,
              },
            }
          : {}),
        customProperties: parsedCustomProps,
      });
      setStatus('saved');
      toast.success(`Metadata for "${draft.title.trim()}" saved.`);
      onSaved(saved);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'Metadata could not be saved';
      const isConflict = /conflict/i.test(message);
      setStatus(isConflict ? 'conflict' : 'error');
      setError(message);
      if (isConflict) {
        toast.error('Conflict: Item metadata was modified elsewhere.');
      } else {
        toast.error(message);
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <label htmlFor={`${item.id}-title`} className="space-y-1 text-xs">
          <span className="font-medium text-foreground">Title</span>
          <Input
            id={`${item.id}-title`}
            value={draft.title}
            onChange={(event) => field('title', event.target.value)}
          />
        </label>
        <label htmlFor={`${item.id}-type`} className="space-y-1 text-xs">
          <span className="font-medium text-foreground">Type</span>
          <Input
            id={`${item.id}-type`}
            value={draft.type}
            onChange={(event) => field('type', event.target.value)}
            placeholder={
              item.collection === 'read'
                ? 'Book, paper, document'
                : 'Movie, series, documentary'
            }
          />
        </label>
        <label htmlFor={`${item.id}-status`} className="space-y-1 text-xs">
          <span className="font-medium text-foreground">Status</span>
          <Input
            id={`${item.id}-status`}
            value={draft.status}
            onChange={(event) => field('status', event.target.value)}
            placeholder={
              item.collection === 'read'
                ? 'Reading, to read, completed'
                : 'Watching, queued, watched'
            }
          />
        </label>
        <label htmlFor={`${item.id}-rating`} className="space-y-1 text-xs">
          <span className="font-medium text-foreground">Rating (0 to 5)</span>
          <Input
            id={`${item.id}-rating`}
            type="number"
            min="0"
            max="5"
            step="0.5"
            value={draft.rating}
            onChange={(event) => field('rating', event.target.value)}
            placeholder="0 to 5"
          />
        </label>
        <label htmlFor={`${item.id}-people`} className="space-y-1 text-xs">
          <span className="font-medium text-foreground">
            {item.collection === 'read' ? 'Authors' : 'Creators'}
          </span>
          <Input
            id={`${item.id}-people`}
            value={draft.people}
            onChange={(event) => field('people', event.target.value)}
            placeholder="Separate names with commas"
          />
        </label>
        <label htmlFor={`${item.id}-tags`} className="space-y-1 text-xs">
          <span className="font-medium text-foreground">Tags</span>
          <Input
            id={`${item.id}-tags`}
            value={draft.tags}
            onChange={(event) => field('tags', event.target.value)}
            placeholder="Separate tags with commas"
          />
        </label>
        {item.collection === 'read' && (
          <>
            <label htmlFor={`${item.id}-series`} className="space-y-1 text-xs">
              <span className="font-medium text-foreground">Series</span>
              <Input
                id={`${item.id}-series`}
                value={draft.seriesName}
                onChange={(event) => field('seriesName', event.target.value)}
              />
            </label>
            <label
              htmlFor={`${item.id}-series-position`}
              className="space-y-1 text-xs"
            >
              <span className="font-medium text-foreground">Series position</span>
              <Input
                id={`${item.id}-series-position`}
                value={draft.seriesPosition}
                onChange={(event) =>
                  field('seriesPosition', event.target.value)
                }
              />
            </label>
          </>
        )}
      </div>

      <label htmlFor={`${item.id}-summary`} className="block space-y-1 text-xs">
        <span className="font-medium text-foreground">Overview</span>
        <textarea
          id={`${item.id}-summary`}
          value={draft.summary}
          onChange={(event) => field('summary', event.target.value)}
          rows={3}
          className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </label>

      <label
        htmlFor={`${item.id}-custom-properties`}
        className="block space-y-1 text-xs"
      >
        <span className="font-medium text-foreground">Custom properties</span>
        <textarea
          id={`${item.id}-custom-properties`}
          value={draft.properties}
          onChange={(event) => field('properties', event.target.value)}
          placeholder={'Language: English\nEdition: Second'}
          rows={3}
          className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <span className="block text-[11px] text-muted-foreground">
          One property per line using Name: value. Imported Notion properties remain read-only.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          onClick={() => void save()}
          disabled={!dirty || status === 'saving'}
          size="sm"
        >
          {status === 'saving' ? 'Saving...' : 'Save changes'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setDraft(initial);
            setStatus('idle');
            setError(null);
          }}
          disabled={!dirty || status === 'saving'}
        >
          Cancel
        </Button>
        <span
          aria-live="polite"
          className={`text-xs ml-auto font-medium ${
            status === 'error' || status === 'conflict'
              ? 'text-destructive'
              : status === 'saved'
                ? 'text-primary'
                : 'text-muted-foreground'
          }`}
        >
          {status === 'saved'
            ? 'Saved'
            : status === 'saving'
              ? 'Saving changes...'
              : dirty
                ? 'Unsaved changes'
                : 'All changes saved'}
        </span>
      </div>

      {(status === 'error' || status === 'conflict') && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-foreground space-y-1.5"
        >
          <p className="font-medium text-destructive">{error}</p>
          {status === 'conflict' && (
            <Button
              className="mt-1"
              variant="secondary"
              size="sm"
              onClick={onReload}
            >
              Reload current library data
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
