/**
 * Safe, immutable Document Source Descriptor.
 * Identifies a document source by stable item ID and content hash without exposing
 * arbitrary filesystem paths to client presentation code.
 */

import { DocumentError } from './errors.ts';

export type DocumentFormat =
  | 'pdf'
  | 'epub'
  | 'mobi'
  | 'azw'
  | 'azw3'
  | 'cbz'
  | 'fb2'
  | 'unknown';

export interface ReadonlyDocumentSource {
  readonly itemId: string;
  readonly formatId: string;
  readonly format: DocumentFormat;
  readonly sourceHash: string;
  readonly byteSize?: number;
  readonly title?: string;
  /** Safe opaque resolver identifier or endpoint reference, NEVER an absolute filesystem path */
  readonly resolverRef?: string;
}

export function validateDocumentSource(input: unknown): ReadonlyDocumentSource {
  if (typeof input !== 'object' || input === null) {
    throw DocumentError.invalidSource('Source descriptor must be a non-null object');
  }

  const s = input as Record<string, unknown>;

  if (typeof s.itemId !== 'string' || !s.itemId.trim()) {
    throw DocumentError.invalidSource('itemId must be a non-empty string');
  }

  if (typeof s.formatId !== 'string' || !s.formatId.trim()) {
    throw DocumentError.invalidSource('formatId must be a non-empty string');
  }

  if (typeof s.format !== 'string' || !s.format.trim()) {
    throw DocumentError.invalidSource('format must be a valid document format string');
  }

  if (typeof s.sourceHash !== 'string' || !s.sourceHash.trim()) {
    throw DocumentError.invalidSource('sourceHash must be a non-empty content hash');
  }

  if (s.byteSize !== undefined && (typeof s.byteSize !== 'number' || s.byteSize < 0)) {
    throw DocumentError.invalidSource('byteSize must be a non-negative number if provided');
  }

  if (s.title !== undefined && typeof s.title !== 'string') {
    throw DocumentError.invalidSource('title must be a string if provided');
  }

  if (s.resolverRef !== undefined && typeof s.resolverRef !== 'string') {
    throw DocumentError.invalidSource('resolverRef must be a string if provided');
  }

  return {
    itemId: s.itemId.trim(),
    formatId: s.formatId.trim(),
    format: s.format.trim().toLowerCase() as DocumentFormat,
    sourceHash: s.sourceHash.trim(),
    ...(s.byteSize !== undefined ? { byteSize: s.byteSize } : {}),
    ...(s.title !== undefined ? { title: s.title } : {}),
    ...(s.resolverRef !== undefined ? { resolverRef: s.resolverRef } : {}),
  };
}
