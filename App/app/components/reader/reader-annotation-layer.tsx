'use client';

/**
 * Annotation overlay for the reader page.
 *
 * PDF marks and freehand markup are drawn from NORMALIZED page-relative
 * coordinates, so they stay attached to the correct page region at any zoom,
 * rotation, or window size. Reflowable documents have no stable page geometry,
 * so their marks are surfaced in the study pane instead of being painted with
 * fabricated coordinates.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReader } from './reader-context';
import {
  fromCanonicalPoint,
  fromCanonicalRect,
  type NormalizedRectLike,
} from '@/lib/document/selection-geometry';

const DEFAULT_MARK_COLORS: Record<string, string> = {
  highlight: '#d6b34c',
  underline: '#2f6f63',
  strike: '#b45309',
};

/** Per-annotation colour, honouring the colour the user actually saved. */
function markPresentation(subKind: string, savedColor?: string) {
  const color = savedColor || DEFAULT_MARK_COLORS[subKind] || DEFAULT_MARK_COLORS.highlight;
  if (subKind === 'underline') {
    return { background: 'transparent', borderBottom: `2px solid ${color}` };
  }
  if (subKind === 'strike') {
    return { background: 'transparent', borderBottom: `2px solid ${color}` };
  }
  return {
    background: `color-mix(in oklab, ${color} 42%, transparent)`,
    borderBottom: undefined as string | undefined,
  };
}

interface StrokePoint {
  x: number;
  y: number;
}

