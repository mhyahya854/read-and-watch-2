/**
 * Per-book study summary.
 *
 * Shared by the Vite middleware and the Electron desktop service so the two
 * transports can never drift apart on what a book's study state is.
 */

export function buildStudySummary({ itemId, annotationStore, canvasStore }) {
  const annotations = annotationStore.getAnnotations(itemId);
  const canvases = canvasStore.listCanvases({ itemId });

  const annotationCounts = {
    highlight: 0,
    underline: 0,
    strike: 0,
    comment: 0,
    excerpt: 0,
    drawing: 0,
  };
  let annotationsWithNotes = 0;

  for (const annotation of annotations) {
    const content = annotation.content || {};
    if (
      annotation.kind === 'text-mark' &&
      content.subKind &&
      annotationCounts[content.subKind] !== undefined
    ) {
      annotationCounts[content.subKind] += 1;
    } else if (annotation.kind === 'drawing') {
      annotationCounts.drawing += 1;
    } else if (annotation.kind === 'comment') {
      annotationCounts.comment += 1;
    } else if (annotation.kind === 'excerpt') {
      annotationCounts.excerpt += 1;
    }
    if (typeof content.note === 'string' && content.note.trim()) {
      annotationsWithNotes += 1;
    }
  }

  return {
    itemId,
    annotationCount: annotations.length,
    annotationsWithNotes,
    annotationCounts,
    bookCanvases: canvases.filter((c) => c.scopeKind === 'book').length,
    locationCanvases: canvases.filter((c) => c.scopeKind === 'location').length,
    canvasCount: canvases.length,
  };
}

