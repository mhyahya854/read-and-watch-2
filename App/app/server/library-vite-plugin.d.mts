import type { Plugin } from 'vite';

export function libraryPlugin(options: {
  libraryDatabasePath: string;
}): Plugin;
