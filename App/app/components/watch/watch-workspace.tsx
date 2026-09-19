'use client';

/**
 * WatchWorkspace Component.
 * AFFiNE-Style Per-Watch-Title Knowledge Workspace.
 *
 * Scoped strictly to item.collection === 'watch'.
 * Every film, series, documentary, or anime gets its own independent:
 *   1. Knowledge Graph (React Flow nodes, editable labeled relationships, love triangles)
 *   2. Canvas Notes (Excalidraw drawing, visual character boards, planning)
 *   3. Mermaid Diagrams (Flowcharts, timelines, sequence diagrams)
 *   4. Highlights & Evidence (Title-scoped annotations with "Add to Graph" action)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Workflow,
  PenTool,
  FileCode,
  Highlighter,
  Plus,
  ArrowLeft,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConceptGraphCanvas } from '@/components/knowledge/concept-graph-canvas';
import { MermaidEditor } from '@/components/knowledge/mermaid-editor';
import { CanvasList } from '@/components/canvas/canvas-list';
import { ReadWatchCanvas } from '@/components/canvas/read-watch-canvas';
import type { LibraryItem } from '@/lib/catalog';
import type {
  KnowledgeGraphDocument,
  KnowledgeGraphMetadata,
  MermaidDocument,
} from '@/lib/knowledge';
import {
  collectPromotedAnnotationIds,
  isHighlightPromoted,
  mergePromotedAnnotationIds,
  resolveActiveGraphId,
} from '@/lib/knowledge/watch-workspace-state';

type WatchWorkspaceTool = 'graph' | 'canvas' | 'diagrams' | 'highlights';

interface WatchAnnotation {
  id: string;
  itemId: string;
  assetId: string;
  kind: string;
  content: {
    passage?: string;
    text?: string;
    comment?: string;
    [key: string]: unknown;
  };
  anchor: {
    quote?: string;
    [key: string]: unknown;
  };
  createdAt: string;
}

function generateNodeId(prefix = 'node'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function getRandomOffset(): number {
  return 100 + Math.random() * 200;
}

export function WatchWorkspace({
  item,
  mode: _mode = 'split',
  onWorkspaceDirtyChange,
}: {
  item: LibraryItem;
  mode?: 'split' | 'maximized';
  onWorkspaceDirtyChange?: (dirty: boolean) => void;
}) {
  const [activeTool, setActiveTool] = useState<WatchWorkspaceTool>('graph');

  // Graph state
  const [graphs, setGraphs] = useState<KnowledgeGraphMetadata[]>([]);
  const [activeGraphId, setActiveGraphId] = useState<string | null>(null);
  const [activeGraphDoc, setActiveGraphDoc] = useState<KnowledgeGraphDocument | null>(null);
  const [graphsInitialLoading, setGraphsInitialLoading] = useState(true);
  const graphsLoadedRef = useRef(false);
  const [graphsError, setGraphsError] = useState<string | null>(null);
  const [graphDirty, setGraphDirty] = useState(false);
  const [isCreatingGraph, setIsCreatingGraph] = useState(false);

  // Canvas state
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);

  // Diagram state
  const [diagrams, setDiagrams] = useState<MermaidDocument[]>([]);
  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null);
  const [diagramsInitialLoading, setDiagramsInitialLoading] = useState(true);
  const diagramsLoadedRef = useRef(false);
  const [diagramsError, setDiagramsError] = useState<string | null>(null);

  // Highlights state
  const [highlights, setHighlights] = useState<WatchAnnotation[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [highlightsError, setHighlightsError] = useState<string | null>(null);
  const [highlightAddedMap, setHighlightAddedMap] = useState<Record<string, boolean>>({});
  const [highlightActionError, setHighlightActionError] = useState<string | null>(null);
  const [pendingHighlightId, setPendingHighlightId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // 1. Fetch Graphs scoped to this Watch item
  // -------------------------------------------------------------------------
  const fetchGraphs = useCallback(async () => {
    // Yield to a microtask before touching state so effect-driven callers never
    // trigger a synchronous state update inside the effect body.
    await Promise.resolve();
    // A refresh must never tear down an already-mounted graph canvas, so only
    // the very first load uses the full-workspace loading state.
    const initial = !graphsLoadedRef.current;
    if (initial) {
      setGraphsInitialLoading(true);
      setGraphsError(null);
    }
    try {
      const res = await fetch(`/api/knowledge/graphs?itemId=${encodeURIComponent(item.id)}`);
      if (!res.ok) {
        throw new Error(`Failed to load knowledge graphs (HTTP ${res.status})`);
      }
      const list = (await res.json()) as KnowledgeGraphMetadata[];
      setGraphs(list);
      // Never keep a graph id that does not belong to this title's list.
      setActiveGraphId((prev) => resolveActiveGraphId(prev, list));
      setGraphsError(null);
    } catch (err) {
      setGraphsError(err instanceof Error ? err.message : 'Failed to load knowledge graphs');
      if (initial) {
        setGraphs([]);
        setActiveGraphId(null);
        setActiveGraphDoc(null);
      }
    } finally {
      graphsLoadedRef.current = true;
      setGraphsInitialLoading(false);
    }
  }, [item.id]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void fetchGraphs();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchGraphs]);

  // Fetch full document when activeGraphId changes
  useEffect(() => {
    if (!activeGraphId) return;
    let active = true;

    fetch(`/api/knowledge/graphs/${encodeURIComponent(activeGraphId)}?itemId=${encodeURIComponent(item.id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load graph (HTTP ${res.status})`);
        return (await res.json()) as KnowledgeGraphDocument;
      })
      .then((doc) => {
        if (!active) return;
        setActiveGraphDoc(doc);
        setGraphDirty(false);
      })
      .catch((err) => {
        if (!active) return;
        setGraphsError(err instanceof Error ? err.message : 'Failed to load knowledge graph');
        setActiveGraphDoc(null);
      });

    return () => {
      active = false;
    };
  }, [activeGraphId, item.id]);

  /**
   * Evidence already promoted into any graph owned by this Watch title. Used to
   * keep "Add to Graph" from silently duplicating a highlight after reload.
   */
  const scanPromotedAnnotationIds = useCallback(async () => {
    let linked: Record<string, boolean> = {};
    for (const graph of graphs) {
      try {
        const res = await fetch(
          `/api/knowledge/graphs/${encodeURIComponent(graph.id)}?itemId=${encodeURIComponent(item.id)}`
        );
        if (!res.ok) continue;
        const doc = (await res.json()) as KnowledgeGraphDocument;
        linked = collectPromotedAnnotationIds(doc.nodes, linked);
      } catch {
        // A best-effort scan: an unreadable graph must not block the workspace.
      }
    }
    return linked;
  }, [graphs, item.id]);

  const handleCreateGraph = useCallback(async () => {
    setIsCreatingGraph(true);
    setGraphsError(null);
    try {
      const title = graphs.length === 0 ? `${item.title} - Knowledge Graph` : `${item.title} - Graph ${graphs.length + 1}`;
      const res = await fetch('/api/knowledge/graphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: `Knowledge graph for ${item.title}`,
          associatedItemId: item.id,
          nodes: [
            {
              id: generateNodeId('node'),
              label: item.title,
              nodeType: 'concept',
              notes: `Title anchor node for ${item.title}`,
              position: { x: 250, y: 150 },
            },
          ],
          edges: [],
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to create graph (HTTP ${res.status})`);
      }
      const created = (await res.json()) as KnowledgeGraphDocument;
      await fetchGraphs();
      setActiveGraphId(created.id);
      setActiveGraphDoc(created);
      setGraphDirty(false);
    } catch (err) {
      setGraphsError(err instanceof Error ? err.message : 'Failed to create knowledge graph');
    } finally {
      setIsCreatingGraph(false);
    }
  }, [fetchGraphs, graphs.length, item.id, item.title]);

  // -------------------------------------------------------------------------
  // 2. Fetch Diagrams scoped to this Watch item
  // -------------------------------------------------------------------------
  const fetchDiagrams = useCallback(async () => {
    await Promise.resolve();
    const initial = !diagramsLoadedRef.current;
    if (initial) {
      setDiagramsInitialLoading(true);
      setDiagramsError(null);
    }
    try {
      const res = await fetch(`/api/knowledge/diagrams?itemId=${encodeURIComponent(item.id)}`);
      if (!res.ok) {
        throw new Error(`Failed to load diagrams (HTTP ${res.status})`);
      }
      const list = (await res.json()) as MermaidDocument[];
      setDiagrams(list);
      setActiveDiagramId((prev) => (prev && list.some((d) => d.id === prev) ? prev : null));
      setDiagramsError(null);
    } catch (err) {
      setDiagramsError(err instanceof Error ? err.message : 'Failed to load diagrams');
      if (initial) {
        setDiagrams([]);
        setActiveDiagramId(null);
      }
    } finally {
      diagramsLoadedRef.current = true;
      setDiagramsInitialLoading(false);
    }
  }, [item.id]);

  useEffect(() => {
    if (activeTool !== 'diagrams') return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void fetchDiagrams();
    });
    return () => {
      cancelled = true;
    };
  }, [activeTool, fetchDiagrams]);

  const handleCreateDiagram = useCallback(async () => {
    setDiagramsError(null);
    try {
      const res = await fetch('/api/knowledge/diagrams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${item.title} - Plot Diagram`,
          description: `Plot structure diagram for ${item.title}`,
          diagramType: 'flowchart',
          sourceText: `graph TD\n    A[Beginning: Status Quo] --> B[Inciting Incident]\n    B --> C[Rising Action]\n    C --> D[Climax]\n    D --> E[Resolution]`,
          associatedItemId: item.id,
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to create diagram (HTTP ${res.status})`);
      }
      const created = (await res.json()) as MermaidDocument;
      await fetchDiagrams();
      setActiveDiagramId(created.id);
    } catch (err) {
      setDiagramsError(err instanceof Error ? err.message : 'Failed to create diagram');
    }
  }, [fetchDiagrams, item.id, item.title]);



  useEffect(() => {
    if (activeTool !== 'highlights') return;
    let active = true;
    void (async () => {
      // Defer so the effect body itself performs no synchronous state update.
      await Promise.resolve();
      if (!active) return;
      setHighlightsLoading(true);
      setHighlightsError(null);
      try {
        const res = await fetch(`/api/reader/items/${encodeURIComponent(item.id)}/annotations`);
        if (!res.ok) {
          throw new Error(`Failed to load highlights (HTTP ${res.status})`);
        }
        const list = (await res.json()) as WatchAnnotation[];
        if (!active) return;
        setHighlights(list);
        // Recover already-promoted evidence so a reload never re-offers to add
        // the same highlight twice.
        const linked = await scanPromotedAnnotationIds();
        if (active && Object.keys(linked).length > 0) {
          setHighlightAddedMap((prev) => mergePromotedAnnotationIds(prev, linked));
        }
      } catch (err) {
        if (active) {
          setHighlightsError(
            err instanceof Error ? err.message : 'Failed to load highlights'
          );
          setHighlights([]);
        }
      } finally {
        if (active) setHighlightsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeTool, item.id, scanPromotedAnnotationIds]);

  // Add highlight to current graph as a block
  const handleAddHighlightToGraph = useCallback(async (highlight: WatchAnnotation) => {
    setHighlightActionError(null);
    setPendingHighlightId(highlight.id);

    const quoteText =
      highlight.content?.passage ||
      highlight.anchor?.quote ||
      highlight.content?.text ||
      highlight.content?.comment ||
      'Highlight Evidence';

    try {
      // If no graph exists yet, create one
      let targetGraphId = activeGraphId;
      if (!targetGraphId || !activeGraphDoc) {
        const res = await fetch('/api/knowledge/graphs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `${item.title} - Knowledge Graph`,
            description: `Knowledge graph for ${item.title}`,
            associatedItemId: item.id,
            nodes: [],
            edges: [],
          }),
        });
        if (!res.ok) {
          throw new Error(`Could not create a knowledge graph (HTTP ${res.status})`);
        }
        const created = (await res.json()) as KnowledgeGraphDocument;
        targetGraphId = created.id;
        setActiveGraphId(created.id);
        setActiveGraphDoc(created);
      }

      if (!targetGraphId) {
        throw new Error('No knowledge graph is available for this title');
      }

      // Load the freshest graph document before mutating it.
      const freshRes = await fetch(
        `/api/knowledge/graphs/${encodeURIComponent(targetGraphId)}?itemId=${encodeURIComponent(item.id)}`
      );
      if (!freshRes.ok) {
        throw new Error(`Could not open the knowledge graph (HTTP ${freshRes.status})`);
      }
      const freshDoc = (await freshRes.json()) as KnowledgeGraphDocument;

      // Already-promoted evidence is never pushed twice by the normal action.
      const alreadyPromoted = isHighlightPromoted(freshDoc.nodes, highlight.id);
      if (alreadyPromoted) {
        setHighlightAddedMap((prev) => ({ ...prev, [highlight.id]: true }));
        setActiveGraphId(targetGraphId);
        setActiveGraphDoc(freshDoc);
        setGraphDirty(false);
        setActiveTool('graph');
        return;
      }

      const newNodeId = generateNodeId('node');
      const newNodes = [
        ...freshDoc.nodes,
        {
          id: newNodeId,
          graphId: targetGraphId,
          label: quoteText.slice(0, 48) + (quoteText.length > 48 ? '...' : ''),
          nodeType: 'evidence' as const,
          notes: quoteText,
          position: {
            x: getRandomOffset(),
            y: getRandomOffset(),
          },
          deepLink: {
            type: 'annotation' as const,
            target: highlight.id,
            label: 'Highlight Link',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const putRes = await fetch(
        `/api/knowledge/graphs/${encodeURIComponent(targetGraphId)}?itemId=${encodeURIComponent(item.id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: freshDoc.title,
            description: freshDoc.description,
            tags: freshDoc.tags,
            associatedItemId: item.id,
            nodes: newNodes,
            edges: freshDoc.edges,
            expectedRevision: freshDoc.revision,
          }),
        }
      );

      if (!putRes.ok) {
        throw new Error(
          putRes.status === 409
            ? 'This graph changed in another session. Reload and try again.'
            : `Adding this highlight failed (HTTP ${putRes.status}). Nothing was saved.`
        );
      }

      const updated = (await putRes.json()) as KnowledgeGraphDocument;
      setActiveGraphDoc(updated);
      setGraphDirty(false);
      setHighlightAddedMap((prev) => ({ ...prev, [highlight.id]: true }));
      setActiveGraphId(targetGraphId);
      setActiveTool('graph');
      void fetchGraphs();
    } catch (err) {
      setHighlightActionError(
        err instanceof Error ? err.message : 'Adding this highlight failed.'
      );
    } finally {
      setPendingHighlightId(null);
    }
  }, [activeGraphDoc, activeGraphId, fetchGraphs, item.id, item.title]);

  const activeDiagramDoc = diagrams.find((d) => d.id === activeDiagramId);

  useEffect(() => {
    onWorkspaceDirtyChange?.(graphDirty);
  }, [graphDirty, onWorkspaceDirtyChange]);

  /**
   * Switching graphs must never silently discard unsaved edits.
   */
  const selectGraph = useCallback(
    (nextGraphId: string) => {
      if (nextGraphId === activeGraphId) return;
      if (
        graphDirty &&
        !window.confirm('Discard unsaved changes to the current graph?')
      ) {
        return;
      }
      setActiveGraphDoc(null);
      setGraphDirty(false);
      setGraphsError(null);
      setActiveGraphId(nextGraphId);
    },
    [activeGraphId, graphDirty]
  );

  return (
    <div className="flex flex-col h-full w-full bg-surface border border-border rounded-lg overflow-hidden shadow-xs">
      {/* Workspace Sub-Navigation Rail / Header */}
      <header className="h-10 border-b border-border bg-surface-muted/40 px-3 flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => {
              setActiveTool('graph');
              setActiveCanvasId(null);
              setActiveDiagramId(null);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTool === 'graph'
                ? 'bg-surface text-primary font-semibold shadow-xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Workflow size={13} />
            <span>Graph</span>
            {graphs.length > 0 && (
              <span className="text-[10px] bg-primary/10 text-primary px-1 rounded-full">
                {graphs.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTool('canvas');
              setActiveDiagramId(null);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTool === 'canvas'
                ? 'bg-surface text-primary font-semibold shadow-xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <PenTool size={13} />
            <span>Canvas</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTool('diagrams');
              setActiveCanvasId(null);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTool === 'diagrams'
                ? 'bg-surface text-primary font-semibold shadow-xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileCode size={13} />
            <span>Diagrams</span>
            {diagrams.length > 0 && (
              <span className="text-[10px] bg-primary/10 text-primary px-1 rounded-full">
                {diagrams.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTool('highlights');
              setActiveCanvasId(null);
              setActiveDiagramId(null);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTool === 'highlights'
                ? 'bg-surface text-primary font-semibold shadow-xs border border-border/80'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Highlighter size={13} />
            <span>Highlights</span>
            {highlights.length > 0 && (
              <span className="text-[10px] bg-primary/10 text-primary px-1 rounded-full">
                {highlights.length}
              </span>
            )}
          </button>
        </div>

        {/* Graph Switcher when multiple exist */}
        {activeTool === 'graph' && graphs.length > 1 && (
          <div className="flex items-center gap-1.5">
            <select
              value={activeGraphId || ''}
              onChange={(e) => selectGraph(e.target.value)}
              className="h-6 text-[11px] bg-surface border border-border rounded px-2 text-foreground font-medium"
            >
              {graphs.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCreateGraph}
              disabled={isCreatingGraph}
              className="h-6 text-[11px] px-1.5"
              title="Create another graph"
            >
              <Plus size={12} />
            </Button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden bg-background">
        {/* =============================================================== */}
        {/* TOOL 1: KNOWLEDGE GRAPH                                         */}
        {/* =============================================================== */}
        {activeTool === 'graph' && (
          <div className="h-full w-full">
            {graphsInitialLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Loading knowledge workspace...
              </div>
            ) : graphs.length === 0 && graphsError ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-3">
                <span className="grid size-12 place-items-center rounded-xl border border-border bg-surface text-destructive shadow-xs">
                  <AlertTriangle size={22} />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Knowledge graph unavailable
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {graphsError}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void fetchGraphs()} className="h-8 text-xs">
                  Retry
                </Button>
              </div>
            ) : graphs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-3">
                <span className="grid size-12 place-items-center rounded-xl border border-border bg-surface text-primary shadow-xs">
                  <Workflow size={24} />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    No Knowledge Graph yet
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Create an independent visual network for {item.title}. Map characters,
                    rivalries, love triangles, factions, and story revelations.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleCreateGraph}
                  disabled={isCreatingGraph}
                  className="h-8 text-xs"
                >
                  <Plus size={13} className="mr-1.5" />
                  {isCreatingGraph ? 'Creating...' : 'Create Graph'}
                </Button>
              </div>
            ) : activeGraphDoc ? (
              <ConceptGraphCanvas
                key={activeGraphDoc.id}
                initialDocument={activeGraphDoc}
                collection="watch"
                onDirtyChange={setGraphDirty}
                onDocumentChange={(updated) => {
                  setActiveGraphDoc(updated);
                  setGraphDirty(false);
                  void fetchGraphs();
                }}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
                <span>{graphsError ?? 'Select a graph above.'}</span>
                {graphsError && (
                  <Button size="sm" variant="secondary" onClick={() => void fetchGraphs()} className="h-8 text-xs">
                    Retry
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* =============================================================== */}
        {/* TOOL 2: CANVAS (EXCALIDRAW)                                     */}
        {/* =============================================================== */}
        {activeTool === 'canvas' && (
          <div className="h-full w-full">
            {activeCanvasId ? (
              <div className="h-full w-full flex flex-col">
                <div className="h-8 border-b border-border bg-surface px-3 flex items-center shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveCanvasId(null)}
                    className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft size={12} className="mr-1" />
                    Back to Canvas List
                  </Button>
                </div>
                <div className="flex-1 relative">
                  <ReadWatchCanvas
                    canvasId={activeCanvasId}
                    bookTitle={item.title}
                    itemId={item.id}
                    onClose={() => setActiveCanvasId(null)}
                  />
                </div>
              </div>
            ) : (
              <div className="h-full p-4 overflow-y-auto">
                <CanvasList
                  itemId={item.id}
                  bookTitle={item.title}
                  onSelectCanvas={(id) => setActiveCanvasId(id)}
                />
              </div>
            )}
          </div>
        )}

        {/* =============================================================== */}
        {/* TOOL 3: DIAGRAMS (MERMAID)                                      */}
        {/* =============================================================== */}
        {activeTool === 'diagrams' && (
          <div className="h-full w-full">
            {activeDiagramId && activeDiagramDoc ? (
              <div className="h-full w-full flex flex-col">
                <div className="h-8 border-b border-border bg-surface px-3 flex items-center shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveDiagramId(null)}
                    className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft size={12} className="mr-1" />
                    Back to Diagrams
                  </Button>
                </div>
                <div className="flex-1 relative">
                  <MermaidEditor
                    initialDocument={activeDiagramDoc}
                    onDocumentChange={() => void fetchDiagrams()}
                  />
                </div>
              </div>
            ) : diagramsInitialLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Loading diagrams...
              </div>
            ) : diagrams.length === 0 && diagramsError ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-3">
                <span className="grid size-12 place-items-center rounded-xl border border-border bg-surface text-destructive shadow-xs">
                  <AlertTriangle size={22} />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Diagrams unavailable
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{diagramsError}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void fetchDiagrams()} className="h-8 text-xs">
                  Retry
                </Button>
              </div>
            ) : diagrams.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-3">
                <span className="grid size-12 place-items-center rounded-xl border border-border bg-surface text-primary shadow-xs">
                  <FileCode size={24} />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    No Diagrams yet
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Create Mermaid flowcharts, sequence diagrams, and timelines scoped to {item.title}.
                  </p>
                </div>
                <Button size="sm" onClick={handleCreateDiagram} className="h-8 text-xs">
                  <Plus size={13} className="mr-1.5" />
                  Create Diagram
                </Button>
              </div>
            ) : (
              <div className="h-full p-5 overflow-y-auto space-y-4 max-w-4xl mx-auto">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Diagrams for {item.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Text-driven Mermaid charts and plot flowcharts.
                    </p>
                  </div>
                  <Button size="sm" onClick={handleCreateDiagram} className="h-7 text-xs">
                    <Plus size={12} className="mr-1" />
                    New Diagram
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {diagrams.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setActiveDiagramId(d.id)}
                      className="p-3.5 rounded-lg border border-border bg-surface hover:border-primary/50 text-left transition-all shadow-xs group cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {d.diagramType}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          r{d.revision}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                        {d.title}
                      </h4>
                      {d.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                          {d.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =============================================================== */}
        {/* TOOL 4: HIGHLIGHTS & EVIDENCE                                   */}
        {/* =============================================================== */}
        {activeTool === 'highlights' && (
          <div className="h-full w-full overflow-y-auto p-5">
            {highlightsLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Loading highlights...
              </div>
            ) : highlightsError ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-3">
                <span className="grid size-12 place-items-center rounded-xl border border-border bg-surface text-destructive shadow-xs">
                  <AlertTriangle size={22} />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Highlights unavailable
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {highlightsError}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setActiveTool('graph')}
                  className="h-8 text-xs"
                >
                  Back to graph
                </Button>
              </div>
            ) : highlights.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-3">
                <span className="grid size-12 place-items-center rounded-xl border border-border bg-surface text-primary shadow-xs">
                  <Highlighter size={24} />
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    No highlights recorded
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Evidence, annotations, and key moments for {item.title} will appear here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-4xl mx-auto">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Highlights for {item.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {highlights.length} saved evidence records and annotations.
                  </p>
                </div>

                {highlightActionError && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>{highlightActionError}</span>
                  </div>
                )}

                <div className="space-y-3">
                  {highlights.map((h) => {
                    const text =
                      h.content?.passage ||
                      h.anchor?.quote ||
                      h.content?.text ||
                      h.content?.comment ||
                      'Evidence passage';
                    const isAdded = highlightAddedMap[h.id];
                    const isPending = pendingHighlightId === h.id;

                    return (
                      <div
                        key={h.id}
                        className="rounded-lg border border-border bg-surface p-3.5 space-y-2 shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {h.kind || 'Highlight'}
                          </Badge>
                          <Button
                            size="sm"
                            variant={isAdded ? 'secondary' : 'default'}
                            onClick={() => void handleAddHighlightToGraph(h)}
                            disabled={isAdded || isPending}
                            className="h-6 text-[11px] px-2"
                          >
                            {isAdded ? (
                              <>
                                <Check size={11} className="mr-1" />
                                Added to Graph
                              </>
                            ) : isPending ? (
                              <>
                                <Plus size={11} className="mr-1" />
                                Adding...
                              </>
                            ) : (
                              <>
                                <Plus size={11} className="mr-1" />
                                Add to Graph
                              </>
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-foreground font-serif leading-relaxed italic border-l-2 border-primary/40 pl-2.5">
                          &ldquo;{text}&rdquo;
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
