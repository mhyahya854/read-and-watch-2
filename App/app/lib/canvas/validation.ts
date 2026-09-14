/**
 * Runtime Validators and Sanitization for Canvas Domain.
 * Phase 10 — Book-Linked Excalidraw Notes.
 */

import {
  CANVAS_SCHEMA_VERSION,
  type CanvasLifecycle,
  type CanvasLinkRecord,
  type CanvasAssetMeta,
  type ReadWatchCanvasDocument,
  type ExcalidrawSceneData,
} from './types.ts';

const VALID_LIFECYCLES: ReadonlySet<CanvasLifecycle> = new Set(['active', 'archived', 'soft-deleted']);
const ALLOWED_IMAGE_MIMES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const MAX_TITLE_LENGTH = 500;
const MAX_SCENE_ELEMENTS = 10_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

function fail(msg: string): never {
  throw new Error(`[CanvasValidation] ${msg}`);
}

function assertString(val: unknown, name: string, maxLen = 2000): string {
  if (typeof val !== 'string' || !val.trim()) fail(`${name} must be a non-empty string`);
  if (val.length > maxLen) fail(`${name} exceeds max length ${maxLen}`);
  return val;
}

function assertPositiveInteger(val: unknown, name: string): number {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 1) {
    fail(`${name} must be a positive integer >= 1`);
  }
  return val;
}

/**
 * Validates external or embedded URLs to prevent script execution or protocol escapes.
 * Permitted: http:, https:, mailto:, /reader/*, /canvas-notes/*
 * Prohibited: javascript:, file:, data:text/html, vbscript:, shell:
 */
export function sanitizeLinkUrl(url: string): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/html')
  ) {
    return null;
  }

  if (trimmed.startsWith('/') || lower.startsWith('http://') || lower.startsWith('https://')) {
    return trimmed;
  }

  return null;
}

/** Validate single canvas link record. */
export function validateCanvasLink(raw: unknown): CanvasLinkRecord {
  if (!raw || typeof raw !== 'object') fail('Canvas link must be an object');
  const r = raw as Record<string, unknown>;

  const id = assertString(r.id, 'link.id', 128);
  const canvasId = assertString(r.canvasId, 'link.canvasId', 128);
  const elementId = assertString(r.elementId, 'link.elementId', 128);
  const itemId = assertString(r.itemId, 'link.itemId', 128);

  let annotationId: string | null = null;
  if (r.annotationId !== undefined && r.annotationId !== null) {
    annotationId = assertString(r.annotationId, 'link.annotationId', 128);
  }

  let anchorJson: string | null = null;
  if (r.anchorJson !== undefined && r.anchorJson !== null) {
    if (typeof r.anchorJson !== 'string') fail('link.anchorJson must be a string if provided');
    try {
      JSON.parse(r.anchorJson);
    } catch {
      fail('link.anchorJson must be valid JSON');
    }
    anchorJson = r.anchorJson;
  }

  let label: string | undefined;
  if (typeof r.label === 'string') {
    label = r.label.slice(0, 1000);
  }

  const createdAt = typeof r.createdAt === 'string' && r.createdAt
    ? r.createdAt
    : new Date().toISOString();

  return {
    id,
    canvasId,
    elementId,
    itemId,
    annotationId,
    anchorJson,
    ...(label ? { label } : {}),
    createdAt,
  };
}

/** Validate canvas asset metadata. */
export function validateCanvasAssetMeta(raw: unknown): CanvasAssetMeta {
  if (!raw || typeof raw !== 'object') fail('Canvas asset must be an object');
  const r = raw as Record<string, unknown>;

  const id = assertString(r.id, 'asset.id', 128);
  const canvasId = assertString(r.canvasId, 'asset.canvasId', 128);
  const mimeType = assertString(r.mimeType, 'asset.mimeType', 100);

  if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
    fail(`Unsupported asset mimeType: ${mimeType}. Allowed: ${[...ALLOWED_IMAGE_MIMES].join(', ')}`);
  }

  const sizeBytes = assertPositiveInteger(r.sizeBytes, 'asset.sizeBytes');
  if (sizeBytes > MAX_IMAGE_BYTES) {
    fail(`Asset size ${sizeBytes} exceeds maximum allowed ${MAX_IMAGE_BYTES} bytes`);
  }

  const sha256 = assertString(r.sha256, 'asset.sha256', 64);
  if (sha256.length !== 64 || !/^[0-9a-f]{64}$/i.test(sha256)) {
    fail('asset.sha256 must be a 64-character hexadecimal SHA-256 string');
  }

  const originalName = typeof r.originalName === 'string' ? r.originalName.slice(0, 255) : 'unnamed';
  const relativePath = assertString(r.relativePath, 'asset.relativePath', 500);

  // Guard against path traversal in relativePath
  if (relativePath.includes('..') || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
    fail('asset.relativePath must not escape its directory');
  }

  const createdAt = typeof r.createdAt === 'string' && r.createdAt ? r.createdAt : new Date().toISOString();

  return {
    id,
    canvasId,
    mimeType,
    sizeBytes,
    sha256,
    originalName,
    relativePath,
    createdAt,
  };
}

