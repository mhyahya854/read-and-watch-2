export type DataPaths = {
  dataRoot: string;
  dataAppRoot: string;
  libraryRoot: string;
  catalogPath: string;
  userDataRoot: string;
  readerExecutable: string;
};

export declare function resolveDataPaths(options: {
  appRoot: string;
  environment?: Record<string, string | undefined>;
}): DataPaths;
