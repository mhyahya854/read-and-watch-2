'use client';

/**
 * Library-side summary of one Read title's study data.
 *
 * The reader itself is the primary study surface; this panel only summarises and
 * links into it. Every request is item-scoped, so a title can only ever show its
 * own annotations and its own Knowledge Canvases.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Highlighter,
  Underline,
  Strikethrough,
  PenLine,
  MessageSquare,
  Quote,
  Blocks,
  MapPin,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getAnnotations } from '@/lib/annotation/client';
import { annotationQuote, annotationSourceLabel } from '@/lib/canvas';
import type { Annotation } from '@/lib/annotation';
import type { CanvasMetadata } from '@/lib/canvas';

interface StudySummary {
  annotationCount: number;
  annotationsWithNotes: number;
  bookCanvases: number;
  locationCanvases: number;
  canvasCount: number;
}

function annotationIcon(annotation: Annotation) {
  if (annotation.kind === 'drawing') return <PenLine size={12} />;
  if (annotation.kind === 'comment') return <MessageSquare size={12} />;
  if (annotation.kind === 'excerpt') return <Quote size={12} />;
  const subKind = (annotation.content as { subKind?: string }).subKind;
  if (subKind === 'underline') return <Underline size={12} />;
  if (subKind === 'strike') return <Strikethrough size={12} />;
  return <Highlighter size={12} />;
}

export function ReadStudyPanel({ itemId }: { itemId: string }) {
  const [annotations, setAnnotations] = useState<ReadonlyArray<Annotation>>([]);
  const [canvases, setCanvases] = useState<ReadonlyArray<CanvasMetadata>>([]);
  const [summary, setSummary] = useState<StudySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [annotationList, canvasRes, summaryRes] = await Promise.all([
        getAnnotations(itemId),
        fetch(`/api/reader/items/${encodeURIComponent(itemId)}/canvases`),
        fetch(`/api/reader/items/${encodeURIComponent(itemId)}/study-summary`),
      ]);
      setAnnotations(annotationList);
      setCanvases(canvasRes.ok ? ((await canvasRes.json()) as CanvasMetadata[]) : []);
      setSummary(summaryRes.ok ? ((await summaryRes.json()) as StudySummary) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load study data');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading study data...</p>;
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="read-study-panel">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{summary?.annotationCount ?? annotations.length}</span>{' '}
          annotations
        </span>
        <span>·</span>
        <span>
          <span className="font-semibold text-foreground">{summary?.annotationsWithNotes ?? 0}</span>{' '}
          with notes
        </span>
        <span>·</span>
        <span>
          <span className="font-semibold text-foreground">{summary?.bookCanvases ?? canvases.filter((c) => c.scopeKind === 'book').length}</span>{' '}
          book canvases
        </span>
        <span>·</span>
        <span>
          <span className="font-semibold text-foreground">{summary?.locationCanvases ?? canvases.filter((c) => c.scopeKind === 'location').length}</span>{' '}
          page/location canvases
        </span>
        <Link
          href={`/reader/${encodeURIComponent(itemId)}`}
          className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
        >
          <BookOpen size={12} />
          Open study workspace
        </Link>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold text-foreground">
          Annotations in this book
        </h3>
        {annotations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No annotations yet. Open the reader and select text to highlight it.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {annotations.slice(0, 25).map((annotation) => {
              const note = (annotation.content as { note?: string }).note;
              return (
                <li key={annotation.id}>
                  <Link
                    href={`/reader/${encodeURIComponent(itemId)}?annotationId=${encodeURIComponent(annotation.id)}`}
                    className="flex items-start gap-2 px-3 py-2 text-xs hover:bg-surface-muted/60"
                  >
                    <span className="mt-0.5 text-muted-foreground">
                      {annotationIcon(annotation)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-foreground">
                        {annotationQuote(annotation)}
                      </span>
                      {note && (
                        <span className="mt-0.5 line-clamp-1 block italic text-muted-foreground">
                          {note}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {annotationSourceLabel(annotation)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold text-foreground">Knowledge Canvas</h3>
        {canvases.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No Knowledge Canvas yet. Create one from the reader study workspace.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {canvases.map((canvas) => (
              <li
                key={canvas.id}
                className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs"
              >
                {canvas.scopeKind === 'location' ? (
                  <MapPin size={13} className="shrink-0 text-muted-foreground" />
                ) : (
                  <Blocks size={13} className="shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-foreground">{canvas.title}</span>
                <Badge variant="outline" className="text-[10px]">
                  {canvas.scopeKind === 'location' ? 'Page / location' : 'Whole book'}
                </Badge>
                {canvas.scopeLabel && (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {canvas.scopeLabel}
                  </span>
                )}
                <Link
                  href={`/reader/${encodeURIComponent(itemId)}?canvasId=${encodeURIComponent(canvas.id)}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  title="Open this canvas in the reader study workspace"
                >
                  <ExternalLink size={12} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
