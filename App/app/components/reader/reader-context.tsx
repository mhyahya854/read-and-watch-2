'use client';

/**
 * Capability-Driven Reader Session Context.
 * Bridges ReaderSession state, persistence, navigation history, bookmarks,
 * and user preferences into a clean React context for reader presentation components.
 * Zero format-conditional branching: all features are governed by adapter capabilities.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import {
  ReaderSession,
  type ReaderSessionSnapshot,
  type DocumentLocation,
  type ReadonlyDocumentSource,
  type ReaderPreferences,
  createBookmark,
  areDocumentLocationsEqual,
  createPageLocation,
  createSemanticLocation,
  validateDocumentLocation,
} from '@/lib/document';
import {
  getReaderStatus,
  getReaderState,
  saveReaderPosition,
  getReaderBookmarks,
  addReaderBookmark,
  deleteReaderBookmark,
  getReaderSettings,
  saveReaderSettings,
  type ReaderStatus,
} from '@/lib/reader';
import { getAnnotation } from '@/lib/annotation';
import {
  createAnnotation as createAnnotationApi,
  deleteAnnotation as deleteAnnotationApi,
  getAnnotations,
  updateAnnotation as updateAnnotationApi,
} from '@/lib/annotation/client';
import type {
  Annotation,
  AnnotationAnchor,
  TextMarkSubKind,
} from '@/lib/annotation';
import {
  normalizeSelectionRects,
  pdfTextAnchorFromSelection,
  reflowableTextAnchorFromSelection,
} from '@/lib/annotation/selection-anchor';
import type { CanvasMetadata } from '@/lib/canvas';
import { useToast } from '@/components/ui/toast';


export type SidebarTab = 'contents' | 'search' | 'bookmarks' | null;

/** The three reader layout states. */
export type ReaderLayoutMode = 'split' | 'full' | 'minimized';

/** Right-hand study surface alongside the reader. */
export type ReaderStudyPane = 'none' | 'annotations' | 'canvas';

export interface StudySummary {
  itemId: string;
  annotationCount: number;
  annotationsWithNotes: number;
  annotationCounts: Record<string, number>;
  bookCanvases: number;
  locationCanvases: number;
  canvasCount: number;
}

export interface ReaderContextValue {
  session: ReaderSession;
  snapshot: ReaderSessionSnapshot;
  itemId: string;
  readerStatus: ReaderStatus | null;
  activeSidebar: SidebarTab;
  setActiveSidebar: (tab: SidebarTab) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isCurrentLocationBookmarked: boolean;
  isCanvasOpen: boolean;
  setIsCanvasOpen: (open: boolean) => void;
  activeCanvasId: string | null;
  setActiveCanvasId: (id: string | null) => void;
  mobileViewTab: 'reader' | 'canvas';
  setMobileViewTab: (tab: 'reader' | 'canvas') => void;

  // Reader layout (split / full / minimized) and the study pane
  readerLayout: ReaderLayoutMode;
  setReaderLayout: (mode: ReaderLayoutMode) => void;
  studyPane: ReaderStudyPane;
  setStudyPane: (pane: ReaderStudyPane) => void;

  // Book-scoped study state
  annotations: ReadonlyArray<Annotation>;
  annotationsLoading: boolean;
  annotationsError: string | null;
  refreshAnnotations: () => Promise<void>;
  activeAnnotationId: string | null;
  setActiveAnnotationId: (id: string | null) => void;
  activeAnnotation: Annotation | null;
  annotationNoteDraft: string;
  setAnnotationNoteDraft: (value: string) => void;
  studySummary: StudySummary | null;
  refreshStudySummary: () => Promise<void>;
  canvases: ReadonlyArray<CanvasMetadata>;
  refreshCanvases: () => Promise<void>;

