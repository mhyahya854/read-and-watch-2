import { type DocumentLocation } from './document/location.ts';
import { type Bookmark } from './document/bookmark.ts';
import { type ReaderPreferences } from './document/preferences.ts';

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

export interface ReadingStateRecord {
  location: DocumentLocation;
  progression: number;
  sourceHash: string;
  updatedAt: string;
  page?: number;
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Reader request failed');
  return payload;
}

export async function getReaderStatus(itemId: string, signal?: AbortSignal): Promise<ReaderStatus> {
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

// --- Canonical Reading State & Progress ---

export async function getReaderState(
  itemId: string,
  signal?: AbortSignal
): Promise<ReadingStateRecord | null> {
  try {
    const res = await fetch(`/api/reader/items/${encodeURIComponent(itemId)}/state`, {
      cache: 'no-store',
      signal,
    });
    if (res.status === 404) return null;
    return jsonResponse<ReadingStateRecord | null>(res);
  } catch {
    return null;
  }
}

export async function saveReaderPosition(
  itemId: string,
  state: {
    location: DocumentLocation;
    progression: number;
    sourceHash: string;
    page?: number;
  }
): Promise<{ ok: boolean }> {
  try {
    return await jsonResponse<{ ok: boolean }>(
      await fetch(`/api/reader/items/${encodeURIComponent(itemId)}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
    );
  } catch {
    return { ok: false };
  }
}

// --- Canonical Bookmarks ---

export async function getReaderBookmarks(
  itemId: string,
  signal?: AbortSignal
): Promise<Bookmark[]> {
  try {
    const res = await fetch(`/api/reader/items/${encodeURIComponent(itemId)}/bookmarks`, {
      cache: 'no-store',
      signal,
    });
    if (!res.ok) return [];
    return jsonResponse<Bookmark[]>(res);
  } catch {
    return [];
  }
}

export async function addReaderBookmark(
  itemId: string,
  bookmark: {
    location: DocumentLocation;
    sourceHash: string;
    label?: string;
    snippet?: string;
    pageNumber?: number;
    progression?: number;
  }
): Promise<Bookmark | null> {
  try {
    return await jsonResponse<Bookmark>(
      await fetch(`/api/reader/items/${encodeURIComponent(itemId)}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookmark),
      })
    );
  } catch {
    return null;
  }
}

export async function deleteReaderBookmark(
  itemId: string,
  bookmarkId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/reader/items/${encodeURIComponent(itemId)}/bookmarks/${encodeURIComponent(bookmarkId)}`,
      { method: 'DELETE' }
    );
    return res.ok;
  } catch {
    return false;
  }
}

// --- Canonical Reader Preferences ---

export async function getReaderSettings(
  signal?: AbortSignal
): Promise<ReaderPreferences | null> {
  try {
    const res = await fetch('/api/reader/settings', {
      cache: 'no-store',
      signal,
    });
    if (!res.ok) return null;
    return jsonResponse<ReaderPreferences>(res);
  } catch {
    return null;
  }
}

export async function saveReaderSettings(
  settings: Partial<ReaderPreferences>
): Promise<ReaderPreferences | null> {
  try {
    return await jsonResponse<ReaderPreferences>(
      await fetch('/api/reader/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
    );
  } catch {
    return null;
  }
}
