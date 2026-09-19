/**
 * Capability-Driven Reader Session Controller.
 * Bridges DocumentAdapter capabilities into clean application state so the UI
 * queries capabilities rather than branching on file extensions or engine names.
 * Manages location history, bookmarks, preferences, zoom, rotation, and reading metrics.
 */

import { DocumentError } from './errors.ts';
import { type DocumentCapabilities, hasCapability } from './capabilities.ts';
import { type ReadonlyDocumentSource } from './source.ts';
import {
  type DocumentLocation,
  type PageLocationPayload,
  type SemanticLocationPayload,
  type ProgressionLocationPayload,
  createPageLocation,
} from './location.ts';
import { type TextAnchor, type ResolvedAnchor } from './anchor.ts';
import {
  type DocumentAdapter,
  type DocumentMetadata,
  type TocEntry,
  type SearchOptions,
  type SearchResult,
  type DocumentSelection,
} from './adapter.ts';
import {
  type DocumentAdapterRegistry,
  type CreateAdapterOptions,
  defaultAdapterRegistry,
} from './registry.ts';
import { ReaderHistory } from './history.ts';
import { type Bookmark } from './bookmark.ts';
import {
  type ReaderPreferences,
  DEFAULT_READER_PREFERENCES,
  validateReaderPreferences,
} from './preferences.ts';

export interface ReaderSessionSnapshot {
  readonly isOpen: boolean;
  readonly isLoading: boolean;
  readonly error: DocumentError | null;
  readonly source: ReadonlyDocumentSource | null;
  readonly currentLocation: DocumentLocation | null;
  readonly metadata: DocumentMetadata | null;
  readonly toc: ReadonlyArray<TocEntry>;
  readonly capabilities: DocumentCapabilities;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly readingProgress: number; // 0.0 - 1.0
  readonly currentPage: number;
  readonly totalPages: number;
  readonly currentChapter: string;
  readonly zoom: number;
  readonly rotation: number;
  readonly bookmarks: ReadonlyArray<Bookmark>;
  readonly preferences: ReaderPreferences;
}

export type SessionStateListener = (snapshot: ReaderSessionSnapshot) => void;

export interface OpenSessionOptions extends CreateAdapterOptions {
  signal?: AbortSignal;
  initialLocation?: DocumentLocation;
}

export class ReaderSession {
  private adapter: DocumentAdapter | null = null;
  private registry: DocumentAdapterRegistry;
  private currentSource: ReadonlyDocumentSource | null = null;
  private currentLocation: DocumentLocation | null = null;
  private currentMetadata: DocumentMetadata | null = null;
  private currentToc: ReadonlyArray<TocEntry> = [];
  private isLoading = false;
  private lastError: DocumentError | null = null;
  private readonly listeners = new Set<SessionStateListener>();

  // Navigation History
  private readonly history = new ReaderHistory(50);

  // Reader metrics & state
  private readingProgress = 0;
  private currentPage = 1;
  private totalPages = 1;
  private currentChapter = '';
  private zoomLevel = 1.0;
  private rotationAngle = 0;

  // Bookmarks & Preferences
  private bookmarksList: Bookmark[] = [];
  private currentPreferences: ReaderPreferences = { ...DEFAULT_READER_PREFERENCES };

  constructor(registry: DocumentAdapterRegistry = defaultAdapterRegistry) {
    this.registry = registry;
  }

  // --- Capability Queries (used by UI to toggle features) ---

  get capabilities(): DocumentCapabilities {
    return this.adapter ? this.adapter.getCapabilities() : new Set();
  }

  get canSearch(): boolean {
    return hasCapability(this.capabilities, 'textSearch');
  }

  get canZoom(): boolean {
    return hasCapability(this.capabilities, 'zoom');
  }

  get canAdjustFont(): boolean {
    return hasCapability(this.capabilities, 'fontControls');
  }

  get canAdjustTheme(): boolean {
    return hasCapability(this.capabilities, 'themeControls');
  }

