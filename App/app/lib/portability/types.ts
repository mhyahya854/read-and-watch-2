/**
 * Read & Watch Portable Schema Family — Public Types.
 *
 * Phase 12 — Export and Portability.
 *
 * Architecture:
 *   - Exports are representations of canonical data; they are NOT the runtime truth.
 *   - Every machine-restorable format declares `format` and `schemaVersion: 1`.
 *   - Future schema versions (> 1) must fail closed.
 *   - Zero absolute paths (OneDrive, C:\, machine roots) are ever emitted.
 *   - SHA-256 integrity checksums secure payloads.
 *   - Source EPUB/PDF files are NEVER modified or overwritten.
 */

import type { Annotation } from '../annotation/types.ts';
import type { Bookmark } from '../document/bookmark.ts';
import type { ReadWatchCanvasDocument } from '../canvas/types.ts';
import type { KnowledgeGraphDocument, MermaidDocument } from '../knowledge/types.ts';

export const PORTABILITY_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Stable Format Identifiers
// ---------------------------------------------------------------------------

export const PORTABLE_FORMATS = {
  ANNOTATIONS: 'read-watch.annotations',
  NOTES: 'read-watch.notes',
  CANVAS: 'read-watch-canvas-export', // Reuses Phase 10 .rwcanvas format
  LIBRARY_METADATA: 'read-watch.library-metadata',
  BACKUP: 'read-watch.backup',
  KNOWLEDGE_GRAPH: 'read-watch.knowledge-graph',
  MERMAID_DIAGRAM: 'read-watch.mermaid-diagram',
} as const;

export type PortableFormatId =
  typeof PORTABLE_FORMATS[keyof typeof PORTABLE_FORMATS];

// ---------------------------------------------------------------------------
// Base Envelope
// ---------------------------------------------------------------------------

export interface BaseExportEnvelope {
  readonly schemaVersion: typeof PORTABILITY_SCHEMA_VERSION;
  readonly format: string;
  readonly exportedAt: string; // ISO-8601 UTC
  readonly app: {
    readonly name: 'Read & Watch';
    readonly version: string;
  };
}

// ---------------------------------------------------------------------------
// Source Descriptor (Path-independent source reference)
// ---------------------------------------------------------------------------

export interface SourceDescriptor {
  readonly itemId: string;
  readonly assetId?: string;
  readonly sourceHash: string;
  readonly title?: string;
  readonly format?: string;
  readonly byteSize?: number;
}

// ---------------------------------------------------------------------------
// Annotations Export Schema (P12-T002)
// ---------------------------------------------------------------------------

export interface AnnotationsExportPackage extends BaseExportEnvelope {
  readonly format: typeof PORTABLE_FORMATS.ANNOTATIONS;
  readonly scope: 'item' | 'library';
  readonly source?: SourceDescriptor;
  readonly annotations: ReadonlyArray<Annotation>;
  readonly bookmarks?: ReadonlyArray<Bookmark>;
  readonly counts: {
    readonly textMarks: number;
    readonly comments: number;
    readonly excerpts: number;
    readonly drawings: number;
    readonly bookmarks: number;
    readonly total: number;
  };
  readonly checksumSha256?: string;
}

// ---------------------------------------------------------------------------
// Notes Export Schema (P12-T003)
// ---------------------------------------------------------------------------

export interface ItemNoteExport {
  readonly itemId: string;
  readonly title?: string;
  readonly sourceHash?: string;
  readonly thoughtsMarkdown?: string | null;
  readonly thoughtsModifiedAt?: string | null;
  readonly notesMarkdown?: string | null;
  readonly notesModifiedAt?: string | null;
}

export interface NotesExportPackage extends BaseExportEnvelope {
  readonly format: typeof PORTABLE_FORMATS.NOTES;
  readonly scope: 'item' | 'library';
  readonly notes: ReadonlyArray<ItemNoteExport>;
  readonly counts: {
    readonly itemsWithNotes: number;
    readonly itemsWithThoughts: number;
    readonly total: number;
  };
  readonly checksumSha256?: string;
}

// ---------------------------------------------------------------------------
// Canvas Export Schema (P12-T003 - Reusing Phase 10 .rwcanvas)
// ---------------------------------------------------------------------------

export interface CanvasExportPackage extends BaseExportEnvelope {
  readonly format: 'read-watch-canvas-export' | 'read-watch.canvas';
  readonly document: ReadWatchCanvasDocument;
  readonly checksumSha256?: string;
}

// ---------------------------------------------------------------------------
// Library Metadata Export Schema (P12-T004)
// ---------------------------------------------------------------------------

export interface PortableMediaDescriptor {
  readonly name: string;
  readonly extension: string;
  readonly sourceSha256?: string;
  readonly byteSize?: number;
}

export interface PortableItemMetadata {
  readonly id: string;
  readonly title: string;
  readonly collection: 'read' | 'watch';
  readonly itemType: string;
  readonly status: string;
  readonly sourceAdded: string | null;
  readonly summary: string | null;
  readonly tags: ReadonlyArray<string>;
  readonly notionProperties: Record<string, unknown>;
  readonly media: ReadonlyArray<PortableMediaDescriptor>;
  readonly relationshipIds: ReadonlyArray<string>;
}

