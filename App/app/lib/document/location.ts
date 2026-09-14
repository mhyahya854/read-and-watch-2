/**
 * Versioned Document Location Envelope.
 * Normalizes document navigation targets across PDF and reflowable document engines.
 */

import { DocumentError } from './errors.ts';

export const DOCUMENT_LOCATION_SCHEMA_VERSION = 1 as const;

export type LocationKind = 'page' | 'semantic' | 'progression';

export interface PageLocationPayload {
  readonly pageNumber: number; // 1-based page index
  readonly totalPages?: number;
  readonly normalizedCoordinates?: {
    readonly x: number; // 0.0 - 1.0 from left
    readonly y: number; // 0.0 - 1.0 from top
  };
  readonly scrollFraction?: number; // 0.0 - 1.0
}

export interface SemanticLocationPayload {
  readonly sectionId?: string;
  readonly cfi?: string;
  readonly spineIndex?: number;
  readonly progression?: number; // 0.0 - 1.0 within book or chapter
  readonly title?: string;
}

export interface ProgressionLocationPayload {
  readonly fraction: number; // 0.0 - 1.0 overall reading progress
  readonly label?: string;
}

export interface DocumentLocation {
  readonly schemaVersion: typeof DOCUMENT_LOCATION_SCHEMA_VERSION;
  readonly kind: LocationKind;
  readonly sourceHash: string;
  readonly payload: PageLocationPayload | SemanticLocationPayload | ProgressionLocationPayload;
}

export function createPageLocation(
  sourceHash: string,
  pageNumber: number,
  options: {
    totalPages?: number;
    normalizedCoordinates?: { x: number; y: number };
    scrollFraction?: number;
  } = {}
): DocumentLocation {
  if (pageNumber < 1 || !Number.isInteger(pageNumber)) {
    throw DocumentError.invalidSource(`Page number must be a positive integer, got ${pageNumber}`);
  }
  return {
    schemaVersion: DOCUMENT_LOCATION_SCHEMA_VERSION,
    kind: 'page',
    sourceHash,
    payload: {
      pageNumber,
      ...(options.totalPages !== undefined ? { totalPages: options.totalPages } : {}),
      ...(options.normalizedCoordinates !== undefined
        ? { normalizedCoordinates: options.normalizedCoordinates }
        : {}),
      ...(options.scrollFraction !== undefined ? { scrollFraction: options.scrollFraction } : {}),
    },
  };
}

export function createSemanticLocation(
  sourceHash: string,
  options: {
    sectionId?: string;
    cfi?: string;
    spineIndex?: number;
    progression?: number;
    title?: string;
  }
): DocumentLocation {
  return {
    schemaVersion: DOCUMENT_LOCATION_SCHEMA_VERSION,
    kind: 'semantic',
    sourceHash,
    payload: {
      ...(options.sectionId ? { sectionId: options.sectionId } : {}),
      ...(options.cfi ? { cfi: options.cfi } : {}),
      ...(options.spineIndex !== undefined ? { spineIndex: options.spineIndex } : {}),
      ...(options.progression !== undefined ? { progression: options.progression } : {}),
      ...(options.title ? { title: options.title } : {}),
    },
  };
}

export function createProgressionLocation(
  sourceHash: string,
  fraction: number,
  label?: string
): DocumentLocation {
  const bounded = Math.max(0, Math.min(1, fraction));
  return {
    schemaVersion: DOCUMENT_LOCATION_SCHEMA_VERSION,
    kind: 'progression',
    sourceHash,
    payload: {
      fraction: bounded,
      ...(label ? { label } : {}),
    },
  };
}

export function validateDocumentLocation(
  input: unknown,
  expectedSourceHash?: string
): DocumentLocation {
  if (typeof input !== 'object' || input === null) {
    throw DocumentError.invalidSource('Document location must be a non-null object');
  }

  const loc = input as Record<string, unknown>;

  if (loc.schemaVersion !== DOCUMENT_LOCATION_SCHEMA_VERSION) {
    throw DocumentError.invalidSource(
      `Unsupported document location schema version: ${String(loc.schemaVersion)} (expected ${DOCUMENT_LOCATION_SCHEMA_VERSION})`
    );
  }

  if (typeof loc.sourceHash !== 'string' || !loc.sourceHash.trim()) {
    throw DocumentError.invalidSource('Document location missing valid sourceHash');
  }

  if (expectedSourceHash && loc.sourceHash !== expectedSourceHash) {
    throw DocumentError.sourceChanged(expectedSourceHash, loc.sourceHash);
  }

  if (loc.kind !== 'page' && loc.kind !== 'semantic' && loc.kind !== 'progression') {
    throw DocumentError.invalidSource(`Unknown document location kind: ${String(loc.kind)}`);
  }

  if (typeof loc.payload !== 'object' || loc.payload === null) {
    throw DocumentError.invalidSource('Document location payload must be a non-null object');
  }

  const payload = loc.payload as Record<string, unknown>;

  if (loc.kind === 'page') {
    if (typeof payload.pageNumber !== 'number' || payload.pageNumber < 1) {
      throw DocumentError.invalidSource('Page location payload requires a positive pageNumber');
    }
  } else if (loc.kind === 'progression') {
    if (typeof payload.fraction !== 'number' || payload.fraction < 0 || payload.fraction > 1) {
      throw DocumentError.invalidSource('Progression location payload requires fraction between 0.0 and 1.0');
    }
  }

  return {
    schemaVersion: DOCUMENT_LOCATION_SCHEMA_VERSION,
    kind: loc.kind,
    sourceHash: loc.sourceHash,
    payload: payload as PageLocationPayload | SemanticLocationPayload | ProgressionLocationPayload,
  };
}

export function serializeDocumentLocation(loc: DocumentLocation): string {
  return JSON.stringify(loc);
}

export function deserializeDocumentLocation(
  jsonStr: string,
  expectedSourceHash?: string
): DocumentLocation {
  try {
    const parsed = JSON.parse(jsonStr);
    return validateDocumentLocation(parsed, expectedSourceHash);
  } catch (err) {
    if (DocumentError.isDocumentError(err)) {
      throw err;
    }
    throw DocumentError.invalidSource(`Failed to parse location JSON: ${String(err)}`);
  }
}

export function areDocumentLocationsEqual(a: DocumentLocation, b: DocumentLocation): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.schemaVersion !== b.schemaVersion || a.kind !== b.kind || a.sourceHash !== b.sourceHash) {
    return false;
  }
  if (a.kind === 'page' && b.kind === 'page') {
    const pa = a.payload as PageLocationPayload;
    const pb = b.payload as PageLocationPayload;
    return pa.pageNumber === pb.pageNumber;
  }
  if (a.kind === 'semantic' && b.kind === 'semantic') {
    const pa = a.payload as SemanticLocationPayload;
    const pb = b.payload as SemanticLocationPayload;
    if (pa.cfi && pb.cfi) return pa.cfi === pb.cfi;
    if (pa.sectionId && pb.sectionId) {
      if (pa.progression !== undefined && pb.progression !== undefined) {
        return pa.sectionId === pb.sectionId && Math.abs(pa.progression - pb.progression) < 0.001;
      }
      return pa.sectionId === pb.sectionId;
    }
    return pa.progression === pb.progression && pa.title === pb.title;
  }
  if (a.kind === 'progression' && b.kind === 'progression') {
    const pa = a.payload as ProgressionLocationPayload;
    const pb = b.payload as ProgressionLocationPayload;
    return Math.abs(pa.fraction - pb.fraction) < 0.001;
  }
  return false;
}
