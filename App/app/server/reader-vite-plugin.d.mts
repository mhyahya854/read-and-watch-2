import type { Plugin } from 'vite';

export declare function readerPlugin(options: {
  libraryRoot: string;
  libraryDatabasePath: string;
  readerExecutable: string;
}): Plugin;
