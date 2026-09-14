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

export type SidebarTab = 'contents' | 'search' | 'bookmarks' | null;

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
  const [readerStatus, setReaderStatus] = useState<ReaderStatus | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Open session with container mount
    if (containerRef.current) {
      await session.open(source, {
        container: containerRef.current,
        initialLocation:
          initialLocation && initialLocation.sourceHash === source.sourceHash
            ? initialLocation
            : undefined,
      });
    }
  }, [itemId, source, session]);

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

  const value: ReaderContextValue = {
    session,
    snapshot,
    itemId,
    readerStatus,
    activeSidebar,
    setActiveSidebar,
    isSettingsOpen,
    setIsSettingsOpen,
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
