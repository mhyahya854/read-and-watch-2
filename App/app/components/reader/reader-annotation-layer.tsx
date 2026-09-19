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

const MARK_STYLES: Record<string, { background: string; borderBottom?: string }> = {
  highlight: { background: 'rgba(214, 179, 76, 0.32)' },
  underline: {
    background: 'transparent',
    borderBottom: '2px solid rgba(47, 111, 99, 0.85)',
  },
  strike: {
    background: 'transparent',
    borderBottom: '2px solid rgba(180, 83, 9, 0.85)',
  },
};

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
  const strokeRef = useRef<StrokePoint[] | null>(null);
  const [liveStroke, setLiveStroke] = useState<ReadonlyArray<StrokePoint>>([]);

  const canPaintGeometry = snapshot.capabilities.has('surfaceMarkup');

  /** Track the rendered page rectangle so normalized rects map to real pixels. */
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const page = container.querySelector('canvas, .reflowable-content, iframe');
    setPageRect(page ? page.getBoundingClientRect() : null);
  }, [containerRef]);

  useEffect(() => {
    measure();
    const interval = window.setInterval(measure, 400);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('resize', measure);
    };
  }, [measure, snapshot.currentPage, snapshot.zoom, snapshot.currentLocation, snapshot.isOpen]);

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

  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{
        left: pageRect.left,
        top: pageRect.top,
        width: pageRect.width,
        height: pageRect.height,
      }}
      data-testid="reader-annotation-layer"
    >
      {geometryMarks.map((annotation) => {
        const rect = (
          annotation.anchor as unknown as {
            rects: Array<{ x: number; y: number; width: number; height: number }>;
          }
        ).rects[0];
        const subKind = (annotation.content as { subKind?: string }).subKind ?? 'highlight';
        const style = MARK_STYLES[subKind] ?? MARK_STYLES.highlight;
        const isActive = annotation.id === activeAnnotationId;
        return (
          <button
            key={annotation.id}
            type="button"
            onClick={() => setActiveAnnotationId(annotation.id)}
            aria-label={`${subKind} annotation`}
            data-annotation-id={annotation.id}
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
