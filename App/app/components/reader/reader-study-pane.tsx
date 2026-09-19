'use client';

/**
 * Right-hand study pane for one book: its own annotations and its own Knowledge
 * Canvases. Everything here is item-scoped, so Book A's study data can never
 * appear while reading Book B.
 */

import { useState } from 'react';
import {
  Highlighter,
  Underline,
  Strikethrough,
  PenLine,
  MessageSquare,
  Quote,
  Trash2,
  Plus,
  ExternalLink,
  X,
  Blocks,
  BookOpen,
  MapPin,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useReader } from './reader-context';
import {
  addAnnotationToKnowledgeCanvas,
  annotationQuote,
  annotationSourceLabel,
} from '@/lib/canvas';
import type { Annotation } from '@/lib/annotation';
import { describeLocation } from '@/lib/document/location-key.mjs';

function annotationIcon(annotation: Annotation) {
  if (annotation.kind === 'drawing') return <PenLine size={12} />;
  if (annotation.kind === 'comment') return <MessageSquare size={12} />;
  if (annotation.kind === 'excerpt') return <Quote size={12} />;
  const subKind = (annotation.content as { subKind?: string }).subKind;
  if (subKind === 'underline') return <Underline size={12} />;
  if (subKind === 'strike') return <Strikethrough size={12} />;
  return <Highlighter size={12} />;
}

function annotationKindLabel(annotation: Annotation): string {
  if (annotation.kind === 'drawing') return 'Drawing';
  if (annotation.kind === 'comment') return 'Comment';
  if (annotation.kind === 'excerpt') return 'Excerpt';
  const subKind = (annotation.content as { subKind?: string }).subKind ?? 'highlight';
  return subKind.charAt(0).toUpperCase() + subKind.slice(1);
}

