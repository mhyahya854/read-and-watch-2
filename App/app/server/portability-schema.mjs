/**
 * Read & Watch Portable Schema Family & Validation (Server Pure ESM).
 *
 * Phase 12 — Export and Portability.
 *
 * Architecture:
 *   - Pure ECMAScript (.mjs) suitable for direct Node.js / Electron main execution.
 *   - Zero dependencies on uncompiled TypeScript (.ts) files.
 *   - Canonical schema versioning guard (schemaVersion > 1 fails closed).
 *   - Strict path traversal and injection protections.
 */

export const PORTABILITY_SCHEMA_VERSION = 1;

export const PORTABLE_FORMATS = {
  ANNOTATIONS: 'read-watch.annotations',
  NOTES: 'read-watch.notes',
  CANVAS: 'read-watch-canvas-export',
  LIBRARY_METADATA: 'read-watch.library-metadata',
  BACKUP: 'read-watch.backup',
  KNOWLEDGE_GRAPH: 'read-watch.knowledge-graph',
  MERMAID_DIAGRAM: 'read-watch.mermaid-diagram',
};

export class PortabilityValidationError extends Error {
  constructor(message, code = 'INVALID_PORTABLE_SCHEMA', status = 400) {
    super(message);
    this.name = 'PortabilityValidationError';
    this.code = code;
    this.status = status;
  }
}

const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

/** Check if a string contains prohibited absolute path or traversal characters. */
export function assertSafePath(path, fieldLabel = 'path') {
  if (typeof path !== 'string' || !path.trim()) {
    throw new PortabilityValidationError(`Empty ${fieldLabel} is not allowed`);
  }
  if (path.includes('\0')) {
    throw new PortabilityValidationError(`Null bytes forbidden in ${fieldLabel}`);
  }
  if (/^[a-zA-Z]:/.test(path)) {
    throw new PortabilityValidationError(`Absolute drive path forbidden in ${fieldLabel}: ${path}`);
  }
  if (path.includes(':')) {
    throw new PortabilityValidationError(`Alternate data streams and colons forbidden in ${fieldLabel}: ${path}`);
  }
  if (/%2e|%2f|%5c/i.test(path)) {
    throw new PortabilityValidationError(`Percent-encoded path characters forbidden in ${fieldLabel}: ${path}`);
  }
  if (path.startsWith('/') || path.startsWith('\\')) {
    throw new PortabilityValidationError(`Root-relative path forbidden in ${fieldLabel}: ${path}`);
  }
  const segments = path.split(/[/\\]/);
  for (const seg of segments) {
    if (seg === '..' || seg === '.') {
      throw new PortabilityValidationError(`Directory traversal forbidden in ${fieldLabel}: ${path}`);
    }
    if (WINDOWS_RESERVED_NAMES.test(seg)) {
      throw new PortabilityValidationError(`Reserved Windows device name forbidden in ${fieldLabel}: ${seg}`);
    }
    if (seg.endsWith('.') || seg.endsWith(' ')) {
      throw new PortabilityValidationError(`Trailing dot or space forbidden in path segment: ${seg}`);
    }
  }
  if (path.includes('OneDrive') || path.includes('Users') || path.includes('AppData')) {
    throw new PortabilityValidationError(`Personal machine path detected in ${fieldLabel}: ${path}`);
  }
}

/** Sanitize an export filename to prevent traversal and reserved Windows characters. */
export function sanitizeExportFilename(name, fallback = 'export') {
  const sanitized = name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replaceAll('\0', '-')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized || fallback;
}

/** Base validation for any export envelope. */
export function validateBaseEnvelope(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new PortabilityValidationError('Payload must be a non-null JSON object');
  }

  const record = obj;
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

  const format = record.format;
  if (typeof format !== 'string' || !format.trim()) {
    throw new PortabilityValidationError('Missing or invalid format identifier');
  }

  return {
    schemaVersion: version,
    format,
    exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : new Date().toISOString(),
    app: {
      name: 'Read & Watch',
      version: typeof record.app?.version === 'string' ? String(record.app.version) : '0.1.0',
    },
  };
}

