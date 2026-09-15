/**
 * Electron Main Process for Read & Watch.
 * Phase 14 — Desktop Native Integration.
 *
 * Implements:
 * - Single-instance locking (prevents multiple writers on SQLite database)
 * - Safe Windows Open-With and file association argument handling
 * - Least-privilege IPC command handlers
 * - Sandboxed renderer with context isolation and disabled nodeIntegration
 * - Embedded loopback HTTP service (127.0.0.1 with ephemeral port)
 * - Graceful lifecycle termination with zero lingering background processes
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDesktopService } from './desktop-service.mjs';

const SUPPORTED_EXTENSIONS = new Set([
  '.epub',
  '.pdf',
  '.mobi',
  '.azw',
  '.azw3',
  '.fb2',
  '.fbz',
  '.cbz',
]);

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const preloadPath = fileURLToPath(new URL('./preload.mjs', import.meta.url));

// -----------------------------------------------------------------
// 1. Single-Instance Enforcement
// -----------------------------------------------------------------
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // A primary instance is already running; terminate this second instance immediately.
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let desktopServiceInstance = null;
let activeServiceOrigin = null;
const pendingOpenFiles = [];

/**
 * Extracts and canonicalizes valid book file paths from Windows CLI launch arguments.
 */
function parseBookArgs(argv) {
  const results = [];
  if (!Array.isArray(argv)) return results;

  for (const arg of argv) {
    if (!arg || typeof arg !== 'string') continue;
    // Skip electron/node switches (e.g. --inspect, --remote-debugging-port, .)
    if (arg.startsWith('-') || arg === '.') continue;

    try {
      const resolved = resolve(arg);
      if (existsSync(resolved)) {
        const canonical = realpathSync(resolved);
        const st = statSync(canonical);
        if (st.isFile()) {
          const ext = extname(canonical).toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            const name = canonical.split(/[/\\]/).pop() || '';
            results.push({
              path: canonical,
              name,
              size: st.size,
              ext,
            });
          }
        }
      }
    } catch {
      // Ignore invalid or unreadable path arguments
    }
  }
  return results;
}

function handleIncomingFile(fileInfo) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop:open-file', fileInfo);
  } else {
    pendingOpenFiles.push(fileInfo);
  }
}

// Handle initial launch arguments
const initialFiles = parseBookArgs(process.argv.slice(app.isPackaged ? 1 : 2));
for (const f of initialFiles) {
  pendingOpenFiles.push(f);
}

// -----------------------------------------------------------------
// 2. Second-Instance Handling (Open-With while already running)
// -----------------------------------------------------------------
app.on('second-instance', (_event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  const incoming = parseBookArgs(commandLine.slice(app.isPackaged ? 1 : 2));
  for (const f of incoming) {
    handleIncomingFile(f);
  }
});

