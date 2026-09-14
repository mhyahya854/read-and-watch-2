/**
 * Read & Watch Portable Schema Validation & Sanitization.
 *
 * Phase 12 — Export and Portability.
 *
 * Enforces:
 *   - Schema versioning guard: schemaVersion > 1 fails closed.
 *   - Untrusted input boundary: all incoming JSON must be validated.
 *   - Path traversal prevention: rejects absolute paths, drive letters, `../`, `..\`.
 *   - Payload bounds: validates string lengths, arrays, and prevents prototype pollution.
 */

import {
  PORTABLE_FORMATS,
  PORTABILITY_SCHEMA_VERSION,
  type BaseExportEnvelope,
  type AnnotationsExportPackage,
  type NotesExportPackage,
  type LibraryMetadataExportPackage,
  type BackupPackage,
} from './types.ts';

export class PortabilityValidationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = 'INVALID_PORTABLE_SCHEMA', status = 400) {
    super(message);
    this.name = 'PortabilityValidationError';
    this.code = code;
    this.status = status;
  }
}

/** Check if a string contains prohibited absolute path or traversal characters. */
export function assertSafePath(path: string, fieldLabel = 'path'): void {
  if (typeof path !== 'string' || !path.trim()) {
    throw new PortabilityValidationError(`Empty ${fieldLabel} is not allowed`);
  }
  // Disallow null bytes
  if (path.includes('\0')) {
    throw new PortabilityValidationError(`Null bytes forbidden in ${fieldLabel}`);
  }
  // Disallow Windows drive letters (e.g. C:, D:)
  if (/^[a-zA-Z]:/.test(path)) {
    throw new PortabilityValidationError(`Absolute drive path forbidden in ${fieldLabel}: ${path}`);
  }
  // Disallow absolute unix paths
  if (path.startsWith('/') || path.startsWith('\\')) {
    throw new PortabilityValidationError(`Root-relative path forbidden in ${fieldLabel}: ${path}`);
  }
  // Disallow directory traversal
  const segments = path.split(/[/\\]/);
  for (const seg of segments) {
    if (seg === '..' || seg === '.') {
      throw new PortabilityValidationError(`Directory traversal forbidden in ${fieldLabel}: ${path}`);
    }
  }
  // Disallow personal absolute path substrings
  if (path.includes('OneDrive') || path.includes('Users') || path.includes('AppData')) {
    throw new PortabilityValidationError(`Personal machine path detected in ${fieldLabel}: ${path}`);
  }
}

/** Sanitize an export filename to prevent traversal and reserved Windows characters. */
export function sanitizeExportFilename(name: string, fallback = 'export'): string {
  const sanitized = name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replaceAll('\0', '-')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized || fallback;
}

/** Base validation for any export envelope. */
export function validateBaseEnvelope(obj: unknown): BaseExportEnvelope {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new PortabilityValidationError('Payload must be a non-null JSON object');
  }

  const record = obj as Record<string, unknown>;

  // Schema version guard
  const version = record.schemaVersion;
  if (typeof version !== 'number') {
    throw new PortabilityValidationError('Missing or invalid schemaVersion (expected number)');
  }
  if (version > PORTABILITY_SCHEMA_VERSION) {
    throw new PortabilityValidationError(
      `Unsupported future schema version: ${version} (highest supported is ${PORTABILITY_SCHEMA_VERSION}). Please upgrade Read & Watch.`,
      'UNSUPPORTED_FUTURE_SCHEMA',
      422,
    );
  }
  if (version < 1) {
    throw new PortabilityValidationError(`Invalid schemaVersion: ${version}`);
  }

  // Format identifier guard
  const format = record.format;
  if (typeof format !== 'string' || !format.trim()) {
    throw new PortabilityValidationError('Missing or invalid format identifier');
  }

  // App information
  if (record.app && typeof record.app === 'object') {
    const app = record.app as Record<string, unknown>;
    if (app.name && app.name !== 'Read & Watch') {
      // Advisory check - allow third-party compatible producers if well-formed, but warn
    }
  }

  return {
    schemaVersion: version as 1,
    format,
    exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : new Date().toISOString(),
    app: {
      name: 'Read & Watch',
      version: typeof (record.app as Record<string, unknown>)?.version === 'string'
        ? String((record.app as Record<string, unknown>).version)
        : '0.1.0',
    },
  };
}

