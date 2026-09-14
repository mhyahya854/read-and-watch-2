# Desktop Native Boundary and Least-Privilege Command Inventory

**Document ID:** `DESKTOP_NATIVE_BOUNDARY`  
**Phase:** `PHASE-14` (Tasks `P14-T002`, `P14-T003`)  
**Date:** 2026-09-14  
**Status:** Canonical Security Specification  

---

## 1. Trust Architecture Overview

Read & Watch maintains an explicit, hardened boundary between the untrusted web frontend and the privileged native runtime.

```text
=================================================================================
[UNTRUSTED RENDERER DOMAIN]
  React 19 UI, Foliate-JS, PDF.js, Excalidraw, React Flow, Mermaid
  Restrictions:
    - nodeIntegration: false
    - contextIsolation: true
    - sandbox: true
    - webSecurity: true
    - CSP: strict-local (no remote script/eval execution, no CDNs)
=================================================================================
                                      │
                   [TYPED PRELOAD CONTEXT BRIDGE]
                   window.readWatchDesktop (5 Narrow APIs)
                                      │
=================================================================================
[PRIVILEGED NATIVE MAIN PROCESS DOMAIN]
  Electron Main Process (Node 22 LTS / Windows 10/11 Win32 APIs)
  Guarantees:
    - Loopback only (127.0.0.1 with ephemeral port and session auth token)
    - Single-instance lock (prevents SQLite database concurrency corruption)
    - Zero generic shell execution (no exec, spawn, powershell, or cmd.exe)
    - Zero arbitrary filesystem access (no generic readFile/writeFile/deleteFile)
    - Source publications are strictly READ-ONLY
=================================================================================
```

---

## 2. Complete Inventory of Native Privileged Commands

Every native command callable by the renderer is documented below. No undocumented command or generic IPC channel exists.

### Command 1: `chooseBookFiles`
* **Name:** `chooseBookFiles`
* **Caller:** React UI (`LibraryToolbar`, `EmptyLibraryState`, or Add Book menu)
* **Purpose:** Allows the user to select one or more local publication files via the native Windows Open File dialog.
* **Input:** `options?: { multiple?: boolean }`
* **Validation:** 
  - Dialog strictly specifies file filters for approved extensions:
    `*.epub`, `*.mobi`, `*.azw`, `*.azw3`, `*.fb2`, `*.fbz`, `*.cbz`, `*.pdf`.
  - Filter `name: 'Books & Documents (*.epub, *.pdf, *.mobi, ...)'`.
* **Permitted Path Scope:** Only files explicitly selected by the user in the OS dialog.
* **Output:** `Promise<{ canceled: boolean, files: Array<{ path: string, name: string, size: number, ext: string }> }>`
* **Failure Mode:** If canceled or on dialog error, returns `{ canceled: true, files: [] }` without throwing.
* **Side Effects:** None. Does not read file contents, mutate files, or alter the database.
* **Security Notes:** User interaction is strictly required (OS dialog). Renderer cannot trigger file discovery silently or scan directories.
* **Why Native Access is Required:** Standard HTML `<input type="file">` does not expose full OS filesystem paths required for referencing external books and checking source immutability hashes.

### Command 2: `chooseDataRoot`
* **Name:** `chooseDataRoot`
* **Caller:** React UI (`SettingsPage`, `PortabilitySettings`, or First-Run Setup)
* **Purpose:** Allows the user to select the directory to use as `READ_WATCH_DATA_ROOT`.
* **Input:** `none`
* **Validation:**
  - Invokes `dialog.showOpenDialog` with properties `['openDirectory', 'createDirectory']`.
  - Verifies that selected directory exists and is a directory.
  - Verifies that selected directory is **OUTSIDE** the Git repository root (rejects attempts to place personal data in the repo).
* **Permitted Path Scope:** Explicitly user-selected directory only.
* **Output:** `Promise<{ canceled: boolean, path?: string, error?: string }>`
* **Failure Mode:** If canceled, returns `{ canceled: true }`. If validation fails, returns `{ canceled: false, error: '...' }`.
* **Side Effects:** None on filesystem. Informs main process of chosen data root.
* **Security Notes:** Prevents repository contamination and directory traversal.
* **Why Native Access is Required:** Web applications cannot browse or select filesystem directory paths.

