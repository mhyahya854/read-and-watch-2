/**
 * OCR text overlay — Phase 17, task P17-T005.
 *
 * Turns recognised page lines into a selectable, transparent text layer placed
 * over the rendered page image, using the same technique the native PDF text
 * layer already uses. The overlay is derived data: it never rewrites the page
 * canvas, never changes the source PDF, and carries an explicit marker so the
 * UI can distinguish machine transcription from native document text.
 *
 * Positioning is expressed in percentages of the page image, so the overlay
 * stays correct at any render scale and on any platform.
 */

export interface OcrOverlayLine {
  text: string;
  box: { x: number; y: number; width: number; height: number } | null;
  confidence?: number | null;
}

export interface OcrOverlaySource {
  lines: OcrOverlayLine[];
  imageWidth: number;
  imageHeight: number;
  provider?: string;
  providerVersion?: string | null;
  modelRevision?: string | null;
  language?: string;
  sourceHash?: string | null;
  pageIndex?: number;
}

export interface OcrOverlaySpan {
  text: string;
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
  heightPercent: number;
  confidence: number | null;
}

export interface OcrOverlayModel {
  kind: 'ocr-derived';
  provider: string | null;
  providerVersion: string | null;
  modelRevision: string | null;
  language: string | null;
  pageIndex: number | null;
  spans: OcrOverlaySpan[];
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Builds the overlay model. Lines without a bounding box are kept in the model
 * (so text is never silently dropped) but are marked with zero geometry, which
 * the mount step renders as a non-positioned selectable region.
 */
export function createOcrOverlayModel(source: OcrOverlaySource): OcrOverlayModel {
  const width = Number.isFinite(source.imageWidth) && source.imageWidth > 0 ? source.imageWidth : 0;
  const height = Number.isFinite(source.imageHeight) && source.imageHeight > 0 ? source.imageHeight : 0;

  const spans: OcrOverlaySpan[] = source.lines
    .filter((line) => typeof line?.text === 'string' && line.text.length > 0)
    .map((line) => {
      const box = line.box;
      if (!box || width === 0 || height === 0) {
        return {
          text: line.text,
          leftPercent: 0,
          topPercent: 0,
          widthPercent: 0,
          heightPercent: 0,
          confidence: line.confidence ?? null,
        };
      }
      return {
        text: line.text,
        leftPercent: clampPercent((box.x / width) * 100),
        topPercent: clampPercent((box.y / height) * 100),
        widthPercent: clampPercent((box.width / width) * 100),
        heightPercent: clampPercent((box.height / height) * 100),
        confidence: line.confidence ?? null,
      };
    });

  return {
    kind: 'ocr-derived',
    provider: source.provider ?? null,
    providerVersion: source.providerVersion ?? null,
    modelRevision: source.modelRevision ?? null,
    language: source.language ?? null,
    pageIndex: source.pageIndex ?? null,
    spans,
  };
}

/**
 * Mounts the overlay into a page container.
 *
 * @param documentRef Injected document, so the DOM shape is unit-testable.
 */
export function mountOcrOverlay(
  container: HTMLElement,
  model: OcrOverlayModel,
  documentRef: Document = document,
): HTMLElement | null {
  if (model.spans.length === 0) return null;

  const layer = documentRef.createElement('div');
  layer.className = 'ocr-text-layer';
  layer.setAttribute('data-ocr-text-layer', 'derived');
  layer.setAttribute('data-ocr-provider', model.provider ?? 'unknown');
  layer.setAttribute('data-ocr-language', model.language ?? 'unknown');
  layer.setAttribute('aria-label', 'Machine transcription of this page');

  for (const span of model.spans) {
    const element = documentRef.createElement('span');
    element.className = 'ocr-text-span';
    element.textContent = span.text;
    element.setAttribute('data-ocr-derived', 'true');
    if (span.confidence !== null) {
      element.setAttribute('data-ocr-confidence', span.confidence.toFixed(3));
    }
    element.style.position = 'absolute';
    element.style.left = `${span.leftPercent}%`;
    element.style.top = `${span.topPercent}%`;
    element.style.width = `${span.widthPercent}%`;
    element.style.height = `${span.heightPercent}%`;
    element.style.color = 'transparent';
    element.style.background = 'transparent';
    element.style.pointerEvents = 'auto';
    element.style.userSelect = 'text';
    element.style.whiteSpace = 'pre-wrap';
    element.style.overflow = 'hidden';
    layer.appendChild(element);
  }

  layer.style.position = 'absolute';
  layer.style.top = '0';
  layer.style.left = '0';
  layer.style.width = '100%';
  layer.style.height = '100%';
  layer.style.overflow = 'hidden';

  container.appendChild(layer);
  return layer;
}

/**
 * The searchable text a page contributes once OCR has run. Kept separate from
 * the visual overlay so the index never depends on DOM state.
 */
export function ocrOverlaySearchText(model: OcrOverlayModel, searchText?: string): string {
  if (typeof searchText === 'string') return searchText;
  return model.spans.map((span) => span.text).join('\n');
}
