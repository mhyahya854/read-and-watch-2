/**
 * Promote a source annotation into a Knowledge Canvas block.
 *
 * The block keeps a deep link to the annotation and its reader location, so the
 * canvas never holds a detached copy. The normal action refuses to add the same
 * annotation to the same canvas twice.
 */

import type { Annotation } from '@/lib/annotation';
import type { CanvasKnowledge, ReadWatchCanvasDocument } from './types.ts';
import { createKnowledgeBlock, findBlockByAnnotation } from './knowledge.ts';

export interface PromotionResult {
  status: 'added' | 'already-present' | 'failed';
  message?: string;
  canvasId: string;
  blockId?: string;
}

export function annotationQuote(annotation: Annotation): string {
  const anchor = annotation.anchor as { quote?: string };
  const content = annotation.content as { passage?: string; body?: string; note?: string };
  return anchor.quote || content.passage || content.body || content.note || 'Captured passage';
}

export function annotationSourceLabel(annotation: Annotation): string {
  if (annotation.anchor.kind === 'pdf-text' || annotation.anchor.kind === 'pdf-drawing') {
    return `p. ${annotation.anchor.pageNumber}`;
  }
  return `Section ${(annotation.anchor.spineIndex ?? 0) + 1}`;
}

export function annotationBlockType(annotation: Annotation): string {
  if (annotation.kind === 'text-mark') return 'quote';
  if (annotation.kind === 'comment') return 'evidence';
  if (annotation.kind === 'excerpt') return 'source';
  return 'evidence';
}

/** Build the knowledge payload for one promoted annotation. */
export function knowledgeWithPromotedAnnotation(
  knowledge: CanvasKnowledge,
  annotation: Annotation,
  options: { itemId: string; elementId?: string },
): { knowledge: CanvasKnowledge; blockId: string | null; alreadyPresent: boolean } {
  const existing = findBlockByAnnotation(knowledge, annotation.id);
  if (existing) return { knowledge, blockId: existing.id, alreadyPresent: true };

  const quote = annotationQuote(annotation);
  const block = createKnowledgeBlock({
    type: annotationBlockType(annotation),
    title: quote.slice(0, 120),
    body: quote,
    ...(options.elementId ? { elementId: options.elementId } : {}),
    source: {
      itemId: options.itemId,
      annotationId: annotation.id,
      label: annotationSourceLabel(annotation),
      quote: quote.slice(0, 200),
    },
  });
  return {
    knowledge: { ...knowledge, blocks: [...knowledge.blocks, block] },
    blockId: block.id,
    alreadyPresent: false,
  };
}

function canvasUrl(canvasId: string, itemId: string | null): string {
  const base = `/api/reader/canvases/${encodeURIComponent(canvasId)}`;
  return itemId ? `${base}?itemId=${encodeURIComponent(itemId)}` : base;
}

/**
 * Add an annotation to a Knowledge Canvas through the real canvas API, honouring
 * optimistic concurrency and reporting failures instead of pretending success.
 */
export async function addAnnotationToKnowledgeCanvas(
  canvasId: string,
  annotation: Annotation,
  options: {
    itemId: string;
    /**
     * Transport seam. Defaults to the browser `fetch`; tests inject a request
     * function so the real canvas API logic runs without a live server.
     */
    fetchImpl?: typeof fetch;
  },
): Promise<PromotionResult> {
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const docRes = await doFetch(canvasUrl(canvasId, options.itemId));
    if (!docRes.ok) {
      return {
        status: 'failed',
        canvasId,
        message: `Could not open the canvas (HTTP ${docRes.status})`,
      };
    }
    const doc = (await docRes.json()) as ReadWatchCanvasDocument;
    const currentKnowledge: CanvasKnowledge =
      doc.knowledge && Array.isArray(doc.knowledge.blocks)
        ? doc.knowledge
        : { blocks: [], relationships: [] };

    const { knowledge, blockId, alreadyPresent } = knowledgeWithPromotedAnnotation(
      currentKnowledge,
      annotation,
      { itemId: options.itemId },
    );
    if (alreadyPresent) {
      return { status: 'already-present', canvasId, blockId: blockId ?? undefined };
    }

    const putRes = await doFetch(canvasUrl(canvasId, options.itemId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: doc.title,
        expectedRevision: doc.revision,
        scene: doc.scene,
        links: doc.links,
        knowledge,
      }),
    });

    if (putRes.status === 409) {
      return {
        status: 'failed',
        canvasId,
        message: 'The canvas changed elsewhere. Reload it and try again.',
      };
    }
    if (!putRes.ok) {
      return {
        status: 'failed',
        canvasId,
        message: `Adding to the canvas failed (HTTP ${putRes.status})`,
      };
    }
    return { status: 'added', canvasId, blockId: blockId ?? undefined };
  } catch (err) {
    return {
      status: 'failed',
      canvasId,
      message: err instanceof Error ? err.message : 'Adding to the canvas failed',
    };
  }
}
