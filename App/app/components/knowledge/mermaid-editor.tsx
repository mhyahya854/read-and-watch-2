'use client';

/**
 * MermaidEditor Component.
 * Phase 13 — Knowledge and Diagram System.
 *
 * Implements:
 *   - P13-T004: Pinned Mermaid for text-defined diagrams
 *   - Strict security mode: securityLevel: 'strict'
 *   - Zero eval, zero remote CDN calls
 *   - Calm inline syntax error resilience without crashing
 *   - Source text is canonical; SVG is derived and disposable
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
import {
  Save,
  Download,
  Copy,
  Check,
  AlertTriangle,
  FileCode,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { MermaidDocument, MermaidDiagramType } from '@/lib/knowledge';

interface MermaidEditorProps {
  initialDocument: MermaidDocument;
  onDocumentChange?: (doc: MermaidDocument) => void;
}

const DIAGRAM_TEMPLATES: Record<MermaidDiagramType, { label: string; template: string }> = {
  flowchart: {
    label: 'Flowchart',
    template: `graph TD
    A[Start: Hypothesis] --> B{Empirical Test}
    B -->|Pass| C[Formulate Principle]
    B -->|Fail| D[Revise Premise]
    D --> A
    C --> E[Final Conclusion]`,
  },
  sequence: {
    label: 'Sequence Diagram',
    template: `sequenceDiagram
    autonumber
    actor Reader
    participant Library as Library Index
    participant ReaderEngine as Foliate/PDF.js
    participant Annotations as SQLite Store

    Reader->>Library: Open Publication
    Library->>ReaderEngine: Mount Document Stream
    Reader->>ReaderEngine: Highlight Passage
    ReaderEngine->>Annotations: Commit Anchor (CFI/Normalized Rect)
    Annotations-->>Reader: Sync Confirmation`,
  },
  state: {
    label: 'State Machine',
    template: `stateDiagram-v2
    [*] --> Unread
    Unread --> Reading : Start Reading
    Reading --> Paused : Sleep / Switch
    Paused --> Reading : Resume
    Reading --> Completed : 100% Progress
    Completed --> [*]`,
  },
  class: {
    label: 'Class Diagram',
    template: `classDiagram
    class Publication {
      +String id
      +String title
      +String author
      +open()
    }
    class Annotation {
      +String id
      +String quote
      +Anchor anchor
      +save()
    }
    Publication "1" *-- "many" Annotation : contains`,
  },
  er: {
    label: 'Entity Relationship',
    template: `erDiagram
    ITEM ||--o{ ANNOTATION : contains
    ITEM ||--o{ CANVAS : attaches
    CANVAS ||--o{ CANVAS_LINK : references
    ANNOTATION ||--o| CANVAS_LINK : targets`,
  },
  gantt: {
    label: 'Gantt / Roadmap',
    template: `gantt
    title Reading and Study Plan
    dateFormat  YYYY-MM-DD
    section Part 1: Theory
    Chapter 1 - Foundations :done,    des1, 2026-09-01,2026-09-04
    Chapter 2 - Core Method  :active,  des2, 2026-09-05, 3d
    section Part 2: Practice
    Case Studies             :         des3, after des2, 5d`,
  },
  gitGraph: {
    label: 'Git Graph',
    template: `gitGraph
    commit id: "Initial Draft"
    branch synthesis
    checkout synthesis
    commit id: "Add Core Claims"
    commit id: "Link Empirical Citations"
    checkout main
    merge synthesis id: "Consolidate Thesis"`,
  },
  pie: {
    label: 'Pie Chart',
    template: `pie title Reading Breakdown by Topic
    "Epistemology" : 45
    "Cognitive Science" : 30
    "Philosophy of Language" : 25`,
  },
  mindmap: {
    label: 'Mindmap',
    template: `mindmap
  root((Central Thesis))
    Foundations
      Axiom 1
      Axiom 2
    Objections
      Counter-argument A
      Counter-argument B
    Conclusions
      Practical Outcome`,
  },
  timeline: {
    label: 'Timeline',
    template: `timeline
    title Historical Development of Ideas
    1950 : Turing Test Proposed
    1965 : Early Connectionism
    1986 : Backpropagation Resurgence
    2017 : Attention Mechanism`,
  },
};

export function MermaidEditor({ initialDocument, onDocumentChange }: MermaidEditorProps) {
  const [doc, setDoc] = useState<MermaidDocument>(initialDocument);
  const [sourceText, setSourceText] = useState(initialDocument.sourceText);
  const [svgOutput, setSvgOutput] = useState<string>('');
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize Mermaid with strict security mode
  useEffect(() => {
    try {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'default',
        fontFamily: 'inherit',
        logLevel: 'error',
      });
    } catch {}
  }, []);

  // Render Mermaid diagram on source change
  const renderDiagram = useCallback(async (code: string) => {
    if (!code.trim()) {
      setSvgOutput('');
      setSyntaxError(null);
      return;
    }

    const renderId = `mermaid-render-${Date.now()}`;
    try {
      // Validate syntax before render
      await mermaid.parse(code);
      const { svg } = await mermaid.render(renderId, code);
      setSvgOutput(svg);
      setSyntaxError(null);
    } catch (err) {
      // Graceful error handling: show calm inline error without crashing
      const errMsg = err instanceof Error ? err.message : String(err);
      setSyntaxError(errMsg);
      // Clean up orphaned render element if created
      const orphan = document.getElementById(renderId);
      if (orphan) orphan.remove();
    }
  }, []);

  // Debounced live render
  useEffect(() => {
    const timer = setTimeout(() => {
      void renderDiagram(sourceText);
    }, 250);
    return () => clearTimeout(timer);
  }, [sourceText, renderDiagram]);

  // Apply template
  const handleApplyTemplate = (type: MermaidDiagramType) => {
    const tmpl = DIAGRAM_TEMPLATES[type]?.template;
    if (tmpl) {
      setSourceText(tmpl);
      setDoc((prev) => ({ ...prev, diagramType: type }));
    }
  };

  // Save changes
  const handleSave = async () => {
    setIsSaving(true);
    setConflictError(null);
    setSaveSuccess(false);

    try {
      const res = await fetch(`/api/knowledge/diagrams/${encodeURIComponent(doc.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: doc.title,
          description: doc.description,
          diagramType: doc.diagramType,
          sourceText,
          tags: doc.tags,
          associatedItemId: doc.associatedItemId,
          expectedRevision: doc.revision,
        }),
      });

      if (res.status === 409) {
        setConflictError('Conflict: Diagram was updated elsewhere. Please reload.');
        setIsSaving(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to save diagram (HTTP ${res.status})`);
      }

      const updated = (await res.json()) as MermaidDocument;
      setDoc(updated);
      setSaveSuccess(true);
      if (onDocumentChange) onDocumentChange(updated);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save diagram:', err);
      setConflictError(String(err));
    } finally {
      setIsSaving(false);
    }
  };

  // Copy SVG to clipboard
  const handleCopySvg = async () => {
    if (!svgOutput) return;
    try {
      await navigator.clipboard.writeText(svgOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // Export as .rwmermaid file
  const handleExport = () => {
    const json = JSON.stringify(
      {
        schemaVersion: 1,
        format: 'read-watch.mermaid-diagram',
        exportedAt: new Date().toISOString(),
        app: { name: 'Read & Watch', version: '0.1.0' },
        diagram: {
          ...doc,
          sourceText,
        },
      },
      null,
      2
    );
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.toLowerCase().replace(/\s+/g, '-') || 'diagram'}.rwmermaid`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full w-full bg-background select-none">
      {/* Header Bar */}
      <header className="h-14 border-b border-border bg-surface px-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <FileCode className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground truncate">{doc.title}</h2>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize font-mono">
                {doc.diagramType}
              </Badge>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-mono">
                Rev {doc.revision}
              </Badge>
            </div>
            {doc.associatedItemId && (
              <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                <BookOpen size={11} />
                Linked to publication
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Templates Dropdown */}
          <select
            value={doc.diagramType}
            onChange={(e) => handleApplyTemplate(e.target.value as MermaidDiagramType)}
            className="h-8 bg-surface-muted border border-border text-xs rounded px-2 text-foreground focus:outline-none focus:border-primary"
          >
            {Object.entries(DIAGRAM_TEMPLATES).map(([type, { label }]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopySvg}
            disabled={!svgOutput}
            className="h-8 text-xs"
            title="Copy Rendered SVG"
          >
            {copied ? <Check size={13} className="mr-1 text-emerald-500" /> : <Copy size={13} className="mr-1" />}
            {copied ? 'Copied' : 'Copy SVG'}
          </Button>

          <Button size="sm" variant="ghost" onClick={handleExport} className="h-8 text-xs" title="Export .rwmermaid">
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

      {/* Conflict error banner */}
      {conflictError && (
        <div className="p-3 bg-amber-500/15 border-b border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} />
            <span>{conflictError}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => window.location.reload()} className="h-6 text-xs">
            Reload Diagram
          </Button>
        </div>
      )}

      {/* Split Work area: Left = Source Editor, Right = Derived Preview */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
        {/* Source Text Editor Pane */}
        <div className="flex flex-col border-r border-border bg-surface-muted/30 h-full overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-surface flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase text-[10px] tracking-wider">Mermaid Source (Canonical)</span>
            <span className="text-[11px] font-mono">{sourceText.split('\n').length} lines</span>
          </div>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full p-4 font-mono text-xs bg-transparent border-0 resize-none focus:outline-none text-foreground leading-relaxed selection:bg-primary/20"
            placeholder="Enter Mermaid diagram code..."
          />
        </div>

        {/* Live Derived SVG Preview Pane */}
        <div className="flex flex-col h-full bg-surface overflow-hidden">
          <div className="px-4 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase text-[10px] tracking-wider">Derived Vector Preview</span>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Strict Security Mode</span>
          </div>

          <div
            ref={containerRef}
            className="flex-1 p-6 overflow-auto flex items-center justify-center bg-dot-pattern"
          >
            {syntaxError ? (
              <div className="max-w-md p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs space-y-2 animate-in fade-in">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle size={15} />
                  <span>Mermaid Syntax Notice</span>
                </div>
                <p className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap">{syntaxError}</p>
                <p className="text-[10px] text-muted-foreground pt-2 border-t border-destructive/10">
                  Editing continues normally. Correct the syntax to re-render the preview.
                </p>
              </div>
            ) : svgOutput ? (
              <div
                className="w-full h-full flex items-center justify-center [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:drop-shadow-xs"
                dangerouslySetInnerHTML={{ __html: svgOutput }}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Type or select a template to preview diagram.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
