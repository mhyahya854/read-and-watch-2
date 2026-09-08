export type UserDataDocument = {
  content: string | null;
  revision: string | null;
};

export type SaveResult = {
  ok: boolean;
  conflict?: boolean;
  content: string | null;
  revision: string | null;
  exists?: boolean;
};

export type UserDataStore = {
  load(type: 'thoughts' | 'notes', itemId: string): UserDataDocument;
  save(
    type: 'thoughts' | 'notes',
    itemId: string,
    content: string,
    baseRevision: string | null,
  ): SaveResult;
  getIndex(): Record<string, unknown>;
  close(): void;
};

export declare function createUserDataStore(options: {
  userDataRoot: string;
  libraryDatabasePath: string;
  historyLimit?: number;
}): UserDataStore;