// -----------------------------------------------------------------
// 3. Window & Service Lifecycle
// -----------------------------------------------------------------
async function createWindow() {
  // Start the internal desktop loopback service
  const service = createDesktopService({ appRoot });
  desktopServiceInstance = await service.start(0, '127.0.0.1');
  activeServiceOrigin = desktopServiceInstance.origin;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Read & Watch',
    backgroundColor: '#fbfbfa', // Warm editorial background
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Remove default menu for clean, calm interface
  mainWindow.setMenuBarVisibility(false);

  // Security: Guard window navigation and new windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') {
        void shell.openExternal(url);
      }
    } catch {
      // Refuse invalid URLs
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(activeServiceOrigin)) {
      event.preventDefault();
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:') {
          void shell.openExternal(url);
        }
      } catch {
        // Refuse
      }
    }
  });

  // Load the desktop service
  const devUrl = process.env.ELECTRON_DEV_URL;
  if (devUrl && !app.isPackaged) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadURL(activeServiceOrigin);
  }

  // Once window has finished loading, flush any queued open files
  mainWindow.webContents.once('did-finish-load', () => {
    while (pendingOpenFiles.length > 0) {
      const f = pendingOpenFiles.shift();
      if (f) mainWindow.webContents.send('desktop:open-file', f);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// -----------------------------------------------------------------
// 4. Least-Privilege IPC Handlers
// -----------------------------------------------------------------
ipcMain.handle('desktop:choose-book-files', async (_event, options = {}) => {
  if (!mainWindow) return { canceled: true, files: [] };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Book or Document',
    filters: [
      {
        name: 'Books & Documents (*.epub, *.pdf, *.mobi, *.azw, *.azw3, *.fb2, *.cbz)',
        extensions: ['epub', 'pdf', 'mobi', 'azw', 'azw3', 'fb2', 'fbz', 'cbz'],
      },
      { name: 'All Files (*.*)', extensions: ['*'] },
    ],
    properties: [
      'openFile',
      options.multiple ? 'multiSelections' : null,
    ].filter(Boolean),
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true, files: [] };
  }

  const files = [];
  for (const fp of result.filePaths) {
    try {
      const canonical = realpathSync(fp);
      const st = statSync(canonical);
      if (st.isFile()) {
        files.push({
          path: canonical,
          name: canonical.split(/[/\\]/).pop() || '',
          size: st.size,
          ext: extname(canonical).toLowerCase(),
        });
      }
    } catch {
      // Skip invalid
    }
  }

  return { canceled: false, files };
});

ipcMain.handle('desktop:choose-data-root', async () => {
  if (!mainWindow) return { canceled: true };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Read & Watch Data Folder',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const chosenPath = resolve(result.filePaths[0]);
  const repoRoot = resolve(appRoot, '..', '..');
  const fromRoot = relative(repoRoot, chosenPath);
  const isInside = fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot));

  // Verify that the chosen path is OUTSIDE the Git repository
  if (isInside) {
    return {
      canceled: false,
      error: 'Data folder must be outside the Git repository root',
    };
  }

  return { canceled: false, path: chosenPath };
});

ipcMain.handle('desktop:get-app-paths', async () => {
  return {
    isDesktop: true,
    version: app.getVersion(),
    platform: process.platform,
    dataRoot: desktopServiceInstance?.paths?.dataRoot || '',
    libraryRoot: desktopServiceInstance?.paths?.libraryRoot || '',
    userDataRoot: desktopServiceInstance?.paths?.userDataRoot || '',
    isPackaged: app.isPackaged,
  };
});

ipcMain.handle('desktop:open-external-https', async (_event, url) => {
  if (typeof url !== 'string') return { ok: false, error: 'Invalid URL' };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return { ok: false, error: 'Only HTTPS links are permitted' };
    }
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to open URL' };
  }
});

ipcMain.handle('desktop:get-pending-open-files', async () => {
  const copy = [...pendingOpenFiles];
  pendingOpenFiles.length = 0;
  return copy;
});

ipcMain.handle('desktop:resolve-open-file', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string' || !existsSync(filePath)) {
    return { found: false, error: 'File not found' };
  }

  try {
    const canonical = realpathSync(filePath);
    const res = await fetch(`${activeServiceOrigin}/api/desktop/resolve-open-file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ReadWatch-Session-Token': desktopServiceInstance?.sessionToken || '',
      },
      body: JSON.stringify({ path: canonical }),
    });
    return await res.json();
  } catch (err) {
    return { found: false, error: err.message };
  }
});

// -----------------------------------------------------------------
// 5. Clean Exit Handlers
// -----------------------------------------------------------------
void app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  if (desktopServiceInstance) {
    try {
      await desktopServiceInstance.close();
    } catch {
      // Ignore
    }
  }
  app.quit();
});

app.on('before-quit', async () => {
  if (desktopServiceInstance) {
    try {
      await desktopServiceInstance.close();
    } catch {
      // Ignore
    }
  }
});
