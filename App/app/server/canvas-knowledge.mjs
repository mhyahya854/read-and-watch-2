/**
 * Server-side structured knowledge helpers for Knowledge Canvases.
 *
 * The Canvas document is the single source of truth: structured knowledge lives
 * in the same document as the freeform scene. This module owns the server-side
 * projection of a legacy item-owned knowledge graph into that document so the
 * original graph is never modified or deleted.
 */

import { randomUUID } from 'node:crypto';

export function emptyKnowledge() {
  return { blocks: [], relationships: [] };
}

/**
 * Project a legacy knowledge graph into Knowledge Canvas content.
 *
 * Pure: it reads the graph document and returns canvas content. Provenance of the
 * legacy graph id is recorded on every block and in `importedGraphIds`.
 */
export function convertLegacyGraphToKnowledgeCanvas(graph, { itemId, now } = {}) {
  const timestamp = now || new Date().toISOString();
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];

  const blocks = nodes.map((node) => {
    const deepLink = node?.deepLink ?? null;
    const annotationId =
      deepLink && deepLink.type === 'annotation' && typeof deepLink.target === 'string'
        ? deepLink.target
        : undefined;
    return {
      id: node.id,
      type: typeof node.nodeType === 'string' && node.nodeType ? node.nodeType : 'concept',
      title: typeof node.label === 'string' ? node.label : 'Untitled block',
      ...(node.notes ? { body: node.notes } : {}),
      source: {
        itemId,
        ...(annotationId ? { annotationId } : {}),
        ...(typeof deepLink?.label === 'string' ? { label: deepLink.label } : {}),
        legacyGraphId: graph.id,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  const blockIds = new Set(blocks.map((b) => b.id));
  const relationships = edges
    .filter((e) => blockIds.has(e.sourceNodeId) && blockIds.has(e.targetNodeId))
    .map((edge, index) => ({
      id: typeof edge.id === 'string' && edge.id ? edge.id : `${graph.id}-rel-${index}`,
      sourceBlockId: edge.sourceNodeId,
      targetBlockId: edge.targetNodeId,
      label: edge.label || edge.relationshipType || '',
      direction: edge.bidirectional ? 'mutual' : 'directed',
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

  return {
    title: graph?.title ? `${graph.title} (imported)` : 'Imported Knowledge Graph',
    scope: { kind: 'book' },
    knowledge: {
      blocks,
      relationships,
      importedGraphIds: [graph.id],
    },
  };
}

/**
 * Find an existing canvas for this item that was already created from the given
 * legacy graph, so the same graph cannot be imported twice by accident.
 */
export function findImportedCanvas(canvasStore, itemId, graphId) {
  for (const meta of canvasStore.listCanvases({ itemId })) {
    let doc = null;
    try {
      doc = canvasStore.getCanvas(meta.id);
    } catch {
      continue;
    }
    const imported = doc?.knowledge?.importedGraphIds;
    if (Array.isArray(imported) && imported.includes(graphId)) return meta;
  }
  return null;
}

export function newKnowledgeId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

