/**
 * Client-side API for Read & Watch Portability & Export.
 *
 * Phase 12 — Export and Portability.
 */

import type {
  AnnotationsExportPackage,
  NotesExportPackage,
  CanvasExportPackage,
  LibraryMetadataExportPackage,
  RestorePreflightReport,
  RestoreExecutionResult,
} from './types.ts';

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function fetchAnnotationsJson(itemId?: string): Promise<AnnotationsExportPackage> {
  const url = itemId
    ? `/api/portability/annotations?itemId=${encodeURIComponent(itemId)}&format=json`
    : '/api/portability/annotations?format=json';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to export annotations: ${res.statusText}`);
  return res.json();
}

export async function downloadAnnotationsJson(itemId?: string, titleHint = 'annotations'): Promise<void> {
  const data = await fetchAnnotationsJson(itemId);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const filename = `${titleHint.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-annotations.json`;
  triggerBrowserDownload(blob, filename);
}

export async function downloadAnnotationsMarkdown(itemId?: string, titleHint = 'annotations'): Promise<void> {
  const url = itemId
    ? `/api/portability/annotations?itemId=${encodeURIComponent(itemId)}&format=markdown`
    : '/api/portability/annotations?format=markdown';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to export markdown annotations: ${res.statusText}`);
  const blob = await res.blob();
  const filename = `${titleHint.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-annotations.md`;
  triggerBrowserDownload(blob, filename);
}

export async function fetchNotes(itemId?: string): Promise<NotesExportPackage> {
  const url = itemId
    ? `/api/portability/notes?itemId=${encodeURIComponent(itemId)}`
    : '/api/portability/notes';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to export notes: ${res.statusText}`);
  return res.json();
}

export async function downloadNotes(itemId?: string, titleHint = 'notes'): Promise<void> {
  const data = await fetchNotes(itemId);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const filename = `${titleHint.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-notes.json`;
  triggerBrowserDownload(blob, filename);
}

export async function fetchCanvases(itemId?: string): Promise<CanvasExportPackage[]> {
  const url = itemId
    ? `/api/portability/canvases?itemId=${encodeURIComponent(itemId)}`
    : '/api/portability/canvases';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to export canvases: ${res.statusText}`);
  return res.json();
}

export async function fetchLibraryMetadata(): Promise<LibraryMetadataExportPackage> {
  const res = await fetch('/api/portability/library-metadata');
  if (!res.ok) throw new Error(`Failed to export library metadata: ${res.statusText}`);
  return res.json();
}

export async function downloadLibraryMetadata(): Promise<void> {
  const data = await fetchLibraryMetadata();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerBrowserDownload(blob, `read-watch-library-metadata-${new Date().toISOString().slice(0, 10)}.json`);
}

export async function downloadBackup(): Promise<void> {
  const res = await fetch('/api/portability/backup');
  if (!res.ok) throw new Error(`Failed to create backup: ${res.statusText}`);
  const blob = await res.blob();
  const filename = `read-watch-backup-${new Date().toISOString().slice(0, 10)}.rwbackup`;
  triggerBrowserDownload(blob, filename);
}

export async function preflightRestore(backupPackage: unknown): Promise<RestorePreflightReport> {
  const res = await fetch('/api/portability/restore/preflight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backupPackage),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(err?.error || `Preflight failed: ${res.statusText}`);
  }
  return res.json();
}

export async function applyRestore(
  backupPackage: unknown,
  conflictResolution: 'skip' | 'overwrite' | 'copy' = 'skip',
): Promise<RestoreExecutionResult> {
  const res = await fetch('/api/portability/restore/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backup: backupPackage, conflictResolution }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(err?.error || `Restore failed: ${res.statusText}`);
  }
  return res.json();
}

export async function downloadAnnotatedPdf(itemId: string, titleHint = 'Document'): Promise<void> {
  const res = await fetch(`/api/portability/pdf/${encodeURIComponent(itemId)}/annotated`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(err?.error || `Failed to export annotated PDF: ${res.statusText}`);
  }
  const blob = await res.blob();
  const filename = `${titleHint.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-annotated.pdf`;
  triggerBrowserDownload(blob, filename);
}