  get canPageNavigate(): boolean {
    return hasCapability(this.capabilities, 'pageNavigation');
  }

  get canContinuousScroll(): boolean {
    return hasCapability(this.capabilities, 'continuousLayout');
  }

  get hasToc(): boolean {
    return hasCapability(this.capabilities, 'toc') && this.currentToc.length > 0;
  }

  get canExtractText(): boolean {
    return hasCapability(this.capabilities, 'textExtraction');
  }

  get canAnchorText(): boolean {
    return hasCapability(this.capabilities, 'textAnchors');
  }

  // --- State Accessors ---

  get isOpen(): boolean {
    return this.adapter !== null && this.adapter.lifecycleState === 'open';
  }

  get loading(): boolean {
    return this.isLoading;
  }

  get error(): DocumentError | null {
    return this.lastError;
  }

  get source(): ReadonlyDocumentSource | null {
    return this.currentSource;
  }

  get location(): DocumentLocation | null {
    return this.currentLocation;
  }

  get metadata(): DocumentMetadata | null {
    return this.currentMetadata;
  }

  get toc(): ReadonlyArray<TocEntry> {
    return this.currentToc;
  }

  get canGoBack(): boolean {
    return this.history.canGoBack;
  }

  get canGoForward(): boolean {
    return this.history.canGoForward;
  }

  get progress(): number {
    return this.readingProgress;
  }

  get page(): number {
    return this.currentPage;
  }

  get pageCount(): number {
    return this.totalPages;
  }

  get chapter(): string {
    return this.currentChapter;
  }

  get zoom(): number {
    return this.zoomLevel;
  }

  get rotation(): number {
    return this.rotationAngle;
  }

  get bookmarks(): ReadonlyArray<Bookmark> {
    return [...this.bookmarksList];
  }

  get preferences(): ReaderPreferences {
    return { ...this.currentPreferences };
  }

  get adapterInstance(): DocumentAdapter | null {
    return this.adapter;
  }

  get snapshot(): ReaderSessionSnapshot {
    return {
      isOpen: this.isOpen,
      isLoading: this.isLoading,
      error: this.lastError,
      source: this.currentSource,
      currentLocation: this.currentLocation,
      metadata: this.currentMetadata,
      toc: this.currentToc,
      capabilities: this.capabilities,
      canGoBack: this.canGoBack,
      canGoForward: this.canGoForward,
      readingProgress: this.readingProgress,
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      currentChapter: this.currentChapter,
      zoom: this.zoomLevel,
      rotation: this.rotationAngle,
      bookmarks: [...this.bookmarksList],
      preferences: { ...this.currentPreferences },
    };
  }

  getSnapshot(): ReaderSessionSnapshot {
    return this.snapshot;
  }

  // --- State Subscription ---

