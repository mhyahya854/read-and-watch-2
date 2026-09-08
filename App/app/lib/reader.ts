export type ReaderCandidate = {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
};

export type ReaderStatus = {
  state:
    | 'available'
    | 'multiple'
    | 'missing'
    | 'unsupported'
    | 'no-readable-file';
  readerReady: boolean;
  candidates: ReaderCandidate[];
  missing: Array<{ name: string; format: string }>;
  unsupported: Array<{ name: string; format: string }>;
};

async function jsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Reader request failed');
  return payload;
}

export async function getReaderStatus(itemId: string, signal?: AbortSignal) {
  return jsonResponse<ReaderStatus>(
    await fetch(`/api/reader/items/${encodeURIComponent(itemId)}`, {
      cache: 'no-store',
      signal,
    }),
  );
}

export async function openInReader(itemId: string, candidateId?: string) {
  return jsonResponse<{ ok: true; name: string; format: string }>(
    await fetch(`/api/reader/items/${encodeURIComponent(itemId)}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidateId ? { candidateId } : {}),
    }),
  );
}
