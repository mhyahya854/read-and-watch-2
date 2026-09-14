# Desktop Threat Model and Abuse Case Analysis

**Document ID:** `DESKTOP_THREAT_MODEL`  
**Phase:** `PHASE-14` (Task `P14-T007`)  
**Date:** 2026-09-14  
**Status:** Canonical Security Threat Model  

---

## 1. Threat Model Scope and Assumptions

### Assets to Protect
1. **Source Publications:** Original EPUBs, PDFs, MOBIs, AZWs (must remain strictly read-only and byte-identical).
2. **Canonical SQLite Database:** `state/read-watch.sqlite3` containing library records, annotations, bookmarks, canvases, and knowledge structures.
3. **User-Authored Files:** Markdown notes (`thoughts.md`, `notes.md`), canvas definitions (`canvas.json`), and atomic recovery mirrors.
4. **Local OS Integrity:** Preventing arbitrary code execution, privilege escalation, or lateral filesystem compromise via the desktop application shell.

### Core Adversary Assumption (Renderer Compromise)
In accordance with defense-in-depth principles, **we assume the renderer process could become fully compromised** (e.g., via a zero-day in Chromium, an XSS vector in an untrusted SVG/EPUB chapter, or an exploited third-party web dependency).
* **Security Question:** *If an attacker achieves arbitrary JavaScript execution inside the renderer window, what OS damage can they cause?*
* **Security Target:** The attacker must **NOT** be able to execute arbitrary OS commands, read or write arbitrary filesystem locations outside explicit grants, steal user credentials, or mutate source publications.

---

## 2. Threat Analysis and Concrete Abuse Cases

### Abuse Case 1: Malicious Book Filename / Path Traversal
* **Attack Vector:** An attacker crafts a file named `../../../../Windows/System32/evil.epub` or `sample.pdf; calc.exe` and attempts to open it via file chooser or CLI.
* **Mitigation:**
  - File chooser runs in the privileged main process; paths returned are resolved via `path.resolve` and checked for existence.
  - Windows Open-With handlers treat all incoming CLI arguments as untrusted strings. Arguments are checked against a strict allowlist of file extensions and canonicalized using Node's `fs.realpathSync`.
  - Directory traversal tokens (`..`) cannot escape the canonical path normalization.
* **Residual Risk:** Negligible.

### Abuse Case 2: Junction / Symlink / Reparse Point Escape
* **Attack Vector:** An attacker creates a Windows NTFS junction or directory symlink inside `READ_WATCH_DATA_ROOT` pointing to `C:\Windows` or another sensitive directory.
* **Mitigation:**
  - All store path resolvers (`data-paths.mjs`, `safeLibraryFile`) compute `relative(root, resolved)` and assert `!fromRoot.startsWith('..') && !isAbsolute(fromRoot)`.
  - Realpath resolution verifies that the physical target path remains strictly bounded within the intended directory hierarchy.
* **Residual Risk:** Low.

### Abuse Case 3: Hostile Open-With / Command Argument Injection
* **Attack Vector:** A malicious desktop link or file association passes flags such as `--inspect-brk` or `--renderer-cmd-prefix` disguised as a filename to the Read & Watch executable.
* **Mitigation:**
  - Launch argument parser filters out any argument starting with `-` or `--` from the file opening candidate list.
  - Arguments are checked against `fs.statSync` to verify they represent actual existing files before further processing.
* **Residual Risk:** Negligible.

### Abuse Case 4: Malicious URL Protocol Handler Hijack
* **Attack Vector:** A renderer-embedded link tries to invoke `cmd://`, `powershell://`, `ms-settings:`, or `file://C:/Windows/System32/calc.exe`.
* **Mitigation:**
  - The native command `openExternalHttps` parses the target URL with `new URL()` and strictly rejects any protocol that is not `https:` or `http:`.
  - The Chromium window event `will-navigate` blocks all top-level navigations away from the local application origin.
* **Residual Risk:** Negligible.

