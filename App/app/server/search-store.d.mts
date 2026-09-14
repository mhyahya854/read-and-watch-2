export interface SearchStore {
  getStatus(): {
    schemaVersion: number;
    status: string;
    lastRebuiltAtUtc: string | null;
    counts: {
      items: number;
      annotations: number;
      bookmarks: number;
      canvases: number;
      notes: number;
      total: number;
    };
    errorMessage?: string | null;
  };
  rebuildIndex(): { ok: boolean; counts: Record<string, number>; rebuiltAt: string };
  search(options?: {
    query?: string;
    typeFilter?: string;
    bookFilter?: string | null;
    limit?: number;
    offset?: number;
  }): {
    results: unknown[];
    total: number;
    meta: unknown;
  };
  getFilterableBooks(): Array<{ itemId: string; title: string; count: number }>;
  indexItem(item: unknown): void;
  removeItem(itemId: string): void;
  indexAnnotation(ann: unknown): void;
  removeAnnotation(annotationId: string): void;
  indexBookmark(itemId: string, bm: unknown): void;
  removeBookmark(itemId: string, bookmarkId: string): void;
  indexCanvas(canvasId: string): void;
  removeCanvas(canvasId: string): void;
  indexNote(itemId: string, kind: string, content: string): void;
  removeNote(itemId: string, kind: string): void;
  close(): void;
}

export declare function createSearchStore(options: {
  databasePath?: string;
  userDataRoot?: string;
  libraryDatabase?: unknown;
}): SearchStore;
