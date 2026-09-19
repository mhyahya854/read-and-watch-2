'use client';

/**
 * ConceptGraphCanvas Component.
 * Phase 13: Knowledge and Diagram System.
 * Watch-Specific Knowledge Workspace & Relationship System.
 *
 * Implements:
 *   - AFFiNE-style node-and-line interaction:
 *     - Drag nodes, connect any node to any node
 *     - First-class editable relationship lines with custom user labels
 *     - Swappable directions and mutual / bidirectional relations
 *     - Love triangles (A->B, B->C, C->A), multiple edges, complex networks
 *     - Direct edge selection & relationship inspector
 *   - Support for Watch-oriented nodes (Character, Location, Group, Event, etc.)
 *   - Readable, non-overlapping labels directly on edges
 *   - Double-click to add block at cursor position
 *   - Accessible table/outline alternative view for keyboard & screen-reader users
 *   - Optimistic concurrency save with conflict handling
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Save,
  Plus,
  Table,
  Workflow,
  Download,
  Trash2,
  Check,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConceptNode, type ConceptNodeData } from './concept-node';
import { DeepLinkBadge } from './deep-link-badge';
import { computeEdgeRouting } from '@/lib/knowledge/edge-routing';
import type {
  KnowledgeGraphDocument,
  KnowledgeNode,
  KnowledgeEdge,
  KnowledgeNodeType,
  DeepLinkRef,
} from '@/lib/knowledge';

interface ConceptGraphCanvasProps {
  initialDocument: KnowledgeGraphDocument;
  collection?: 'read' | 'watch';
  onDocumentChange?: (doc: KnowledgeGraphDocument) => void;
  /** Reports unsaved edits so the parent never discards work silently. */
  onDirtyChange?: (dirty: boolean) => void;
}

const WATCH_RELATIONSHIP_PRESETS = [
  'loves',
  'dated',
  'rivalry',
  'friend of',
  'sibling of',
  'family',
  'works for',
  'betrayed',
  'suspects',
  'allies with',
  'mentors',
  'causes',
  'reveals',
  'enemy of',
  'supports',
  'contradicts',
];

const ACADEMIC_RELATIONSHIP_PRESETS = [
  'supports',
  'refutes',
  'derives-from',
  'influences',
  'part-of',
  'contrasts-with',
  'relates-to',
];

/**
 * Relationship colour comes from the shared Read & Watch theme tokens so the
 * graph matches the rest of the product in light, warm, and dark themes.
 */
export function knowledgeRelationshipColor(
  edge: Pick<KnowledgeEdge, 'label' | 'relationshipType'>,
  selected = false,
): string {
  if (selected) return 'var(--primary)';
  const type = (edge.relationshipType || '').toLowerCase();
  const label = (edge.label || '').toLowerCase();
  const negative =
    type === 'refutes' ||
    type === 'contradicts' ||
    label.includes('rival') ||
    label.includes('enemy') ||
    label.includes('betray') ||
    label.includes('suspect');
  if (negative) return 'var(--destructive)';
  const positive =
    type === 'supports' ||
    label.includes('ally') ||
    label.includes('friend') ||
    label.includes('mentor') ||
    label.includes('family') ||
    label.includes('partner');
  if (positive) return 'var(--success)';
  const romantic = label.includes('love') || label.includes('date') || label.includes('likes');
  if (romantic) return 'var(--warning)';
  return 'var(--primary)';
}

/** Minimap swatch per block type, drawn from the shared theme tokens. */
export function knowledgeNodeColor(nodeType: string | undefined): string {
  switch (nodeType) {
    case 'character':
      return 'var(--success)';
    case 'location':
    case 'object':
    case 'question':
      return 'var(--warning)';
    case 'event':
      return 'var(--destructive)';
    case 'group':
    case 'episode':
      return 'var(--muted-foreground)';
    default:
      return 'var(--primary)';
  }
}

