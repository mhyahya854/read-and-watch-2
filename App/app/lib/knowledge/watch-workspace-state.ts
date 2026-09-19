/**
 * Pure state decisions for the Watch title knowledge workspace.
 *
 * These are the exact decisions the component makes when a title's graph list
 * or graph document changes, so the title-isolation guarantees can be verified
 * without a browser.
 */

export interface GraphRef {
  id: string;
}

export interface AnnotationLinkNode {
  deepLink?: { type?: string; target?: string | null } | null;
}

/**
 * Which graph should be active after the title's graph list is (re)loaded.
 *
 * A graph id that is not part of the current title's list must never remain
 * active — that is how Watch A's graph could otherwise survive into Watch B.
 */
export function resolveActiveGraphId(
  current: string | null,
  graphs: ReadonlyArray<GraphRef>,
): string | null {
  if (current && graphs.some((graph) => graph.id === current)) return current;
  return graphs[0]?.id ?? null;
}

/** Merge newly discovered promoted-evidence ids without dropping existing ones. */
export function mergePromotedAnnotationIds(
  previous: Record<string, boolean>,
  discovered: Record<string, boolean>,
): Record<string, boolean> {
  const keys = Object.keys(discovered).filter((key) => !previous[key]);
  if (keys.length === 0) return previous;
  const next = { ...previous };
  for (const key of keys) next[key] = true;
  return next;
}

/** True when the graph already carries a block linked to this annotation. */
export function isHighlightPromoted(
  nodes: ReadonlyArray<AnnotationLinkNode>,
  annotationId: string,
): boolean {
  return nodes.some(
    (node) =>
      node.deepLink?.type === 'annotation' && node.deepLink.target === annotationId,
  );
}

/** Collect annotation ids already linked from a graph document. */
export function collectPromotedAnnotationIds(
  nodes: ReadonlyArray<AnnotationLinkNode>,
  into: Record<string, boolean> = {},
): Record<string, boolean> {
  for (const node of nodes) {
    const link = node.deepLink;
    if (link?.type === 'annotation' && typeof link.target === 'string' && link.target) {
      into[link.target] = true;
    }
  }
  return into;
}