export interface LibraryMetadataExportPackage extends BaseExportEnvelope {
  readonly format: typeof PORTABLE_FORMATS.LIBRARY_METADATA;
  readonly counts: {
    readonly read: number;
    readonly watch: number;
    readonly total: number;
  };
  readonly items: ReadonlyArray<PortableItemMetadata>;
  readonly libraryState?: LibraryStatePackage;
  readonly checksumSha256?: string;
}

export interface LibraryStateSavedView {
  readonly id: string;
  readonly name: string;
  readonly definition: unknown;
  readonly revision: number;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
}

export interface LibraryStateRelationship {
  readonly id: string;
  readonly sourceItemId: string;
  readonly targetItemId: string | null;
  readonly targetExternal: Record<string, unknown> | null;
  readonly relationshipType: string;
  readonly direction: 'directed' | 'undirected';
  readonly position: number;
  readonly provenance: Record<string, unknown>;
  readonly createdAtUtc: string;
}

export interface LibraryStatePackage {
  readonly schemaVersion: 1;
  readonly savedViews: ReadonlyArray<LibraryStateSavedView>;
  readonly relationships: ReadonlyArray<LibraryStateRelationship>;
}

// ---------------------------------------------------------------------------
// Full Backup Package Schema (P12-T004)
// ---------------------------------------------------------------------------

export interface BackupPackagePolicy {
  readonly sourceBooksIncluded: false;
  readonly description: string;
}

export interface BackupManifest {
  readonly backupId: string;
  readonly createdUtc: string;
  readonly appVersion: string;
  readonly memberCounts: {
    readonly items: number;
    readonly annotations: number;
    readonly bookmarks: number;
    readonly notes: number;
    readonly canvases: number;
    readonly canvasAssets: number;
    readonly knowledgeGraphs?: number;
    readonly mermaidDocuments?: number;
    readonly savedViews?: number;
    readonly relationships?: number;
  };
  readonly checksums: {
    readonly librarySha256: string;
    readonly annotationsSha256: string;
    readonly notesSha256: string;
    readonly canvasesSha256: string;
    readonly knowledgeSha256?: string;
    readonly libraryStateSha256?: string;
  };
}

export interface BackupPackage extends BaseExportEnvelope {
  readonly format: typeof PORTABLE_FORMATS.BACKUP;
  readonly backupId: string;
  readonly policy: BackupPackagePolicy;
  readonly manifest: BackupManifest;
  readonly library: LibraryMetadataExportPackage;
  readonly annotations: AnnotationsExportPackage;
  readonly notes: NotesExportPackage;
  readonly canvases: ReadonlyArray<CanvasExportPackage>;
  readonly libraryState?: LibraryStatePackage;
  readonly knowledge?: {
    readonly graphs: ReadonlyArray<KnowledgeGraphDocument>;
    readonly diagrams: ReadonlyArray<MermaidDocument>;
  };
  readonly checksumSha256?: string;
}

// ---------------------------------------------------------------------------
// Restore Preflight & Conflict Resolution (P12-T007)
// ---------------------------------------------------------------------------

export type ConflictKind =
  | 'IDENTICAL'
  | 'CONFLICT_DIVERGENT'
  | 'SOURCE_MISMATCH'
  | 'SOURCE_MISSING'
  | 'UNSUPPORTED_VERSION';

export interface RestoreConflict {
  readonly entityType: 'item' | 'annotation' | 'bookmark' | 'note' | 'canvas' | 'knowledge-graph' | 'mermaid-diagram';
  readonly entityId: string;
  readonly kind: ConflictKind;
  readonly message: string;
  readonly currentRevision?: number;
  readonly incomingRevision?: number;
}

export interface RestorePreflightReport {
  readonly canRestore: boolean;
  readonly schemaVersion: number;
  readonly format: string;
  readonly appVersion: string;
  readonly counts: {
    readonly incomingItems: number;
    readonly incomingAnnotations: number;
    readonly incomingBookmarks: number;
    readonly incomingNotes: number;
    readonly incomingCanvases: number;
  };
  readonly conflicts: ReadonlyArray<RestoreConflict>;
  readonly warnings: ReadonlyArray<string>;
}

export interface RestoreExecutionResult {
  readonly ok: boolean;
  readonly restoredCounts: {
    readonly items: number;
    readonly annotations: number;
    readonly bookmarks: number;
    readonly notes: number;
    readonly canvases: number;
  };
  readonly skippedCounts: {
    readonly items: number;
    readonly annotations: number;
    readonly bookmarks: number;
    readonly notes: number;
    readonly canvases: number;
  };
  readonly searchRebuilt: boolean;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Annotated PDF Export Options (P12-T005)
// ---------------------------------------------------------------------------

export interface AnnotatedPdfExportOptions {
  readonly itemId: string;
  readonly targetFilename?: string;
  readonly includeCommentsSummaryPage?: boolean;
}