/** Validate Excalidraw scene representation. */
export function validateSceneData(raw: unknown): ExcalidrawSceneData {
  if (!raw || typeof raw !== 'object') fail('Scene data must be an object');
  const r = raw as Record<string, unknown>;

  if (!Array.isArray(r.elements)) {
    fail('scene.elements must be an array');
  }
  if (r.elements.length > MAX_SCENE_ELEMENTS) {
    fail(`scene.elements count ${r.elements.length} exceeds maximum ${MAX_SCENE_ELEMENTS}`);
  }

  const files: ExcalidrawSceneData['files'] = {};
  if (r.files && typeof r.files === 'object' && !Array.isArray(r.files)) {
    for (const [key, val] of Object.entries(r.files)) {
      if (val && typeof val === 'object') {
        const fileObj = val as Record<string, unknown>;
        if (typeof fileObj.id === 'string' && typeof fileObj.dataURL === 'string') {
          files[key] = {
            id: fileObj.id,
            dataURL: fileObj.dataURL,
            mimeType: typeof fileObj.mimeType === 'string' ? fileObj.mimeType : 'image/png',
            created: typeof fileObj.created === 'number' ? fileObj.created : Date.now(),
            ...(typeof fileObj.lastRetrieved === 'number' ? { lastRetrieved: fileObj.lastRetrieved } : {}),
          };
        }
      }
    }
  }

  return {
    elements: r.elements,
    ...(r.appState && typeof r.appState === 'object' ? { appState: r.appState as ExcalidrawSceneData['appState'] } : {}),
    files,
  };
}

/** Validate a complete ReadWatchCanvasDocument. */
export function validateCanvasDocument(raw: unknown): ReadWatchCanvasDocument {
  if (!raw || typeof raw !== 'object') fail('Canvas document must be an object');
  const r = raw as Record<string, unknown>;

  if (r.schemaVersion !== CANVAS_SCHEMA_VERSION) {
    fail(`Unsupported canvas schemaVersion ${String(r.schemaVersion)}. Expected ${CANVAS_SCHEMA_VERSION}`);
  }

  const canvasId = assertString(r.canvasId, 'canvasId', 128);

  let itemId: string | null = null;
  if (r.itemId !== undefined && r.itemId !== null) {
    itemId = assertString(r.itemId, 'itemId', 128);
  }

  const title = typeof r.title === 'string' ? r.title.slice(0, MAX_TITLE_LENGTH) : 'Untitled Canvas';
  const revision = assertPositiveInteger(r.revision, 'revision');

  const lifecycle = (r.lifecycle as CanvasLifecycle) || 'active';
  if (!VALID_LIFECYCLES.has(lifecycle)) {
    fail(`Invalid lifecycle: ${lifecycle}. Allowed: ${[...VALID_LIFECYCLES].join(', ')}`);
  }

  const createdAt = assertString(r.createdAt, 'createdAt', 64);
  const updatedAt = assertString(r.updatedAt, 'updatedAt', 64);
  const deletedAt = typeof r.deletedAt === 'string' ? r.deletedAt : null;

  const scene = validateSceneData(r.scene || { elements: [] });

  const links: CanvasLinkRecord[] = Array.isArray(r.links)
    ? r.links.map(validateCanvasLink)
    : [];

  const assets: CanvasAssetMeta[] = Array.isArray(r.assets)
    ? r.assets.map(validateCanvasAssetMeta)
    : [];

  return {
    schemaVersion: CANVAS_SCHEMA_VERSION,
    canvasId,
    itemId,
    title,
    revision,
    lifecycle,
    createdAt,
    updatedAt,
    deletedAt,
    scene,
    links,
    assets,
  };
}

/** Serialize canvas document to formatted UTF-8 JSON. */
export function serializeCanvasDocument(doc: ReadWatchCanvasDocument): string {
  return JSON.stringify(validateCanvasDocument(doc), null, 2);
}

/** Deserialize and validate a JSON string as ReadWatchCanvasDocument. */
export function deserializeCanvasDocument(json: string): ReadWatchCanvasDocument {
  if (typeof json !== 'string' || !json.trim()) fail('JSON string cannot be empty');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    fail(`Malformed JSON: ${(err as Error).message}`);
  }
  return validateCanvasDocument(parsed);
}
