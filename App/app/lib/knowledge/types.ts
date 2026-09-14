/**
 * Read & Watch Knowledge and Diagram System — Type Definitions.
 * Phase 13 — Knowledge and Diagram System.
 *
 * Defines canonical schemas for:
 *   - Semantic Knowledge Graphs (nodes, edges, deep links)
 *   - Mermaid Text Diagrams
 *   - Deep link targets and resolution results
 */

export const KNOWLEDGE_SCHEMA_VERSION = 1;

export type KnowledgeNodeType =
  | 'concept'
  | 'thesis'
  | 'evidence'
  | 'source'
  | 'person'
  | 'event'
  | 'question';

export type KnowledgeRelationshipType =
  | 'supports'
  | 'refutes'
  | 'derives-from'
  | 'influences'
  | 'part-of'
  | 'contrasts-with'
  | 'relates-to';

export type DeepLinkType =
  | 'item'
  | 'location'
  | 'annotation'
  | 'notes'
  | 'canvas'
  | 'external';

export interface DeepLinkRef {
  type: DeepLinkType;
  target: string;
  anchorJson?: string | null;
  label?: string | null;
}

export interface DeepLinkResolution {
  resolved: boolean;
  type: DeepLinkType;
  target: string;
  title?: string;
  subtitle?: string;
  url?: string;
  reason?: string;
}

export interface KnowledgeNode {
  id: string;
  graphId: string;
  label: string;
  nodeType: KnowledgeNodeType;
  notes: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  color?: string;
  deepLink?: DeepLinkRef | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface KnowledgeEdge {
  id: string;
  graphId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: KnowledgeRelationshipType;
  label: string;
  bidirectional: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface KnowledgeGraphMetadata {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  tags: string[];
  revision: number;
  lifecycle: 'active' | 'archived' | 'soft-deleted';
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface KnowledgeGraphDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  tags: string[];
  revision: number;
  lifecycle: 'active' | 'archived' | 'soft-deleted';
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export type MermaidDiagramType =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'state'
  | 'er'
  | 'gantt'
  | 'gitGraph'
  | 'pie'
  | 'mindmap'
  | 'timeline';

export interface MermaidDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  diagramType: MermaidDiagramType;
  sourceText: string;
  tags: string[];
  associatedItemId?: string | null;
  revision: number;
  lifecycle: 'active' | 'archived' | 'soft-deleted';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface KnowledgeIndexSummary {
  graphs: KnowledgeGraphMetadata[];
  diagrams: MermaidDocument[];
  conceptCanvasesCount: number;
}
