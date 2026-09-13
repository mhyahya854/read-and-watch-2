/**
 * Fake Reflowable Adapter for Contract Fixture and Conformance Testing.
 * Models a reflowable, semantic/CFI-oriented document engine without Foliate dependencies.
 */

import { DocumentError } from '../errors.ts';
import { type DocumentCapabilities, STANDARD_REFLOWABLE_CAPABILITIES } from '../capabilities.ts';
import { type ReadonlyDocumentSource } from '../source.ts';
import { type DocumentLocation, createSemanticLocation } from '../location.ts';
import {
  type TextAnchor,
  type ResolvedAnchor,
  createReflowableRangeAnchor,
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

export class FakeReflowableAdapter implements DocumentAdapter {
  private _state: AdapterLifecycleState = 'created';
  private _source: ReadonlyDocumentSource | null = null;
  private _currentChapter = 1;
  private readonly _totalChapters = 5;
  private _currentProgression = 0.0;
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
      throw DocumentError.cancelled('Open Reflowable Book');
    }

    this._source = source;
    this._currentChapter = 1;
    this._currentProgression = 0.0;
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
      title: this._source?.title || 'Sample Reflowable Book',
      author: 'Reflowable Author',
      format: 'epub',
      description: 'A test double representing a 5-chapter reflowable EPUB publication.',
      language: 'en',
    };
  }

  async getTOC(): Promise<ReadonlyArray<TocEntry>> {
    this.ensureOpen('getTOC');
    const hash = this._source!.sourceHash;
    return [
      {
        id: 'toc-chap-1',
        title: 'Chapter 1: The Principle of Architecture',
        targetLocation: createSemanticLocation(hash, {
          sectionId: 'chap-1',
          spineIndex: 0,
          progression: 0.0,
          title: 'Chapter 1',
        }),
      },
      {
        id: 'toc-chap-2',
        title: 'Chapter 2: The Adapter Pattern',
        targetLocation: createSemanticLocation(hash, {
          sectionId: 'chap-2',
          spineIndex: 1,
          progression: 0.2,
          title: 'Chapter 2',
        }),
      },
      {
        id: 'toc-chap-3',
        title: 'Chapter 3: Capability Inversion',
        targetLocation: createSemanticLocation(hash, {
          sectionId: 'chap-3',
          spineIndex: 2,
          progression: 0.4,
          title: 'Chapter 3',
        }),
      },
      {
        id: 'toc-chap-4',
        title: 'Chapter 4: Durable State',
        targetLocation: createSemanticLocation(hash, {
          sectionId: 'chap-4',
          spineIndex: 3,
          progression: 0.6,
          title: 'Chapter 4',
        }),
      },
      {
        id: 'toc-chap-5',
        title: 'Chapter 5: Conformance Certification',
        targetLocation: createSemanticLocation(hash, {
          sectionId: 'chap-5',
          spineIndex: 4,
          progression: 0.8,
          title: 'Chapter 5',
        }),
      },
    ];
  }

  async getCurrentLocation(): Promise<DocumentLocation> {
    this.ensureOpen('getCurrentLocation');
    return createSemanticLocation(this._source!.sourceHash, {
      sectionId: `chap-${this._currentChapter}`,
      spineIndex: this._currentChapter - 1,
      progression: this._currentProgression,
      title: `Chapter ${this._currentChapter}`,
    });
  }

  async goTo(location: DocumentLocation, signal?: AbortSignal): Promise<void> {
    this.ensureOpen('goTo');

    if (signal?.aborted) {
      throw DocumentError.cancelled('Navigation');
    }

    if (location.kind !== 'semantic' && location.kind !== 'progression') {
      throw DocumentError.navigationFailed(
        `Reflowable adapter requires semantic or progression location, received kind "${location.kind}"`
      );
    }

    if (location.kind === 'semantic') {
      const payload = location.payload as { spineIndex?: number; progression?: number };
      if (payload.spineIndex !== undefined) {
        if (payload.spineIndex < 0 || payload.spineIndex >= this._totalChapters) {
          throw DocumentError.navigationFailed(`Spine index ${payload.spineIndex} out of range`);
        }
        this._currentChapter = payload.spineIndex + 1;
      }
      this._currentProgression = payload.progression ?? 0.0;
    } else {
      const payload = location.payload as { fraction: number };
      this._currentProgression = payload.fraction;
      this._currentChapter = Math.min(
        this._totalChapters,
        Math.floor(payload.fraction * this._totalChapters) + 1
      );
    }
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

    // Simulate search hits across chapters
    const hits = [1, 2, 4];
    for (const chap of hits) {
      if (signal?.aborted) {
        throw DocumentError.cancelled('Search');
      }
      results.push({
        id: `reflowable-hit-chap-${chap}`,
        matchText: query,
        snippet: `...occurring inside section ${chap} matching query "${query}"...`,
        location: createSemanticLocation(hash, {
          sectionId: `chap-${chap}`,
          spineIndex: chap - 1,
          progression: (chap - 1) / this._totalChapters,
          title: `Chapter ${chap}`,
        }),
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
      return {
        text: 'Software abstractions should reflect natural domain boundaries.',
        location: createSemanticLocation(this._source!.sourceHash, {
          sectionId: `chap-${this._currentChapter}`,
          cfi: `epubcfi(/6/${this._currentChapter * 2}[chap${this._currentChapter}]!/4/2/10)`,
          spineIndex: this._currentChapter - 1,
          progression: this._currentProgression,
          title: `Chapter ${this._currentChapter}`,
        }),
        context: {
          prefix: 'As noted earlier, ',
          suffix: ' This remains authoritative.',
        },
      };
    }
    return this._currentSelection;
  }

  setSelection(selection: DocumentSelection | null): void {
    this._currentSelection = selection;
  }

  async createTextAnchor(selection: DocumentSelection): Promise<TextAnchor> {
    this.ensureOpen('createTextAnchor');

    if (selection.location.kind !== 'semantic') {
      throw DocumentError.anchorInvalid(
        `Reflowable adapter requires semantic location for anchor creation, got "${selection.location.kind}"`
      );
    }

    const payload = selection.location.payload as { spineIndex?: number; cfi?: string };
    return createReflowableRangeAnchor(
      this._source!.sourceHash,
      selection.text,
      {
        spineIndex: payload.spineIndex ?? 0,
        startCfi: payload.cfi ?? 'epubcfi(/6/2!/4/1:0)',
        endCfi: payload.cfi ? `${payload.cfi}:45` : 'epubcfi(/6/2!/4/1:45)',
      },
      selection.context
    );
  }

  async resolveTextAnchor(anchor: TextAnchor): Promise<ResolvedAnchor> {
    this.ensureOpen('resolveTextAnchor');

    if (anchor.schemaVersion > 1) {
      return {
        status: 'version-unsupported',
        confidence: 0,
        details: `Anchor schema version ${anchor.schemaVersion} is not supported.`,
      };
    }

    if (anchor.sourceHash !== this._source!.sourceHash) {
      return {
        status: 'source-mismatch',
        confidence: 0,
        details: `Anchor bound to source hash ${anchor.sourceHash.slice(0, 8)}..., active document is ${this._source!.sourceHash.slice(0, 8)}...`,
      };
    }

    if (anchor.kind !== 'reflowable-range') {
      return {
        status: 'unresolved',
        confidence: 0,
        details: `Reflowable adapter cannot resolve fixed-layout anchor kind "${anchor.kind}"`,
      };
    }

    const payload = anchor.payload as { spineIndex?: number; startCfi?: string };
    const loc = createSemanticLocation(this._source!.sourceHash, {
      sectionId: `chap-${(payload.spineIndex ?? 0) + 1}`,
      spineIndex: payload.spineIndex ?? 0,
      cfi: payload.startCfi,
      title: `Chapter ${(payload.spineIndex ?? 0) + 1}`,
    });

    return {
      status: 'exact',
      location: loc,
      confidence: 1.0,
      details: 'Resolved exactly via CFI / spine location',
    };
  }

  getCapabilities(): DocumentCapabilities {
    return STANDARD_REFLOWABLE_CAPABILITIES;
  }
}
