'use client';

/**
 * KnowledgeHub Component.
 * Phase 13 — Knowledge and Diagram System.
 *
 * Implements the 4-tier knowledge management dashboard:
 *   - Semantic Concept Graphs (React Flow)
 *   - Text-Defined Diagrams (Mermaid)
 *   - Standalone Concept Canvases (Excalidraw)
 *   - Calibrated Tool Selection Guide
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Workflow,
  FileCode,
  PenTool,
  BookOpen,
  Plus,
  Search,
  Layers,
  ArrowRight,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CanvasList } from '@/components/canvas';
import type { KnowledgeGraphMetadata, MermaidDocument, KnowledgeIndexSummary } from '@/lib/knowledge';

export function KnowledgeHub() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'graphs';

  const [activeTab, setActiveTab] = useState<'graphs' | 'diagrams' | 'canvases' | 'guide'>(
    initialTab as 'graphs' | 'diagrams' | 'canvases' | 'guide'
  );

  const [graphs, setGraphs] = useState<KnowledgeGraphMetadata[]>([]);
  const [diagrams, setDiagrams] = useState<MermaidDocument[]>([]);
  const [canvasesCount, setCanvasesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create modal states
  const [isCreatingGraph, setIsCreatingGraph] = useState(false);
  const [newGraphTitle, setNewGraphTitle] = useState('');
  const [isCreatingDiagram, setIsCreatingDiagram] = useState(false);
  const [newDiagramTitle, setNewDiagramTitle] = useState('');
  const [newDiagramType, setNewDiagramType] = useState('flowchart');

  // Load summary data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge/summary');
      if (res.ok) {
        const data = (await res.json()) as KnowledgeIndexSummary;
        setGraphs(data.graphs || []);
        setDiagrams(data.diagrams || []);
        setCanvasesCount(data.conceptCanvasesCount || 0);
      }
    } catch (err) {
      console.error('Failed to load knowledge summary:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-compiler/react-compiler
    void fetchData();
  }, [fetchData]);

  // Handle tab changes with URL reflection
  const handleTabChange = (tab: 'graphs' | 'diagrams' | 'canvases' | 'guide') => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`?${params.toString()}`);
  };

  // Create new concept graph
  const handleCreateGraph = async () => {
    if (!newGraphTitle.trim()) return;
    try {
      const res = await fetch('/api/knowledge/graphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newGraphTitle.trim(),
          nodes: [
            {
              id: 'node-1',
              label: newGraphTitle.trim(),
              nodeType: 'concept',
              position: { x: 250, y: 150 },
            },
          ],
        }),
      });

      if (res.ok) {
        const created = (await res.json()) as { id: string };
        setNewGraphTitle('');
        setIsCreatingGraph(false);
        router.push(`/knowledge/graphs/${encodeURIComponent(created.id)}`);
      }
    } catch (err) {
      console.error('Failed to create graph:', err);
    }
  };

  // Create new diagram
  const handleCreateDiagram = async () => {
    if (!newDiagramTitle.trim()) return;
    try {
      const res = await fetch('/api/knowledge/diagrams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newDiagramTitle.trim(),
          diagramType: newDiagramType,
          sourceText: 'graph TD\n    A[Start] --> B[Process]\n    B --> C[End]',
        }),
      });

      if (res.ok) {
        const created = (await res.json()) as { id: string };
        setNewDiagramTitle('');
        setIsCreatingDiagram(false);
        router.push(`/knowledge/diagrams/${encodeURIComponent(created.id)}`);
      }
    } catch (err) {
      console.error('Failed to create diagram:', err);
    }
  };

  // Filter graphs
  const filteredGraphs = graphs.filter((g) =>
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    g.description.toLowerCase().includes(search.toLowerCase())
  );

  // Filter diagrams
  const filteredDiagrams = diagrams.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.diagramType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full w-full bg-background select-none">
      {/* Navigation Subheader */}
      <div className="border-b border-border bg-surface px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Knowledge & Diagrams
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Selective tools for semantic concept mapping, text-defined diagrams, and freeform canvases.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center rounded-lg border border-border bg-surface-muted/60 p-1 self-start md:self-auto">
          <button
            type="button"
            onClick={() => handleTabChange('graphs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'graphs'
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Workflow size={13} />
            <span>Concept Graphs ({graphs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('diagrams')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'diagrams'
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileCode size={13} />
            <span>Text Diagrams ({diagrams.length})</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('canvases')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'canvases'
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <PenTool size={13} />
            <span>Concept Canvases ({canvasesCount})</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('guide')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'guide'
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Info size={13} />
            <span>Selection Guide</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full">
        {/* TAB 1: CONCEPT GRAPHS */}
        {activeTab === 'graphs' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search concept graphs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-surface border border-border text-xs rounded-lg pl-9 pr-3 py-2 text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <Button onClick={() => setIsCreatingGraph(true)} size="sm">
                <Plus size={14} className="mr-1.5" />
                New Concept Graph
              </Button>
            </div>

            {/* Create Graph Form Banner */}
            {isCreatingGraph && (
              <div className="p-4 bg-surface rounded-xl border border-primary/40 shadow-sm animate-in fade-in slide-in-from-top-2">
                <h3 className="text-sm font-semibold text-foreground mb-1">Create New Concept Graph</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Map explicit relationships, arguments, and evidence across your books and ideas.
                </p>
                <div className="flex items-center gap-2 max-w-md">
                  <input
                    type="text"
                    placeholder="e.g. Theory of Knowledge, Cognitive Biases..."
                    value={newGraphTitle}
                    onChange={(e) => setNewGraphTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleCreateGraph()}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="flex-1 bg-surface-muted border border-border text-xs rounded-lg px-3 py-2 text-foreground"
                  />
                  <Button size="sm" onClick={handleCreateGraph}>
                    Create
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsCreatingGraph(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Graphs Grid */}
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-12">Loading concept graphs...</p>
            ) : filteredGraphs.length === 0 ? (
              <div className="text-center py-16 px-4 border border-dashed border-border rounded-xl bg-surface/50">
                <Workflow className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-foreground mb-1">No concept graphs yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                  Create a semantic graph when you want to connect ideas, compare arguments across books, or build structured concept hierarchies.
                </p>
                <Button size="sm" onClick={() => setIsCreatingGraph(true)}>
                  <Plus size={14} className="mr-1.5" />
                  Create First Graph
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredGraphs.map((g) => {
                  const updatedDate = new Date(g.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <Link
                      key={g.id}
                      href={`/knowledge/graphs/${encodeURIComponent(g.id)}`}
                      className="p-5 rounded-xl border border-border bg-surface hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between gap-4 group cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            Rev {g.revision}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">{updatedDate}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                          {g.title}
                        </h3>
                        {g.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{g.description}</p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {g.nodeCount} concepts · {g.edgeCount} links
                        </span>
                        <span className="flex items-center gap-1 text-primary text-[11px] font-medium group-hover:translate-x-0.5 transition-transform">
                          Open Canvas <ArrowRight size={12} />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TEXT DIAGRAMS */}
        {activeTab === 'diagrams' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search text diagrams..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-surface border border-border text-xs rounded-lg pl-9 pr-3 py-2 text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <Button onClick={() => setIsCreatingDiagram(true)} size="sm">
                <Plus size={14} className="mr-1.5" />
                New Text Diagram
              </Button>
            </div>

            {/* Create Diagram Form Banner */}
            {isCreatingDiagram && (
              <div className="p-4 bg-surface rounded-xl border border-primary/40 shadow-sm animate-in fade-in slide-in-from-top-2">
                <h3 className="text-sm font-semibold text-foreground mb-1">Create New Mermaid Diagram</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Author diagrams using clean text code: sequence flows, state machines, timelines, or architectures.
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-xl">
                  <input
                    type="text"
                    placeholder="Diagram title (e.g. Reading Lifecycle, System Protocol)..."
                    value={newDiagramTitle}
                    onChange={(e) => setNewDiagramTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleCreateDiagram()}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="flex-1 bg-surface-muted border border-border text-xs rounded-lg px-3 py-2 text-foreground"
                  />
                  <select
                    value={newDiagramType}
                    onChange={(e) => setNewDiagramType(e.target.value)}
                    className="bg-surface-muted border border-border text-xs rounded-lg px-2.5 py-2 text-foreground"
                  >
                    <option value="flowchart">Flowchart</option>
                    <option value="sequence">Sequence Diagram</option>
                    <option value="state">State Machine</option>
                    <option value="class">Class Diagram</option>
                    <option value="er">Entity Relationship</option>
                    <option value="timeline">Timeline</option>
                  </select>
                  <Button size="sm" onClick={handleCreateDiagram}>
                    Create
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsCreatingDiagram(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Diagrams Grid */}
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-12">Loading diagrams...</p>
            ) : filteredDiagrams.length === 0 ? (
              <div className="text-center py-16 px-4 border border-dashed border-border rounded-xl bg-surface/50">
                <FileCode className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-foreground mb-1">No text diagrams yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                  Create a Mermaid diagram to express processes, timelines, or system models as version-controlled code.
                </p>
                <Button size="sm" onClick={() => setIsCreatingDiagram(true)}>
                  <Plus size={14} className="mr-1.5" />
                  Create First Diagram
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDiagrams.map((d) => {
                  const updatedDate = new Date(d.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <Link
                      key={d.id}
                      href={`/knowledge/diagrams/${encodeURIComponent(d.id)}`}
                      className="p-5 rounded-xl border border-border bg-surface hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between gap-4 group cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <Badge variant="outline" className="text-[10px] font-mono capitalize">
                            {d.diagramType}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">{updatedDate}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                          {d.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 font-mono text-[11px] bg-surface-muted/40 p-1.5 rounded">
                          {d.sourceText.slice(0, 100)}...
                        </p>
                      </div>

                      <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Rev {d.revision}</span>
                        <span className="flex items-center gap-1 text-primary text-[11px] font-medium group-hover:translate-x-0.5 transition-transform">
                          Open Editor <ArrowRight size={12} />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: STANDALONE CONCEPT CANVASES */}
        {activeTab === 'canvases' && (
          <div className="space-y-4">
            <div className="p-4 bg-surface-muted/50 rounded-xl border border-border text-xs text-muted-foreground">
              <p className="font-semibold text-foreground mb-0.5">Standalone Whiteboards (Excalidraw)</p>
              <p>
                Concept canvases are unattached drawings where you can sketch freely, create visual brainstorms, and place freehand notes without book boundaries.
              </p>
            </div>
            <div className="border border-border rounded-xl bg-surface overflow-hidden h-[600px] flex flex-col">
              <CanvasList />
            </div>
          </div>
        )}

        {/* TAB 4: SELECTION CONSTITUTION & USER GUIDE */}
        {activeTab === 'guide' && (
          <div className="max-w-3xl space-y-6 text-foreground">
            <div className="p-5 bg-primary/5 rounded-xl border border-primary/20 space-y-2">
              <h2 className="text-base font-semibold text-primary flex items-center gap-2">
                <ShieldCheck size={18} />
                Knowledge Tool Selection Constitution
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Read & Watch rejects the &ldquo;everything is a graph&rdquo; fallacy. Instead of forcing all your thoughts into messy node webs, we provide four dedicated tools—each deployed strictly where its cognitive structure is best.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-border bg-surface space-y-2">
                <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                  <BookOpen size={15} className="text-amber-500" />
                  1. Native Notes (The Default)
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Use for linear reflections, chapter summaries, key quotes, and reading thoughts. Native Markdown gives the lowest friction, zero canvas overhead, and 100% screen-reader accessibility.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-border bg-surface space-y-2">
                <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                  <PenTool size={15} className="text-emerald-500" />
                  2. Excalidraw (Freeform Spatial)
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Use for whiteboard sketches, beside-book doodles, hand-drawn annotations, and spatial mood boards where formal semantic links get in the way.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-border bg-surface space-y-2">
                <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                  <Workflow size={15} className="text-indigo-500" />
                  3. React Flow (Semantic Topology)
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Use when ideas have typed relationships (&ldquo;Thesis A supports Premise B&rdquo;), cross-book synthesis, or argument graphs with links to exact source passages.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-border bg-surface space-y-2">
                <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                  <FileCode size={15} className="text-rose-500" />
                  4. Mermaid (Text-Defined Diagrams)
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Use when diagrams should be reproducible code: sequence timelines, state transitions, entity schemas, and flowcharts. Rendered strictly offline in strict security mode.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
