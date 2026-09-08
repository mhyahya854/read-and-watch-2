export function createLibraryStore(options: {
  databasePath: string;
  readOnly?: boolean;
}): {
  getCatalog(): unknown;
  itemExists(itemId: string): boolean;
  queryItems(query?: Record<string, string>): unknown[];
  updateMetadata(
    itemId: string,
    patch: Record<string, unknown>,
    expectedRevision: number,
  ): unknown;
  setProperty(
    itemId: string,
    namespace: string,
    key: string,
    value: unknown,
    expectedRevision: number,
  ): number;
  setTags(itemId: string, tags: string[], expectedRevision: number): number;
  duplicateCandidates(): { titles: unknown[]; files: unknown[] };
  getFormatInventory(itemId: string): unknown[];
  setPeople(
    itemId: string,
    role: string,
    names: string[],
    expectedRevision: number,
  ): number;
  setSeries(
    itemId: string,
    name: string | null,
    position: string | number | null,
    expectedRevision: number,
  ): number;
  addRelationship(
    sourceItemId: string,
    targetItemId: string,
    relationshipType: string,
    expectedRevision: number,
  ): unknown;
  saveView(name: string, definition: unknown): unknown;
  listViews(): unknown[];
  loadNote(
    kind: string,
    itemId: string,
  ): { content: string | null; revision: string | null };
  saveNote(
    kind: string,
    itemId: string,
    content: string,
    baseRevision: string | null,
  ): unknown;
  close(): void;
};
