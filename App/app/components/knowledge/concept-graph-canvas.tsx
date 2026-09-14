'use client';

/**
 * ConceptGraphCanvas Component.
 * Phase 13 — Knowledge and Diagram System.
 *
 * Implements:
 *   - P13-T003: React Flow projection for semantic topology
 *   - P13-T005: Read & Watch owned relationships and deep links
 *   - Accessible alternative table/outline view
 *   - Optimistic concurrency save with conflict handling
 */

import { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConceptNode, type ConceptNodeData } from './concept-node';
import { DeepLinkBadge } from './deep-link-badge';
import type {
  KnowledgeGraphDocument,
  KnowledgeNode,
  KnowledgeEdge,
  KnowledgeNodeType,
  KnowledgeRelationshipType,
  DeepLinkRef,
} from '@/lib/knowledge';

interface ConceptGraphCanvasProps {
  initialDocument: KnowledgeGraphDocument;
  onDocumentChange?: (doc: KnowledgeGraphDocument) => void;
}

const _RELATIONSHIP_OPTIONS: Array<{ value: KnowledgeRelationshipType; label: string }> = [
  { value: 'supports', label: 'Supports / Evidence For' },
  { value: 'refutes', label: 'Refutes / Contradicts' },
  { value: 'derives-from', label: 'Derives From / Extends' },
  { value: 'influences', label: 'Influences / Shapes' },
  { value: 'part-of', label: 'Part Of / Component Of' },
  { value: 'contrasts-with', label: 'Contrasts With' },
  { value: 'relates-to', label: 'Relates To' },
];