### Command 3: `getAppPaths`
* **Name:** `getAppPaths`
* **Caller:** React UI (`SettingsPage`, `AppHeader`, Diagnostics)
* **Purpose:** Informs the UI of runtime execution context (version, data root, packaging state).
* **Input:** `none`
* **Validation:** None (read-only state reflection).
* **Permitted Path Scope:** Pre-resolved application paths.
* **Output:** `Promise<{ isDesktop: true, version: string, platform: 'win32', dataRoot: string, libraryRoot: string, isPackaged: boolean }>`
* **Failure Mode:** Returns safe fallback object.
* **Side Effects:** None.
* **Security Notes:** Returns only high-level directory paths; never exposes system credentials, environment secrets, or session tokens.
* **Why Native Access is Required:** Web application needs to know if it is running inside the native desktop shell and where the active data root is located.

### Command 4: `openExternalHttps`
* **Name:** `openExternalHttps`
* **Caller:** React UI (Citation links, external web references in notes/diagrams)
* **Purpose:** Opens a validated external web link in the user's default OS web browser.
* **Input:** `url: string`
* **Validation:**
  - Parses input using `new URL(url)`.
  - Strictly asserts `parsed.protocol === 'https:' || parsed.protocol === 'http:'`.
  - Explicitly rejects `file:`, `javascript:`, `vbscript:`, `cmd:`, `powershell:`, `ms-settings:`, or any other scheme.
* **Permitted Path Scope:** External HTTP/HTTPS URLs only.
* **Output:** `Promise<{ ok: boolean, error?: string }>`
* **Failure Mode:** If protocol is forbidden or URL is invalid, rejects with `{ ok: false, error: 'Protocol not permitted' }`.
* **Side Effects:** Launches the user's default Windows web browser.
* **Security Notes:** Prevents in-app navigation to untrusted sites and protects against protocol-based arbitrary code execution.
* **Why Native Access is Required:** The Electron window must never navigate to external web pages directly; external links must be delegated to the OS browser.

### Command 5: `onOpenFile` / `getPendingOpenFiles`
* **Name:** `onOpenFile` / `getPendingOpenFiles`
* **Caller:** React UI on mount (`AppLayout`, `ReaderController`)
* **Purpose:** Delivers file paths passed to the application via Windows Explorer "Open with" or CLI arguments.
* **Input:** Event callback: `(file: { path: string, name: string, ext: string }) => void`
* **Validation:**
  - Main process strips executable switches (e.g. `--remote-debugging-port`).
  - Canonicalizes path using `path.resolve` and `fs.realpathSync`.
  - Verifies file existence and ensures it is a regular file.
  - Verifies extension against approved list: `.epub`, `.pdf`, `.mobi`, `.azw`, `.azw3`, `.fb2`, `.fbz`, `.cbz`.
  - Rejects unknown or malformed paths.
* **Permitted Path Scope:** The specific file passed in the OS launch arguments.
* **Output:** Delivers validated file descriptor to callback.
* **Failure Mode:** Invalid or unsupported files are dropped with a warning logged in main process.
* **Side Effects:** UI resolves existing library item by SHA-256 or opens import prompt.
* **Security Notes:** Protects against argument injection, UNC path exploits, and path traversal.
* **Why Native Access is Required:** Windows Explorer Open-With invokes the application binary with command-line arguments.

---

## 3. Forbidden Operations & Enforcement

The following primitives are **STRICTLY PROHIBITED** and will fail automated security gates:

1. **Generic Shell Execution:** `child_process.exec`, `child_process.spawn`, `child_process.execFile`, `cmd.exe`, `powershell.exe` are completely absent and forbidden from IPC handlers.
2. **Arbitrary Filesystem Access:** No `readFile(path)`, `writeFile(path, data)`, `deleteFile(path)`, or `renameFile(path)` methods are exposed across the bridge.
3. **Source Book Mutation:** No native API exists to write, alter, or rename source book files. Books remain strictly read-only.
4. **Arbitrary Directory Listing:** No `readdir(path)` is exposed to the renderer.
5. **Direct Database Exposure:** The renderer does not execute raw SQL queries; all data interactions go through tested store contracts.
