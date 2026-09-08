export type UserDataType = 'thoughts' | 'notes';

export type UserDataDocument = {
  content: string | null;
  revision: string | null;
};

export type SaveResult =
  | { ok: true; content: string; revision: string | null; exists: boolean }
  | { ok: false; conflict: true; content: string | null; revision: string | null };

const ITEM_ID_RE = /^(read|watch)-[0-9a-f]{32}$/;

function assertItemId(itemId: string) {
  if (!ITEM_ID_RE.test(itemId)) {
    throw new Error('Invalid item ID');
  }
}

export const UserDataService = {
  async load(type: UserDataType, itemId: string): Promise<UserDataDocument> {
    assertItemId(itemId);
    const response = await fetch(`/api/user-data/${type}/${encodeURIComponent(itemId)}`);
    if (!response.ok) throw new Error(`Failed to load ${type}`);
    return (await response.json()) as UserDataDocument;
  },

  async save(
    type: UserDataType,
    itemId: string,
    content: string,
    baseRevision: string | null,
  ): Promise<SaveResult> {
    assertItemId(itemId);
    const response = await fetch(`/api/user-data/${type}/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, baseRevision }),
    });
    const payload = (await response.json()) as SaveResult & { error?: string };
    if (response.status === 409) {
      return {
        ok: false,
        conflict: true,
        content: payload.content ?? null,
        revision: payload.revision ?? null,
      };
    }
    if (!response.ok) {
      throw new Error(payload.error ?? `Failed to save ${type}`);
    }
    return payload as SaveResult;
  },
};