/** Validate Annotations Export Package. */
export function validateAnnotationsPackage(obj) {
  const base = validateBaseEnvelope(obj);
  if (base.format !== PORTABLE_FORMATS.ANNOTATIONS) {
    throw new PortabilityValidationError(
      `Expected format ${PORTABLE_FORMATS.ANNOTATIONS}, got ${base.format}`,
    );
  }

  const record = obj;
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
    const annot = a;
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

  return record;
}

/** Validate Notes Export Package. */
export function validateNotesPackage(obj) {
  const base = validateBaseEnvelope(obj);
  if (base.format !== PORTABLE_FORMATS.NOTES) {
    throw new PortabilityValidationError(
      `Expected format ${PORTABLE_FORMATS.NOTES}, got ${base.format}`,
    );
  }

  const record = obj;
  if (!Array.isArray(record.notes)) {
    throw new PortabilityValidationError('Missing notes array in notes export package');
  }

  for (const n of record.notes) {
    if (!n || typeof n !== 'object') {
      throw new PortabilityValidationError('Note entry must be an object');
    }
    const note = n;
    if (typeof note.itemId !== 'string' || !note.itemId.trim()) {
      throw new PortabilityValidationError('Note entry missing itemId');
    }
  }

  return record;
}

/** Validate Library Metadata Export Package. */
export function validateLibraryMetadataPackage(obj) {
  const base = validateBaseEnvelope(obj);
  if (base.format !== PORTABLE_FORMATS.LIBRARY_METADATA) {
    throw new PortabilityValidationError(
      `Expected format ${PORTABLE_FORMATS.LIBRARY_METADATA}, got ${base.format}`,
    );
  }

  const record = obj;
  if (!Array.isArray(record.items)) {
    throw new PortabilityValidationError('Missing items array in library metadata package');
  }

  for (const item of record.items) {
    if (!item || typeof item !== 'object') {
      throw new PortabilityValidationError('Item entry must be an object');
    }
    const it = item;
    if (typeof it.id !== 'string' || !it.id.trim()) {
      throw new PortabilityValidationError('Library item missing id');
    }
    if (typeof it.title !== 'string') {
      throw new PortabilityValidationError(`Library item ${it.id} missing title`);
    }
    if (it.collection !== 'read' && it.collection !== 'watch') {
      throw new PortabilityValidationError(`Library item ${it.id} invalid collection: ${String(it.collection)}`);
    }
    if (Array.isArray(it.media)) {
      for (const m of it.media) {
        if (m && typeof m === 'object' && typeof m.name === 'string') {
          assertSafePath(m.name, 'media filename');
        }
      }
    }
  }

  return record;
}

/** Validate Full Backup Package. */
export function validateBackupPackage(obj) {
  const base = validateBaseEnvelope(obj);
  if (base.format !== PORTABLE_FORMATS.BACKUP) {
    throw new PortabilityValidationError(
      `Expected format ${PORTABLE_FORMATS.BACKUP}, got ${base.format}`,
    );
  }

  const record = obj;
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

  return record;
}

/** Validate Knowledge Graph Package. */
export function validateKnowledgeGraphPackage(obj) {
  const base = validateBaseEnvelope(obj);
  if (base.format !== PORTABLE_FORMATS.KNOWLEDGE_GRAPH) {
    throw new PortabilityValidationError(
      `Expected format ${PORTABLE_FORMATS.KNOWLEDGE_GRAPH}, got ${base.format}`,
    );
  }
  const record = obj;
  if (!record.graph || typeof record.graph !== 'object') {
    throw new PortabilityValidationError('Knowledge graph package missing graph object');
  }
  return record;
}

/** Validate Mermaid Diagram Package. */
export function validateMermaidDiagramPackage(obj) {
  const base = validateBaseEnvelope(obj);
  if (base.format !== PORTABLE_FORMATS.MERMAID_DIAGRAM) {
    throw new PortabilityValidationError(
      `Expected format ${PORTABLE_FORMATS.MERMAID_DIAGRAM}, got ${base.format}`,
    );
  }
  const record = obj;
  if (!record.diagram || typeof record.diagram !== 'object') {
    throw new PortabilityValidationError('Mermaid diagram package missing diagram object');
  }
  return record;
}