export function ReaderAnnotationLayer() {
  const {
    annotations,
    snapshot,
    containerRef,
    drawMode,
    setDrawMode,
    createDrawing,
    activeAnnotationId,
    setActiveAnnotationId,
  } = useReader();

  const [pageRect, setPageRect] = useState<DOMRect | null>(null);
  const [parentOffset, setParentOffset] = useState<{ left: number; top: number } | null>(null);
  const strokeRef = useRef<StrokePoint[] | null>(null);
  const [liveStroke, setLiveStroke] = useState<ReadonlyArray<StrokePoint>>([]);
  const layerRef = useRef<HTMLDivElement | null>(null);

  const canPaintGeometry = snapshot.capabilities.has('surfaceMarkup');

  /** Track the rendered page rectangle so normalized rects map to real pixels. */
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    // The adapter renders the page INTO the container, so the container is the
    // page element (its canvas/text layer fill it).
    const page = container.querySelector('canvas, .reflowable-content, iframe') ?? container;
    setPageRect(page.getBoundingClientRect());

    // The overlay is absolutely positioned, so its left/top must be expressed in
    // the offsetParent's coordinate space, not viewport space. Measuring the
    // offsetParent (rather than assuming one) keeps the overlay aligned in split,
    // full, minimized and sidebar states.
    const parent = layerRef.current?.offsetParent as HTMLElement | null;
    const parentRect = parent?.getBoundingClientRect();
    setParentOffset(parentRect ? { left: parentRect.left, top: parentRect.top } : { left: 0, top: 0 });
  }, [containerRef]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    const container = containerRef.current;
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    if (container && observer) observer.observe(container);
    const mutation =
      container && typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => measure())
        : null;
    if (container && mutation) mutation.observe(container, { childList: true, subtree: true });
    // Capture-phase scroll keeps the overlay glued to the page while scrolling,
    // without a permanent polling loop.
    const onScroll = () => measure();
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', onScroll, true);
      observer?.disconnect();
      mutation?.disconnect();
    };
  }, [measure, containerRef, snapshot.currentPage, snapshot.zoom, snapshot.currentLocation, snapshot.isOpen]);

  // Re-measure when the reader re-renders the page (page/zoom/rotation changes).
  useEffect(() => {
    const timer = window.setTimeout(measure, 120);
    return () => window.clearTimeout(timer);
  }, [measure, snapshot.currentPage, snapshot.zoom, snapshot.rotation]);

  const pageNumber = snapshot.currentPage || 1;

  const geometryMarks = annotations.filter(
    (a) =>
      a.anchor.kind === 'pdf-text' &&
      a.anchor.pageNumber === pageNumber &&
      Array.isArray(a.anchor.rects) &&
      a.anchor.rects.length > 0,
  );
  const pageDrawings = annotations.filter(
    (a) => a.anchor.kind === 'pdf-drawing' && a.anchor.pageNumber === pageNumber,
  );

  const rotation = snapshot.rotation ?? 0;

  const normalizeEvent = useCallback(
    (event: React.PointerEvent): StrokePoint | null => {
      if (!pageRect || pageRect.width <= 0 || pageRect.height <= 0) return null;
      return {
        x: (event.clientX - pageRect.left) / pageRect.width,
        y: (event.clientY - pageRect.top) / pageRect.height,
      };
    },
    [pageRect],
  );

  const handlePointerDown = (event: React.PointerEvent) => {
    const point = normalizeEvent(event);
    if (!point) return;
    strokeRef.current = [point];
    setLiveStroke([point]);
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!strokeRef.current) return;
    const point = normalizeEvent(event);
    if (!point) return;
    strokeRef.current = [...strokeRef.current, point];
    setLiveStroke(strokeRef.current);
  };

  const handlePointerUp = async () => {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    setLiveStroke([]);
    if (!stroke || stroke.length < 2) return;
    await createDrawing(stroke);
  };

  if (!pageRect || !snapshot.isOpen || !canPaintGeometry) return null;

  const layerStyle = parentOffset
    ? {
        left: pageRect.left - parentOffset.left,
        top: pageRect.top - parentOffset.top,
      }
    : { left: pageRect.left, top: pageRect.top };

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute z-10"
      style={{
        ...layerStyle,
        width: pageRect.width,
        height: pageRect.height,
      }}
      data-testid="reader-annotation-layer"
    >
      {geometryMarks.map((annotation) => {
        const canonicalRects = (
          annotation.anchor as unknown as { rects: NormalizedRectLike[] }
        ).rects;
        const subKind = (annotation.content as { subKind?: string }).subKind ?? 'highlight';
        const savedColor = (annotation.content as { color?: string }).color;
        const style = markPresentation(subKind, savedColor);
        const isActive = annotation.id === activeAnnotationId;
        return (
          <span key={annotation.id} className="contents">
            {canonicalRects.map((canonicalRect, index) => {
              const rect = fromCanonicalRect(canonicalRect, rotation);
              return (
                <button
                  // One accessible element per annotation: the first fragment
                  // carries the label, the rest are presentation pieces.
                  key={`${annotation.id}-${index}`}
                  type="button"
                  aria-hidden={index === 0 ? undefined : true}
                  tabIndex={index === 0 ? 0 : -1}
                  onClick={() => setActiveAnnotationId(annotation.id)}
                  aria-label={index === 0 ? `${subKind} annotation` : undefined}
                  data-annotation-id={annotation.id}
                  data-annotation-fragment={index}
                  className={`pointer-events-auto absolute rounded-[2px] outline-none ${
                    isActive ? 'ring-2 ring-primary/70' : ''
                  }`}
                  style={{
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.width * 100}%`,
                    height: `${rect.height * 100}%`,
                    background: style.background,
                    borderBottom: style.borderBottom,
                    mixBlendMode: 'multiply',
                  }}
                />
              );
            })}
          </span>
        );
      })}

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {pageDrawings.map((annotation) => {
          const anchor = annotation.anchor as {
            points: ReadonlyArray<{ x: number; y: number }>;
          };
          const content = annotation.content as { color?: string; strokeWidth?: number };
          const d = anchor.points
            .map((p) => fromCanonicalPoint(p, rotation))
            .map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'} ${(p.x * 100).toFixed(3)} ${(p.y * 100).toFixed(3)}`,
            )
            .join(' ');
          return (
            <path
              key={annotation.id}
              d={d}
              stroke={content.color ?? '#b45309'}
              strokeWidth={(content.strokeWidth ?? 0.004) * 100}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-annotation-id={annotation.id}
            />
          );
        })}
        {drawMode && liveStroke.length > 1 && (
          <path
            d={liveStroke
              .map(
                (p, i) =>
                  `${i === 0 ? 'M' : 'L'} ${(p.x * 100).toFixed(3)} ${(p.y * 100).toFixed(3)}`,
              )
              .join(' ')}
            stroke="#b45309"
            strokeWidth={0.4}
            fill="none"
            strokeLinecap="round"
          />
        )}
      </svg>

      {drawMode && (
        <div
          className="pointer-events-auto absolute inset-0 cursor-crosshair touch-none"
          data-testid="reader-draw-surface"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => void handlePointerUp()}
          onPointerLeave={() => void handlePointerUp()}
        />
      )}

      {drawMode && (
        <div className="pointer-events-auto absolute bottom-2 right-2 rounded border border-border bg-surface px-2 py-1 text-[10px] text-muted-foreground shadow-xs">
          Drawing on page {pageNumber} ·{' '}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => setDrawMode(false)}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
