'use client';

/**
 * Read & Watch Unified Reader Route.
 * Bridges library item candidate resolution into the capability-driven ReaderProvider.
 * 100% capability-driven; zero format-conditional branching in presentation layer.
 */

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  type ReadonlyDocumentSource,
  createSourceFromCandidate,
  createSampleSource,
} from '@/lib/document';
import { getReaderStatus, type ReaderStatus } from '@/lib/reader';
import { ReaderProvider, ReaderShell } from '@/components/reader';

export default function ReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: itemId } = use(params);

  const isSample = itemId.startsWith('sample');
  const [source, setSource] = useState<ReadonlyDocumentSource | null>(() => {
    return isSample ? createSampleSource(itemId) : null;
  });
  const [loading, setLoading] = useState(!isSample);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSample) return;

    const ctrl = new AbortController();
    getReaderStatus(itemId, ctrl.signal)
      .then((status: ReaderStatus) => {
        if (status.state === 'missing' || status.state === 'no-readable-file') {
          setError('No readable publication file found for this library item.');
        } else if (status.candidates.length === 0) {
          setError('No valid readable candidate attached to this item.');
        } else {
          let chosen = status.candidates[0];
          if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const candId = params.get('candidate');
            if (candId) {
              const matched = status.candidates.find((c) => c.id === candId);
              if (matched) chosen = matched;
            }
          }
          setSource(createSourceFromCandidate(itemId, chosen));
        }
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to resolve reader status');
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [itemId, isSample]);

  if (loading) {
    return (
      <div className="flex flex-col h-screen w-screen items-center justify-center bg-background text-foreground select-none">
        <BookOpen className="h-8 w-8 text-muted-foreground animate-pulse mb-3" />
        <p className="text-xs text-muted-foreground font-medium">Preparing reader...</p>
      </div>
    );
  }

  if (error || !source) {
    return (
      <div className="flex flex-col h-screen w-screen items-center justify-center bg-background p-6 text-center select-none">
        <div className="max-w-md bg-surface border border-border p-6 rounded-lg shadow-sm">
          <p className="text-sm font-semibold text-destructive mb-2">Unable to open publication</p>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            {error || 'Unknown reader error'}
          </p>
          <Link href="/">
            <Button size="sm" variant="secondary" className="text-xs">
              <ArrowLeft size={14} className="mr-1.5" />
              Return to Library
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ReaderProvider itemId={itemId} source={source}>
      <ReaderShell />
    </ReaderProvider>
  );
}
