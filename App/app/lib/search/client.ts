/**
 * Read & Watch Search Client API.
 *
 * Phase 11 — Search, Annotation Browser, and Study Workflow.
 */

import type {
  SearchQueryOptions,
  SearchResponse,
  SearchIndexMeta,
  FilterableBook,
} from './types';

export async function searchStudy(
  options: SearchQueryOptions,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const params = new URLSearchParams();
  if (options.query) params.set('q', options.query);
  if (options.typeFilter && options.typeFilter !== 'all') {
    params.set('type', options.typeFilter);
  }
  if (options.bookFilter) params.set('book', options.bookFilter);
  if (typeof options.limit === 'number') params.set('limit', String(options.limit));
  if (typeof options.offset === 'number') params.set('offset', String(options.offset));

  const res = await fetch(`/api/search?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error || `Search failed with status ${res.status}`);
  }

  return res.json();
}

export async function getSearchStatus(signal?: AbortSignal): Promise<SearchIndexMeta> {
  const res = await fetch('/api/search/status', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!res.ok) {
    throw new Error(`Failed to get search index status: ${res.status}`);
  }

  return res.json();
}

export async function rebuildSearchIndex(
  signal?: AbortSignal,
): Promise<{ ok: boolean; counts?: unknown; error?: string }> {
  const res = await fetch('/api/search/rebuild', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error || `Rebuild failed with status ${res.status}`);
  }

  return res.json();
}

export async function getFilterableBooks(
  signal?: AbortSignal,
): Promise<ReadonlyArray<FilterableBook>> {
  const res = await fetch('/api/search/books', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!res.ok) {
    return [];
  }

  return res.json();
}
