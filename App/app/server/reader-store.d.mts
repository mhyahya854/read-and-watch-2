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

export type ReaderStore = {
  getStatus(itemId: string): ReaderStatus;
  open(
    itemId: string,
    candidateId?: string,
  ): Promise<{
    ok: true;
    name: string;
    format: string;
  }>;
};

export declare function createReaderStore(options: {
  libraryRoot: string;
  libraryDatabasePath: string;
  readerExecutable: string;
  launchReader?: (executable: string, source: string) => void | Promise<void>;
}): ReaderStore;
