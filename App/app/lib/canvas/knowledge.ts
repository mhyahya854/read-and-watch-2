/**
 * Structured knowledge half of a Knowledge Canvas.
 *
 * A Knowledge Canvas is ONE workspace: freeform Excalidraw content plus these
 * structured blocks and relationships, stored in the same canvas document. These
 * helpers are pure so the same rules are used by the UI and by tests.
 */

import type {
  CanvasKnowledge,
  CanvasScope,
  KnowledgeBlock,
  KnowledgeRelationship,
  KnowledgeRelationshipDirection,
  KnowledgeSourceLink,
} from './types.ts';

/** Suggested block types. Any other string is accepted — these are conveniences. */
export const KNOWLEDGE_BLOCK_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'concept', label: 'Concept' },
  { value: 'definition', label: 'Definition' },
  { value: 'term', label: 'Term' },
  { value: 'person', label: 'Person' },
  { value: 'character', label: 'Character' },
  { value: 'event', label: 'Event' },
  { value: 'claim', label: 'Claim' },
  { value: 'argument', label: 'Argument' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'question', label: 'Question' },
  { value: 'quote', label: 'Quote' },
  { value: 'theme', label: 'Theme' },
  { value: 'chapter', label: 'Chapter' },
  { value: 'source', label: 'Source' },
  { value: 'mechanism', label: 'Mechanism' },
  { value: 'formula', label: 'Formula' },
  { value: 'custom', label: 'Custom' },
];

export const RELATIONSHIP_PRESETS: ReadonlyArray<string> = [
  'causes',
  'supports',
  'contradicts',
  'defines',
  'part of',
  'leads to',
  'associated with',
  'example of',
  'evidence for',
  'derived from',
  'occurs before',
  'inhibits',
  'activates',
];

let counter = 0;
function localId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function emptyKnowledge(): CanvasKnowledge {
  return { blocks: [], relationships: [] };
}

