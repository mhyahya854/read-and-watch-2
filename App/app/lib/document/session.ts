/**
 * Capability-Driven Reader Session Controller.
 * Bridges DocumentAdapter capabilities into clean application state so the UI
 * queries capabilities rather than branching on file extensions or engine names.
 */

import { DocumentError } from './errors.ts';
import { type DocumentCapabilities, hasCapability } from './capabilities.ts';
import { type ReadonlyDocumentSource } from './source.ts';
import { type DocumentLocation } from './location.ts';
import { type TextAnchor, type ResolvedAnchor } from './anchor.ts';
import {
  type DocumentAdapter,
  type DocumentMetadata,
  type TocEntry,
  type SearchOptions,
  type SearchResult,
  type DocumentSelection,
} from './adapter.ts';
import { type DocumentAdapterRegistry, defaultAdapterRegistry } from './registry.ts';

export interface ReaderSessionSnapshot {
  readonly isOpen: boolean;
  readonly isLoading: boolean;
  readonly error: DocumentError | null;
  readonly source: ReadonlyDocumentSource | null;
  readonly currentLocation: DocumentLocation | null;
  readonly metadata: DocumentMetadata | null;
  readonly toc: ReadonlyArray<TocEntry>;
  readonly capabilities: DocumentCapabilities;
}

export type SessionStateListener = (snapshot: ReaderSessionSnapshot) => void;

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
    };
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

  // --- Session Lifecycle Actions ---

  /** Open a document source using the registered adapter */
  async open(source: ReadonlyDocumentSource, signal?: AbortSignal): Promise<void> {
    if (this.adapter) {
      await this.close();
    }

    this.isLoading = true;
    this.lastError = null;
    this.currentSource = source;
    this.notify();

    try {
      const adapter = this.registry.createAdapter(source);
      await adapter.open(source, signal);

      this.adapter = adapter;
      this.currentLocation = await adapter.getCurrentLocation();
      this.currentMetadata = await adapter.getMetadata();
      this.currentToc = await adapter.getTOC();
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
        this.notify();
      }
    }
  }

  /** Navigate to target location */
  async goTo(location: DocumentLocation, signal?: AbortSignal): Promise<void> {
    if (!this.adapter || this.adapter.lifecycleState !== 'open') {
      throw DocumentError.adapterClosed('navigation');
    }

    await this.adapter.goTo(location, signal);
    this.currentLocation = await this.adapter.getCurrentLocation();
    this.notify();
  }

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
