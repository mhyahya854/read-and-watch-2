/**
 * Read & Watch Normalized Search Domain Types.
 *
 * Phase 11 — Search, Annotation Browser, and Study Workflow.
 *
 * Architecture & Ownership:
 *   - The global search index is DERIVED and REBUILDABLE; it is never canonical.
 *   - Canonical stores: SQLite items/annotations/canvases/notes + bookmarks.json.
 *   - Book-local content search is separate and operates via DocumentAdapter.
 *   - Engine-specific types (PDF.js, Foliate-JS) MUST NEVER leak into this model.
 *   - All search queries, results, and index entries remain 100% local and offline.
 */

import type { DocumentLocation } from '@/lib/document/location';
import type { AnnotationAnchor } from '@/lib/annotation/types';

export const SEARCH_INDEX_SCHEMA_VERSION = 1 as const;

/** Canonical kinds of search results indexed in the derived store. */
export type SearchResultKind =
  | 'library-item'
  | 'annotation'
  | 'bookmark'
  | 'canvas'
  | 'note';

/** Filter types supported across library and study browser queries. */
export type StudyFilterType =
  | 'all'
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'comment'
  | 'excerpt'
  | 'bookmark'
  | 'drawing'
  | 'canvas'
  | 'note'
  | 'library-item';

/** Safe tokenized snippet for HTML-safe rendering without dangerouslySetInnerHTML. */
export interface SnippetToken {
  readonly text: string;
  readonly match: boolean;
}

/** Normalized canonical target for jumping directly to the source. */
export interface SearchTarget {
  readonly type: SearchResultKind;
  readonly itemId?: string;
  readonly assetId?: string;
  readonly annotationId?: string;
  readonly bookmarkId?: string;
  readonly canvasId?: string;
  readonly elementId?: string;
  readonly location?: DocumentLocation;
  readonly anchor?: AnnotationAnchor;
}

/** Unified normalized search result item. */
export interface SearchResultItem {
  readonly id: string;
  readonly kind: SearchResultKind;
  readonly subkind?: string;
  readonly itemId?: string;
  readonly bookTitle?: string;
  readonly title: string;
  readonly secondaryLabel?: string;
  readonly snippet: string;
  readonly snippetTokens: ReadonlyArray<SnippetToken>;
  readonly target: SearchTarget;
  readonly sourceHash?: string;
  readonly updatedAt?: string;
  readonly score?: number;
}

/** Status of the derived local search index. */
export type SearchIndexStatus =
  | 'ready'
  | 'rebuilding'
  | 'stale'
  | 'failed'
  | 'empty';

/** Diagnostics and state metadata for the derived search index. */
export interface SearchIndexMeta {
  readonly schemaVersion: typeof SEARCH_INDEX_SCHEMA_VERSION;
  readonly status: SearchIndexStatus;
  readonly lastRebuiltAtUtc: string | null;
  readonly counts: {
    readonly items: number;
    readonly annotations: number;
    readonly bookmarks: number;
    readonly canvases: number;
    readonly notes: number;
    readonly total: number;
  };
  readonly errorMessage?: string | null;
}

/** Parameters for querying the derived search store. */
export interface SearchQueryOptions {
  readonly query: string;
  readonly typeFilter?: StudyFilterType;
  readonly bookFilter?: string; // itemId
  readonly limit?: number;
  readonly offset?: number;
}

/** Server response payload from the unified search endpoint. */
export interface SearchResponse {
  readonly results: ReadonlyArray<SearchResultItem>;
  readonly total: number;
  readonly meta: SearchIndexMeta;
}

/** Filterable book option for the browser dropdown. */
export interface FilterableBook {
  readonly itemId: string;
  readonly title: string;
  readonly count: number;
}
