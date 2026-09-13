/**
 * Fake PDF Adapter for Contract Fixture and Conformance Testing.
 * Models a fixed-layout, page-oriented document engine without PDF.js dependencies.
 */

import { DocumentError } from '../errors.ts';
import { type DocumentCapabilities, STANDARD_PDF_CAPABILITIES } from '../capabilities.ts';
import { type ReadonlyDocumentSource } from '../source.ts';
import { type DocumentLocation, createPageLocation } from '../location.ts';
import {
  type TextAnchor,
  type ResolvedAnchor,
  createPdfGeometryAnchor,
} from '../anchor.ts';
import {
  type DocumentAdapter,
  type AdapterLifecycleState,
  type DocumentMetadata,
  type TocEntry,
  type SearchOptions,
  type SearchResult,
  type DocumentSelection,
} from '../adapter.ts';

export class FakePdfAdapter implements DocumentAdapter {
  private _state: AdapterLifecycleState = 'created';
  private _source: ReadonlyDocumentSource | null = null;
  private _currentPage = 1;
  private readonly _totalPages = 50;
  private _currentSelection: DocumentSelection | null = null;

  get lifecycleState(): AdapterLifecycleState {
    return this._state;
  }

  get source(): ReadonlyDocumentSource | null {
    return this._source;
  }

  async open(source: ReadonlyDocumentSource, signal?: AbortSignal): Promise<void> {
    if (this._state === 'open' || this._state === 'opening') {
      throw DocumentError.invalidLifecycleState('open', this._state);
    }
    if (this._state === 'closed') {
      throw DocumentError.invalidLifecycleState('open', 'closed');
    }

    this._state = 'opening';

    // Respect cancellation signal
    if (signal?.aborted) {
      this._state = 'failed';
      throw DocumentError.cancelled('Open PDF');
    }

    this._source = source;
    this._currentPage = 1;
    this._state = 'open';
  }

  async close(): Promise<void> {
    if (this._state === 'closed') {
      return; // Idempotent close
    }
    this._state = 'closing';
    this._source = null;
    this._currentSelection = null;
    this._state = 'closed';
  }

  private ensureOpen(operation: string): void {
    if (this._state === 'closed' || this._state === 'closing') {
      throw DocumentError.adapterClosed(operation);
    }
    if (this._state !== 'open') {
      throw DocumentError.invalidLifecycleState(operation, this._state);
    }
  }

  async getMetadata(): Promise<DocumentMetadata> {
    this.ensureOpen('getMetadata');
    return {
      title: this._source?.title || 'Sample PDF Document',
      author: 'Sample Author',
      format: 'pdf',
      pageCount: this._totalPages,
      description: 'A test double representing a 50-page fixed-layout PDF document.',
    };
  }

  async getTOC(): Promise<ReadonlyArray<TocEntry>> {
    this.ensureOpen('getTOC');
    const hash = this._source!.sourceHash;
    return [
      {
        id: 'toc-page-1',
        title: 'Cover & Title',
        targetLocation: createPageLocation(hash, 1, { totalPages: this._totalPages }),
      },
      {
        id: 'toc-page-5',
        title: 'Chapter 1: The Beginning',
        targetLocation: createPageLocation(hash, 5, { totalPages: this._totalPages }),
        children: [
          {
            id: 'toc-page-12',
            title: 'Section 1.1: Background',
            targetLocation: createPageLocation(hash, 12, { totalPages: this._totalPages }),
          },
        ],
      },
      {
        id: 'toc-page-25',
        title: 'Chapter 2: Deep Dive',
        targetLocation: createPageLocation(hash, 25, { totalPages: this._totalPages }),
      },
      {
        id: 'toc-page-48',
        title: 'Index',
        targetLocation: createPageLocation(hash, 48, { totalPages: this._totalPages }),
      },
    ];
  }

  async getCurrentLocation(): Promise<DocumentLocation> {
    this.ensureOpen('getCurrentLocation');
    return createPageLocation(this._source!.sourceHash, this._currentPage, {
      totalPages: this._totalPages,
      normalizedCoordinates: { x: 0, y: 0 },
    });
  }