  // Annotation creation
  drawMode: boolean;
  setDrawMode: (on: boolean) => void;
  createTextMark: (
    subKind: TextMarkSubKind,
    options?: { color?: string; note?: string },
  ) => Promise<Annotation | null>;
  createDrawing: (
    normalizedPoints: ReadonlyArray<{ x: number; y: number }>,
    options?: { color?: string; strokeWidth?: number; note?: string },
  ) => Promise<Annotation | null>;
  saveAnnotationNote: (annotationId: string, note: string) => Promise<void>;
  removeAnnotation: (annotationId: string) => Promise<void>;

  // Actions
  goTo: (location: DocumentLocation) => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  zoomIn: () => void;
  zoomOut: () => void;
  rotate: () => void;
  setZoom: (zoom: number) => void;
  setTheme: (theme: 'light' | 'warm' | 'dark') => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: 'serif' | 'sans' | 'mono') => void;
  setLineHeight: (height: number) => void;
  setContentWidth: (width: 'compact' | 'normal' | 'wide') => void;
  setLayoutMode: (mode: 'paginated' | 'scrolled') => void;
  toggleBookmark: (label?: string) => Promise<void>;
  removeBookmark: (bookmarkId: string) => Promise<void>;
  reload: () => Promise<void>;
}

const ReaderContext = createContext<ReaderContextValue | null>(null);

export function useReader(): ReaderContextValue {
  const ctx = useContext(ReaderContext);
  if (!ctx) {
    throw new Error('useReader must be used within a ReaderProvider');
  }
  return ctx;
}

interface ReaderProviderProps {
  itemId: string;
  source: ReadonlyDocumentSource;
  children: ReactNode;
}

