import type { LibraryCatalog, LibraryItem } from '@/lib/catalog';

export type LibraryView = {
  id: string;
  name: string;
  revision: number;
  definition: Record<string, unknown>;
};

export type PortableRecoveryState = {
  status: 'HEALTHY' | 'RECOVERED' | 'RECOVERY_REQUIRED';
  code: string;
  reasons: string[];
  message: string;
  actions: string[];
  counts: { read: number; watch: number; total: number } | null;
  partial: boolean;
  limitations: string[];
  mutationBlocked: boolean;
  metrics: Record<string, unknown>;
};

async function jsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Library request failed');
  return payload;
}

export async function loadLibrary(signal?: AbortSignal) {
  return jsonResponse<LibraryCatalog>(
    await fetch('/api/library/catalog', { cache: 'no-store', signal }),
  );
}

export async function saveLibraryItem(
  itemId: string,
  expectedRevision: number,
  patch: Record<string, unknown>,
) {
  const response = await fetch(
    `/api/library/items/${encodeURIComponent(itemId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch, expectedRevision }),
    },
  );
  const payload = await jsonResponse<{ ok: true; item: LibraryItem }>(response);
  return payload.item;
}

export async function loadLibraryViews(signal?: AbortSignal) {
  return jsonResponse<LibraryView[]>(
    await fetch('/api/library/views', { cache: 'no-store', signal }),
  );
}

export async function saveLibraryView(
  name: string,
  definition: Record<string, unknown>,
) {
  return jsonResponse<LibraryView>(
    await fetch('/api/library/views', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, definition }),
    }),
  );
}

export async function loadRecoveryState(signal?: AbortSignal) {
  return jsonResponse<PortableRecoveryState>(
    await fetch('/api/library/recovery', { cache: 'no-store', signal }),
  );
}

export async function retryRecovery() {
  return jsonResponse<PortableRecoveryState>(
    await fetch('/api/library/recovery/retry', { method: 'POST' }),
  );
}
