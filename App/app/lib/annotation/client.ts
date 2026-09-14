/**
 * Read & Watch Annotation Client API.
 * Phase 09 / Phase 11 — Local, offline annotation operations.
 */

import type { Annotation } from './types';

export async function getAnnotations(
  itemId: string,
  options: { includeDeleted?: boolean } = {},
  signal?: AbortSignal,
): Promise<ReadonlyArray<Annotation>> {
  const query = options.includeDeleted ? '?includeDeleted=true' : '';
  const res = await fetch(`/api/reader/items/${encodeURIComponent(itemId)}/annotations${query}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!res.ok) {
    throw new Error(`Failed to load annotations: ${res.status}`);
  }

  return res.json();
}

export async function getAnnotation(
  itemId: string,
  annotationId: string,
  signal?: AbortSignal,
): Promise<Annotation | null> {
  const res = await fetch(
    `/api/reader/items/${encodeURIComponent(itemId)}/annotations/${encodeURIComponent(annotationId)}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    },
  );

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Failed to load annotation: ${res.status}`);
  }

  return res.json();
}

export async function createAnnotation(
  itemId: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Annotation> {
  const res = await fetch(`/api/reader/items/${encodeURIComponent(itemId)}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Failed to create annotation: ${res.status}`);
  }

  return res.json();
}

export async function updateAnnotation(
  itemId: string,
  annotationId: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Annotation> {
  const res = await fetch(
    `/api/reader/items/${encodeURIComponent(itemId)}/annotations/${encodeURIComponent(annotationId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Failed to update annotation: ${res.status}`);
  }

  return res.json();
}

export async function deleteAnnotation(
  itemId: string,
  annotationId: string,
  revision?: number,
  signal?: AbortSignal,
): Promise<{ ok: boolean }> {
  const res = await fetch(
    `/api/reader/items/${encodeURIComponent(itemId)}/annotations/${encodeURIComponent(annotationId)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: revision }),
      signal,
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Failed to delete annotation: ${res.status}`);
  }

  return res.json();
}

export async function restoreAnnotation(
  itemId: string,
  annotationId: string,
  revision?: number,
  signal?: AbortSignal,
): Promise<Annotation> {
  const res = await fetch(
    `/api/reader/items/${encodeURIComponent(itemId)}/annotations/${encodeURIComponent(annotationId)}/restore`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: revision }),
      signal,
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Failed to restore annotation: ${res.status}`);
  }

  return res.json();
}
