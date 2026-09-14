/**
 * Type definitions for the Read & Watch Desktop Native Integration.
 * Phase 14 — Desktop Native Integration.
 */

export interface DesktopFileInfo {
  path: string;
  name: string;
  size: number;
  ext: string;
}

export interface ChooseBookFilesResult {
  canceled: boolean;
  files: DesktopFileInfo[];
}

export interface ChooseDataRootResult {
  canceled: boolean;
  path?: string;
  error?: string;
}

export interface DesktopAppPaths {
  isDesktop: boolean;
  version: string;
  platform: string;
  dataRoot: string;
  libraryRoot: string;
  userDataRoot: string;
  isPackaged: boolean;
}

export interface ResolvedOpenFileResult {
  found: boolean;
  itemId?: string;
  title?: string;
  file: DesktopFileInfo & { hash: string };
}

export interface ReadWatchDesktopBridge {
  isDesktop: boolean;
  chooseBookFiles(options?: { multiple?: boolean }): Promise<ChooseBookFilesResult>;
  chooseDataRoot(): Promise<ChooseDataRootResult>;
  getAppPaths(): Promise<DesktopAppPaths>;
  openExternalHttps(url: string): Promise<{ ok: boolean; error?: string }>;
  onOpenFile(callback: (file: DesktopFileInfo) => void): () => void;
  getPendingOpenFiles(): Promise<DesktopFileInfo[]>;
  resolveOpenFile(path: string): Promise<ResolvedOpenFileResult>;
}

declare global {
  interface Window {
    readWatchDesktop?: ReadWatchDesktopBridge;
  }
}
