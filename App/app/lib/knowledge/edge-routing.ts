/**
 * Deterministic multi-edge routing for the concept graph.
 *
 * React Flow's stock `smoothstep` edges between the same two blocks render on
 * top of each other, so two relationships ("friend of", "works with") or an
 * opposite-direction pair (A -> B, B -> A) become visually indistinguishable and
 * only one of them can be selected.
 *
 * This module assigns each relationship a stable anchor pair (which of the
 * block's four connection handles the line leaves from and arrives at) plus, once
 * the four anchor combinations are exhausted, an alternating bezier curvature.
 * Routing is a pure function of the graph's edge list, so it is identical after
 * reload and independent of render order.
 */

export interface EdgeRoutingInput {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface EdgeRoutingGeometry {
  sourceHandle: string;
  targetHandle: string;
  curvature: number;
}

export const KNOWLEDGE_HANDLES = {
  targetLeft: 'target-left',
  targetTop: 'target-top',
  sourceRight: 'source-right',
  sourceBottom: 'source-bottom',
} as const;

const ANCHOR_PAIRS: ReadonlyArray<{ sourceHandle: string; targetHandle: string }> = [
  {
    sourceHandle: KNOWLEDGE_HANDLES.sourceRight,
    targetHandle: KNOWLEDGE_HANDLES.targetLeft,
  },
  {
    sourceHandle: KNOWLEDGE_HANDLES.sourceBottom,
    targetHandle: KNOWLEDGE_HANDLES.targetTop,
  },
  {
    sourceHandle: KNOWLEDGE_HANDLES.sourceRight,
    targetHandle: KNOWLEDGE_HANDLES.targetTop,
  },
  {
    sourceHandle: KNOWLEDGE_HANDLES.sourceBottom,
    targetHandle: KNOWLEDGE_HANDLES.targetLeft,
  },
];

const BASE_CURVATURE = 0.25;
const CURVATURE_STEP = 0.2;

/** Undirected key so A -> B and B -> A share one routing group. */
export function edgePairKey(sourceNodeId: string, targetNodeId: string): string {
  return sourceNodeId <= targetNodeId
    ? `${sourceNodeId}::${targetNodeId}`
    : `${targetNodeId}::${sourceNodeId}`;
}

/**
 * Compute one routing entry per edge id. Edges between the same unordered pair
 * of blocks receive distinct anchor pairs before any curvature offset is used.
 */
export function computeEdgeRouting(
  edges: ReadonlyArray<EdgeRoutingInput>,
): Map<string, EdgeRoutingGeometry> {
  const groups = new Map<string, EdgeRoutingInput[]>();
  for (const edge of edges) {
    const key = edgePairKey(edge.sourceNodeId, edge.targetNodeId);
    const bucket = groups.get(key);
    if (bucket) bucket.push(edge);
    else groups.set(key, [edge]);
  }

  const routing = new Map<string, EdgeRoutingGeometry>();
  for (const bucket of groups.values()) {
    // Stable, render-order-independent index within the group.
    const ordered = [...bucket].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    ordered.forEach((edge, index) => {
      const anchor = ANCHOR_PAIRS[index % ANCHOR_PAIRS.length];
      const round = Math.floor(index / ANCHOR_PAIRS.length);
      const curvature =
        round === 0
          ? BASE_CURVATURE
          : (round % 2 === 1 ? -1 : 1) * (BASE_CURVATURE + CURVATURE_STEP * round);
      routing.set(edge.id, {
        sourceHandle: anchor.sourceHandle,
        targetHandle: anchor.targetHandle,
        curvature,
      });
    });
  }
  return routing;
}

