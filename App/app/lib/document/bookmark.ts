/**
 * Canonical Read & Watch Bookmark Definition.
 * Represents a user-marked reading location without engine-specific coupling.
 * Bookmarks are distinct from highlights/annotations (owned by Phase 09).
 */

import { type DocumentLocation, validateDocumentLocation } from './location.ts';
import { DocumentError } from './errors.ts';

export interface Bookmark {
  readonly id: string;
  readonly itemId: string;
  readonly location: DocumentLocation;
  readonly sourceHash: string;
  readonly createdAt: string;
  readonly label?: string;
  readonly snippet?: string;
  readonly pageNumber?: number;
  readonly progression?: number;
}

export function createBookmark(
  itemId: string,
  location: DocumentLocation,
  options: {
    id?: string;
    label?: string;
    snippet?: string;
    pageNumber?: number;
    progression?: number;
    createdAt?: string;
  } = {}
): Bookmark {
  if (!itemId || typeof itemId !== 'string') {
    throw DocumentError.invalidSource('Bookmark requires a valid string itemId');
  }

  const validLocation = validateDocumentLocation(location);

  const id =
    options.id ||
    `bm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    itemId,
    location: validLocation,
    sourceHash: validLocation.sourceHash,
    createdAt: options.createdAt || new Date().toISOString(),
    ...(options.label ? { label: options.label.trim() } : {}),
    ...(options.snippet ? { snippet: options.snippet.trim() } : {}),
    ...(options.pageNumber !== undefined ? { pageNumber: options.pageNumber } : {}),
    ...(options.progression !== undefined ? { progression: options.progression } : {}),
  };
}

export function validateBookmark(input: unknown): Bookmark {
  if (typeof input !== 'object' || input === null) {
    throw DocumentError.invalidSource('Bookmark must be a non-null object');
  }

  const record = input as Record<string, unknown>;

  if (typeof record.id !== 'string' || !record.id.trim()) {
    throw DocumentError.invalidSource('Bookmark missing id');
  }
  if (typeof record.itemId !== 'string' || !record.itemId.trim()) {
    throw DocumentError.invalidSource('Bookmark missing itemId');
  }
  if (typeof record.sourceHash !== 'string' || !record.sourceHash.trim()) {
    throw DocumentError.invalidSource('Bookmark missing sourceHash');
  }
  if (typeof record.createdAt !== 'string' || !record.createdAt.trim()) {
    throw DocumentError.invalidSource('Bookmark missing createdAt');
  }

  const location = validateDocumentLocation(record.location, record.sourceHash);

  return {
    id: record.id,
    itemId: record.itemId,
    location,
    sourceHash: record.sourceHash,
    createdAt: record.createdAt,
    ...(typeof record.label === 'string' ? { label: record.label } : {}),
    ...(typeof record.snippet === 'string' ? { snippet: record.snippet } : {}),
    ...(typeof record.pageNumber === 'number' ? { pageNumber: record.pageNumber } : {}),
    ...(typeof record.progression === 'number' ? { progression: record.progression } : {}),
  };
}
