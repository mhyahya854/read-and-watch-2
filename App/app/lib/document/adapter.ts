/**
 * Core DocumentAdapter Contract and Lifecycle Model.
 * Represents the engine-independent abstraction implemented by all future document viewers.
 */

import { type DocumentCapabilities } from './capabilities.ts';
import { type ReadonlyDocumentSource, type DocumentFormat } from './source.ts';
import { type DocumentLocation } from './location.ts';
import { type TextAnchor, type ResolvedAnchor } from './anchor.ts';

export type AdapterLifecycleState =
  | 'created'
  | 'opening'
  | 'open'
  | 'closing'
  | 'closed'
  | 'failed';

export interface TocEntry {
  readonly id: string;
  readonly title: string;
  readonly targetLocation: DocumentLocation;
  readonly children?: ReadonlyArray<TocEntry>;
}

export interface DocumentMetadata {
  readonly title?: string;
  readonly author?: string;
  readonly format: DocumentFormat;
  readonly pageCount?: number;
  readonly description?: string;
  readonly publisher?: string;
  readonly language?: string;
}

export interface SearchOptions {
  readonly caseSensitive?: boolean;
  readonly maxResults?: number;
}

export interface SearchResult {
  readonly id: string;
  readonly matchText: string;
  readonly snippet: string;
  readonly location: DocumentLocation;
  readonly score?: number;
}

export interface DocumentSelection {
  readonly text: string;
  readonly location: DocumentLocation;
  readonly context?: {
    readonly prefix?: string;
    readonly suffix?: string;
  };
}

/**
 * The canonical interface between Read & Watch application logic and any underlying document engine.
 * Engine-native objects (PDF.js page proxies, Foliate renditions/DOM ranges) MUST NEVER leak through this contract.
 */
export interface DocumentAdapter {
  readonly lifecycleState: AdapterLifecycleState;
  readonly source: ReadonlyDocumentSource | null;

  /** Open and initialize the document source with optional cancellation */
  open(source: ReadonlyDocumentSource, signal?: AbortSignal): Promise<void>;

  /** Clean up all engine resources and transition to 'closed' */
  close(): Promise<void>;

  /** Retrieve normalized document metadata */
  getMetadata(): Promise<DocumentMetadata>;

  /** Retrieve structured table of contents */
  getTOC(): Promise<ReadonlyArray<TocEntry>>;

  /** Get current reader viewport location */
  getCurrentLocation(): Promise<DocumentLocation>;

  /** Navigate to a specified document location */
  goTo(location: DocumentLocation, signal?: AbortSignal): Promise<void>;

  /** Search document text with optional cancellation */
  search(query: string, options?: SearchOptions, signal?: AbortSignal): Promise<ReadonlyArray<SearchResult>>;

  /** Get active user selection, or null if no text is currently selected */
  getSelection(): Promise<DocumentSelection | null>;

  /** Create a persistent, versioned text anchor from a document selection */
  createTextAnchor(selection: DocumentSelection): Promise<TextAnchor>;

  /** Resolve an existing text anchor back to a document location */
  resolveTextAnchor(anchor: TextAnchor): Promise<ResolvedAnchor>;

  /** Return the set of product capabilities supported by this adapter instance */
  getCapabilities(): DocumentCapabilities;
}
