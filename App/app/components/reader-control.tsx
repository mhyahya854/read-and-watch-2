'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  getReaderStatus,
  type ReaderStatus,
} from '@/lib/reader';

function statusMessage(status: ReaderStatus | null) {
  if (!status) return 'Checking for a local book...';
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
  if (!status.readerReady) return 'The local reader is not installed.';
  if (status.state === 'multiple') return 'Choose which local book to open.';
  return 'Opens in the unified reader.';
}

export function ReaderControl({ itemId }: { itemId: string }) {
  const [status, setStatus] = useState<ReaderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const ready = status?.readerReady ?? false;
  const single = status?.state === 'available' ? status.candidates[0] : null;

  return (
    <div className="space-y-2">
      {status?.state === 'multiple' ? (
        <div className="flex flex-wrap gap-2">
          {status.candidates.map((candidate) => (
            <Link
              key={candidate.id}
              href={`/reader/${encodeURIComponent(itemId)}?candidate=${encodeURIComponent(candidate.id)}`}
              className={!ready ? 'pointer-events-none' : ''}
            >
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!ready}
              >
                <BookOpen />
                {`Open ${candidate.name} (${candidate.format})`}
              </Button>
            </Link>
          ))}
        </div>
      ) : (
        <Link
          href={single && ready ? `/reader/${encodeURIComponent(itemId)}` : '#'}
          className={!single || !ready ? 'pointer-events-none block' : 'block'}
        >
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-start"
            disabled={!single || !ready}
          >
            <BookOpen />
            Open in Reader
          </Button>
        </Link>
      )}
      <p
        aria-live="polite"
        className={`text-[11px] ${error ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {error ?? statusMessage(status)}
      </p>
    </div>
  );
}