export function ConceptGraphCanvas({ initialDocument, onDocumentChange }: ConceptGraphCanvasProps) {
  const [doc, setDoc] = useState<KnowledgeGraphDocument>(initialDocument);
  const [viewMode, setViewMode] = useState<'canvas' | 'table'>('canvas');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Inspector state
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editType, setEditType] = useState<KnowledgeNodeType>('concept');
  const [editNotes, setEditNotes] = useState('');
  const [editLinkType, setEditLinkType] = useState<'none' | 'item' | 'external'>('none');
  const [editLinkTarget, setEditLinkTarget] = useState('');

  // Register custom node types
  const nodeTypes = useMemo(() => ({ concept: ConceptNode }), []);

  // Map canonical nodes to React Flow projection nodes
  const initialNodes = useMemo<Node[]>(() => {
    return doc.nodes.map((n) => ({
      id: n.id,
      type: 'concept',
      position: { x: n.position.x, y: n.position.y },
      data: {
        label: n.label,
        nodeType: n.nodeType,
        notes: n.notes,
        deepLink: n.deepLink,
        onEdit: (nodeId: string) => {
          const targetNode = doc.nodes.find((dn) => dn.id === nodeId);
          if (targetNode) {
            setSelectedNodeId(nodeId);
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
            setInspectorOpen(true);
          }
        },
      } satisfies ConceptNodeData,
    }));
  }, [doc.nodes]);

  // Map canonical edges to React Flow projection edges
  const initialEdges = useMemo<Edge[]>(() => {
    return doc.edges.map((e) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      label: e.label || e.relationshipType,
      markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
      style: {
        strokeWidth: 1.5,
        stroke: e.relationshipType === 'refutes' ? '#ef4444' : e.relationshipType === 'supports' ? '#10b981' : '#6366f1',
      },
      data: { relationshipType: e.relationshipType },
    }));
  }, [doc.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

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
      const newEdgeId = `edge-${Date.now()}`;
      const newCanonicalEdge: KnowledgeEdge = {
        id: newEdgeId,
        graphId: doc.id,
        sourceNodeId: params.source,
        targetNodeId: params.target,
        relationshipType: 'relates-to',
        label: 'relates to',
        bidirectional: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            id: newEdgeId,
            label: 'relates to',
            markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
            style: { strokeWidth: 1.5, stroke: '#6366f1' },
          },
          eds
        )
      );

      setDoc((prev) => ({
        ...prev,
        edges: [...prev.edges, newCanonicalEdge],
      }));
    },
    [doc.id, setEdges]
  );

  // Open inspector for a node
  const openInspector = useCallback(
    (nodeId: string) => {
      const targetNode = doc.nodes.find((n) => n.id === nodeId);
      if (targetNode) {
        setSelectedNodeId(nodeId);
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
        setInspectorOpen(true);
      }
    },
    [doc.nodes]
  );

  // Save inspector changes
  const applyInspectorChanges = () => {
    if (!selectedNodeId) return;

    let deepLink: DeepLinkRef | null = null;
    if (editLinkType !== 'none' && editLinkTarget.trim()) {
      deepLink = {
        type: editLinkType,
        target: editLinkTarget.trim(),
        label: editLinkType === 'item' ? 'Book Reference' : 'External Web Reference',
      };
    }

    setDoc((prev) => {
      const updatedNodes = prev.nodes.map((n) => {
        if (n.id === selectedNodeId) {
          return {
            ...n,
            label: editLabel.trim() || 'Untitled Concept',
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

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              label: editLabel.trim() || 'Untitled Concept',
              nodeType: editType,
              notes: editNotes.trim(),
              deepLink,
            },
          };
        }
        return n;
      })
    );

    setInspectorOpen(false);
  };

  // Add new concept node
  const handleAddNode = () => {
    const newNodeId = `node-${Date.now()}`;
    const newNode: KnowledgeNode = {
      id: newNodeId,
      graphId: doc.id,
      label: 'New Concept',
      nodeType: 'concept',
      notes: '',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDoc((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));

    setNodes((nds) => [
      ...nds,
      {
        id: newNodeId,
        type: 'concept',
        position: newNode.position,
        data: {
          label: newNode.label,
          nodeType: newNode.nodeType,
          notes: '',
          onEdit: openInspector,
        },
      },
    ]);

    openInspector(newNodeId);
  };

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    setDoc((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      edges: prev.edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
    }));
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) {
      setInspectorOpen(false);
      setSelectedNodeId(null);
    }
  };

  // Save graph to server with optimistic concurrency
  const handleSave = async () => {
    handleNodesSync();
    setIsSaving(true);
    setConflictError(null);
    setSaveSuccess(false);

    try {
      // Capture updated positions from flow nodes
      const finalNodes = doc.nodes.map((n) => {
        const flowNode = nodes.find((fn) => fn.id === n.id);
        return {
          ...n,
          position: flowNode ? { x: flowNode.position.x, y: flowNode.position.y } : n.position,
        };
      });

      const res = await fetch(`/api/knowledge/graphs/${encodeURIComponent(doc.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: doc.title,
          description: doc.description,
          tags: doc.tags,
          nodes: finalNodes,
          edges: doc.edges,
          expectedRevision: doc.revision,
        }),
      });

      if (res.status === 409) {
        setConflictError('Conflict: This graph was modified in another session. Please reload.');
        setIsSaving(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to save graph (HTTP ${res.status})`);
      }

      const updated = (await res.json()) as KnowledgeGraphDocument;
      setDoc(updated);
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
      2
    );
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.toLowerCase().replace(/\s+/g, '-') || 'concept-graph'}.rwgraph`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full w-full bg-background select-none">
      {/* Top Toolbar */}
      <header className="h-14 border-b border-border bg-surface px-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Workflow className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground truncate">{doc.title}</h2>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-mono">
                Rev {doc.revision}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {doc.nodes.length} concepts · {doc.edges.length} relationships
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* View mode toggle: Visual Flow vs Accessible Table */}
          <div className="flex rounded-lg border border-border bg-surface-muted/60 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('canvas')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'canvas'
                  ? 'bg-surface text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Interactive Visual Canvas"
            >
              <Workflow size={13} />
              <span>Canvas</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'table'
                  ? 'bg-surface text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Accessible Table View"
            >
              <Table size={13} />
              <span>Outline / Table</span>
            </button>
          </div>

          <Button size="sm" variant="secondary" onClick={handleAddNode} className="h-8 text-xs">
            <Plus size={13} className="mr-1" />
            Add Concept
          </Button>

          <Button size="sm" variant="ghost" onClick={handleExport} className="h-8 text-xs" title="Export .rwgraph">
            <Download size={13} />
          </Button>

          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className={`h-8 text-xs ${saveSuccess ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
          >
            {saveSuccess ? (
              <>
                <Check size={13} className="mr-1" />
                Saved
              </>
            ) : (
              <>
                <Save size={13} className="mr-1" />
                {isSaving ? 'Saving...' : 'Save'}
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Conflict Warning Banner */}
      {conflictError && (
        <div className="p-3 bg-amber-500/15 border-b border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} />
            <span>{conflictError}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => window.location.reload()} className="h-6 text-xs">
            Reload Graph
          </Button>
        </div>
      )}

      {/* Main Workspace: Canvas or Table */}
      <div className="flex-1 relative overflow-hidden">
        {viewMode === 'canvas' ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2.5}
            className="bg-dot-pattern"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls className="!bg-surface !border-border !shadow-sm" />
            <MiniMap
              className="!bg-surface/90 !border-border !rounded-lg"
              nodeColor={(n) => {
                const data = n.data as unknown as ConceptNodeData;
                if (data.nodeType === 'thesis') return '#a855f7';
                if (data.nodeType === 'evidence') return '#10b981';
                if (data.nodeType === 'source') return '#3b82f6';
                if (data.nodeType === 'person') return '#f59e0b';
                if (data.nodeType === 'event') return '#f43f5e';
                return '#6366f1';
              }}
            />
            <Panel position="top-right" className="bg-surface/90 backdrop-blur border border-border rounded-lg p-2 text-xs text-muted-foreground shadow-xs">
              <span className="font-semibold text-foreground">Tip:</span> Drag between node handles to create relationships.
            </Panel>
          </ReactFlow>
        ) : (
          /* Accessible Table / List View */
          <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">Concepts & Nodes</h3>
                <p className="text-xs text-muted-foreground">Screen-reader and keyboard accessible inventory of graph knowledge.</p>
              </div>
              <Button size="sm" onClick={handleAddNode}>
                <Plus size={13} className="mr-1" />
                Add Concept
              </Button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden bg-surface">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted/60 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">Concept Label</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Notes</th>
                    <th className="py-2.5 px-3">Source Link</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {doc.nodes.map((n) => (
                    <tr key={n.id} className="hover:bg-surface-muted/40 transition-colors">
                      <td className="py-3 px-4 font-semibold text-foreground">{n.label}</td>
                      <td className="py-3 px-3">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {n.nodeType}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground max-w-xs truncate">{n.notes || '-'}</td>
                      <td className="py-3 px-3">
                        {n.deepLink ? <DeepLinkBadge link={n.deepLink} /> : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="py-3 px-3 text-right space-x-2">
                        <Button size="sm" variant="ghost" onClick={() => openInspector(n.id)} className="h-7 text-xs px-2">
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteNode(n.id)} className="h-7 text-xs px-2 text-destructive hover:bg-destructive/10">
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Relationships Table */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">Semantic Relationships</h3>
              <div className="border border-border rounded-lg overflow-hidden bg-surface">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-muted/60 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4">Source Concept</th>
                      <th className="py-2.5 px-3">Relationship</th>
                      <th className="py-2.5 px-3">Target Concept</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {doc.edges.map((e) => {
                      const src = doc.nodes.find((n) => n.id === e.sourceNodeId);
                      const tgt = doc.nodes.find((n) => n.id === e.targetNodeId);
                      return (
                        <tr key={e.id} className="hover:bg-surface-muted/40 transition-colors">
                          <td className="py-2.5 px-4 font-medium text-foreground">{src?.label || e.sourceNodeId}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-primary">{e.relationshipType}</span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-foreground">{tgt?.label || e.targetNodeId}</td>
                          <td className="py-2.5 px-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setDoc((prev) => ({
                                  ...prev,
                                  edges: prev.edges.filter((edge) => edge.id !== e.id),
                                }));
                                setEdges((eds) => eds.filter((edge) => edge.id !== e.id));
                              }}
                              className="h-7 text-xs px-2 text-destructive hover:bg-destructive/10"
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Node Inspector Drawer */}
        {inspectorOpen && (
          <aside className="absolute top-0 right-0 w-80 h-full bg-surface border-l border-border shadow-xl p-5 flex flex-col gap-4 z-20 animate-in slide-in-from-right-2">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-semibold text-foreground">Edit Concept Node</h3>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto">
              <div>
                <label htmlFor="inspector-label" className="block text-xs font-medium text-foreground mb-1">Concept Label</label>
                <input
                  id="inspector-label"
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full bg-surface-muted border border-border text-xs rounded px-3 py-1.5 text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label htmlFor="inspector-type" className="block text-xs font-medium text-foreground mb-1">Concept Type</label>
                <select
                  id="inspector-type"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as KnowledgeNodeType)}
                  className="w-full bg-surface-muted border border-border text-xs rounded px-3 py-1.5 text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="concept">Concept</option>
                  <option value="thesis">Thesis / Core Argument</option>
                  <option value="evidence">Evidence / Data</option>
                  <option value="source">Source Publication</option>
                  <option value="person">Person / Author</option>
                  <option value="event">Event / History</option>
                  <option value="question">Open Question</option>
                </select>
              </div>

              <div>
                <label htmlFor="inspector-notes" className="block text-xs font-medium text-foreground mb-1">Notes &amp; Explanation</label>
                <textarea
                  id="inspector-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={4}
                  placeholder="Elaborate the concept, premise, or argument..."
                  className="w-full bg-surface-muted border border-border text-xs rounded p-2.5 text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              {/* Deep Link to Library Material */}
              <div className="pt-2 border-t border-border/50">
                <label htmlFor="inspector-link-type" className="block text-xs font-semibold text-foreground mb-1">Deep Link to Source</label>
                <p className="text-[11px] text-muted-foreground mb-2">Connect this concept node to a book or external source.</p>

                <select
                  id="inspector-link-type"
                  value={editLinkType}
                  onChange={(e) => setEditLinkType(e.target.value as 'none' | 'item' | 'external')}
                  className="w-full bg-surface-muted border border-border text-xs rounded px-3 py-1.5 text-foreground mb-2"
                >
                  <option value="none">No Link</option>
                  <option value="item">Library Book ID</option>
                  <option value="external">External Web URL</option>
                </select>

                {editLinkType !== 'none' && (
                  <input
                    type="text"
                    placeholder={editLinkType === 'item' ? 'e.g. read-book00000000000000000000000001' : 'e.g. https://plato.stanford.edu/...'}
                    value={editLinkTarget}
                    onChange={(e) => setEditLinkTarget(e.target.value)}
                    className="w-full bg-surface-muted border border-border text-xs rounded px-3 py-1.5 text-foreground"
                  />
                )}
              </div>
            </div>

            {/* Inspector Footer Actions */}
            <div className="flex items-center justify-between border-t border-border pt-3">
              {selectedNodeId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteNode(selectedNodeId)}
                  className="text-destructive hover:bg-destructive/10 text-xs px-2 h-7"
                >
                  <Trash2 size={13} className="mr-1" />
                  Delete
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button size="sm" variant="secondary" onClick={() => setInspectorOpen(false)} className="h-7 text-xs">
                  Cancel
                </Button>
                <Button size="sm" onClick={applyInspectorChanges} className="h-7 text-xs">
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
