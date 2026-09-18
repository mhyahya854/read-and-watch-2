import type { Plugin } from 'vite';

export function libraryPlugin(options: {
  libraryDatabasePath: string;
  searchStore?: unknown;
  portableRoot?: string | null;
  portableBackupRoot?: string | null;
}): Plugin;
