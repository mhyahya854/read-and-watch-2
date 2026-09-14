/**
 * Read & Watch Canvas Domain Types — Public API.
 * Phase 10 — Book-Linked Excalidraw Notes.
 *
 * Architecture:
 *   - Read & Watch owns canonical canvas identity, book relationships, metadata, and deep links.
 *   - Excalidraw is encapsulated as the drawing/diagramming engine.
 *   - All canvas documents are versioned (CANVAS_SCHEMA_VERSION = 1).
 *   - No cloud-dependent or engine-owned canonical authority.
 */

export const CANVAS_SCHEMA_VERSION = 1 as const;

/** Canonical lifecycle status of a canvas document. */
export type CanvasLifecycle = 'active' | 'archived' | 'soft-deleted';

/** Metadata record stored in SQLite (canvases table). */
export interface CanvasMetadata {
  schemaVersion: 1;
  id: string; // stable UUID
  itemId: string | null; // null for unattached / standalone canvases
  title: string;
  documentRelativePath: string; // relative to userDataRoot
  revision: number;
  lifecycle: CanvasLifecycle;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
  deletedAt: string | null; // ISO 8601 UTC if soft-deleted
}

/** Canonical bidirectional deep link between a canvas element and a book / annotation. */
export interface CanvasLinkRecord {
  id: string; // stable UUID
  canvasId: string;
  elementId: string; // Excalidraw element ID
  itemId: string; // Read item ID
  annotationId: string | null; // Phase 09 annotation ID if linked to a specific highlight/mark
  anchorJson: string | null; // Serialized DocumentLocation or TextAnchor envelope
  label?: string; // Optional user label / excerpt preview
  createdAt: string; // ISO 8601 UTC
}

/** Tracked asset associated with a canvas (e.g., imported images, book diagrams). */
export interface CanvasAssetMeta {
  id: string; // stable UUID or SHA-256 asset hash
  canvasId: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  originalName: string;
  relativePath: string; // relative to canvas assets directory
  createdAt: string;
}

/** Excalidraw-compatible scene subset stored deterministically. */
export interface ExcalidrawSceneData {
  elements: readonly unknown[];
  appState?: {
    viewBackgroundColor?: string;
    gridSize?: number | null;
    theme?: 'light' | 'dark';
    scrollX?: number;
    scrollY?: number;
    zoom?: { value: number };
  };
  files?: Record<string, {
    id: string;
    dataURL: string;
    mimeType: string;
    created: number;
    lastRetrieved?: number;
  }>;
}

/** Full Read & Watch canvas document envelope persisted to external JSON and export packages. */
export interface ReadWatchCanvasDocument {
  schemaVersion: 1;
  canvasId: string;
  itemId: string | null;
  title: string;
  revision: number;
  lifecycle: CanvasLifecycle;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  scene: ExcalidrawSceneData;
  links: CanvasLinkRecord[];
  assets: CanvasAssetMeta[];
}

/** Canvas history entry for bounded recovery (up to 50 entries). */
export interface CanvasHistorySnapshot {
  canvasId: string;
  revision: number;
  timestamp: string;
  document: ReadWatchCanvasDocument;
}

/** Conflict response when optimistic revision mismatch occurs. */
export interface CanvasConflictResponse {
  error: 'Revision conflict';
  expectedRevision: number;
  currentRevision: number;
  canvasId: string;
}

/** Source hash check result when verifying book link targets. */
export interface CanvasLinkVerification {
  linkId: string;
  elementId: string;
  status: 'valid' | 'target-missing' | 'annotation-deleted' | 'source-changed';
  message?: string;
}