### Abuse Case 5: Renderer Compromise -> Native Bridge Abuse
* **Attack Vector:** An attacker exploiting an XSS in the renderer attempts to call native Node.js APIs (`fs`, `child_process`) or invoke arbitrary IPC commands.
* **Mitigation:**
  - `nodeIntegration: false` ensures `require` and `process` are completely absent from the DOM window.
  - `contextIsolation: true` ensures the preload context bridge cannot have its prototypes polluted by renderer scripts.
  - `sandbox: true` confines the renderer to an OS-level low-integrity sandbox.
  - The exposed `window.readWatchDesktop` API exposes ONLY 5 specific, strongly validated functions. There is NO `eval`, NO `exec`, NO `spawn`, and NO `readFile`/`writeFile`.
* **Residual Risk:** Low (bounded by the minimal 5-command native facade).

### Abuse Case 6: Local HTTP Backend / CSRF from Web Browsers
* **Attack Vector:** A user visits a malicious website `attacker.com` in their normal browser (Chrome/Edge); the malicious website makes background `fetch('http://127.0.0.1:PORT/api/...')` requests to alter the user's library or database.
* **Mitigation:**
  - The local HTTP service binds **STRICTLY to `127.0.0.1`** (loopback only; never `0.0.0.0` or external interfaces).
  - The service requires a high-entropy cryptographically random session auth token passed in request headers (`X-ReadWatch-Session-Token`).
  - Requests originating from external browser origins without the token receive HTTP 403 Forbidden.
  - CORS headers reject unauthorized origins.
* **Residual Risk:** Negligible.

### Abuse Case 7: Multi-Instance Database Contention
* **Attack Vector:** A user rapidly double-clicks multiple books in Windows Explorer, launching multiple instances of the app that compete to write to `read-watch.sqlite3`, causing database locking or corruption.
* **Mitigation:**
  - Single-instance lock via Electron's `app.requestSingleInstanceLock()`.
  - If a second instance attempts to launch, it immediately forwards its CLI arguments to the primary running instance and cleanly terminates.
  - Only ONE primary instance ever opens the SQLite database in write mode.
* **Residual Risk:** Negligible.

### Abuse Case 8: Source Book Mutation
* **Attack Vector:** The application accidentally writes metadata, annotations, or temporary files back into the original book directory.
* **Mitigation:**
  - Document adapters open publications in read-only streams.
  - Phase 08 retirement eliminated external reader processes that might have auto-imported or altered books.
  - Phase 12 derivative PDF exports explicitly assert `targetPath !== sourcePath` and verify pre/post-export SHA-256 hashes.
  - Automated tests continuously verify 100% byte-identical source files across all operations.
* **Residual Risk:** Negligible.

### Abuse Case 9: Installer Privacy and Data Leakage
* **Attack Vector:** Personal database records, private notes, credentials, or actual book files are packaged into the distributed installer `.exe`.
* **Mitigation:**
  - `electron-builder` configuration explicitly whitelists only build outputs: `dist/client/**/*`, `dist/server/**/*`, `package.json`, `electron/**/*`.
  - All personal data directories (`READ_WATCH_DATA_ROOT`, `library/`, `user-data/`, `state/`, `.env`) are strictly excluded from packaging.
  - Automated pre-packaging hygiene audits verify zero personal files in package directories.
* **Residual Risk:** Negligible.

### Abuse Case 10: DLL Search-Order Hijacking
* **Attack Vector:** An attacker places a malicious DLL in the application directory or working directory on Windows.
* **Mitigation:**
  - Electron uses standard Windows application manifests and loads system libraries from Windows System32.
  - Per-user installation installs to `%LOCALAPPDATA%\Programs\ReadAndWatch`, which is writable only by the current user account.
* **Residual Risk:** Low.

---

## 3. Threat Model Verdict

The architecture satisfies all requirements of verification gate `P14-G001` and `P14-G002`:
- **Least Privilege:** PASS.
- **Renderer Isolation:** PASS.
- **Source Immutability:** PASS.
- **Process Boundaries:** PASS.
