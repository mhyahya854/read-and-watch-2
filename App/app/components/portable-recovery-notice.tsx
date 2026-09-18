'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  loadRecoveryState,
  retryRecovery,
  type PortableRecoveryState,
} from '@/lib/library-data';

export function PortableRecoveryNotice({
  onRecovered,
}: {
  onRecovered: () => void;
}) {
  const [recovery, setRecovery] = useState<PortableRecoveryState | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    loadRecoveryState(controller.signal)
      .then(setRecovery)
      .catch(() => setRecovery(null));
    return () => controller.abort();
  }, []);

  if (!recovery || dismissed) return null;

  if (
    recovery.status === 'RECOVERED' &&
    recovery.code === 'RECOVERED_CORRUPT_RUNTIME'
  ) {
    return (
      <output className="mb-4 block rounded-md border border-border bg-surface-muted p-4 text-sm">
        <h2 className="font-editorial text-lg font-semibold">
          Runtime data reconstructed
        </h2>
        <p className="mt-1 text-muted-foreground">{recovery.message}</p>
        {recovery.partial && (
          <p className="mt-1 text-muted-foreground">
            Some runtime-only data could not be reconstructed from the damaged
            database. The damaged database was preserved for review.
          </p>
        )}
        <Button
          className="mt-3"
          size="sm"
          variant="ghost"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </Button>
      </output>
    );
  }

  if (recovery.status !== 'RECOVERY_REQUIRED') return null;

  async function retry() {
    setRetrying(true);
    try {
      const next = await retryRecovery();
      setRecovery(next);
      if (next.status !== 'RECOVERY_REQUIRED') {
        onRecovered();
      }
    } catch {
      setRecovery((current) => current);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div
      role="alert"
      className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <h2 className="font-editorial text-lg font-semibold">
        Library recovery needed
      </h2>
      <p className="mt-1 text-muted-foreground">{recovery.message}</p>
      <p className="mt-1 text-muted-foreground">
        Your library files have not been changed.
        {recovery.mutationBlocked
          ? ' Saving title metadata is paused until recovery is resolved. Reading and browsing remain available.'
          : ''}
      </p>
      <Button className="mt-3" size="sm" variant="secondary" onClick={() => void retry()} disabled={retrying}>
        {retrying ? 'Retrying...' : 'Retry recovery'}
      </Button>
    </div>
  );
}
