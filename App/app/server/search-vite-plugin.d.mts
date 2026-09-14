import type { Plugin } from 'vite';

export declare function searchPlugin(options: {
  searchStore?: unknown;
  databasePath?: string;
  userDataRoot?: string;
}): Plugin;
