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

import { useState, useEffect, useCallback } from 'react';
import {
  Workflow,
  PenTool,
  FileCode,
  Highlighter,
  Plus,
  ArrowLeft,
  Check,
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
}: {
  item: LibraryItem;
  mode?: 'split' | 'maximized';
}) {
  const [activeTool, setActiveTool] = useState<WatchWorkspaceTool>('graph');

  // Graph state
  const [graphs, setGraphs] = useState<KnowledgeGraphMetadata[]>([]);
  const [activeGraphId, setActiveGraphId] = useState<string | null>(null);
  const [activeGraphDoc, setActiveGraphDoc] = useState<KnowledgeGraphDocument | null>(null);
  const [graphsLoading, setGraphsLoading] = useState(false);
  const [isCreatingGraph, setIsCreatingGraph] = useState(false);

  // Canvas state
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);

  // Diagram state
  const [diagrams, setDiagrams] = useState<MermaidDocument[]>([]);
  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null);
  const [diagramsLoading, setDiagramsLoading] = useState(false);

  // Highlights state
  const [highlights, setHighlights] = useState<WatchAnnotation[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [highlightAddedMap, setHighlightAddedMap] = useState<Record<string, boolean>>({});

  // -------------------------------------------------------------------------
  // 1. Fetch Graphs scoped to this Watch item
  // -------------------------------------------------------------------------
  const fetchGraphs = useCallback(async () => {
    try {
      const res = await fetch(`/api/knowledge/graphs?itemId=${encodeURIComponent(item.id)}`);
      if (res.ok) {
        const list = (await res.json()) as KnowledgeGraphMetadata[];
        setGraphs(list);
        if (list.length > 0) {
          setActiveGraphId((prev) => prev ?? list[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch watch graphs:', err);
    } finally {
      setGraphsLoading(false);
    }
  }, [item.id]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/knowledge/graphs?itemId=${encodeURIComponent(item.id)}`);
        if (res.ok && active) {
          const list = (await res.json()) as KnowledgeGraphMetadata[];
          setGraphs(list);
          if (list.length > 0) {
            setActiveGraphId((prev) => prev ?? list[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch watch graphs:', err);
      } finally {
        if (active) setGraphsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [item.id]);

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
        if (active) setActiveGraphDoc(doc);
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load active watch graph:', err);
          setActiveGraphDoc(null);
        }
      });

    return () => {
      active = false;
    };
  }, [activeGraphId, item.id]);

  const handleCreateGraph = useCallback(async () => {
    setIsCreatingGraph(true);
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

      if (res.ok) {
        const created = (await res.json()) as KnowledgeGraphDocument;
        await fetchGraphs();
        setActiveGraphId(created.id);
        setActiveGraphDoc(created);
      }
    } catch (err) {
      console.error('Failed to create watch graph:', err);
    } finally {
      setIsCreatingGraph(false);
    }
  }, [fetchGraphs, graphs.length, item.id, item.title]);

  // -------------------------------------------------------------------------
  // 2. Fetch Diagrams scoped to this Watch item
  // -------------------------------------------------------------------------
  const fetchDiagrams = useCallback(async () => {
    try {
      const res = await fetch(`/api/knowledge/diagrams?itemId=${encodeURIComponent(item.id)}`);
      if (res.ok) {
        const list = (await res.json()) as MermaidDocument[];
        setDiagrams(list);
      }
    } catch (err) {
      console.error('Failed to fetch watch diagrams:', err);
    } finally {
      setDiagramsLoading(false);
    }
  }, [item.id]);

  useEffect(() => {
    if (activeTool !== 'diagrams') return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/knowledge/diagrams?itemId=${encodeURIComponent(item.id)}`);
        if (res.ok && active) {
          const list = (await res.json()) as MermaidDocument[];
          setDiagrams(list);
        }
      } catch (err) {
        console.error('Failed to fetch watch diagrams:', err);
      } finally {
        if (active) setDiagramsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeTool, item.id]);

  const handleCreateDiagram = useCallback(async () => {
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
      if (res.ok) {
        const created = (await res.json()) as MermaidDocument;
        await fetchDiagrams();
        setActiveDiagramId(created.id);
      }
    } catch (err) {
      console.error('Failed to create watch diagram:', err);
    }
  }, [fetchDiagrams, item.id, item.title]);



  useEffect(() => {
    if (activeTool !== 'highlights') return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/reader/items/${encodeURIComponent(item.id)}/annotations`);
        if (res.ok && active) {
          const list = (await res.json()) as WatchAnnotation[];
          setHighlights(list);
        }
      } catch (err) {
        console.error('Failed to fetch watch annotations:', err);
      } finally {
        if (active) setHighlightsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeTool, item.id]);

  // Add highlight to current graph as a block
  const handleAddHighlightToGraph = useCallback(async (highlight: WatchAnnotation) => {
    const quoteText =
      highlight.content?.passage ||
      highlight.anchor?.quote ||
      highlight.content?.text ||
      highlight.content?.comment ||
      'Highlight Evidence';

    // If no graph exists yet, create one
    let targetGraphId = activeGraphId;
    if (!targetGraphId || !activeGraphDoc) {
      const title = `${item.title} - Knowledge Graph`;
      const res = await fetch('/api/knowledge/graphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: `Knowledge graph for ${item.title}`,
          associatedItemId: item.id,
          nodes: [],
          edges: [],
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as KnowledgeGraphDocument;
        targetGraphId = created.id;
        setActiveGraphId(created.id);
        setActiveGraphDoc(created);
      }
    }

    if (!targetGraphId) return;

    // Load fresh graph document
    const freshRes = await fetch(
      `/api/knowledge/graphs/${encodeURIComponent(targetGraphId)}?itemId=${encodeURIComponent(item.id)}`
    );
    if (!freshRes.ok) return;
    const freshDoc = (await freshRes.json()) as KnowledgeGraphDocument;

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

    await fetch(`/api/knowledge/graphs/${encodeURIComponent(targetGraphId)}`, {
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
    });

    setHighlightAddedMap((prev) => ({ ...prev, [highlight.id]: true }));
    setActiveGraphId(targetGraphId);
    setActiveTool('graph');
  }, [activeGraphDoc, activeGraphId, item.id, item.title]);

  const activeDiagramDoc = diagrams.find((d) => d.id === activeDiagramId);

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
              onChange={(e) => setActiveGraphId(e.target.value)}
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
            {graphsLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Loading knowledge workspace...
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
                initialDocument={activeGraphDoc}
                collection="watch"
                onDocumentChange={(updated) => {
                  setActiveGraphDoc(updated);
                  void fetchGraphs();
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Select a graph above.
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
            ) : diagramsLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Loading diagrams...
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

                <div className="space-y-3">
                  {highlights.map((h) => {
                    const text =
                      h.content?.passage ||
                      h.anchor?.quote ||
                      h.content?.text ||
                      h.content?.comment ||
                      'Evidence passage';
                    const isAdded = highlightAddedMap[h.id];

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
                            disabled={isAdded}
                            className="h-6 text-[11px] px-2"
                          >
                            {isAdded ? (
                              <>
                                <Check size={11} className="mr-1" />
                                Added to Graph
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