export function ReaderProvider({ itemId, source, children }: ReaderProviderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [session] = useState(() => new ReaderSession());

  const [snapshot, setSnapshot] = useState<ReaderSessionSnapshot>(() => session.snapshot);
  const [activeSidebar, setActiveSidebar] = useState<SidebarTab>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [mobileViewTab, setMobileViewTab] = useState<'reader' | 'canvas'>('reader');
  const [readerStatus, setReaderStatus] = useState<ReaderStatus | null>(null);
  const [readerLayout, setReaderLayout] = useState<ReaderLayoutMode>('split');
  const [studyPane, setStudyPane] = useState<ReaderStudyPane>('none');
  const [annotations, setAnnotations] = useState<ReadonlyArray<Annotation>>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [annotationsError, setAnnotationsError] = useState<string | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  // Note drafts are keyed by annotation id so switching annotations never needs a
  // synchronising effect (and never leaks one annotation's draft into another).
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [studySummary, setStudySummary] = useState<StudySummary | null>(null);
  const [canvases, setCanvases] = useState<ReadonlyArray<CanvasMetadata>>([]);
  const [drawMode, setDrawMode] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  // Subscribe to session snapshot updates
  useEffect(() => {
    return session.subscribe((snap) => {
      setSnapshot(snap);
    });
  }, [session]);

  // Load persisted reader preferences once on mount
  useEffect(() => {
    let active = true;
    void (async () => {
      const savedPrefs = await getReaderSettings();
      if (active && savedPrefs) {
        session.setPreferences(savedPrefs);
      }
    })();
    return () => {
      active = false;
    };
  }, [session]);

  // Load reader item status, bookmarks, and saved reading state
  const loadItemStateAndOpen = useCallback(async () => {
    const isSample = itemId.startsWith('sample');

    if (!isSample) {
      try {
        const status = await getReaderStatus(itemId);
        setReaderStatus(status);
      } catch {
        // Handled through session error
      }
    }

    // Load persisted bookmarks
    const savedBookmarks = await getReaderBookmarks(itemId);
    session.setBookmarks(savedBookmarks);

    // Load persisted reading position for restore
    const savedState = await getReaderState(itemId);
    const initialLocation = savedState?.location;

    // Check for direct jump query parameters (?location= or ?annotationId=)
    let targetLocation: DocumentLocation | undefined = undefined;

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const targetLocParam = urlParams.get('location');
      const targetAnnId = urlParams.get('annotationId');

      if (targetLocParam) {
        try {
          const parsed = JSON.parse(decodeURIComponent(targetLocParam));
          targetLocation = validateDocumentLocation(parsed);
        } catch {
          toast.error('Invalid navigation target location');
        }
      } else if (targetAnnId) {
        try {
          const ann = await getAnnotation(itemId, targetAnnId);
          if (ann) {
            if (ann.sourceHash && ann.sourceHash !== source.sourceHash) {
              toast.info('Document version changed since annotation was created');
            }
            if (ann.anchor.kind === 'pdf-text' || ann.anchor.kind === 'pdf-drawing') {
              targetLocation = createPageLocation(source.sourceHash, ann.anchor.pageNumber);
            } else if (ann.anchor.kind === 'reflowable-text') {
              targetLocation = createSemanticLocation(source.sourceHash, {
                cfi: ann.anchor.startCfi,
                spineIndex: ann.anchor.spineIndex,
              });
            }
          } else {
            toast.info('Unable to locate annotation in document');
          }
        } catch {
          toast.info('Unable to locate annotation in document');
        }
      }
    }

    const effectiveLocation = targetLocation || (
      initialLocation && initialLocation.sourceHash === source.sourceHash
        ? initialLocation
        : undefined
    );

    // Open session with container mount
    if (containerRef.current) {
      await session.open(source, {
        container: containerRef.current,
        initialLocation: effectiveLocation,
      });
    }
  }, [itemId, source, session, toast]);

  // Initialize session once container is attached
  useEffect(() => {
    void (async () => {
      try {
        await loadItemStateAndOpen();
      } catch {
        // Errors captured in session snapshot
      }
    })();

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      void session.close();
    };
  }, [loadItemStateAndOpen, session]);

  // Debounced persistence of current reading position
  useEffect(() => {
    if (!snapshot.isOpen || !snapshot.currentLocation || snapshot.isLoading) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (snapshot.currentLocation && snapshot.source) {
        void saveReaderPosition(itemId, {
          location: snapshot.currentLocation,
          progression: snapshot.readingProgress,
          sourceHash: snapshot.source.sourceHash,
          page: snapshot.currentPage,
        });
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [itemId, snapshot.currentLocation, snapshot.isOpen, snapshot.isLoading, snapshot.readingProgress, snapshot.source, snapshot.currentPage]);

  // Check if current location is bookmarked
  const isCurrentLocationBookmarked = snapshot.bookmarks.some((b) => {
    if (!snapshot.currentLocation) return false;
    return areDocumentLocationsEqual(b.location, snapshot.currentLocation);
  });

  // Navigation handlers
  const goTo = useCallback(
    async (location: DocumentLocation) => {
      await session.goTo(location);
    },
    [session]
  );

  const goBack = useCallback(async () => {
    await session.goBack();
  }, [session]);

  const goForward = useCallback(async () => {
    await session.goForward();
  }, [session]);

  const next = useCallback(async () => {
    await session.next();
  }, [session]);

  const prev = useCallback(async () => {
    await session.prev();
  }, [session]);

  // Zoom & Rotation handlers
  const zoomIn = useCallback(() => {
    session.zoomIn();
  }, [session]);

  const zoomOut = useCallback(() => {
    session.zoomOut();
  }, [session]);

  const rotate = useCallback(() => {
    session.rotate();
  }, [session]);

  const setZoom = useCallback(
    (zoom: number) => {
      session.setZoom(zoom);
    },
    [session]
  );

  // Preference handlers with server persistence
  const updatePreferences = useCallback(
    (patch: Partial<ReaderPreferences>) => {
      session.setPreferences(patch);
      void saveReaderSettings({ ...session.preferences, ...patch });
    },
    [session]
  );

  const setTheme = useCallback(
    (theme: 'light' | 'warm' | 'dark') => {
      updatePreferences({ theme });
    },
    [updatePreferences]
  );

  const setFontSize = useCallback(
    (fontSize: number) => {
      updatePreferences({ fontSize });
    },
    [updatePreferences]
  );

  const setFontFamily = useCallback(
    (fontFamily: 'serif' | 'sans' | 'mono') => {
      updatePreferences({ fontFamily });
    },
    [updatePreferences]
  );

  const setLineHeight = useCallback(
    (lineHeight: number) => {
      updatePreferences({ lineHeight });
    },
    [updatePreferences]
  );

  const setContentWidth = useCallback(
    (contentWidth: 'compact' | 'normal' | 'wide') => {
      updatePreferences({ contentWidth });
    },
    [updatePreferences]
  );

  const setLayoutMode = useCallback(
    (layoutMode: 'paginated' | 'scrolled') => {
      session.setLayoutMode(layoutMode);
      updatePreferences({ layoutMode });
    },
    [session, updatePreferences]
  );

  // Bookmark handlers
  const toggleBookmark = useCallback(
    async (label?: string) => {
      if (!snapshot.currentLocation || !snapshot.source) return;

      const existing = snapshot.bookmarks.find((b) =>
        areDocumentLocationsEqual(b.location, snapshot.currentLocation!)
      );

      if (existing) {
        session.removeBookmark(existing.id);
        await deleteReaderBookmark(itemId, existing.id);
      } else {
        const snippet =
          snapshot.currentChapter ||
          (snapshot.currentPage ? `Page ${snapshot.currentPage}` : undefined) ||
          snapshot.metadata?.title;

        const newBm = createBookmark(itemId, snapshot.currentLocation, {
          label: label || (snapshot.currentPage ? `Page ${snapshot.currentPage}` : undefined),
          snippet,
          pageNumber: snapshot.currentPage,
          progression: snapshot.readingProgress,
        });

        session.addBookmark(newBm);
        await addReaderBookmark(itemId, newBm);
      }
    },
    [itemId, session, snapshot]
  );

  const removeBookmark = useCallback(
    async (bookmarkId: string) => {
      session.removeBookmark(bookmarkId);
      await deleteReaderBookmark(itemId, bookmarkId);
    },
    [itemId, session]
  );

  const reload = useCallback(async () => {
    await loadItemStateAndOpen();
  }, [loadItemStateAndOpen]);

  // ---------------------------------------------------------------------------
  // Book-scoped study state. Every request is item-scoped, so Book A's study
  // data can never appear in Book B.
  // ---------------------------------------------------------------------------

  const refreshAnnotations = useCallback(async () => {
    if (!itemId || itemId.startsWith('sample')) {
      setAnnotations([]);
      return;
    }
    setAnnotationsLoading(true);
    setAnnotationsError(null);
    try {
      const list = await getAnnotations(itemId);
      setAnnotations(list);
    } catch (err) {
      setAnnotationsError(err instanceof Error ? err.message : 'Failed to load annotations');
      setAnnotations([]);
    } finally {
      setAnnotationsLoading(false);
    }
  }, [itemId]);

  const refreshStudySummary = useCallback(async () => {
    if (!itemId || itemId.startsWith('sample')) {
      setStudySummary(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/reader/items/${encodeURIComponent(itemId)}/study-summary`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStudySummary((await res.json()) as StudySummary);
    } catch {
      setStudySummary(null);
    }
  }, [itemId]);

  const refreshCanvases = useCallback(async () => {
    if (!itemId) {
      setCanvases([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/reader/items/${encodeURIComponent(itemId)}/canvases`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCanvases((await res.json()) as CanvasMetadata[]);
    } catch {
      setCanvases([]);
    }
  }, [itemId]);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      await Promise.all([
        refreshAnnotations(),
        refreshStudySummary(),
        refreshCanvases(),
      ]);
    });
  }, [refreshAnnotations, refreshStudySummary, refreshCanvases]);

  const activeAnnotation =
    annotations.find((a) => a.id === activeAnnotationId) ?? null;

  const annotationNoteDraft = activeAnnotation
    ? (noteDrafts[activeAnnotation.id] ??
      (activeAnnotation.content as { note?: string }).note ??
      '')
    : '';

  const setAnnotationNoteDraft = useCallback(
    (value: string) => {
      if (!activeAnnotationId) return;
      setNoteDrafts((prev) => ({ ...prev, [activeAnnotationId]: value }));
    },
    [activeAnnotationId],
  );

  /** Build a canonical anchor from the live selection for the current engine. */
  const buildSelectionAnchor = useCallback(async (): Promise<AnnotationAnchor | null> => {
    const selection = await session.getSelection();
    if (!selection || !selection.text.trim() || !snapshot.source) return null;

    if (snapshot.capabilities.has('surfaceMarkup')) {
      const container = containerRef.current;
      const pageEl = container?.querySelector('canvas') as HTMLElement | null;
      const domSelection = typeof window !== 'undefined' ? window.getSelection() : null;
      const pageRect = pageEl?.getBoundingClientRect();
      const clientRects: Array<{ left: number; top: number; width: number; height: number }> = [];
      if (domSelection && domSelection.rangeCount > 0) {
        const range = domSelection.getRangeAt(0);
        for (const rect of Array.from(range.getClientRects())) {
          clientRects.push({
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          });
        }
      }
      const normalized =
        pageRect && clientRects.length
          ? normalizeSelectionRects(clientRects, pageRect)
          : [];
      return pdfTextAnchorFromSelection({
        pageNumber: snapshot.currentPage || 1,
        sourceHash: snapshot.source.sourceHash,
        quote: selection.text,
        rects: normalized,
        prefix: selection.context?.prefix,
        suffix: selection.context?.suffix,
      });
    }

    const payload = (selection.location.payload || {}) as {
      cfi?: string;
      spineIndex?: number;
      startOffset?: number;
      endOffset?: number;
    };
    return reflowableTextAnchorFromSelection({
      sourceHash: snapshot.source.sourceHash,
      quote: selection.text,
      startCfi: payload.cfi,
      spineIndex: payload.spineIndex,
      startOffset: payload.startOffset,
      endOffset: payload.endOffset,
      prefix: selection.context?.prefix,
      suffix: selection.context?.suffix,
    });
  }, [session, snapshot.capabilities, snapshot.currentPage, snapshot.source]);

  const createTextMark = useCallback(
    async (subKind: TextMarkSubKind, options?: { color?: string; note?: string }) => {
      try {
        const anchor = await buildSelectionAnchor();
        if (!anchor || !snapshot.source) {
          toast.info('Select text in the document first');
          return null;
        }
        const created = await createAnnotationApi(itemId, {
          assetId: readerStatus?.candidates[0]?.id ?? 'unknown',
          kind: 'text-mark',
          anchor,
          content: {
            subKind,
            ...(options?.color ? { color: options.color } : {}),
            ...(options?.note ? { note: options.note, noteUpdatedAt: new Date().toISOString() } : {}),
          },
          sourceHash: snapshot.source.sourceHash,
        });
        setAnnotations((prev) => [...prev, created]);
        setActiveAnnotationId(created.id);
        void refreshStudySummary();
        if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
        return created;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save annotation');
        return null;
      }
    },
    [buildSelectionAnchor, itemId, readerStatus, refreshStudySummary, snapshot.source, toast],
  );

  const createDrawing = useCallback(
    async (
      normalizedPoints: ReadonlyArray<{ x: number; y: number }>,
      options?: { color?: string; strokeWidth?: number; note?: string },
    ) => {
      if (!snapshot.source) return null;
      if (!snapshot.capabilities.has('surfaceMarkup')) {
        toast.info('Freehand markup is available for fixed-layout documents only');
        return null;
      }
      if (normalizedPoints.length < 2) return null;
      try {
        const xs = normalizedPoints.map((p) => p.x);
        const ys = normalizedPoints.map((p) => p.y);
        const anchor: AnnotationAnchor = {
          kind: 'pdf-drawing',
          pageNumber: snapshot.currentPage || 1,
          points: normalizedPoints.map((p) => ({ x: p.x, y: p.y })),
          bounds: {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          },
          sourceHash: snapshot.source.sourceHash,
        };
        const created = await createAnnotationApi(itemId, {
          assetId: readerStatus?.candidates[0]?.id ?? 'unknown',
          kind: 'drawing',
          anchor,
          content: {
            subKind: 'pen',
            color: options?.color ?? '#b45309',
            strokeWidth: options?.strokeWidth ?? 0.004,
            ...(options?.note ? { note: options.note, noteUpdatedAt: new Date().toISOString() } : {}),
          },
          sourceHash: snapshot.source.sourceHash,
        });
        setAnnotations((prev) => [...prev, created]);
        setActiveAnnotationId(created.id);
        void refreshStudySummary();
        return created;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save markup');
        return null;
      }
    },
    [itemId, readerStatus, refreshStudySummary, snapshot.capabilities, snapshot.currentPage, snapshot.source, toast],
  );

  const saveAnnotationNote = useCallback(
    async (annotationId: string, note: string) => {
      const current = annotations.find((a) => a.id === annotationId);
      if (!current) return;
      const trimmed = note.trim();
      const nextContent = {
        ...(current.content as unknown as Record<string, unknown>),
        note: trimmed,
        noteUpdatedAt: trimmed ? new Date().toISOString() : undefined,
      };
      try {
        const updated = await updateAnnotationApi(itemId, annotationId, {
          content: nextContent,
          expectedRevision: current.revision,
        });
        setAnnotations((prev) => prev.map((a) => (a.id === annotationId ? updated : a)));
        void refreshStudySummary();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Failed to save the annotation note',
        );
      }
    },
    [annotations, itemId, refreshStudySummary, toast],
  );

  const removeAnnotation = useCallback(
    async (annotationId: string) => {
      const current = annotations.find((a) => a.id === annotationId);
      if (!current) return;
      try {
        await deleteAnnotationApi(itemId, annotationId, current.revision);
        setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
        if (activeAnnotationId === annotationId) setActiveAnnotationId(null);
        void refreshStudySummary();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete the annotation');
      }
    },
    [activeAnnotationId, annotations, itemId, refreshStudySummary, toast],
  );

  const value: ReaderContextValue = {
    session,
    snapshot,
    itemId,
    readerStatus,
    activeSidebar,
    setActiveSidebar,
    isSettingsOpen,
    setIsSettingsOpen,
    isCanvasOpen,
    setIsCanvasOpen,
    activeCanvasId,
    setActiveCanvasId,
    mobileViewTab,
    setMobileViewTab,
    readerLayout,
    setReaderLayout,
    studyPane,
    setStudyPane,
    annotations,
    annotationsLoading,
    annotationsError,
    refreshAnnotations,
    activeAnnotationId,
    setActiveAnnotationId,
    activeAnnotation,
    annotationNoteDraft,
    setAnnotationNoteDraft,
    studySummary,
    refreshStudySummary,
    canvases,
    refreshCanvases,
    drawMode,
    setDrawMode,
    createTextMark,
    createDrawing,
    saveAnnotationNote,
    removeAnnotation,
    containerRef,
    isCurrentLocationBookmarked,
    goTo,
    goBack,
    goForward,
    next,
    prev,
    zoomIn,
    zoomOut,
    rotate,
    setZoom,
    setTheme,
    setFontSize,
    setFontFamily,
    setLineHeight,
    setContentWidth,
    setLayoutMode,
    toggleBookmark,
    removeBookmark,
    reload,
  };

  return <ReaderContext.Provider value={value}>{children}</ReaderContext.Provider>;
}
