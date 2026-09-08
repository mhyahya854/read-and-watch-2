'use client';

import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  getReaderStatus,
  openInReader,
  type ReaderCandidate,
  type ReaderStatus,
} from '@/lib/reader';

function statusMessage(status: ReaderStatus | null) {
  if (!status) return 'Checking for a local book…';
  if (status.state === 'unsupported') {
    const formats = [
      ...new Set(status.unsupported.map(({ format }) => format)),
    ].join(', ');
    return `No readable local book attached. ${formats || 'Attached media'} is not a supported book.`;
  }
  if (status.state === 'missing')
    return 'No readable local book attached. The catalog file is missing.';
  if (status.state === 'no-readable-file')
    return 'No readable local book attached.';
  if (!status.readerReady) return 'Readest runtime is not installed.';
  if (status.state === 'multiple') return 'Choose which local book to open.';
  return 'Opens in a separate Readest window. Close it to return to this library.';
}

export function ReaderControl({ itemId }: { itemId: string }) {
  const [status, setStatus] = useState<ReaderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getReaderStatus(itemId, controller.signal)
      .then(setStatus)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error ? caught.message : 'Reader check failed',
          );
        }
      });
    return () => controller.abort();
  }, [itemId]);

  async function open(candidate?: ReaderCandidate) {
    const pendingId = candidate?.id ?? status?.candidates[0]?.id ?? 'single';
    setOpeningId(pendingId);
    setError(null);
    setMessage(null);
    try {
      const result = await openInReader(itemId, candidate?.id);
      setMessage(
        `${result.name} opened in Readest. Close that window to return here.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not open Readest',
      );
    } finally {
      setOpeningId(null);
    }
  }

  const ready = status?.readerReady ?? false;
  const single = status?.state === 'available' ? status.candidates[0] : null;

  return (
    <div className="space-y-2">
      {status?.state === 'multiple' ? (
        <div className="flex flex-wrap gap-2">
          {status.candidates.map((candidate) => (
            <Button
              key={candidate.id}
              type="button"
              variant="secondary"
              size="sm"
              disabled={!ready || openingId !== null}
              onClick={() => open(candidate)}
            >
              <BookOpen />
              {openingId === candidate.id
                ? 'Opening…'
                : `Open ${candidate.name} (${candidate.format})`}
            </Button>
          ))}
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="w-full justify-start"
          disabled={!single || !ready || openingId !== null}
          onClick={() => open()}
        >
          <BookOpen />
          {openingId ? 'Opening…' : 'Open in Reader'}
        </Button>
      )}
      <p
        aria-live="polite"
        className={`text-[11px] ${error ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {error ?? message ?? statusMessage(status)}
      </p>
    </div>
  );
}