  subscribe(listener: SessionStateListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snap = this.snapshot;
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  private syncLocationMetrics(loc: DocumentLocation | null): void {
    if (!loc) return;
    if (loc.kind === 'page') {
      const p = loc.payload as PageLocationPayload;
      this.currentPage = p.pageNumber;
      if (p.totalPages && p.totalPages > 0) {
        this.totalPages = p.totalPages;
        this.readingProgress = Number((p.pageNumber / p.totalPages).toFixed(3));
      } else if (this.totalPages > 0) {
        this.readingProgress = Number((p.pageNumber / this.totalPages).toFixed(3));
      }
    } else if (loc.kind === 'semantic') {
      const p = loc.payload as SemanticLocationPayload;
      if (p.progression !== undefined) {
        this.readingProgress = Number(p.progression.toFixed(3));
      }
      if (p.title) {
        this.currentChapter = p.title;
      }
    } else if (loc.kind === 'progression') {
      const p = loc.payload as ProgressionLocationPayload;
      this.readingProgress = Number(p.fraction.toFixed(3));
    }
  }

  // --- Session Lifecycle Actions ---

  /** Open a document source using the registered adapter */
  async open(
    source: ReadonlyDocumentSource,
    optionsOrSignal?: OpenSessionOptions | AbortSignal
  ): Promise<void> {
    if (this.adapter) {
      await this.close();
    }

    const options: OpenSessionOptions =
      optionsOrSignal instanceof AbortSignal
        ? { signal: optionsOrSignal }
        : optionsOrSignal || {};

    const signal = options.signal;

    this.isLoading = true;
    this.lastError = null;
    this.currentSource = source;
    this.history.clear();
    this.notify();

    try {
      const adapter = this.registry.createAdapter(source, {
        container: options.container,
        initialData: options.initialData,
      });
      await adapter.open(source, signal);

      this.adapter = adapter;
      this.currentMetadata = await adapter.getMetadata();
      this.currentToc = await adapter.getTOC();

      // Check for adapter properties (e.g. totalPages, initial zoom)
      const anyAdapter = adapter as unknown as {
        totalPages?: number;
        currentPage?: number;
        zoom?: number;
        rotation?: number;
      };
      if (typeof anyAdapter.totalPages === 'number' && anyAdapter.totalPages > 0) {
        this.totalPages = anyAdapter.totalPages;
      } else if (this.currentMetadata?.pageCount) {
        this.totalPages = this.currentMetadata.pageCount;
      }

      if (typeof anyAdapter.currentPage === 'number') {
        this.currentPage = anyAdapter.currentPage;
      }
      if (typeof anyAdapter.zoom === 'number') {
        this.zoomLevel = anyAdapter.zoom;
      }
      if (typeof anyAdapter.rotation === 'number') {
        this.rotationAngle = anyAdapter.rotation;
      }

      // If initialLocation requested, navigate to it
      if (options.initialLocation) {
        try {
          await adapter.goTo(options.initialLocation, signal);
        } catch {
          // If restore to initialLocation failed, fall back to default start location safely
        }
      }

      this.currentLocation = await adapter.getCurrentLocation();
      this.syncLocationMetrics(this.currentLocation);

      if (this.currentLocation) {
        this.history.push(this.currentLocation);
      }

      this.isLoading = false;
      this.notify();
    } catch (err) {
      this.isLoading = false;
      if (err instanceof DocumentError) {
        this.lastError = err;
      } else if (signal?.aborted) {
        this.lastError = DocumentError.cancelled('Document open');
      } else {
        this.lastError = DocumentError.openFailed(
          err instanceof Error ? err.message : String(err),
          err
        );
      }
      this.notify();
      throw this.lastError;
    }
  }

  /** Close the current document adapter session */
  async close(): Promise<void> {
    if (this.adapter) {
      try {
        await this.adapter.close();
      } finally {
        this.adapter = null;
        this.currentLocation = null;
        this.currentMetadata = null;
        this.currentToc = [];
        this.isLoading = false;
        this.lastError = null;
        this.history.clear();
        this.readingProgress = 0;
        this.currentPage = 1;
        this.totalPages = 1;
        this.currentChapter = '';
        this.notify();
      }
    }
  }

  /** Navigate to target location */
  async goTo(
    location: DocumentLocation,
    options?: { signal?: AbortSignal; recordHistory?: boolean }
  ): Promise<void> {
    if (!this.adapter || this.adapter.lifecycleState !== 'open') {
      throw DocumentError.adapterClosed('navigation');
    }

    const signal = options?.signal;
    await this.adapter.goTo(location, signal);
    this.currentLocation = await this.adapter.getCurrentLocation();
    this.syncLocationMetrics(this.currentLocation);

    if (options?.recordHistory !== false && this.currentLocation) {
      this.history.push(this.currentLocation);
    }
    this.notify();
  }

  /** Step back in reader location history */
  async goBack(): Promise<DocumentLocation | null> {
    const prev = this.history.back();
    if (prev) {
      await this.goTo(prev, { recordHistory: false });
    }
    return prev;
  }

  /** Step forward in reader location history */
  async goForward(): Promise<DocumentLocation | null> {
    const next = this.history.forward();
    if (next) {
      await this.goTo(next, { recordHistory: false });
    }
    return next;
  }

  /** Advance to next page or progression block */
  async next(): Promise<void> {
    if (!this.adapter || this.adapter.lifecycleState !== 'open') return;

    if (this.canPageNavigate) {
      const anyAdapter = this.adapter as unknown as { nextPage?: () => Promise<void> };
      if (typeof anyAdapter.nextPage === 'function') {
        await anyAdapter.nextPage();
        this.currentLocation = await this.adapter.getCurrentLocation();
        this.syncLocationMetrics(this.currentLocation);
        if (this.currentLocation) this.history.push(this.currentLocation);
        this.notify();
        return;
      }
      if (this.currentLocation && this.currentSource && this.currentPage < this.totalPages) {
        await this.goTo(
          createPageLocation(this.currentSource.sourceHash, this.currentPage + 1, {
            totalPages: this.totalPages,
          })
        );
        return;
      }
    }

    // Progression / semantic advance
    if (this.currentLocation?.kind === 'semantic') {
      const payload = this.currentLocation.payload as SemanticLocationPayload;
      const current = payload.progression ?? 0;
      const nextProg = Math.min(1.0, current + 0.05);
      await this.goTo({
        ...this.currentLocation,
        payload: { ...payload, progression: nextProg },
      });
    }
  }

  /** Retreat to previous page or progression block */
  async prev(): Promise<void> {
    if (!this.adapter || this.adapter.lifecycleState !== 'open') return;

    if (this.canPageNavigate) {
      const anyAdapter = this.adapter as unknown as { prevPage?: () => Promise<void> };
      if (typeof anyAdapter.prevPage === 'function') {
        await anyAdapter.prevPage();
        this.currentLocation = await this.adapter.getCurrentLocation();
        this.syncLocationMetrics(this.currentLocation);
        if (this.currentLocation) this.history.push(this.currentLocation);
        this.notify();
        return;
      }
      if (this.currentLocation && this.currentSource && this.currentPage > 1) {
        await this.goTo(
          createPageLocation(this.currentSource.sourceHash, this.currentPage - 1, {
            totalPages: this.totalPages,
          })
        );
        return;
      }
    }

    // Progression / semantic retreat
    if (this.currentLocation?.kind === 'semantic') {
      const payload = this.currentLocation.payload as SemanticLocationPayload;
      const current = payload.progression ?? 0;
      const prevProg = Math.max(0.0, current - 0.05);
      await this.goTo({
        ...this.currentLocation,
        payload: { ...payload, progression: prevProg },
      });
    }
  }

  // --- Zoom & Rotation ---

  setZoom(zoom: number): void {
    if (!this.canZoom) return;
    this.zoomLevel = Math.max(0.25, Math.min(5.0, Number(zoom.toFixed(2))));
    const anyAdapter = this.adapter as unknown as { setZoom?: (z: number) => void };
    if (typeof anyAdapter.setZoom === 'function') {
      anyAdapter.setZoom(this.zoomLevel);
    }
    this.notify();
    void this.refreshView();
  }

  zoomIn(): void {
    if (!this.canZoom) return;
    this.setZoom(this.zoomLevel + 0.25);
  }

  zoomOut(): void {
    if (!this.canZoom) return;
    this.setZoom(this.zoomLevel - 0.25);
  }

  setRotation(rotation: number): void {
    if (!this.canZoom) return;
    this.rotationAngle = ((rotation % 360) + 360) % 360;
    const anyAdapter = this.adapter as unknown as { setRotation?: (r: number) => void };
    if (typeof anyAdapter.setRotation === 'function') {
      anyAdapter.setRotation(this.rotationAngle);
    }
    this.notify();
    void this.refreshView();
  }

  /**
   * Ask the engine to re-render after a view-only change. The toolbar otherwise
   * reports a new zoom/rotation while the page keeps rendering at the old one.
   */
  private async refreshView(): Promise<void> {
    const adapter = this.adapter as unknown as {
      refresh?: (signal?: AbortSignal) => Promise<void>;
    } | null;
    if (!adapter || typeof adapter.refresh !== 'function') return;
    try {
      await adapter.refresh();
      this.notify();
    } catch {
      // A failed re-render leaves the previous page on screen; the failure is
      // surfaced through the next navigation/reload rather than crashing the UI.
    }
  }

  rotate(): void {
    if (!this.canZoom) return;
    this.setRotation(this.rotationAngle + 90);
  }

  setLayoutMode(mode: 'paginated' | 'scrolled'): void {
    this.currentPreferences = { ...this.currentPreferences, layoutMode: mode };
    const anyAdapter = this.adapter as unknown as {
      setLayoutMode?: (m: 'paginated' | 'scrolled') => void;
    };
    if (typeof anyAdapter.setLayoutMode === 'function') {
      anyAdapter.setLayoutMode(mode);
    }
    this.notify();
  }

  // --- Bookmarks & Preferences ---

  setBookmarks(bookmarks: ReadonlyArray<Bookmark>): void {
    this.bookmarksList = [...bookmarks];
    this.notify();
  }

  addBookmark(bookmark: Bookmark): void {
    if (!this.bookmarksList.some((b) => b.id === bookmark.id)) {
      this.bookmarksList = [bookmark, ...this.bookmarksList];
      this.notify();
    }
  }

  removeBookmark(bookmarkId: string): void {
    this.bookmarksList = this.bookmarksList.filter((b) => b.id !== bookmarkId);
    this.notify();
  }

  setPreferences(prefs: Partial<ReaderPreferences>): void {
    this.currentPreferences = validateReaderPreferences({
      ...this.currentPreferences,
      ...prefs,
    });
    this.notify();
  }

  setTheme(theme: 'light' | 'warm' | 'dark'): void {
    this.setPreferences({ theme });
  }

  setFontSize(fontSize: number): void {
    this.setPreferences({ fontSize });
  }

  setFontFamily(fontFamily: 'serif' | 'sans' | 'mono'): void {
    this.setPreferences({ fontFamily });
  }

  setLineHeight(lineHeight: number): void {
    this.setPreferences({ lineHeight });
  }

  setContentWidth(contentWidth: 'compact' | 'normal' | 'wide'): void {
    this.setPreferences({ contentWidth });
  }

  // --- Document Search ---

  /** Perform document search */
  async search(
    query: string,
    options?: SearchOptions,
    signal?: AbortSignal
  ): Promise<ReadonlyArray<SearchResult>> {
    if (!this.adapter || this.adapter.lifecycleState !== 'open') {
      throw DocumentError.adapterClosed('search');
    }
    if (!this.canSearch) {
      throw DocumentError.unsupportedCapability('textSearch', this.currentSource?.format);
    }

    return this.adapter.search(query, options, signal);
  }

  // --- Text Selection & Anchors ---

  /** Get current document selection */
  async getSelection(): Promise<DocumentSelection | null> {
    if (!this.adapter || this.adapter.lifecycleState !== 'open') {
      throw DocumentError.adapterClosed('getSelection');
    }
    return this.adapter.getSelection();
  }

  /** Create text anchor from active selection */
  async createAnchorFromSelection(): Promise<TextAnchor | null> {
    const selection = await this.getSelection();
    if (!selection) return null;

    if (!this.canAnchorText) {
      throw DocumentError.unsupportedCapability('textAnchors', this.currentSource?.format);
    }

    return this.adapter!.createTextAnchor(selection);
  }

  /** Resolve an existing text anchor */
  async resolveAnchor(anchor: TextAnchor): Promise<ResolvedAnchor> {
    if (!this.adapter || this.adapter.lifecycleState !== 'open') {
      throw DocumentError.adapterClosed('resolveAnchor');
    }
    return this.adapter.resolveTextAnchor(anchor);
  }
}
