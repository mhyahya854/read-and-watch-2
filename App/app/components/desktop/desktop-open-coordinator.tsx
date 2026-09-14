'use client';

/**
 * Desktop Open Coordinator.
 * Phase 14 - Desktop Native Integration.
 *
 * Coordinates Windows Explorer "Open with" and file association events.
 * Resolves existing publications by stable SHA-256 identity.
 * Bounded import dialog for new publications with zero source book mutation.
 */

import React, { useEffect, useState } from 'react';
import type { DesktopFileInfo, ResolvedOpenFileResult } from '../../lib/desktop/types';

export function DesktopOpenCoordinator() {
  const [unregisteredFile, setUnregisteredFile] = useState<ResolvedOpenFileResult | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    async function handleFile(file: DesktopFileInfo) {
      if (!window.readWatchDesktop) return;
      try {
        setStatusNotice(`Checking library for "${file.name}"...`);
        const resolved = await window.readWatchDesktop.resolveOpenFile(file.path);
        setStatusNotice(null);

        if (resolved.found && resolved.itemId) {
          // Known book: navigate directly to the reader
          window.location.href = `/reader/${encodeURIComponent(resolved.itemId)}`;
        } else {
          // New/unregistered book: show explicit import boundary dialog
          setUnregisteredFile(resolved);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setStatusNotice(`Failed to open file: ${msg}`);
      }
    }

    const handleCustomOpen = (event: Event) => {
      const customEvent = event as CustomEvent<DesktopFileInfo>;
      if (customEvent.detail) {
        void handleFile(customEvent.detail);
      }
    };
    window.addEventListener('readwatch:open-file', handleCustomOpen);

    if (!window.readWatchDesktop) {
      return () => {
        window.removeEventListener('readwatch:open-file', handleCustomOpen);
      };
    }

    const bridge = window.readWatchDesktop;

    // Check for any file passed at cold launch
    void bridge.getPendingOpenFiles().then((files) => {
      if (files.length > 0) {
        void handleFile(files[0]);
      }
    });

    // Listen for second-instance / live Windows Open-With events
    const unsubscribe = bridge.onOpenFile((file) => {
      void handleFile(file);
    });

    return () => {
      window.removeEventListener('readwatch:open-file', handleCustomOpen);
      unsubscribe();
    };
  }, []);

  // Handle Escape key to dismiss dialog
  useEffect(() => {
    if (!unregisteredFile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUnregisteredFile(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [unregisteredFile]);

  if (statusNotice) {
    return (
      <aside
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 bg-[#1c1c1a] text-[#fbfbfa] px-4 py-2.5 rounded shadow-lg text-xs font-sans border border-[#244b4c]"
      >
        {statusNotice}
      </aside>
    );
  }

  if (!unregisteredFile) {
    return null;
  }

  const { file } = unregisteredFile;

  return (
    <dialog
      open
      aria-labelledby="open-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 w-full h-full border-0 max-w-none max-h-none m-0"
    >
      <div className="bg-[#fbfbfa] text-[#1c1c1a] border border-[#d6d6d2] rounded-md shadow-xl max-w-md w-full p-6 font-sans">
        <h2 id="open-dialog-title" className="text-base font-serif font-bold text-[#1c1c1a] mb-2">
          Open External Publication
        </h2>
        <p className="text-xs text-[#52524e] mb-3 leading-relaxed">
          This publication is not currently part of your local library catalog. To include it in your library, copy or move this file into your library folder (<code className="font-mono text-[11px] bg-[#f4f4f2] px-1 py-0.5 rounded">data/library/read</code>).
        </p>

        <div className="bg-[#f4f4f2] border border-[#e5e5e2] rounded p-3 text-xs mb-4 space-y-1.5 font-mono">
          <div className="flex justify-between">
            <span className="text-[#73736c]">File:</span>
            <span className="text-[#1c1c1a] font-semibold truncate max-w-[240px]" title={file.name}>
              {file.name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#73736c]">Format:</span>
            <span className="text-[#1c1c1a] uppercase">{file.ext.replace('.', '')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#73736c]">Size:</span>
            <span className="text-[#1c1c1a]">{(file.size / 1024).toFixed(1)} KB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#73736c]">SHA-256:</span>
            <span className="text-[#1c1c1a] truncate max-w-[180px]" title={file.hash}>
              {file.hash.slice(0, 16)}...
            </span>
          </div>
        </div>

        <div className="text-xs text-[#73736c] mb-5">
          Note: Source publications are strictly read-only and will never be modified or converted in place.
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setUnregisteredFile(null)}
            className="px-3.5 py-1.5 text-xs rounded border border-[#d6d6d2] bg-white text-[#1c1c1a] hover:bg-[#f4f4f2] transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => setUnregisteredFile(null)}
            className="px-3.5 py-1.5 text-xs rounded bg-[#244b4c] text-white hover:bg-[#1a3839] transition-colors cursor-pointer font-medium"
          >
            Return to Library
          </button>
        </div>
      </div>
    </dialog>
  );
}