  async goTo(location: DocumentLocation, signal?: AbortSignal): Promise<void> {
    this.ensureOpen('goTo');

    if (signal?.aborted) {
      throw DocumentError.cancelled('Navigation');
    }

    if (location.kind !== 'page') {
      throw DocumentError.navigationFailed(
        `PDF adapter requires page-based location, received kind "${location.kind}"`
      );
    }

    const payload = location.payload as { pageNumber: number };
    if (payload.pageNumber < 1 || payload.pageNumber > this._totalPages) {
      throw DocumentError.navigationFailed(
        `Page ${payload.pageNumber} out of range (1 - ${this._totalPages})`
      );
    }

    this._currentPage = payload.pageNumber;
  }

  async search(
    query: string,
    options?: SearchOptions,
    signal?: AbortSignal
  ): Promise<ReadonlyArray<SearchResult>> {
    this.ensureOpen('search');

    if (signal?.aborted) {
      throw DocumentError.cancelled('Search');
    }

    if (!query.trim()) {
      return [];
    }

    const results: SearchResult[] = [];
    const hash = this._source!.sourceHash;

    // Simulate search hits on matching pages
    const hits = [5, 12, 25, 33];
    for (const page of hits) {
      if (signal?.aborted) {
        throw DocumentError.cancelled('Search');
      }
      results.push({
        id: `pdf-hit-page-${page}`,
        matchText: query,
        snippet: `...context surrounding the search hit for "${query}" on page ${page}...`,
        location: createPageLocation(hash, page, { totalPages: this._totalPages }),
      });
      if (options?.maxResults && results.length >= options.maxResults) {
        break;
      }
    }

    return results;
  }

  async getSelection(): Promise<DocumentSelection | null> {
    this.ensureOpen('getSelection');
    if (!this._currentSelection) {
      // Return a simulated selection on the current page for test purposes
      return {
        text: 'The fundamental theorem of document architecture',
        location: createPageLocation(this._source!.sourceHash, this._currentPage, {
          totalPages: this._totalPages,
          normalizedCoordinates: { x: 0.1, y: 0.2 },
        }),
        context: {
          prefix: 'In section 1.1, ',
          suffix: ' is established.',
        },
      };
    }
    return this._currentSelection;
  }

  /** Helper method for tests to set a specific selection */
  setSelection(selection: DocumentSelection | null): void {
    this._currentSelection = selection;
  }

  async createTextAnchor(selection: DocumentSelection): Promise<TextAnchor> {
    this.ensureOpen('createTextAnchor');

    if (selection.location.kind !== 'page') {
      throw DocumentError.anchorInvalid(
        `PDF adapter requires page location for anchor creation, got "${selection.location.kind}"`
      );
    }

    const payload = selection.location.payload as { pageNumber: number };
    return createPdfGeometryAnchor(
      this._source!.sourceHash,
      selection.text,
      payload.pageNumber,
      [
        {
          x: 0.1,
          y: 0.2,
          width: 0.8,
          height: 0.05,
        },
      ],
      selection.context
    );
  }

  async resolveTextAnchor(anchor: TextAnchor): Promise<ResolvedAnchor> {
    this.ensureOpen('resolveTextAnchor');

    // Schema version check
    if (anchor.schemaVersion > 1) {
      return {
        status: 'version-unsupported',
        confidence: 0,
        details: `Anchor schema version ${anchor.schemaVersion} is not supported.`,
      };
    }

    // Source hash safety check
    if (anchor.sourceHash !== this._source!.sourceHash) {
      return {
        status: 'source-mismatch',
        confidence: 0,
        details: `Anchor bound to source hash ${anchor.sourceHash.slice(0, 8)}..., active document is ${this._source!.sourceHash.slice(0, 8)}...`,
      };
    }

    // Kind check
    if (anchor.kind !== 'pdf-geometry') {
      return {
        status: 'unresolved',
        confidence: 0,
        details: `PDF adapter cannot resolve reflowable anchor kind "${anchor.kind}"`,
      };
    }

    const payload = anchor.payload as { pageNumber: number };
    const loc = createPageLocation(this._source!.sourceHash, payload.pageNumber, {
      totalPages: this._totalPages,
    });

    return {
      status: 'exact',
      location: loc,
      confidence: 1.0,
      details: `Resolved exactly to page ${payload.pageNumber}`,
    };
  }

  getCapabilities(): DocumentCapabilities {
    return STANDARD_PDF_CAPABILITIES;
  }
}
