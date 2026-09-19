'use client';

/**
 * ReadWatchCanvas — Encapsulated Excalidraw Drawing & Study Canvas.
 * Phase 10 — Book-Linked Excalidraw Notes.
 *
 * Architecture:
 *   - Read & Watch owns canonical identity, book relationship, storage, and links.
 *   - Excalidraw is encapsulated as the drawing/diagramming engine.
 *   - 100% offline; assets served locally from /api/reader/excalidraw-assets/.
 *   - Bidirectional deep links between canvas elements and book locations / Phase 09 annotations.
 *   - Bounded autosave with optimistic concurrency conflict detection.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ArrowLeft,
  Save,
  Download,
  Link as LinkIcon,
  Quote,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Blocks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KnowledgePanel } from './knowledge-panel';
import type {
  ReadWatchCanvasDocument,
  CanvasLinkRecord,
  CanvasMetadata,
  CanvasAssetMeta,
  CanvasKnowledge,
  KnowledgeBlock,
  KnowledgeRelationship,
} from '@/lib/canvas';
import {
  createKnowledgeBlock,
  findBlockByAnnotation,
  updateBlock,
} from '@/lib/canvas/knowledge';
import '@excalidraw/excalidraw/index.css';

interface ExcalidrawApi {
  getSceneElements: () => readonly unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  updateScene: (scene: { elements?: readonly unknown[]; appState?: Record<string, unknown> }) => void;
  addFiles: (files: Array<{ id: string; dataURL: string; mimeType: string; created: number }>) => void;
  scrollToContent?: (target?: unknown, opts?: Record<string, unknown>) => void;
}

interface ExcalidrawModuleType {
  Excalidraw: React.ComponentType<{
    excalidrawAPI?: (api: unknown) => void;
    initialData?: {
      elements?: readonly unknown[];
      appState?: Record<string, unknown>;
      files?: Record<string, unknown>;
    };
    onChange?: (elements: readonly unknown[], appState: unknown, files: unknown) => void;
    UIOptions?: {
      canvasActions?: {
        loadScene?: boolean;
        export?: boolean;
        saveAsImage?: boolean;
      };
    };
    isCollaborating?: boolean;
  }>;
}

interface BookAnnotationItem {
  id: string;
  kind: string;
  content?: {
    passage?: string;
    subKind?: string;
  };
  anchor?: {
    quote?: string;
    pageNumber?: number;
  };
}

interface ReadWatchCanvasProps {
  canvasId: string;
  bookTitle?: string;
  itemId?: string | null;
  onClose?: () => void;
  isBesideReader?: boolean;
}

export function ReadWatchCanvas({
  canvasId,
  bookTitle,
  itemId: propItemId,
  onClose,
  isBesideReader: _isBesideReader = false,
}: ReadWatchCanvasProps) {
  const [ExcalidrawModule, setExcalidrawModule] = useState<ExcalidrawModuleType | null>(null);
  const [doc, setDoc] = useState<ReadWatchCanvasDocument | null>(null);
  const [title, setTitle] = useState('Untitled Canvas');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'conflict' | 'error'>('saved');
  const [selectedLink, setSelectedLink] = useState<CanvasLinkRecord | null>(null);
  const [isExcerptModalOpen, setIsExcerptModalOpen] = useState(false);
  const [availableAnnotations, setAvailableAnnotations] = useState<BookAnnotationItem[]>([]);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [knowledge, setKnowledge] = useState<CanvasKnowledge>({ blocks: [], relationships: [] });
  const knowledgeRef = useRef<CanvasKnowledge>(knowledge);
  const titleRef = useRef(title);
  const docRef = useRef<ReadWatchCanvasDocument | null>(doc);

  // Mirror live values into refs so the serialized save queue always reads the
  // newest state instead of a stale closure.
  useEffect(() => {
    knowledgeRef.current = knowledge;
  }, [knowledge]);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const excalidrawApiRef = useRef<ExcalidrawApi | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRevisionRef = useRef<number>(1);
  /**
   * Saves are serialized. The scene autosave and the structured-knowledge saves
   * both use optimistic concurrency, so two overlapping PUTs would otherwise
   * both send the same expectedRevision and the second would fail with 409.
   */
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  /**
   * Item-scoped canvas access. Supplying the owning item makes the API refuse a
   * canvas that belongs to another title; an unscoped caller (legacy reader
   * flows and standalone canvases) keeps its existing behaviour.
   */
  const scopeQuery = propItemId ? `?itemId=${encodeURIComponent(propItemId)}` : '';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Configure local asset path and dynamically load Excalidraw in browser
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).EXCALIDRAW_ASSET_PATH = '/api/reader/excalidraw-assets/';
      import('@excalidraw/excalidraw').then((mod) => {
        setExcalidrawModule(() => mod as unknown as ExcalidrawModuleType);
      }).catch((err) => {
        console.error('Failed to load Excalidraw package:', err);
      });
    }
  }, []);

  // 2. Fetch canvas document
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/reader/canvases/${encodeURIComponent(canvasId)}${scopeQuery}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ReadWatchCanvasDocument;
      })
      .then((data) => {
        if (active) {
          setDoc(data);
          setTitle(data.title);
          setKnowledge(
            data.knowledge && Array.isArray(data.knowledge.blocks)
              ? {
                  blocks: data.knowledge.blocks,
                  relationships: Array.isArray(data.knowledge.relationships)
                    ? data.knowledge.relationships
                    : [],
                  ...(data.knowledge.importedGraphIds
                    ? { importedGraphIds: data.knowledge.importedGraphIds }
                    : {}),
                }
              : { blocks: [], relationships: [] },
          );
          currentRevisionRef.current = data.revision;
          setSaveStatus('saved');
          setConflictMessage(null);
        }
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load canvas document:', err);
          setSaveStatus('error');
        }
      });

    return () => {
      active = false;
    };
  }, [canvasId, reloadKey, scopeQuery]);

  // 3. Save canvas document
  const saveCanvas = useCallback(
    (
      sceneToSave?: {
        elements?: readonly unknown[];
        appState?: Record<string, unknown>;
        files?: Record<string, unknown>;
      },
      newLinks?: CanvasLinkRecord[],
      knowledgeToSave?: CanvasKnowledge,
    ) => {
      const run = async () => {
        if (!docRef.current) return;
        const api = excalidrawApiRef.current;
        const currentDoc = docRef.current;
        const elements =
          sceneToSave?.elements || (api ? api.getSceneElements() : currentDoc.scene.elements);
        const appState =
          sceneToSave?.appState || (api ? api.getAppState() : currentDoc.scene.appState);
        const files = sceneToSave?.files || (api ? api.getFiles() : currentDoc.scene.files);

        const payload = {
          title: titleRef.current,
          expectedRevision: currentRevisionRef.current,
          scene: {
            elements,
            appState: {
              viewBackgroundColor: (appState?.viewBackgroundColor as string) || '#ffffff',
              gridSize: (appState?.gridSize as number | null) ?? null,
              theme: (appState?.theme as 'light' | 'dark') || 'light',
              scrollX: (appState?.scrollX as number) || 0,
              scrollY: (appState?.scrollY as number) || 0,
              zoom: (appState?.zoom as { value: number }) || { value: 1 },
            },
            files: (files as Record<string, unknown>) || {},
          },
          links: newLinks || currentDoc.links || [],
          knowledge: knowledgeToSave ?? knowledgeRef.current,
        };

        try {
          setSaveStatus('saving');
          const res = await fetch(
            `/api/reader/canvases/${encodeURIComponent(canvasId)}${scopeQuery}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            },
          );

          if (res.status === 409) {
            setSaveStatus('conflict');
            setConflictMessage(
              'Another edit was saved. Reload to preserve data consistency.',
            );
            return;
          }

          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const updatedDoc: ReadWatchCanvasDocument = await res.json();
          currentRevisionRef.current = updatedDoc.revision;
          docRef.current = updatedDoc;
          setDoc(updatedDoc);
          setSaveStatus('saved');
          setConflictMessage(null);
        } catch (err) {
          console.error('Failed to save canvas:', err);
          setSaveStatus('error');
        }
      };

      const chained = saveChainRef.current.then(run, run);
      saveChainRef.current = chained.catch(() => {});
      return chained;
    },
    [canvasId, scopeQuery],
  );

  // ---------------------------------------------------------------------------
  // Structured knowledge surface helpers. Blocks and named relationships live in
  // the same canvas document as the freeform scene, and each block gets a real
  // visual element so both halves stay one workspace.
  // ---------------------------------------------------------------------------

  const handleKnowledgeChange = useCallback(
    (next: CanvasKnowledge) => {
      setKnowledge(next);
      void saveCanvas(undefined, undefined, next);
    },
    [saveCanvas],
  );

  /** Create a bound rectangle + text element so the block exists visually too. */
  const handlePlaceBlock = useCallback(
    (block: KnowledgeBlock) => {
      const api = excalidrawApiRef.current;
      if (!api) return;
      const existing = api.getSceneElements();
      const rectId = `kb-${block.id}`;
      const textId = `kb-${block.id}-label`;
      const nonce = Math.floor(Math.random() * 2 ** 31);
      const baseY = 120 + (knowledge.blocks.findIndex((b) => b.id === block.id) % 6) * 130;
      const rect = {
        id: rectId,
        type: 'rectangle',
        x: 140,
        y: baseY,
        width: 240,
        height: 84,
        angle: 0,
        strokeColor: '#2f6f63',
        backgroundColor: '#f4f1ea',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 3 },
        seed: nonce,
        version: 1,
        versionNonce: nonce,
        isDeleted: false,
        boundElements: [{ type: 'text', id: textId }],
        updated: Date.now(),
        link: null,
        locked: false,
      };
      const label = {
        id: textId,
        type: 'text',
        x: 152,
        y: baseY + 24,
        width: 216,
        height: 32,
        angle: 0,
        strokeColor: '#232323',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: nonce + 1,
        version: 1,
        versionNonce: nonce + 1,
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        text: block.title || 'Untitled block',
        fontSize: 16,
        fontFamily: 1,
        textAlign: 'left',
        verticalAlign: 'middle',
        containerId: rectId,
        originalText: block.title || 'Untitled block',
        lineHeight: 1.25,
      };
      const elements = [...existing, rect, label];
      api.updateScene({ elements });
      const next = updateBlock(knowledge, block.id, { elementId: rectId });
      setKnowledge(next);
      void saveCanvas({ elements }, undefined, next);
    },
    [knowledge, saveCanvas],
  );

  const handleFocusBlock = useCallback((block: KnowledgeBlock) => {
    const api = excalidrawApiRef.current;
    if (!api || !block.elementId) return;
    const target = api
      .getSceneElements()
      .filter((el) => (el as { id?: string }).id === block.elementId);
    api.updateScene({ appState: { selectedElementIds: { [block.elementId]: true } } });
    api.scrollToContent?.(target, { fitToViewport: true, animate: true });
  }, []);

  /** Draw a connector for a named relationship when both blocks are on canvas. */
  const handleRelationshipCreated = useCallback(
    (relationship: KnowledgeRelationship) => {
      const api = excalidrawApiRef.current;
      if (!api) return;
      const source = knowledge.blocks.find((b) => b.id === relationship.sourceBlockId);
      const target = knowledge.blocks.find((b) => b.id === relationship.targetBlockId);
      if (!source?.elementId || !target?.elementId) return;
      const elements = api.getSceneElements() as ReadonlyArray<{
        id?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      }>;
      const from = elements.find((el) => el.id === source.elementId);
      const to = elements.find((el) => el.id === target.elementId);
      if (!from || !to) return;
      const startX = (from.x ?? 0) + (from.width ?? 0);
      const startY = (from.y ?? 0) + (from.height ?? 0) / 2;
      const endX = to.x ?? 0;
      const endY = (to.y ?? 0) + (to.height ?? 0) / 2;
      const nonce = Math.floor(Math.random() * 2 ** 31);
      const arrowId = `kr-${relationship.id}`;
      const arrow = {
        id: arrowId,
        type: 'arrow',
        x: startX,
        y: startY,
        width: Math.max(1, Math.abs(endX - startX)),
        height: Math.max(1, Math.abs(endY - startY)),
        angle: 0,
        strokeColor: '#2f6f63',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 2 },
        seed: nonce,
        version: 1,
        versionNonce: nonce,
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        points: [
          [0, 0],
          [endX - startX, endY - startY],
        ],
        lastCommittedPoint: null,
        startBinding: { elementId: source.elementId, focus: 0, gap: 4 },
        endBinding: { elementId: target.elementId, focus: 0, gap: 4 },
        startArrowhead: relationship.direction === 'mutual' ? 'arrow' : null,
        endArrowhead: 'arrow',
      };
      const nextElements = [...elements, arrow];
      api.updateScene({ elements: nextElements });
      const next = {
        ...knowledge,
        relationships: knowledge.relationships.map((rel) =>
          rel.id === relationship.id ? { ...rel, linkedElementId: arrowId } : rel,
        ),
      };
      setKnowledge(next);
      void saveCanvas({ elements: nextElements }, undefined, next);
    },
    [knowledge, saveCanvas],
  );

  // 4. Debounced autosave on scene changes
  const handleSceneChange = useCallback(
    (elements: readonly unknown[], rawAppState: unknown, rawFiles: unknown) => {
      if (!doc || saveStatus === 'conflict') return;

      const appState = (rawAppState || {}) as Record<string, unknown>;
      const files = (rawFiles || {}) as Record<string, unknown>;

      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }

      autosaveTimeoutRef.current = setTimeout(() => {
        void saveCanvas({ elements, appState, files });
      }, 1500);

      // Check if selected element has a deep link
      const selectedIds = Object.keys((appState.selectedElementIds as Record<string, boolean>) || {});
      if (selectedIds.length === 1) {
        const selId = selectedIds[0];
        const match = doc.links?.find((l) => l.elementId === selId);
        setSelectedLink(match || null);
      } else {
        setSelectedLink(null);
      }
    },
    [doc, saveStatus, saveCanvas],
  );

  // 5. Rename title handler
  const handleRename = async () => {
    setIsEditingTitle(false);
    if (!doc || title.trim() === doc.title) return;
    try {
      const res = await fetch(`/api/reader/canvases/${encodeURIComponent(canvasId)}/metadata${scopeQuery}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, expectedRevision: currentRevisionRef.current }),
      });
      if (res.ok) {
        const meta = (await res.json()) as CanvasMetadata;
        currentRevisionRef.current = meta.revision;
        setDoc((prev) => (prev ? { ...prev, title: meta.title, revision: meta.revision } : null));
      }
    } catch (err) {
      console.error('Failed to rename canvas:', err);
    }
  };

  // 6. Fetch book annotations for excerpt insertion
  const openExcerptPicker = async () => {
    const targetItemId = doc?.itemId || propItemId;
    if (!targetItemId) return;

    setIsExcerptModalOpen(true);
    setLoadingAnnotations(true);
    try {
      const res = await fetch(`/api/reader/items/${encodeURIComponent(targetItemId)}/annotations`);
      if (res.ok) {
        const anns = (await res.json()) as BookAnnotationItem[];
        setAvailableAnnotations(anns);
      }
    } catch (err) {
      console.error('Failed to fetch annotations:', err);
    } finally {
      setLoadingAnnotations(false);
    }
  };

  // 7. Insert an excerpt card into Excalidraw
  const insertExcerpt = useCallback(
    (ann: BookAnnotationItem) => {
      if (!excalidrawApiRef.current || !doc) return;
      const api = excalidrawApiRef.current;
      const targetItemId = doc.itemId || propItemId;
      if (!targetItemId) return;

      const quoteText = ann.content?.passage || ann.anchor?.quote || 'Excerpt from book';
      const elementId = `excerpt-${String(Date.now())}`;
      const now = Date.now();

      // Create a styled card container (rectangle) and text element
      const rectElement = {
        id: elementId,
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 320,
        height: 120,
        strokeColor: '#1e293b',
        backgroundColor: '#f8fafc',
        fillStyle: 'solid',
        strokeWidth: 1,
        roughness: 1,
        opacity: 100,
        roundness: { type: 3 },
        isDeleted: false,
        groupIds: [],
        updated: now,
        link: `/reader/${targetItemId}?annotation=${String(ann.id)}`,
        customData: {
          itemId: targetItemId,
          annotationId: ann.id,
          quote: quoteText,
        },
      };

      const textElement = {
        id: `${elementId}-txt`,
        type: 'text',
        x: 115,
        y: 115,
        width: 290,
        height: 90,
        text: `"${quoteText}"\n\n- ${bookTitle || 'Linked Book'}`,
        fontSize: 14,
        fontFamily: 1,
        textAlign: 'left',
        verticalAlign: 'top',
        strokeColor: '#0f172a',
        isDeleted: false,
        groupIds: [],
        updated: now,
      };

      const currentElements = api.getSceneElements();
      const newElements = [...currentElements, rectElement, textElement];
      api.updateScene({ elements: newElements });

      // Record bidirectional link in state and SQLite
      const newLink: CanvasLinkRecord = {
        id: `link-${String(Date.now())}`,
        canvasId,
        elementId,
        itemId: targetItemId,
        annotationId: typeof ann.id === 'string' ? ann.id : null,
        anchorJson: JSON.stringify(ann.anchor || {}),
        label: quoteText.slice(0, 100),
        createdAt: new Date().toISOString(),
      };

      const updatedLinks = [...(doc.links || []), newLink];
      setDoc({ ...doc, links: updatedLinks });

      // The same excerpt also becomes a structured, source-linked block so the
      // Knowledge Canvas keeps provenance instead of a detached copy. The normal
      // action never inserts the same annotation twice.
      const existingBlock = findBlockByAnnotation(knowledge, String(ann.id));
      const nextKnowledge = existingBlock
        ? knowledge
        : {
            ...knowledge,
            blocks: [
              ...knowledge.blocks,
              createKnowledgeBlock({
                type: ann.kind === 'text-mark' ? 'quote' : 'evidence',
                title: quoteText.slice(0, 120),
                body: quoteText,
                elementId,
                source: {
                  itemId: targetItemId,
                  annotationId: String(ann.id),
                  label:
                    typeof ann.anchor?.pageNumber === 'number'
                      ? `p. ${ann.anchor.pageNumber}`
                      : 'Source',
                  quote: quoteText.slice(0, 200),
                },
              }),
            ],
          };
      setKnowledge(nextKnowledge);
      void saveCanvas({ elements: newElements }, updatedLinks, nextKnowledge);

      setIsExcerptModalOpen(false);
    },
    [doc, propItemId, bookTitle, canvasId, saveCanvas, knowledge],
  );
  // 8. Safe Image Asset Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !excalidrawApiRef.current) return;

    // Validate client-side
    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.type)) {
      alert(`Invalid image type. Allowed: ${ALLOWED.join(', ')}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Image file exceeds 10MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64Data = dataUrl.split(',')[1];

      try {
        const res = await fetch(`/api/reader/canvases/${encodeURIComponent(canvasId)}/assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalName: file.name,
            mimeType: file.type,
            dataBase64: base64Data,
          }),
        });

        if (!res.ok) throw new Error('Asset upload failed');
        const assetMeta = (await res.json()) as CanvasAssetMeta;

        // Add image to Excalidraw files and elements
        const api = excalidrawApiRef.current;
        if (!api) return;
        const fileId = assetMeta.id;
        const imageElement = {
          id: `img-${Date.now()}`,
          type: 'image',
          x: 150,
          y: 150,
          width: 300,
          height: 200,
          fileId,
          status: 'saved',
          isDeleted: false,
          updated: Date.now(),
        };

        api.addFiles([
          {
            id: fileId,
            dataURL: dataUrl,
            mimeType: file.type,
            created: Date.now(),
          },
        ]);

        const elements = [...api.getSceneElements(), imageElement];
        api.updateScene({ elements });
        void saveCanvas({ elements });
      } catch (err) {
        console.error('Image upload failed:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  // 9. Full Export Handler
  const handleExport = async () => {
    try {
      const res = await fetch(`/api/reader/canvases/${encodeURIComponent(canvasId)}/export`);
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.rwcanvas`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export canvas:', err);
    }
  };

  if (!doc) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface text-muted-foreground p-6">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        <span className="text-xs font-medium">Loading canvas notes...</span>
      </div>
    );
  }

  const Excalidraw = ExcalidrawModule?.Excalidraw;

  return (
    <div className="flex flex-col h-full w-full bg-surface select-none relative overflow-hidden border-border">
      {/* Hidden file input for image uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
      />

      {/* Top Header Toolbar */}
      <header className="h-12 border-b border-border bg-surface px-3 flex items-center justify-between shrink-0 z-10 gap-2">
        {/* Left: Title & Book badge */}
        <div className="flex items-center gap-2 min-w-0">
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
              title="Close Canvas Panel"
            >
              <ArrowLeft size={15} />
            </Button>
          )}

          {isEditingTitle ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => e.key === 'Enter' && void handleRename()}
              className="text-xs font-semibold px-1.5 py-0.5 border border-primary rounded bg-background text-foreground max-w-[200px]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingTitle(true)}
              className="text-xs font-semibold text-foreground truncate cursor-pointer hover:bg-surface-muted px-1.5 py-0.5 rounded text-left"
              title="Click to rename canvas"
            >
              {title}
            </button>
          )}

          {doc.itemId && (
            <Link
              href={`/reader/${doc.itemId}`}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground bg-surface-muted px-2 py-0.5 rounded font-mono truncate max-w-[140px]"
              title={`Attached to book: ${bookTitle || doc.itemId}`}
            >
              <BookOpen size={11} className="shrink-0" />
              <span className="truncate">{bookTitle || 'Attached Book'}</span>
            </Link>
          )}
        </div>

        {/* Right: Actions, Save Status, Tools */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Save Status Indicator */}
          <div className="flex items-center gap-1 text-[11px] font-mono mr-1">
            {saveStatus === 'saved' && (
              <span className="text-muted-foreground flex items-center gap-1">
                <CheckCircle2 size={12} className="text-emerald-500" />
                <span className="hidden sm:inline">Saved</span>
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="text-amber-500 flex items-center gap-1">
                <RefreshCw size={12} className="animate-spin" />
                <span className="hidden sm:inline">Saving...</span>
              </span>
            )}
            {saveStatus === 'conflict' && (
              <span className="text-destructive flex items-center gap-1 font-semibold">
                <AlertCircle size={12} />
                <span>Conflict</span>
              </span>
            )}
          </div>

          {/* Insert Excerpt button (if attached to book) */}
          {(doc.itemId || propItemId) && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={openExcerptPicker}
              className="h-7 px-2 text-xs"
              title="Insert excerpt from attached book"
            >
              <Quote size={13} className="mr-1" />
              <span className="hidden md:inline">Add Excerpt</span>
            </Button>
          )}

          {/* Insert Image button */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 px-2 text-xs"
            title="Insert image asset"
          >
            <ImageIcon size={13} className="mr-1" />
            <span className="hidden md:inline">Image</span>
          </Button>

          {/* Knowledge panel toggle: structured blocks + named relationships */}
          <Button
            type="button"
            variant={knowledgeOpen ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setKnowledgeOpen((v) => !v)}
            className="h-7 px-2 text-xs"
            aria-pressed={knowledgeOpen}
            title="Knowledge blocks and relationships"
            data-testid="canvas-knowledge-toggle"
          >
            <Blocks size={13} className="mr-1" />
            <span className="hidden md:inline">Knowledge</span>
            <span className="ml-1 font-mono text-[10px]">{knowledge.blocks.length}</span>
          </Button>

          {/* Export button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleExport}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Export Canvas Package (.rwcanvas)"
          >
            <Download size={14} />
          </Button>

          {/* Manual Save */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void saveCanvas()}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Save Now"
          >
            <Save size={14} />
          </Button>
        </div>
      </header>

      {/* Conflict Resolution Banner */}
      {conflictMessage && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-3 py-2 flex items-center justify-between text-xs text-destructive shrink-0">
          <div className="flex items-center gap-1.5">
            <AlertCircle size={14} className="shrink-0" />
            <span>{conflictMessage}</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setReloadKey((k) => k + 1)}
            className="h-6 px-2 text-[11px] border-destructive/30 hover:bg-destructive/20 text-destructive"
          >
            Reload Latest
          </Button>
        </div>
      )}

      {/* Main Canvas Workspace */}
      <div className="flex-1 w-full min-h-0 relative flex overflow-hidden bg-background">
        <div className="relative min-w-0 flex-1 h-full overflow-hidden">
          {Excalidraw ? (
          <Excalidraw
            excalidrawAPI={(api: unknown) => {
              excalidrawApiRef.current = api as ExcalidrawApi;
            }}
            initialData={{
              elements: doc.scene?.elements || [],
              appState: {
                viewBackgroundColor: doc.scene?.appState?.viewBackgroundColor || '#ffffff',
                gridSize: doc.scene?.appState?.gridSize ?? null,
                theme: doc.scene?.appState?.theme || 'light',
              },
              files: doc.scene?.files || {},
            }}
            onChange={handleSceneChange}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                export: false,
                saveAsImage: false,
              },
            }}
            isCollaborating={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground p-6">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span className="text-xs font-medium">Initializing Excalidraw workspace...</span>
          </div>
          )}
        </div>

        {knowledgeOpen && (
          <aside
            className="h-full w-[22rem] shrink-0 border-l border-border bg-surface overflow-hidden"
            aria-label="Knowledge blocks and relationships"
          >
            <KnowledgePanel
              knowledge={knowledge}
              onChange={handleKnowledgeChange}
              onPlaceBlock={handlePlaceBlock}
              onFocusBlock={handleFocusBlock}
              onRelationshipCreated={handleRelationshipCreated}
            />
          </aside>
        )}

        {/* Floating Deep Link Inspector Card (P10-T005) */}
        {selectedLink && (
          <div className="absolute bottom-4 left-4 z-30 bg-surface border border-border p-3 rounded-lg shadow-md max-w-xs animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <LinkIcon size={10} />
                Book Link
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-muted-foreground"
                onClick={() => setSelectedLink(null)}
              >
                ✕
              </Button>
            </div>
            <p className="text-xs text-foreground font-serif italic mb-2 line-clamp-2">
              &ldquo;{selectedLink.label || 'Linked passage'}&rdquo;
            </p>
            <Link
              href={
                selectedLink.annotationId
                  ? `/reader/${selectedLink.itemId}?annotation=${selectedLink.annotationId}`
                  : `/reader/${selectedLink.itemId}`
              }
            >
              <Button size="sm" variant="secondary" className="w-full text-xs h-7">
                <ExternalLink size={12} className="mr-1" />
                Open in Reader
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Excerpt Selection Modal Dialog */}
      {isExcerptModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-lg shadow-lg max-w-md w-full p-4 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Quote size={15} />
                Insert Excerpt from Book
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setIsExcerptModalOpen(false)}
              >
                ✕
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2">
              {loadingAnnotations ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Loading book highlights...
                </p>
              ) : availableAnnotations.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No highlights or excerpts found in this book yet. Highlight text in the reader first!
                </p>
              ) : (
                availableAnnotations.map((ann) => {
                  const quote = ann.content?.passage || ann.anchor?.quote || 'Highlight';
                  return (
                    <button
                      type="button"
                      key={ann.id}
                      onClick={() => insertExcerpt(ann)}
                      className="w-full text-left p-2.5 rounded border border-border hover:border-primary/50 hover:bg-surface-muted cursor-pointer transition-colors block"
                    >
                      <p className="text-xs font-serif text-foreground line-clamp-3 mb-1">
                        &ldquo;{quote}&rdquo;
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                        <span>Kind: {ann.content?.subKind || ann.kind}</span>
                        {ann.anchor?.pageNumber && <span>p. {ann.anchor.pageNumber}</span>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-border flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsExcerptModalOpen(false)}
                className="text-xs h-7"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