export function ConceptGraphCanvas({
  initialDocument,
  collection = 'watch',
  onDocumentChange,
  onDirtyChange,
}: ConceptGraphCanvasProps) {
  const [doc, setDoc] = useState<KnowledgeGraphDocument>(initialDocument);
  const [viewMode, setViewMode] = useState<'canvas' | 'table'>('canvas');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Selection states
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Node Inspector state
  const [nodeInspectorOpen, setNodeInspectorOpen] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editType, setEditType] = useState<KnowledgeNodeType>(
    collection === 'watch' ? 'character' : 'concept',
  );
  const [editNotes, setEditNotes] = useState('');
  const [editLinkType, setEditLinkType] = useState<
    'none' | 'item' | 'external'
  >('none');
  const [editLinkTarget, setEditLinkTarget] = useState('');

  // Edge Inspector state
  const [edgeInspectorOpen, setEdgeInspectorOpen] = useState(false);
  const [editEdgeLabel, setEditEdgeLabel] = useState('');
  const [editEdgeType, setEditEdgeType] = useState('relates-to');
  const [editEdgeBidirectional, setEditEdgeBidirectional] = useState(false);
  const [editEdgeSourceId, setEditEdgeSourceId] = useState('');
  const [editEdgeTargetId, setEditEdgeTargetId] = useState('');

  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Register custom node types
  const nodeTypes = useMemo(() => ({ concept: ConceptNode }), []);

  /**
   * Latest canonical document. Inspector lookups must never read a stale
   * closure: a block created in this same tick (or a block rendered before the
   * document changed) has to be editable immediately.
   */
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const markDirty = useCallback(() => {
    setDirty(true);
  }, []);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Open inspector for a fully resolved node object
  const openNodeInspectorFor = useCallback((targetNode: KnowledgeNode) => {
    setSelectedNodeId(targetNode.id);
    setSelectedEdgeId(null);
    setEdgeInspectorOpen(false);

    setEditLabel(targetNode.label);
    setEditType(targetNode.nodeType);
    setEditNotes(targetNode.notes || '');
    if (targetNode.deepLink) {
      setEditLinkType(targetNode.deepLink.type === 'item' ? 'item' : 'external');
      setEditLinkTarget(targetNode.deepLink.target);
    } else {
      setEditLinkType('none');
      setEditLinkTarget('');
    }
    setNodeInspectorOpen(true);
  }, []);

  // Open inspector by id using the latest document
  const openNodeInspector = useCallback(
    (nodeId: string) => {
      const targetNode = docRef.current.nodes.find((n) => n.id === nodeId);
      if (targetNode) openNodeInspectorFor(targetNode);
    },
    [openNodeInspectorFor],
  );

  /**
   * Stable dispatcher stored in React Flow node data. React Flow node state is
   * created once and later re-rendered, so storing a fresh callback each render
   * would leave stale lookups behind.
   */
  const openNodeInspectorRef = useRef(openNodeInspector);
  useEffect(() => {
    openNodeInspectorRef.current = openNodeInspector;
  }, [openNodeInspector]);
  const dispatchNodeEdit = useCallback((nodeId: string) => {
    openNodeInspectorRef.current(nodeId);
  }, []);

  // Map canonical nodes to React Flow projection nodes
  const projectNodes = useCallback(
    (source: KnowledgeGraphDocument): Node[] =>
      source.nodes.map((n) => ({
        id: n.id,
        type: 'concept',
        position: { x: n.position.x, y: n.position.y },
        data: {
          label: n.label,
          nodeType: n.nodeType,
          notes: n.notes,
          deepLink: n.deepLink,
          onEdit: dispatchNodeEdit,
        } satisfies ConceptNodeData,
      })),
    [dispatchNodeEdit],
  );

  // Map canonical edges to React Flow projection edges. Routing is derived from
  // the edge set so parallel and opposite-direction relationships stay distinct.
  const projectEdges = useCallback(
    (source: KnowledgeGraphDocument, selectedId: string | null): Edge[] => {
      const routing = computeEdgeRouting(
        source.edges.map((e) => ({
          id: e.id,
          sourceNodeId: e.sourceNodeId,
          targetNodeId: e.targetNodeId,
        })),
      );

      return source.edges.map((e) => {
        const geometry = routing.get(e.id) ?? {
          sourceHandle: undefined,
          targetHandle: undefined,
          curvature: 0.25,
        };
        const isSelected = selectedId === e.id;
        const strokeColor = knowledgeRelationshipColor(e, isSelected);

        return {
          id: e.id,
          source: e.sourceNodeId,
          target: e.targetNodeId,
          sourceHandle: geometry.sourceHandle,
          targetHandle: geometry.targetHandle,
          type: 'default',
          pathOptions: { curvature: geometry.curvature },
          label: e.label || e.relationshipType || 'relates to',
          labelStyle: {
            fill: isSelected ? 'var(--primary)' : 'var(--foreground)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.01em',
          },
          labelBgStyle: {
            fill: 'var(--surface)',
            fillOpacity: 0.96,
            stroke: isSelected ? 'var(--primary)' : 'var(--border)',
            strokeWidth: isSelected ? 1.5 : 1,
          },
          labelBgPadding: [6, 4] as [number, number],
          labelBgBorderRadius: 4,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: strokeColor,
          },
          markerStart: e.bidirectional
            ? {
                type: MarkerType.ArrowClosed,
                width: 14,
                height: 14,
                color: strokeColor,
              }
            : undefined,
          style: {
            strokeWidth: isSelected ? 2.5 : 1.5,
            stroke: strokeColor,
          },
          data: {
            relationshipType: e.relationshipType,
            label: e.label,
            bidirectional: e.bidirectional,
          },
        };
      });
    },
    [],
  );

  const projectedNodes = useMemo(() => projectNodes(doc), [doc, projectNodes]);
  const projectedEdges = useMemo(
    () => projectEdges(doc, selectedEdgeId),
    [doc, projectEdges, selectedEdgeId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(projectedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(projectedEdges);

  // Re-derive the React Flow projection whenever the canonical document changes.
  // React Flow keeps its own drag/selection state between document changes, so
  // this never fights an in-progress drag.
  useEffect(() => {
    setNodes(projectedNodes);
  }, [projectedNodes, setNodes]);

  useEffect(() => {
    setEdges(projectedEdges);
  }, [projectedEdges, setEdges]);

  // Synchronize React Flow nodes back to canonical doc
  const handleNodesSync = useCallback(() => {
    setDoc((prev) => {
      const updatedNodes = prev.nodes.map((n) => {
        const flowNode = nodes.find((fn) => fn.id === n.id);
        if (flowNode) {
          return {
            ...n,
            position: { x: flowNode.position.x, y: flowNode.position.y },
          };
        }
        return n;
      });
      return { ...prev, nodes: updatedNodes };
    });
  }, [nodes]);

  // Connect new edge
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      const newEdgeId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const defaultLabel = collection === 'watch' ? 'relates to' : 'relates to';

      const newCanonicalEdge: KnowledgeEdge = {
        id: newEdgeId,
        graphId: doc.id,
        sourceNodeId: params.source,
        targetNodeId: params.target,
        relationshipType: 'relates-to',
        label: defaultLabel,
        bidirectional: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setDoc((prev) => ({
        ...prev,
        edges: [...prev.edges, newCanonicalEdge],
      }));
      markDirty();

      // Immediately select the new edge for instant labeling
      setSelectedEdgeId(newEdgeId);
      setEditEdgeLabel(defaultLabel);
      setEditEdgeType('relates-to');
      setEditEdgeBidirectional(false);
      setEditEdgeSourceId(params.source);
      setEditEdgeTargetId(params.target);
      setEdgeInspectorOpen(true);
      setNodeInspectorOpen(false);
    },
    [collection, doc.id, markDirty],
  );


  // Open inspector for an edge
  const openEdgeInspector = useCallback(
    (edgeId: string) => {
      const targetEdge = doc.edges.find((e) => e.id === edgeId);
      if (targetEdge) {
        setSelectedEdgeId(edgeId);
        setSelectedNodeId(null);
        setNodeInspectorOpen(false);

        setEditEdgeLabel(targetEdge.label || targetEdge.relationshipType);
        setEditEdgeType(targetEdge.relationshipType || 'relates-to');
        setEditEdgeBidirectional(Boolean(targetEdge.bidirectional));
        setEditEdgeSourceId(targetEdge.sourceNodeId);
        setEditEdgeTargetId(targetEdge.targetNodeId);
        setEdgeInspectorOpen(true);
      }
    },
    [doc.edges],
  );

  // Save node inspector changes
  const applyNodeInspectorChanges = () => {
    if (!selectedNodeId) return;

    let deepLink: DeepLinkRef | null = null;
    if (editLinkType !== 'none' && editLinkTarget.trim()) {
      deepLink = {
        type: editLinkType,
        target: editLinkTarget.trim(),
        label:
          editLinkType === 'item'
            ? 'Library Reference'
            : 'External Reference',
      };
    }

    const trimmedLabel = editLabel.trim() || 'Untitled Block';

    setDoc((prev) => {
      const updatedNodes = prev.nodes.map((n) => {
        if (n.id === selectedNodeId) {
          return {
            ...n,
            label: trimmedLabel,
            nodeType: editType,
            notes: editNotes.trim(),
            deepLink,
            updatedAt: new Date().toISOString(),
          };
        }
        return n;
      });
      return { ...prev, nodes: updatedNodes };
    });
    markDirty();

    setNodeInspectorOpen(false);
  };

  // Save edge inspector changes
  const applyEdgeInspectorChanges = () => {
    if (!selectedEdgeId) return;

    const trimmedLabel = editEdgeLabel.trim() || editEdgeType || 'relates to';

    setDoc((prev) => {
      const updatedEdges = prev.edges.map((e) => {
        if (e.id === selectedEdgeId) {
          return {
            ...e,
            sourceNodeId: editEdgeSourceId,
            targetNodeId: editEdgeTargetId,
            label: trimmedLabel,
            relationshipType: editEdgeType,
            bidirectional: editEdgeBidirectional,
            updatedAt: new Date().toISOString(),
          };
        }
        return e;
      });
      return { ...prev, edges: updatedEdges };
    });
    markDirty();

    setEdgeInspectorOpen(false);
  };

  // Swap edge direction (A -> B into B -> A)
  const handleSwapEdgeDirection = () => {
    setEditEdgeSourceId((prevSource) => {
      const newSource = editEdgeTargetId;
      setEditEdgeTargetId(prevSource);
      return newSource;
    });
  };

  // Add new block
  const handleAddNode = (customType?: KnowledgeNodeType) => {
    const defaultType =
      customType || (collection === 'watch' ? 'character' : 'concept');
    const defaultLabel =
      defaultType === 'character'
        ? 'New Character'
        : defaultType === 'location'
          ? 'New Location'
          : defaultType === 'event'
            ? 'New Event'
            : 'New Concept';

    const newNodeId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const position = {
      x: 120 + Math.random() * 240,
      y: 120 + Math.random() * 240,
    };

    const newNode: KnowledgeNode = {
      id: newNodeId,
      graphId: doc.id,
      label: defaultLabel,
      nodeType: defaultType,
      notes: '',
      position,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDoc((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    markDirty();

    // Open the inspector for the block that was just created, using the node
    // object itself rather than a stale document lookup.
    openNodeInspectorFor(newNode);
  };

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    setDoc((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      edges: prev.edges.filter(
        (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId,
      ),
    }));
    markDirty();
    if (selectedNodeId === nodeId) {
      setNodeInspectorOpen(false);
      setSelectedNodeId(null);
    }
  };

  // Delete edge
  const handleDeleteEdge = (edgeId: string) => {
    setDoc((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== edgeId),
    }));
    markDirty();
    if (selectedEdgeId === edgeId) {
      setEdgeInspectorOpen(false);
      setSelectedEdgeId(null);
    }
  };

  // Save graph to server with optimistic concurrency
  const handleSave = async () => {
    handleNodesSync();
    setIsSaving(true);
    setConflictError(null);
    setSaveSuccess(false);

    try {
      const finalNodes = doc.nodes.map((n) => {
        const flowNode = nodes.find((fn) => fn.id === n.id);
        return {
          ...n,
          position: flowNode
            ? { x: flowNode.position.x, y: flowNode.position.y }
            : n.position,
        };
      });

      const res = await fetch(
        doc.associatedItemId
          ? `/api/knowledge/graphs/${encodeURIComponent(doc.id)}?itemId=${encodeURIComponent(doc.associatedItemId)}`
          : `/api/knowledge/graphs/${encodeURIComponent(doc.id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: doc.title,
            description: doc.description,
            tags: doc.tags,
            associatedItemId: doc.associatedItemId,
            nodes: finalNodes,
            edges: doc.edges,
            expectedRevision: doc.revision,
          }),
        },
      );

      if (res.status === 409) {
        setConflictError(
          'Conflict: This graph was modified in another session. Please reload.',
        );
        setIsSaving(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to save graph (HTTP ${res.status})`);
      }

      const updated = (await res.json()) as KnowledgeGraphDocument;
      setDoc(updated);
      setDirty(false);
      setSaveSuccess(true);
      if (onDocumentChange) onDocumentChange(updated);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save knowledge graph:', err);
      setConflictError(String(err));
    } finally {
      setIsSaving(false);
    }
  };

  // Export as portable .rwgraph file
  const handleExport = () => {
    const json = JSON.stringify(
      {
        schemaVersion: 1,
        format: 'read-watch.knowledge-graph',
        exportedAt: new Date().toISOString(),
        app: { name: 'Read & Watch', version: '0.1.0' },
        graph: doc,
      },
      null,
      2,
    );
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.toLowerCase().replace(/\s+/g, '-') || 'knowledge-graph'}.rwgraph`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedEdgeSourceNode = doc.nodes.find(
    (n) => n.id === editEdgeSourceId,
  );
  const selectedEdgeTargetNode = doc.nodes.find(
    (n) => n.id === editEdgeTargetId,
  );

  return (
    <div className="flex flex-col h-full w-full bg-background select-none overflow-hidden">
      {/* Top Toolbar */}
      <header className="h-12 border-b border-border bg-surface px-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Workflow className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-foreground truncate">
                {doc.title}
              </h2>
              <Badge
                variant="secondary"
                className="text-[10px] h-4 px-1 font-mono"
              >
                r{doc.revision}
              </Badge>
              {dirty && (
                <span className="text-[10px] font-medium text-warning">Unsaved</span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              {doc.nodes.length} blocks · {doc.edges.length} relationships
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* View mode toggle: Visual Flow vs Accessible Table */}
          <div className="flex rounded-md border border-border bg-surface-muted/60 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('canvas')}
              className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                viewMode === 'canvas'
                  ? 'bg-surface text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Interactive Visual Canvas"
            >
              <Workflow size={12} />
              <span>Graph</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                viewMode === 'table'
                  ? 'bg-surface text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Accessible Table View"
            >
              <Table size={12} />
              <span>Table</span>
            </button>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleAddNode()}
            className="h-7 text-xs px-2.5"
          >
            <Plus size={12} className="mr-1" />
            Add Block
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleExport}
            className="h-7 w-7 p-0"
            title="Export .rwgraph"
          >
            <Download size={13} />
          </Button>

          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className={`h-7 text-xs px-2.5 ${
              saveSuccess ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
            }`}
          >
            {saveSuccess ? (
              <>
                <Check size={12} className="mr-1" />
                Saved
              </>
            ) : (
              <>
                <Save size={12} className="mr-1" />
                {isSaving ? 'Saving...' : 'Save'}
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Conflict Warning Banner */}
      {conflictError && (
        <div className="p-2.5 bg-amber-500/15 border-b border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} />
            <span>{conflictError}</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => window.location.reload()}
            className="h-6 text-[11px]"
          >
            Reload
          </Button>
        </div>
      )}

      {/* Main Workspace: Canvas or Table */}
      <div ref={reactFlowWrapper} className="flex-1 relative overflow-hidden">
        {viewMode === 'canvas' ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={(_event, edge) => {
              openEdgeInspector(edge.id);
            }}
            onPaneClick={() => {
              if (selectedEdgeId) {
                setSelectedEdgeId(null);
                setEdgeInspectorOpen(false);
              }
              if (selectedNodeId) {
                setSelectedNodeId(null);
                setNodeInspectorOpen(false);
              }
            }}
            onDoubleClick={(event) => {
              // Create node on double click in empty space
              const bounds = reactFlowWrapper.current?.getBoundingClientRect();
              if (bounds) {
                const x = event.clientX - bounds.left;
                const y = event.clientY - bounds.top;
                const newNodeId = `node-${Date.now()}`;
                const defaultType =
                  collection === 'watch' ? 'character' : 'concept';
                const defaultLabel =
                  defaultType === 'character' ? 'New Character' : 'New Block';

                const newNode: KnowledgeNode = {
                  id: newNodeId,
                  graphId: doc.id,
                  label: defaultLabel,
                  nodeType: defaultType,
                  notes: '',
                  position: { x, y },
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };

                setDoc((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }));
                markDirty();
                openNodeInspectorFor(newNode);
              }
            }}
            onNodeDragStop={(_event, node) => {
              setDoc((prev) => ({
                ...prev,
                nodes: prev.nodes.map((n) =>
                  n.id === node.id
                    ? { ...n, position: { x: node.position.x, y: node.position.y } }
                    : n,
                ),
              }));
              markDirty();
            }}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2.5}
            className="bg-dot-pattern"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls className="!bg-surface !border-border !shadow-xs" />
            <MiniMap
              className="!bg-surface/90 !border-border !rounded-lg"
              nodeColor={(n) => {
                const data = n.data as unknown as ConceptNodeData;
                return knowledgeNodeColor(data.nodeType as string | undefined);
              }}
            />
            <Panel
              position="top-right"
              className="bg-surface border border-border rounded-md px-2.5 py-1 text-[11px] text-muted-foreground shadow-xs pointer-events-none"
            >
              Drag handles to connect · Click line to edit relation · Double click empty space to add block
            </Panel>
          </ReactFlow>
        ) : (
          /* Accessible Table / List View */
          <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Blocks &amp; Characters
                </h3>
                <p className="text-xs text-muted-foreground">
                  Accessible inventory of workspace entities.
                </p>
              </div>
              <Button size="sm" onClick={() => handleAddNode()} className="h-7 text-xs">
                <Plus size={12} className="mr-1" />
                Add Block
              </Button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden bg-surface">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted/60 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2 px-3">Label</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Notes</th>
                    <th className="py-2 px-3">Link</th>
                    <th className="py-2 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {doc.nodes.map((n) => (
                    <tr
                      key={n.id}
                      className="hover:bg-surface-muted/40 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-semibold text-foreground">
                        {n.label}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="outline"
                          className="text-[10px] capitalize"
                        >
                          {n.nodeType}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground max-w-xs truncate">
                        {n.notes || '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        {n.deepLink ? (
                          <DeepLinkBadge link={n.deepLink} />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openNodeInspector(n.id)}
                          className="h-6 text-xs px-2"
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteNode(n.id)}
                          className="h-6 text-xs px-2 text-destructive hover:bg-destructive/10"
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {doc.nodes.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-muted-foreground"
                      >
                        No blocks created yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Relationships Table */}
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Relationships &amp; Connections
                </h3>
                <p className="text-xs text-muted-foreground">
                  Connections between characters, events, and elements.
                </p>
              </div>

              <div className="border border-border rounded-lg overflow-hidden bg-surface">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-muted/60 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2 px-3">Source Block</th>
                      <th className="py-2 px-3">Relationship</th>
                      <th className="py-2 px-3">Direction</th>
                      <th className="py-2 px-3">Target Block</th>
                      <th className="py-2 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {doc.edges.map((e) => {
                      const src = doc.nodes.find((n) => n.id === e.sourceNodeId);
                      const tgt = doc.nodes.find((n) => n.id === e.targetNodeId);
                      return (
                        <tr
                          key={e.id}
                          className="hover:bg-surface-muted/40 transition-colors"
                        >
                          <td className="py-2 px-3 font-medium text-foreground">
                            {src?.label || e.sourceNodeId}
                          </td>
                          <td className="py-2 px-3">
                            <span className="font-semibold text-primary">
                              {e.label || e.relationshipType}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {e.bidirectional ? '↔ Mutual' : '→ Directed'}
                          </td>
                          <td className="py-2 px-3 font-medium text-foreground">
                            {tgt?.label || e.targetNodeId}
                          </td>
                          <td className="py-2 px-3 text-right space-x-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdgeInspector(e.id)}
                              className="h-6 text-xs px-2"
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteEdge(e.id)}
                              className="h-6 text-xs px-2 text-destructive hover:bg-destructive/10"
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {doc.edges.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-6 text-center text-muted-foreground"
                        >
                          No relationships created yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Node Inspector Drawer */}
        {nodeInspectorOpen && (
          <aside className="absolute top-0 right-0 w-80 h-full bg-surface border-l border-border shadow-xl p-4 flex flex-col gap-3.5 z-20 animate-in slide-in-from-right-2">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h3 className="text-xs font-semibold text-foreground">
                Edit Block
              </h3>
              <button
                type="button"
                onClick={() => setNodeInspectorOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              <div>
                <label
                  htmlFor="inspector-node-label"
                  className="block text-xs font-medium text-foreground mb-1"
                >
                  Block Label
                </label>
                <input
                  id="inspector-node-label"
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full bg-surface-muted border border-border text-xs rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="inspector-node-type"
                  className="block text-xs font-medium text-foreground mb-1"
                >
                  Block Type
                </label>
                <select
                  id="inspector-node-type"
                  aria-label="Block Type"
                  value={editType}
                  onChange={(e) =>
                    setEditType(e.target.value as KnowledgeNodeType)
                  }
                  className="w-full bg-surface-muted border border-border text-xs rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:border-primary"
                >
                  <optgroup label="Story & Character Entities">
                    <option value="character">Character</option>
                    <option value="person">Person / Cast / Crew</option>
                    <option value="location">Location / Setting</option>
                    <option value="group">Group / Faction</option>
                    <option value="event">Event / Plot Point</option>
                    <option value="object">Object / Prop</option>
                    <option value="theme">Theme / Motif</option>
                    <option value="episode">Episode / Scene</option>
                    <option value="theory">Theory / Speculation</option>
                    <option value="concept">Concept</option>
                  </optgroup>
                  <optgroup label="Analysis & Arguments">
                    <option value="thesis">Thesis / Core Argument</option>
                    <option value="evidence">Evidence / Clip</option>
                    <option value="source">Source Publication</option>
                    <option value="question">Open Question</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label
                  htmlFor="inspector-node-notes"
                  className="block text-xs font-medium text-foreground mb-1"
                >
                  Description &amp; Notes
                </label>
                <textarea
                  id="inspector-node-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={4}
                  placeholder="Notes, character traits, role in plot..."
                  className="w-full bg-surface-muted border border-border text-xs rounded p-2 text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              {/* Deep Link to Library Material */}
              <div className="pt-2 border-t border-border/50">
                <label
                  htmlFor="inspector-link-type"
                  className="block text-xs font-semibold text-foreground mb-1"
                >
                  Reference Link
                </label>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Optional link to an external URL or item.
                </p>

                <select
                  id="inspector-link-type"
                  value={editLinkType}
                  onChange={(e) =>
                    setEditLinkType(
                      e.target.value as 'none' | 'item' | 'external',
                    )
                  }
                  className="w-full bg-surface-muted border border-border text-xs rounded px-2.5 py-1.5 text-foreground mb-2"
                >
                  <option value="none">No Link</option>
                  <option value="item">Library Item ID</option>
                  <option value="external">External Web URL</option>
                </select>

                {editLinkType !== 'none' && (
                  <input
                    type="text"
                    placeholder={
                      editLinkType === 'item'
                        ? 'e.g. watch-item-id'
                        : 'e.g. https://imdb.com/...'
                    }
                    value={editLinkTarget}
                    onChange={(e) => setEditLinkTarget(e.target.value)}
                    className="w-full bg-surface-muted border border-border text-xs rounded px-2.5 py-1.5 text-foreground"
                  />
                )}
              </div>
            </div>

            {/* Inspector Footer Actions */}
            <div className="flex items-center justify-between border-t border-border pt-2.5">
              {selectedNodeId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteNode(selectedNodeId)}
                  className="text-destructive hover:bg-destructive/10 text-xs px-2 h-7"
                >
                  <Trash2 size={12} className="mr-1" />
                  Delete
                </Button>
              )}
              <div className="flex gap-1.5 ml-auto">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setNodeInspectorOpen(false)}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={applyNodeInspectorChanges}
                  className="h-7 text-xs"
                >
                  Apply
                </Button>
              </div>
            </div>
          </aside>
        )}

        {/* Edge / Relationship Inspector Drawer */}
        {edgeInspectorOpen && (
          <aside className="absolute top-0 right-0 w-84 h-full bg-surface border-l border-border shadow-xl p-4 flex flex-col gap-3.5 z-20 animate-in slide-in-from-right-2">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h3 className="text-xs font-semibold text-foreground">
                Edit Relationship
              </h3>
              <button
                type="button"
                onClick={() => setEdgeInspectorOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3.5 flex-1 overflow-y-auto pr-1">
              {/* Connected Blocks Preview & Swap Direction */}
              <div className="rounded-md border border-border bg-surface-muted/30 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                  Connection
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-foreground truncate flex-1">
                    {selectedEdgeSourceNode?.label || 'Source'}
                  </span>
                  <button
                    type="button"
                    onClick={handleSwapEdgeDirection}
                    title="Swap direction"
                    className="p-1 rounded hover:bg-surface-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <ArrowLeftRight size={13} />
                  </button>
                  <span className="font-semibold text-foreground truncate flex-1 text-right">
                    {selectedEdgeTargetNode?.label || 'Target'}
                  </span>
                </div>
              </div>

              {/* Relationship Label Input */}
              <div>
                <label
                  htmlFor="inspector-edge-label"
                  className="block text-xs font-medium text-foreground mb-1"
                >
                  Relationship Label
                </label>
                <input
                  id="inspector-edge-label"
                  type="text"
                  value={editEdgeLabel}
                  onChange={(e) => setEditEdgeLabel(e.target.value)}
                  placeholder="e.g. loves, dated, rivalry, sibling of..."
                  className="w-full bg-surface-muted border border-border text-xs rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:border-primary font-medium"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Type any custom label or select a preset below.
                </p>
              </div>

              {/* Direction Toggle */}
              <div>
                <span className="block text-xs font-medium text-foreground mb-1.5">
                  Direction
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditEdgeBidirectional(false)}
                    className={`flex items-center justify-center gap-1 py-1.5 text-xs rounded-md border transition-colors ${
                      !editEdgeBidirectional
                        ? 'bg-primary text-primary-foreground border-primary font-medium'
                        : 'bg-surface border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ArrowRight size={12} />
                    <span>Directed</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditEdgeBidirectional(true)}
                    className={`flex items-center justify-center gap-1 py-1.5 text-xs rounded-md border transition-colors ${
                      editEdgeBidirectional
                        ? 'bg-primary text-primary-foreground border-primary font-medium'
                        : 'bg-surface border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ArrowLeftRight size={12} />
                    <span>Mutual (↔)</span>
                  </button>
                </div>
              </div>

              {/* Presets Chips */}
              <div>
                <span className="block text-xs font-medium text-foreground mb-1.5">
                  Quick Relationship Presets
                </span>
                <div className="flex flex-wrap gap-1">
                  {(collection === 'watch'
                    ? WATCH_RELATIONSHIP_PRESETS
                    : ACADEMIC_RELATIONSHIP_PRESETS
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setEditEdgeLabel(preset);
                        setEditEdgeType(preset.replace(/\s+/g, '-'));
                      }}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                        editEdgeLabel.toLowerCase() === preset
                          ? 'bg-primary/15 text-primary border-primary/30 font-medium'
                          : 'border-border text-muted-foreground hover:bg-surface-muted hover:text-foreground'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Edge Inspector Footer Actions */}
            <div className="flex items-center justify-between border-t border-border pt-2.5">
              {selectedEdgeId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteEdge(selectedEdgeId)}
                  className="text-destructive hover:bg-destructive/10 text-xs px-2 h-7"
                >
                  <Trash2 size={12} className="mr-1" />
                  Delete
                </Button>
              )}
              <div className="flex gap-1.5 ml-auto">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEdgeInspectorOpen(false)}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={applyEdgeInspectorChanges}
                  className="h-7 text-xs"
                >
                  Apply
                </Button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
