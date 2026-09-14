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

export function createSourceFromCandidate(
  itemId: string,
  candidate: { id: string; format: string; sizeBytes: number; name: string }
): ReadonlyDocumentSource {
  const rawFormat = candidate.format.toLowerCase().trim();
  const format: DocumentFormat =
    rawFormat === 'pdf' ||
    rawFormat === 'epub' ||
    rawFormat === 'mobi' ||
    rawFormat === 'azw' ||
    rawFormat === 'azw3' ||
    rawFormat === 'cbz' ||
    rawFormat === 'fb2'
      ? rawFormat
      : 'unknown';

  return {
    itemId,
    formatId: candidate.id,
    format,
    sourceHash: candidate.id,
    byteSize: candidate.sizeBytes,
    title: candidate.name,
    resolverRef: candidate.id,
  };
}

export function createSampleSource(sampleId: string): ReadonlyDocumentSource {
  if (sampleId.includes('scan')) {
    return {
      itemId: sampleId,
      formatId: 'sample-scan-format',
      format: 'pdf',
      sourceHash: 'samplescanhash0000000000000000000000000000000000000000000000000000000',
      byteSize: 2048,
      title: 'Historical Archive Manuscript (Scanned Edition).pdf',
    };
  }
  if (sampleId.includes('pdf')) {
    return {
      itemId: sampleId,
      formatId: 'sample-pdf-format',
      format: 'pdf',
      sourceHash: 'samplepdfhash00000000000000000000000000000000000000000000000000000000',
      byteSize: 1024,
      title: 'Sample PDF Document',
    };
  }
  return {
    itemId: sampleId,
    formatId: 'media-sample',
    format: 'epub',
    sourceHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    byteSize: 524288,
    title: 'Domain Driven Reader Systems.epub',
  };
}