export function createKnowledgeBlock(input: {
  type?: string;
  title?: string;
  body?: string;
  source?: KnowledgeSourceLink | null;
  elementId?: string;
  id?: string;
  now?: string;
} = {}): KnowledgeBlock {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id ?? localId('block'),
    ...(input.elementId ? { elementId: input.elementId } : {}),
    type: (input.type || 'concept').slice(0, 64),
    title: (input.title ?? '').slice(0, 500),
    ...(input.body ? { body: input.body.slice(0, 20000) } : {}),
    source: input.source ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function addBlock(knowledge: CanvasKnowledge, block: KnowledgeBlock): CanvasKnowledge {
  return { ...knowledge, blocks: [...knowledge.blocks, block] };
}

export function updateBlock(
  knowledge: CanvasKnowledge,
  blockId: string,
  patch: Partial<Omit<KnowledgeBlock, 'id'>>,
): CanvasKnowledge {
  return {
    ...knowledge,
    blocks: knowledge.blocks.map((b) =>
      b.id === blockId ? { ...b, ...patch, id: b.id, updatedAt: new Date().toISOString() } : b,
    ),
  };
}

/** Removing a block also removes every relationship attached to it. */
export function removeBlock(knowledge: CanvasKnowledge, blockId: string): CanvasKnowledge {
  return {
    ...knowledge,
    blocks: knowledge.blocks.filter((b) => b.id !== blockId),
    relationships: knowledge.relationships.filter(
      (rel) => rel.sourceBlockId !== blockId && rel.targetBlockId !== blockId,
    ),
  };
}

export function createRelationship(input: {
  sourceBlockId: string;
  targetBlockId: string;
  label?: string;
  direction?: KnowledgeRelationshipDirection;
  linkedElementId?: string;
  id?: string;
  now?: string;
}): KnowledgeRelationship {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id ?? localId('rel'),
    sourceBlockId: input.sourceBlockId,
    targetBlockId: input.targetBlockId,
    label: (input.label ?? '').slice(0, 500),
    direction: input.direction === 'mutual' ? 'mutual' : 'directed',
    ...(input.linkedElementId ? { linkedElementId: input.linkedElementId } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function addRelationship(
  knowledge: CanvasKnowledge,
  relationship: KnowledgeRelationship,
): CanvasKnowledge {
  const known = new Set(knowledge.blocks.map((b) => b.id));
  if (!known.has(relationship.sourceBlockId) || !known.has(relationship.targetBlockId)) {
    return knowledge;
  }
  return { ...knowledge, relationships: [...knowledge.relationships, relationship] };
}

export function updateRelationship(
  knowledge: CanvasKnowledge,
  relationshipId: string,
  patch: Partial<Omit<KnowledgeRelationship, 'id'>>,
): CanvasKnowledge {
  return {
    ...knowledge,
    relationships: knowledge.relationships.map((rel) =>
      rel.id === relationshipId
        ? { ...rel, ...patch, id: rel.id, updatedAt: new Date().toISOString() }
        : rel,
    ),
  };
}

export function removeRelationship(
  knowledge: CanvasKnowledge,
  relationshipId: string,
): CanvasKnowledge {
  return {
    ...knowledge,
    relationships: knowledge.relationships.filter((rel) => rel.id !== relationshipId),
  };
}

/** True when this canvas already carries a block sourced from the annotation. */
export function findBlockByAnnotation(
  knowledge: CanvasKnowledge,
  annotationId: string,
): KnowledgeBlock | null {
  return (
    knowledge.blocks.find((b) => b.source && b.source.annotationId === annotationId) ?? null
  );
}

/**
 * Convert a legacy item-owned knowledge graph into Knowledge Canvas content.
 * The original graph is never modified; the conversion is a pure projection.
 */
export function convertLegacyGraphToKnowledgeCanvas(
  graph: {
    id: string;
    title?: string;
    description?: string;
    nodes?: ReadonlyArray<{
      id: string;
      label?: string;
      nodeType?: string;
      notes?: string;
      deepLink?: { type?: string; target?: string; label?: string | null } | null;
    }>;
    edges?: ReadonlyArray<{
      id?: string;
      sourceNodeId: string;
      targetNodeId: string;
      label?: string;
      relationshipType?: string;
      bidirectional?: boolean;
    }>;
  },
  options: { itemId: string; now?: string } ,
): { title: string; scope: CanvasScope; knowledge: CanvasKnowledge } {
  const now = options.now ?? new Date().toISOString();
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];

  const blocks: KnowledgeBlock[] = nodes.map((node) =>
    createKnowledgeBlock({
      id: node.id,
      type: node.nodeType || 'concept',
      title: node.label || 'Untitled block',
      body: node.notes || '',
      source: node.deepLink?.target
        ? {
            itemId: options.itemId,
            ...(node.deepLink.type === 'annotation' ? { annotationId: node.deepLink.target } : {}),
            label: node.deepLink.label ?? undefined,
            legacyGraphId: graph.id,
          }
        : { itemId: options.itemId, legacyGraphId: graph.id },
      now,
    }),
  );

  const blockIds = new Set(blocks.map((b) => b.id));
  const relationships: KnowledgeRelationship[] = edges
    .filter((e) => blockIds.has(e.sourceNodeId) && blockIds.has(e.targetNodeId))
    .map((edge, index) =>
      createRelationship({
        id: edge.id ?? `${graph.id}-rel-${index}`,
        sourceBlockId: edge.sourceNodeId,
        targetBlockId: edge.targetNodeId,
        label: edge.label || edge.relationshipType || '',
        direction: edge.bidirectional ? 'mutual' : 'directed',
        now,
      }),
    );

  return {
    title: graph.title ? `${graph.title} (imported)` : 'Imported Knowledge Graph',
    scope: { kind: 'book' },
    knowledge: {
      blocks,
      relationships,
      importedGraphIds: [graph.id],
    },
  };
}

