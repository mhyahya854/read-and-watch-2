'use client';

/**
 * Portability & Backup Settings Panel.
 * Phase 12 — Export and Portability.
 *
 * Provides:
 *   - Unified Full Backup (.rwbackup) export
 *   - File-first Backup Restore with preflight conflict review
 *   - Library Metadata JSON export
 *   - Zero media mutation assurance
 *   - Automatic derived search index rebuild after restore
 */

import { useEffect, useState, useRef } from 'react';
import {
  Download,
  Upload,
  Database,
  FileJson,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FileText,
  Bookmark,
  Highlighter,
  LayoutGrid,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  downloadBackup,
  downloadLibraryMetadata,
  preflightRestore,
  applyRestore,
} from '@/lib/portability/client';
import {
  loadLibraryIntegrity,
  retryRecovery,
  type LibraryIntegrityState,
} from '@/lib/library-data';
import type {
  RestorePreflightReport,
  RestoreExecutionResult,
} from '@/lib/portability/types';

export function PortabilitySettings() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isExportingMeta, setIsExportingMeta] = useState(false);

  // Restore State
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [parsedBackupData, setParsedBackupData] = useState<unknown>(null);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [preflightReport, setPreflightReport] = useState<RestorePreflightReport | null>(null);
  const [conflictResolution, setConflictResolution] = useState<'skip' | 'overwrite' | 'copy'>('skip');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreExecutionResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [integrity, setIntegrity] = useState<LibraryIntegrityState | null>(null);
  const [integrityError, setIntegrityError] = useState<string | null>(null);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(true);

  async function checkIntegrity(signal?: AbortSignal) {
    setIsCheckingIntegrity(true);
    setIntegrityError(null);
    try {
      setIntegrity(await loadLibraryIntegrity(signal));
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setIntegrityError(
          err instanceof Error ? err.message : 'Library integrity could not be checked.',
        );
      }
    } finally {
      setIsCheckingIntegrity(false);
    }
  }

  async function handleRetryReconciliation() {
    setIsCheckingIntegrity(true);
    setIntegrityError(null);
    try {
      await retryRecovery();
      await checkIntegrity();
    } catch (err: unknown) {
      setIntegrityError(
        err instanceof Error ? err.message : 'Library integrity could not be checked.',
      );
      setIsCheckingIntegrity(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadLibraryIntegrity(controller.signal)
      .then(setIntegrity)
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setIntegrityError(
            err instanceof Error ? err.message : 'Library integrity could not be checked.',
          );
        }
      })
      .finally(() => setIsCheckingIntegrity(false));
    return () => controller.abort();
  }, []);

  // 1. Create Full Backup
  const handleDownloadBackup = async () => {
    setIsExportingBackup(true);
    try {
      await downloadBackup();
      toast.success('Unified user data and metadata downloaded successfully.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not generate backup bundle.');
    } finally {
      setIsExportingBackup(false);
    }
  };

  // 2. Export Library Metadata
  const handleDownloadLibraryMeta = async () => {
    setIsExportingMeta(true);
    try {
      await downloadLibraryMetadata();
      toast.success('Standard library metadata JSON downloaded.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not export metadata.');
    } finally {
      setIsExportingMeta(false);
    }
  };

  // 3. Select Backup File
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreFile(file);
    setRestoreError(null);
    setPreflightReport(null);
    setRestoreResult(null);
    setIsPreflighting(true);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setParsedBackupData(parsed);

      const report = await preflightRestore(parsed);
      setPreflightReport(report);
    } catch (err: unknown) {
      setRestoreError(err instanceof Error ? err.message : 'Failed to parse or validate backup file.');
      setParsedBackupData(null);
    } finally {
      setIsPreflighting(false);
      // Reset input so re-selecting same file triggers change
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 4. Confirm and Execute Restore
  const handleExecuteRestore = async () => {
    if (!parsedBackupData) return;
    setIsRestoring(true);
    setRestoreError(null);

    try {
      const res = await applyRestore(parsedBackupData, conflictResolution);
      setRestoreResult(res);
      toast.success(
        `Successfully restored ${res.restoredCounts.annotations} annotations, ${res.restoredCounts.bookmarks} bookmarks, ${res.restoredCounts.notes} notes, ${res.restoredCounts.canvases} canvases, ${res.restoredCounts.savedViews} saved views, ${res.restoredCounts.relationships} relationships.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to apply restore.';
      setRestoreError(msg);
      toast.error(msg);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleResetRestore = () => {
    setRestoreFile(null);
    setParsedBackupData(null);
    setPreflightReport(null);
    setRestoreResult(null);
    setRestoreError(null);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-editorial text-xl font-semibold text-foreground">
            Portability &amp; Backup
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lossless user data backup, verified portable schemas, and safe recovery.
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <ShieldCheck size={14} />
          <span>Sources Immutable</span>
        </div>
      </div>

      {/* Main Grid: Backup Export & Restore */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Card 1: Create Backup */}
        <div className="rounded-lg border border-border bg-surface p-5 flex flex-col justify-between space-y-4 shadow-xs">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Database size={18} />
              </div>
              <h3 className="font-medium text-foreground text-sm">Unified Library Backup</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Creates a self-contained, versioned <code className="font-mono text-[11px] bg-surface-muted px-1 py-0.5 rounded">.rwbackup</code> archive
              containing all annotations, highlights, bookmarks, notes, thoughts, canvases, saved views, relationships, and library metadata.
            </p>
            <div className="rounded border border-border/70 bg-surface-muted/40 p-2 text-[11px] text-muted-foreground">
              <strong>Zero Source Bloat:</strong> Original publication files (EPUB/PDF) are never bundled or touched, ensuring your storage remains lean and source books stay pristine.
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="w-full sm:w-auto text-xs"
              onClick={handleDownloadBackup}
              disabled={isExportingBackup}
            >
              {isExportingBackup ? (
                <>
                  <RefreshCw size={13} className="animate-spin mr-1.5" />
                  Generating Backup...
                </>
              ) : (
                <>
                  <Download size={13} className="mr-1.5" />
                  Download Full Backup (.rwbackup)
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Card 2: Restore Backup */}
        <div className="rounded-lg border border-border bg-surface p-5 flex flex-col justify-between space-y-4 shadow-xs">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                <Upload size={18} />
              </div>
              <h3 className="font-medium text-foreground text-sm">Restore from Backup</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Restores annotations, canvases, notes, saved views, and relationships into your local library. Includes preflight inspection, conflict review, and automatic search index rebuild.
            </p>
            <div className="rounded border border-border/70 bg-surface-muted/40 p-2 text-[11px] text-muted-foreground">
              <strong>Fail-Safe:</strong> Restores validate schema integrity before applying changes. You can choose whether to skip or update conflicting records.
            </div>
          </div>

          <div className="pt-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".rwbackup,.json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPreflighting || isRestoring}
            >
              {isPreflighting ? (
                <>
                  <RefreshCw size={13} className="animate-spin mr-1.5" />
                  Inspecting Backup...
                </>
              ) : (
                <>
                  <Upload size={13} className="mr-1.5" />
                  Select Backup File to Restore
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Library Integrity */}
      <div className="rounded-lg border border-border bg-surface p-4 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {integrity?.status === 'HEALTHY' ? (
              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ShieldCheck size={16} className="text-primary" />
            )}
            <h3 className="font-medium text-foreground text-sm">Library Integrity</h3>
          </div>
          {isCheckingIntegrity && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <RefreshCw size={12} className="animate-spin" />
              Checking...
            </span>
          )}
        </div>

        {integrityError ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-600" />
              Library integrity could not be checked.
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs"
              onClick={() => void checkIntegrity()}
              disabled={isCheckingIntegrity}
            >
              Retry
            </Button>
          </div>
        ) : integrity ? (
          <>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5">
                <dt className="text-muted-foreground">Portable state mirror</dt>
                <dd className="font-medium text-foreground">
                  {integrity.mirror.present ? 'Present' : 'Missing'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5">
                <dt className="text-muted-foreground">Saved views</dt>
                <dd className="font-medium text-foreground">
                  {integrity.mirror.savedViewCount} in file / {integrity.runtime.savedViewCount} in runtime
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5">
                <dt className="text-muted-foreground">Relationships</dt>
                <dd className="font-medium text-foreground">
                  {integrity.mirror.relationshipCount} in file / {integrity.runtime.relationshipCount} in runtime
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1.5">
                <dt className="text-muted-foreground">Runtime parity</dt>
                <dd className="font-medium text-foreground">
                  {integrity.parity.matches ? 'Matching' : 'Needs reconciliation'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <dt className="text-muted-foreground">Recovery state</dt>
                <dd className="font-medium text-foreground">
                  {integrity.recovery?.status === 'HEALTHY' ? 'Healthy' : 'Recovery needed'}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
              <p className="text-muted-foreground">
                {integrity.status === 'HEALTHY'
                  ? 'Library state is synchronized. Saved views and relationships match their durable file-first record.'
                  : integrity.status === 'MISMATCH'
                    ? 'Library state needs reconciliation. The durable library state and runtime database do not currently match.'
                    : 'Library recovery needed. Use the existing recovery path to reconcile the durable state and runtime database.'}
              </p>
              {integrity.status !== 'HEALTHY' && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  onClick={() => void handleRetryReconciliation()}
                  disabled={isCheckingIntegrity}
                >
                  <RefreshCw size={13} className="mr-1.5" />
                  Retry reconciliation
                </Button>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* Preflight Modal / Expansion Panel */}
      {restoreError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start justify-between gap-3 text-xs">
          <div className="flex items-start gap-2 text-destructive">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Restore Inspection Failed</p>
              <p className="mt-0.5 text-muted-foreground">{restoreError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetRestore}
            className="text-muted-foreground hover:text-foreground p-1"
            title="Dismiss error"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {preflightReport && !restoreResult && (
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="font-medium text-foreground text-sm flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary" />
                <span>Backup Preflight Report</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Source file: <span className="font-mono">{restoreFile?.name}</span> (Schema v{preflightReport.schemaVersion})
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetRestore}
              className="h-7 text-xs text-muted-foreground"
            >
              Cancel
            </Button>
          </div>

          {/* Counts Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="bg-surface-muted/50 p-2.5 rounded border border-border/60">
              <span className="text-muted-foreground block text-[11px]">Annotations</span>
              <span className="font-semibold text-foreground text-base mt-0.5 block flex items-center justify-center gap-1">
                <Highlighter size={13} className="text-amber-500" />
                {preflightReport.counts.incomingAnnotations}
              </span>
            </div>
            <div className="bg-surface-muted/50 p-2.5 rounded border border-border/60">
              <span className="text-muted-foreground block text-[11px]">Bookmarks</span>
              <span className="font-semibold text-foreground text-base mt-0.5 block flex items-center justify-center gap-1">
                <Bookmark size={13} className="text-blue-500" />
                {preflightReport.counts.incomingBookmarks}
              </span>
            </div>
            <div className="bg-surface-muted/50 p-2.5 rounded border border-border/60">
              <span className="text-muted-foreground block text-[11px]">Notes &amp; Thoughts</span>
              <span className="font-semibold text-foreground text-base mt-0.5 block flex items-center justify-center gap-1">
                <FileText size={13} className="text-purple-500" />
                {preflightReport.counts.incomingNotes}
              </span>
            </div>
            <div className="bg-surface-muted/50 p-2.5 rounded border border-border/60">
              <span className="text-muted-foreground block text-[11px]">Canvases</span>
              <span className="font-semibold text-foreground text-base mt-0.5 block flex items-center justify-center gap-1">
                <LayoutGrid size={13} className="text-emerald-500" />
                {preflightReport.counts.incomingCanvases}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Saved views: <strong className="text-foreground">{preflightReport.counts.incomingSavedViews}</strong>
            {' '} / Relationships: <strong className="text-foreground">{preflightReport.counts.incomingRelationships}</strong>
          </p>

          {/* Conflicts Summary */}
          {preflightReport.conflicts.length > 0 ? (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle size={14} />
                <span>{preflightReport.conflicts.length} Overlapping Record(s) Detected</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Some items or annotations already exist in your local library. Choose how conflicts should be handled:
              </p>
              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-foreground">
                  <input
                    type="radio"
                    name="conflictResolution"
                    value="skip"
                    checked={conflictResolution === 'skip'}
                    onChange={() => setConflictResolution('skip')}
                    className="accent-primary"
                  />
                  <span><strong>Skip existing (Safe):</strong> Keep local records and only restore new, non-conflicting entries.</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-foreground">
                  <input
                    type="radio"
                    name="conflictResolution"
                    value="overwrite"
                    checked={conflictResolution === 'overwrite'}
                    onChange={() => setConflictResolution('overwrite')}
                    className="accent-primary"
                  />
                  <span><strong>Overwrite existing:</strong> Update local records to match the backup revisions.</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={14} />
              <span>Zero conflicts detected. All incoming data will be cleanly integrated.</span>
            </div>
          )}

          {/* Action Trigger */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetRestore}
              disabled={isRestoring}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleExecuteRestore}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <>
                  <RefreshCw size={13} className="animate-spin mr-1.5" />
                  Applying Restore &amp; Rebuilding Index...
                </>
              ) : (
                <>
                  <ShieldCheck size={13} className="mr-1.5" />
                  Confirm &amp; Apply Restore
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Restore Result Card */}
      {restoreResult && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3 text-xs shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400 text-sm">
              <CheckCircle2 size={16} />
              <span>Restore Successfully Completed</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetRestore}
              className="h-7 text-xs"
            >
              Dismiss
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground text-[11px]">
            <div>Annotations Restored: <strong className="text-foreground">{restoreResult.restoredCounts.annotations}</strong></div>
            <div>Bookmarks Restored: <strong className="text-foreground">{restoreResult.restoredCounts.bookmarks}</strong></div>
            <div>Notes Restored: <strong className="text-foreground">{restoreResult.restoredCounts.notes}</strong></div>
            <div>Canvases Restored: <strong className="text-foreground">{restoreResult.restoredCounts.canvases}</strong></div>
            <div>Saved Views Restored: <strong className="text-foreground">{restoreResult.restoredCounts.savedViews}</strong></div>
            <div>Relationships Restored: <strong className="text-foreground">{restoreResult.restoredCounts.relationships}</strong></div>
          </div>

          {restoreResult.searchRebuilt && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pt-1">
              <RefreshCw size={12} />
              <span>Derived full-text search index was completely rebuilt and is ready for queries.</span>
            </p>
          )}
        </div>
      )}

      {/* Additional Secondary Export: Library Metadata */}
      <div className="rounded-lg border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <FileJson size={15} className="text-muted-foreground" />
            <span>Library Metadata Catalog (JSON)</span>
          </div>
          <p className="text-muted-foreground text-[11px]">
            Export standalone metadata records for all books, collections, and catalog properties.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleDownloadLibraryMeta}
          disabled={isExportingMeta}
          className="text-xs"
        >
          {isExportingMeta ? (
            <RefreshCw size={13} className="animate-spin mr-1.5" />
          ) : (
            <Download size={13} className="mr-1.5" />
          )}
          Export Metadata (.json)
        </Button>
      </div>
    </section>
  );
}
