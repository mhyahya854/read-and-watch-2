/**
 * Preload Script for Read & Watch Desktop.
 * Phase 14 — Desktop Native Integration.
 *
 * Exposes a narrow, typed, least-privilege bridge to the renderer.
 * Enforces strict isolation: nodeIntegration=false, contextIsolation=true, sandbox=true.
 */

import { contextBridge, ipcRenderer } from 'electron';

const desktopBridge = {
  isDesktop: true,

  /**
   * Prompts the user with a native Open File dialog filtered to supported book formats.
   */
  async chooseBookFiles(options = {}) {
    return await ipcRenderer.invoke('desktop:choose-book-files', options);
  },

  /**
   * Prompts the user with a native directory chooser dialog to select a data root.
   */
  async chooseDataRoot() {
    return await ipcRenderer.invoke('desktop:choose-data-root');
  },

  /**
   * Retrieves high-level application paths and packaging status.
   */
  async getAppPaths() {
    return await ipcRenderer.invoke('desktop:get-app-paths');
  },

  /**
   * Validates and opens an external HTTP/HTTPS link in the default OS browser.
   */
  async openExternalHttps(url) {
    return await ipcRenderer.invoke('desktop:open-external-https', url);
  },

  /**
   * Subscribes to incoming Open-With or CLI-passed file events from Windows.
   */
  onOpenFile(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('desktop:open-file', listener);
    return () => {
      ipcRenderer.removeListener('desktop:open-file', listener);
    };
  },

  /**
   * Retrieves any queued files that were passed via launch arguments before the window loaded.
   */
  async getPendingOpenFiles() {
    return await ipcRenderer.invoke('desktop:get-pending-open-files');
  },

  /**
   * Resolves whether an opened file already exists in the library or requires adding.
   */
  async resolveOpenFile(filePath) {
    return await ipcRenderer.invoke('desktop:resolve-open-file', filePath);
  },
};

contextBridge.exposeInMainWorld('readWatchDesktop', desktopBridge);
