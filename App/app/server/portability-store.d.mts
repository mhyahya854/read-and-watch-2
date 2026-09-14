import type {
  AnnotationsExportPackage,
  NotesExportPackage,
  CanvasExportPackage,
  LibraryMetadataExportPackage,
  BackupPackage,
  RestorePreflightReport,
  RestoreExecutionResult,
} from '../lib/portability/types.ts';

export interface PortabilityStoreOptions {
  databasePath: string;
  userDataRoot: string;
  libraryStore: unknown;
  annotationStore: unknown;
  readerStore: unknown;
  userDataStore: unknown;
  canvasStore: unknown;
  searchStore?: unknown;
}

export interface PortabilityStore {
  exportAnnotationsJson(options?: { itemId?: string; includeDeleted?: boolean }): AnnotationsExportPackage;
  exportAnnotationsMarkdown(options?: { itemId?: string; includeDeleted?: boolean }): string;
  exportNotes(options?: { itemId?: string }): NotesExportPackage;
  exportCanvasPackage(canvasId: string): CanvasExportPackage;
  exportAllCanvases(options?: { itemId?: string }): CanvasExportPackage[];
  exportLibraryMetadata(): LibraryMetadataExportPackage;
  createBackupBundle(): BackupPackage;
  exportAnnotatedPdf(options: {
    itemId: string;
    targetPath?: string;
    includeCommentsSummaryPage?: boolean;
  }): Promise<{
    ok: boolean;
    targetPath: string;
    pageCount: number;
    annotationsExported: number;
    sourceSha256: string;
  }>;
  preflightRestore(backupPackage: unknown): RestorePreflightReport;
  applyRestore(
    backupPackage: unknown,
    options?: { conflictResolution?: 'skip' | 'overwrite' | 'copy' }
  ): RestoreExecutionResult;
}

export function createPortabilityStore(options: PortabilityStoreOptions): PortabilityStore;