export function ReaderStudyPane() {
  const {
    itemId,
    annotations,
    annotationsLoading,
    annotationsError,
    activeAnnotation,
    setActiveAnnotationId,
    annotationNoteDraft,
    setAnnotationNoteDraft,
    saveAnnotationNote,
    removeAnnotation,
    canvases,
    refreshCanvases,
    snapshot,
    goTo,
    setActiveCanvasId,
    studyPane,
    setStudyPane,
    drawMode,
    setDrawMode,
    markColor,
    setMarkColor,
    drawStrokeWidth,
    setDrawStrokeWidth,
    setAnnotationColor,
  } = useReader();
  const toast = useToast();
  // The pane's active tab IS the requested study pane, so the toolbar button and
  // the pane can never disagree about what is open.
  const tab: 'annotations' | 'canvas' = studyPane === 'canvas' ? 'canvas' : 'annotations';
  const setTab = (next: 'annotations' | 'canvas') => setStudyPane(next);
  const [noteEditing, setNoteEditing] = useState(false);
  const [promotionTarget, setPromotionTarget] = useState<string>('');
  const [promotionBusy, setPromotionBusy] = useState(false);
  const [legacyGraphs, setLegacyGraphs] = useState<
    Array<{ id: string; title: string; nodeCount: number; importedCanvasId: string | null }>
  >([]);
  const [legacyLoading, setLegacyLoading] = useState(false);

  const bookCanvases = canvases.filter((c) => c.scopeKind === 'book');
  const locationCanvases = canvases.filter((c) => c.scopeKind === 'location');

  const createCanvas = async (scopeKind: 'book' | 'location') => {
    try {
      const isPaged = snapshot.capabilities.has('pageNavigation');
      // Honest labels: reflowable books have no physical pages, so they get a
      // location/section label instead of a fabricated page number.
      const locationLabel = isPaged
        ? `Page ${snapshot.currentPage || 1}`
        : snapshot.currentLocation
          ? describeLocation(snapshot.currentLocation)
          : 'Current location';
      if (scopeKind === 'location' && !snapshot.currentLocation) {
        toast.error('The reader has no current location yet, so a page/location canvas cannot be created.');
        return;
      }
      const title =
        scopeKind === 'book'
          ? `${snapshot.metadata?.title || 'Book'} - Knowledge Canvas`
          : isPaged
            ? `Page ${snapshot.currentPage || 1} canvas`
            : `${locationLabel} canvas`;
      const scope =
        scopeKind === 'location'
          ? {
              kind: 'location' as const,
              label: locationLabel,
              anchor: {
                ...(snapshot.source ? { sourceHash: snapshot.source.sourceHash } : {}),
                location: snapshot.currentLocation,
                locationLabel,
              },
            }
          : { kind: 'book' as const, label: 'Whole book' };
      const res = await fetch(`/api/reader/items/${encodeURIComponent(itemId)}/canvases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, scope }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = (await res.json()) as { canvasId: string };
      await refreshCanvases();
      setActiveCanvasId(created.canvasId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the canvas');
    }
  };

  const loadLegacyGraphs = async () => {
    setLegacyLoading(true);
    try {
      const res = await fetch(
        `/api/knowledge/legacy-graphs?itemId=${encodeURIComponent(itemId)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLegacyGraphs(await res.json());
    } catch {
      setLegacyGraphs([]);
    } finally {
      setLegacyLoading(false);
    }
  };

  const importLegacyGraph = async (graphId: string) => {
    try {
      const res = await fetch(
        `/api/knowledge/legacy-graphs/${encodeURIComponent(graphId)}/import`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId }),
        },
      );
      if (res.status === 409) {
        const body = (await res.json()) as { canvasId?: string };
        toast.info('This legacy graph is already imported');
        if (body.canvasId) setActiveCanvasId(body.canvasId);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = (await res.json()) as { canvasId: string };
      await refreshCanvases();
      await loadLegacyGraphs();
      setActiveCanvasId(created.canvasId);
      toast.success('Legacy graph imported into a Knowledge Canvas');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const promote = async () => {
    if (!activeAnnotation) return;
    let canvasId = promotionTarget;
    try {
      setPromotionBusy(true);
      if (!canvasId) {
        const res = await fetch(`/api/reader/items/${encodeURIComponent(itemId)}/canvases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `${snapshot.metadata?.title || 'Book'} - Knowledge Canvas`,
            scope: { kind: 'book', label: 'Whole book' },
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        canvasId = ((await res.json()) as { canvasId: string }).canvasId;
      }
      const result = await addAnnotationToKnowledgeCanvas(canvasId, activeAnnotation, { itemId });
      if (result.status === 'failed') {
        toast.error(result.message || 'Adding to the Knowledge Canvas failed');
        return;
      }
      await refreshCanvases();
      if (result.status === 'already-present') {
        toast.info('Already on this canvas');
      } else {
        toast.success('Added to the Knowledge Canvas');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Adding to the Knowledge Canvas failed');
    } finally {
      setPromotionBusy(false);
    }
  };

  const jumpToAnnotation = async (annotation: Annotation) => {
    setActiveAnnotationId(annotation.id);
    const { createPageLocation, createSemanticLocation, validateDocumentLocation } =
      await import('@/lib/document');
    if (annotation.anchor.kind === 'pdf-text' || annotation.anchor.kind === 'pdf-drawing') {
      if (snapshot.source) {
        await goTo(createPageLocation(snapshot.source.sourceHash, annotation.anchor.pageNumber));
      }
      return;
    }
    // Reflowable: prefer the canonical location captured at creation, then a real
    // CFI, then the section/spine anchor. Never silently do nothing.
    const anchor = annotation.anchor;
    if (anchor.location) {
      try {
        await goTo(validateDocumentLocation(anchor.location));
        return;
      } catch {
        // fall through to the CFI/section branches
      }
    }
    if (snapshot.source && (anchor.startCfi || typeof anchor.spineIndex === 'number')) {
      await goTo(
        createSemanticLocation(snapshot.source.sourceHash, {
          ...(anchor.startCfi ? { cfi: anchor.startCfi } : {}),
          ...(typeof anchor.spineIndex === 'number' ? { spineIndex: anchor.spineIndex } : {}),
          ...(typeof anchor.startOffset === 'number'
            ? { startOffset: anchor.startOffset }
            : {}),
        }),
      );
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-surface" data-testid="reader-study-pane">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setTab('annotations')}
          aria-pressed={tab === 'annotations'}
          data-testid="study-tab-annotations"
          className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
            tab === 'annotations' ? 'bg-surface-muted text-foreground' : 'text-muted-foreground'
          }`}
        >
          <Highlighter size={12} />
          Annotations
          <span className="font-mono text-[10px]">{annotations.length}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('canvas');
            void loadLegacyGraphs();
          }}
          aria-pressed={tab === 'canvas'}
          data-testid="study-tab-canvas"
          className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
            tab === 'canvas' ? 'bg-surface-muted text-foreground' : 'text-muted-foreground'
          }`}
        >
          <Blocks size={12} />
          Knowledge Canvas
          <span className="font-mono text-[10px]">{canvases.length}</span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setStudyPane('none')}
          className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          aria-label="Close study pane"
        >
          <X size={12} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'annotations' && (
          <div>
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              This book only
            </div>
            {annotationsLoading && (
              <p className="p-4 text-center text-[11px] text-muted-foreground">Loading annotations...</p>
            )}
            {annotationsError && (
              <div className="m-3 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>{annotationsError}</span>
              </div>
            )}
            {!annotationsLoading && annotations.length === 0 && !annotationsError && (
              <p className="p-6 text-center text-[11px] text-muted-foreground">
                No annotations in this book yet. Select text to highlight, underline, or strike it.
              </p>
            )}
            <div className="divide-y divide-border">
              {annotations.map((annotation) => {
                const note = (annotation.content as { note?: string }).note;
                const isActive = annotation.id === activeAnnotation?.id;
                return (
                  <button
                    key={annotation.id}
                    type="button"
                    onClick={() => void jumpToAnnotation(annotation)}
                    data-annotation-id={annotation.id}
                    className={`flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors ${
                      isActive ? 'bg-surface-muted' : 'hover:bg-surface-muted/60'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      {annotationIcon(annotation)}
                      {annotationKindLabel(annotation)}
                      <span className="font-mono">{annotationSourceLabel(annotation)}</span>
                      {note ? (
                        <Badge variant="secondary" className="ml-auto text-[9px]">
                          Note
                        </Badge>
                      ) : null}
                    </span>
                    <span className="line-clamp-2 text-xs text-foreground">
                      {annotationQuote(annotation)}
                    </span>
                    {note && (
                      <span className="line-clamp-2 text-[11px] italic text-muted-foreground">
                        {note}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {activeAnnotation && (
              <div className="border-t-2 border-primary/30 bg-surface-muted/25 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Selected annotation
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveAnnotationId(null)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Clear selection"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {annotationIcon(activeAnnotation)}
                  {annotationKindLabel(activeAnnotation)}
                  <span className="font-mono">{annotationSourceLabel(activeAnnotation)}</span>
                </div>
                <p className="mt-1.5 text-xs italic text-foreground">
                  “{annotationQuote(activeAnnotation)}”
                </p>

                {!noteEditing ? (
                  <div className="mt-2.5 space-y-2">
                    {annotationNoteDraft ? (
                      <p className="whitespace-pre-wrap rounded border border-border bg-surface p-2 text-[11px] text-foreground">
                        {annotationNoteDraft}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setNoteEditing(true)}
                      >
                        <PenLine size={11} className="mr-1" />
                        {annotationNoteDraft ? 'Edit note' : 'Add note'}
                      </Button>
                      {annotationNoteDraft && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px] text-destructive"
                          onClick={async () => {
                            try {
                              await saveAnnotationNote(activeAnnotation.id, '');
                              setAnnotationNoteDraft('');
                              toast.success('Note removed. The annotation is unchanged.');
                            } catch (err) {
                              // Keep the note visible locally; nothing was saved.
                              toast.error(
                                err instanceof Error
                                  ? err.message
                                  : 'Could not remove the note',
                              );
                            }
                          }}
                        >
                          Delete note
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 space-y-2">
                    <textarea
                      value={annotationNoteDraft}
                      onChange={(e) => setAnnotationNoteDraft(e.target.value)}
                      rows={3}
                      aria-label="Annotation note"
                      placeholder="Note for this annotation…"
                      className="w-full rounded border border-border bg-surface p-2 text-[11px] text-foreground"
                    />
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={async () => {
                          try {
                            await saveAnnotationNote(
                              activeAnnotation.id,
                              annotationNoteDraft,
                            );
                            setNoteEditing(false);
                            toast.success('Note saved');
                          } catch (err) {
                            // Editor stays open with the draft intact so the user
                            // can retry; no false success is reported.
                            toast.error(
                              err instanceof Error ? err.message : 'Could not save the note',
                            );
                          }
                        }}
                      >
                        Save note
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => {
                          const note = (activeAnnotation.content as { note?: string }).note ?? '';
                          setAnnotationNoteDraft(note);
                          setNoteEditing(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-3 space-y-2 border-t border-border/60 pt-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Colour
                    </span>
                    {['#d6b34c', '#2f6f63', '#b45309', '#b91c1c', '#4b5563'].map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Set mark colour ${color}`}
                        data-testid={`mark-colour-${color.slice(1)}`}
                        onClick={() => void setAnnotationColor(activeAnnotation.id, color)}
                        style={{ backgroundColor: color }}
                        className={`size-4 rounded border ${
                          (activeAnnotation.content as { color?: string }).color === color
                            ? 'border-foreground'
                            : 'border-border'
                        }`}
                      />
                    ))}
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Add to Knowledge Canvas
                    </span>
                    <select
                      value={promotionTarget}
                      aria-label="Target Knowledge Canvas"
                      onChange={(e) => setPromotionTarget(e.target.value)}
                      className="w-full rounded border border-border bg-surface px-2 py-1 text-[11px] text-foreground"
                    >
                      <option value="">New book canvas</option>
                      {canvases.map((canvas) => (
                        <option key={canvas.id} value={canvas.id}>
                          {canvas.title}
                          {canvas.scopeKind === 'location' ? ' (page/location)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      disabled={promotionBusy}
                      onClick={() => void promote()}
                    >
                      <Blocks size={11} className="mr-1" />
                      {promotionBusy ? 'Adding...' : 'Add to Knowledge Canvas'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] text-destructive"
                      onClick={() => void removeAnnotation(activeAnnotation.id)}
                    >
                      <Trash2 size={11} className="mr-1" />
                      Delete annotation
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'canvas' && (
          <div className="p-3 space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-6 px-2 text-[11px]"
                onClick={() => void createCanvas('book')}
                data-testid="create-book-canvas"
              >
                <Plus size={11} className="mr-1" />
                New book canvas
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-6 px-2 text-[11px]"
                onClick={() => void createCanvas('location')}
                data-testid="create-location-canvas"
              >
                <MapPin size={11} className="mr-1" />
                New page/location canvas
              </Button>
            </div>

            <div>
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Whole-book canvases
              </h4>
              {bookCanvases.length === 0 && (
                <p className="text-[11px] text-muted-foreground">None yet.</p>
              )}
              <div className="space-y-1">
                {bookCanvases.map((canvas) => (
                  <button
                    key={canvas.id}
                    type="button"
                    data-testid={`open-canvas-${canvas.id}`}
                    onClick={() => setActiveCanvasId(canvas.id)}
                    className="flex w-full items-center gap-1.5 rounded border border-border bg-surface px-2 py-1.5 text-left text-[11px] hover:border-primary/50"
                  >
                    <BookOpen size={11} className="shrink-0 text-muted-foreground" />
                    <span className="truncate text-foreground">{canvas.title}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Page / location canvases
              </h4>
              {locationCanvases.length === 0 && (
                <p className="text-[11px] text-muted-foreground">None yet.</p>
              )}
              <div className="space-y-1">
                {locationCanvases.map((canvas) => (
                  <button
                    key={canvas.id}
                    type="button"
                    data-testid={`open-canvas-${canvas.id}`}
                    onClick={() => setActiveCanvasId(canvas.id)}
                    className="flex w-full items-center gap-1.5 rounded border border-border bg-surface px-2 py-1.5 text-left text-[11px] hover:border-primary/50"
                  >
                    <MapPin size={11} className="shrink-0 text-muted-foreground" />
                    <span className="truncate text-foreground">{canvas.title}</span>
                    {canvas.scopeLabel && (
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                        {canvas.scopeLabel}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Legacy knowledge graphs
                {legacyLoading && <span className="font-normal normal-case">loading...</span>}
              </h4>
              {legacyGraphs.length === 0 && !legacyLoading && (
                <p className="text-[11px] text-muted-foreground">
                  No legacy graphs stored for this book.
                </p>
              )}
              <div className="space-y-1">
                {legacyGraphs.map((graph) => (
                  <div
                    key={graph.id}
                    className="flex items-center gap-2 rounded border border-border bg-surface px-2 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                      {graph.title}
                      <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                        {graph.nodeCount} blocks
                      </span>
                    </span>
                    {graph.importedCanvasId ? (
                      <Badge variant="secondary" className="text-[9px]">
                        Imported
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => void importLegacyGraph(graph.id)}
                      >
                        Import into Knowledge Canvas
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <Button
                type="button"
                size="sm"
                variant={drawMode ? 'default' : 'secondary'}
                className="h-6 px-2 text-[11px]"
                onClick={() => setDrawMode(!drawMode)}
                data-testid="toggle-draw-mode"
              >
                <PenLine size={11} className="mr-1" />
                {drawMode ? 'Stop drawing' : 'Draw on this page'}
              </Button>
              {drawMode && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Ink
                  </span>
                  {['#b45309', '#2f6f63', '#b91c1c', '#1f2937'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Ink colour ${color}`}
                      onClick={() => setMarkColor(color)}
                      style={{ backgroundColor: color }}
                      className={`size-4 rounded border ${
                        markColor === color ? 'border-foreground' : 'border-border'
                      }`}
                    />
                  ))}
                  <select
                    aria-label="Ink width"
                    value={String(drawStrokeWidth)}
                    onChange={(e) => setDrawStrokeWidth(Number(e.target.value))}
                    className="ml-1 rounded border border-border bg-surface px-1 py-0.5 text-[10px] text-foreground"
                  >
                    <option value="0.002">Thin</option>
                    <option value="0.004">Medium</option>
                    <option value="0.008">Thick</option>
                  </select>
                </div>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                Freehand markup is anchored to the page. Reflowable books use a page/location
                canvas for drawing instead.
              </p>
            </div>

            <a
              href={`/canvas-notes`}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink size={10} />
              Open the standalone canvas list
            </a>
            <span className="sr-only">{studyPane}</span>
          </div>
        )}
      </div>
    </div>
  );
}
