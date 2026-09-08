import type { Plugin } from 'vite';

export declare function readerPlugin(options: {
  libraryRoot: string;
  catalogPath: string;
  readerExecutable: string;
}): Plugin;