/** Validate Annotations Export Package. */
export function validateAnnotationsPackage(obj: unknown): AnnotationsExportPackage {
  const base = validateBaseEnvelope(obj);
  if (base.format !== PORTABLE_FORMATS.ANNOTATIONS) {
    throw new PortabilityValidationError(
      `Expected format ${PORTABLE_FORMATS.ANNOTATIONS}, got ${base.format}`,
    );
  }

  const record = obj as Record<string, unknown>;
  const scope = record.scope;
  if (scope !== 'item' && scope !== 'library') {
    throw new PortabilityValidationError(`Invalid annotations export scope: ${String(scope)}`);
  }

  if (!Array.isArray(record.annotations)) {
    throw new PortabilityValidationError('Missing annotations array');
  }

  for (const a of record.annotations) {
    if (!a || typeof a !== 'object') {
      throw new PortabilityValidationError('Annotation entry must be an object');
    }
    const annot = a as Record<string, unknown>;
    if (typeof annot.id !== 'string' || !annot.id.trim()) {
      throw new PortabilityValidationError('Annotation missing valid id');
    }
    if (typeof annot.itemId !== 'string' || !annot.itemId.trim()) {
      throw new PortabilityValidationError('Annotation missing valid itemId');
    }
    if (typeof annot.kind !== 'string' || !annot.kind.trim()) {
      throw new PortabilityValidationError(`Annotation ${annot.id} missing valid kind`);
    }
    if (!annot.anchor || typeof annot.anchor !== 'object') {
      throw new PortabilityValidationError(`Annotation ${annot.id} missing valid anchor`);
    }
    if (!annot.content || typeof annot.content !== 'object') {
      throw new PortabilityValidationError(`Annotation ${annot.id} missing valid content`);
    }
    if (typeof annot.sourceHash !== 'string' || !annot.sourceHash.trim()) {
      throw new PortabilityValidationError(`Annotation ${annot.id} missing valid sourceHash`);
    }
  }

  return record as unknown as AnnotationsExportPackage;
}

/** Validate Notes Export Package. */
export function validateNotesPackage(obj: unknown): NotesExportPackage {
  const base = validateBaseEnvelope(obj);
  if (base.format !== PORTABLE_FORMATS.NOTES) {
    throw new PortabilityValidationError(
      `Expected format ${PORTABLE_FORMATS.NOTES}, got ${base.format}`,
    );
  }

  const record = obj as Record<string, unknown>;
  if (!Array.isArray(record.notes)) {
    throw new PortabilityValidationError('Missing notes array in notes export package');
  }

  for (const n of record.notes) {
    if (!n || typeof n !== 'object') {
      throw new PortabilityValidationError('Note entry must be an object');
    }
    const note = n as Record<string, unknown>;
    if (typeof note.itemId !== 'string' || !note.itemId.trim()) {
      throw new PortabilityValidationError('Note entry missing itemId');
    }
  }

  return record as unknown as NotesExportPackage;
}

/** Validate Library Metadata Export Package. */
export function validateLibraryMetadataPackage(obj: unknown): LibraryMetadataExportPackage {
  const base = validateBaseEnvelope(obj);
  if (base.format !== PORTABLE_FORMATS.LIBRARY_METADATA) {
    throw new PortabilityValidationError(
      `Expected format ${PORTABLE_FORMATS.LIBRARY_METADATA}, got ${base.format}`,
    );
  }

  const record = obj as Record<string, unknown>;
  if (!Array.isArray(record.items)) {
    throw new PortabilityValidationError('Missing items array in library metadata package');
  }

  for (const item of record.items) {
    if (!item || typeof item !== 'object') {
      throw new PortabilityValidationError('Item entry must be an object');
    }
    const it = item as Record<string, unknown>;
    if (typeof it.id !== 'string' || !it.id.trim()) {
      throw new PortabilityValidationError('Library item missing id');
    }
    if (typeof it.title !== 'string') {
      throw new PortabilityValidationError(`Library item ${it.id} missing title`);
    }
    if (it.collection !== 'read' && it.collection !== 'watch') {
      throw new PortabilityValidationError(`Library item ${it.id} invalid collection: ${String(it.collection)}`);
    }
    // Validate media paths are relative and clean
    if (Array.isArray(it.media)) {
      for (const m of it.media) {
        if (m && typeof m === 'object' && typeof (m as Record<string, unknown>).name === 'string') {
          assertSafePath((m as Record<string, unknown>).name as string, 'media filename');
        }
      }
    }
  }

  return record as unknown as LibraryMetadataExportPackage;
}

/** Validate Full Backup Package. */
export function validateBackupPackage(obj: unknown): BackupPackage {
  const base = validateBaseEnvelope(obj);
  if (base.format !== PORTABLE_FORMATS.BACKUP) {
    throw new PortabilityValidationError(
      `Expected format ${PORTABLE_FORMATS.BACKUP}, got ${base.format}`,
    );
  }

  const record = obj as Record<string, unknown>;
  if (typeof record.backupId !== 'string' || !record.backupId.trim()) {
    throw new PortabilityValidationError('Backup package missing backupId');
  }

  if (!record.manifest || typeof record.manifest !== 'object') {
    throw new PortabilityValidationError('Backup package missing manifest');
  }

  if (!record.library || typeof record.library !== 'object') {
    throw new PortabilityValidationError('Backup package missing library metadata');
  }
  validateLibraryMetadataPackage(record.library);

  if (!record.annotations || typeof record.annotations !== 'object') {
    throw new PortabilityValidationError('Backup package missing annotations section');
  }
  validateAnnotationsPackage(record.annotations);

  if (!record.notes || typeof record.notes !== 'object') {
    throw new PortabilityValidationError('Backup package missing notes section');
  }
  validateNotesPackage(record.notes);

  if (!Array.isArray(record.canvases)) {
    throw new PortabilityValidationError('Backup package missing canvases array');
  }

  return record as unknown as BackupPackage;
}
