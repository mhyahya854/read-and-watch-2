# Desktop Installation, Packaging, and Update Strategy

**Document ID:** `DESKTOP_INSTALL_AND_UPDATE`  
**Phase:** `PHASE-14` (Tasks `P14-T005`, `P14-T006`)  
**Date:** 2026-09-14  
**Status:** Canonical Engineering Specification  
**Target OS:** Windows 10 (64-bit) / Windows 11 (64-bit)  

---

## 1. Overview and Target Platform

Read & Watch desktop is packaged as a Windows-first desktop application powered by a hardened Electron shell. It embeds the Chromium rendering engine and Node 22 LTS runtime, ensuring 100% offline self-containment with zero external framework dependencies or prerequisites.

### Supported Windows Versions
- **Windows 11 (64-bit):** All supported editions (Home, Pro, Enterprise).
- **Windows 10 (64-bit):** Build 19041 (Version 2004) and later.
- **Architecture:** x64 (`win32-x64`). ARM64 supported via emulation or future dedicated target.

### Prerequisites for End Users
- **Zero runtime prerequisites:** Chromium and Node.js are bundled directly into the executable package.
- **No external WebView2 download required.**
- **No administrative privileges required:** Defaults to per-user installation.

---

## 2. Windows Installer Architecture

### Installer Technology: NSIS (Nullsoft Scriptable Install System)
The Windows installer is produced via `electron-builder` utilizing the battle-tested NSIS engine.

#### Installer Characteristics
1. **Per-User Installation (Default):**
   - Target Directory: `%LOCALAPPDATA%\Programs\ReadAndWatch`
   - Does not require Windows User Account Control (UAC) elevation or administrative permissions.
   - Eliminates permission conflicts and corporate restriction blockers.
2. **Optional System-Wide Installation:**
   - Supported via `allUsers: true` or command-line switch (`/allusers`) if administrator installs to `%ProgramFiles%\ReadAndWatch`.
3. **100% Offline Installation:**
   - The installer is completely self-contained. It requires zero internet connectivity during setup.
4. **Desktop and Start Menu Shortcuts:**
   - Creates a Start Menu shortcut under `Read & Watch`.
   - Optional desktop icon created according to standard Windows conventions.

### File Associations and "Open With" Registration
The installer registers Read & Watch as an approved application for certified publication formats in the Windows Registry (`HKEY_CURRENT_USER\Software\Classes`):

| File Extension | MIME Type | Description |
| :--- | :--- | :--- |
| `.epub` | `application/epub+zip` | Electronic Publication (Reflowable / Fixed) |
| `.pdf` | `application/pdf` | Portable Document Format |
| `.mobi` | `application/x-mobipocket-ebook` | Mobipocket eBook |
| `.azw` | `application/x-mobipocket-ebook` | Amazon Kindle Document |
| `.azw3` | `application/x-mobipocket-ebook` | Amazon Kindle Format 8 |
| `.fb2` | `application/x-fictionbook+xml` | FictionBook 2.0 |
| `.fbz` | `application/x-zip-compressed-fb2` | Compressed FictionBook |
| `.cbz` | `application/vnd.comicbook+zip` | Comic Book Archive |

* **Non-Hijacking Policy:** Read & Watch registers its capability in the Windows "Open With" list and Default Programs catalog without aggressively or silently overriding the user's existing default viewer (e.g., Edge or Acrobat for PDF).

---

## 3. Uninstall and Data Preservation Policy

### Strict User Data Preservation
Uninstalling Read & Watch removes application binaries, shortcuts, and registry association keys, but **NEVER deletes user data by default**.

1. **What Uninstall Removes:**
   - `%LOCALAPPDATA%\Programs\ReadAndWatch` (Application binaries, Chromium, runtime).
   - Start Menu and Desktop shortcuts.
   - Shell file association registry entries.
2. **What Uninstall Strictly Preserves:**
   - `READ_WATCH_DATA_ROOT` (User library, SQLite database `read-watch.sqlite3`, notes, annotations, canvases, diagrams, and backups).
   - User configuration and local application settings.
3. **Reinstallation Guarantee:**
   - Reinstalling Read & Watch and pointing to the existing `READ_WATCH_DATA_ROOT` restores 100% of the library, reading positions, annotations, and notes with zero data loss.

---

## 4. Update Strategy (Strictly Non-Silent)

### Master Plan Anti-Pattern: No Silent Auto-Updates
In accordance with explicit project governance and data safety principles:
- **Silent, background updating is FORBIDDEN.**
- Binaries will never mutate or update behind the user's back.
- Application updates must be explicitly initiated or confirmed by the user.

### Update Discovery and Verification Workflow
1. **Manual Check or Passive Prompt:**
   - The user may click "Check for Updates" in Settings, or a non-intrusive banner notifies: *"A new version (vX.Y.Z) is available."*
2. **Authenticity & Integrity Verification:**
   - Update manifests specify SHA-256 cryptographic hashes and release notes.
   - The installer signature (Authenticode) is verified by Windows SmartScreen / OS trust provider before execution.
3. **User Confirmation:**
   - The user is shown what version will be installed, what changes are included, and an explicit "Install and Restart" button.
   - The update will only apply when the user explicitly clicks the button.
4. **Offline Capability:**
   - If no internet connection is present, update checks fail silently and gracefully without displaying blocking error dialogs. The application operates normally 100% offline.

---

## 5. Code Signing and Authenticode

### Signing Architecture
1. **Framework Release Signing:**
   - In production releases, the NSIS installer executable and all application `.exe` / `.dll` binaries must be signed with a valid Microsoft Authenticode code-signing certificate (EV or standard) using `signtool.exe`.
2. **Private Key Protection:**
   - Private signing keys (PFX, P12, HSM keys) must **NEVER** be committed to Git, stored in the repository, or exposed in CI logs.
3. **Current Test Build Status:**
   - **Status: UNSIGNED TEST BUILD**.
   - For local development and Phase 14 verification, builds are produced without a commercial Authenticode certificate.
   - Windows SmartScreen may display an unknown publisher alert ("Windows protected your PC") on clean test machines until an official certificate is provisioned in Phase 20 (Final Release Certification).
   - This limitation is documented truthfully; no fake production claims are made.

---

## 6. Update Rollback and Migration Safety

### Rollback Procedure
If a user upgrades to Build B and encounters an issue, they can roll back to Build A using the following verified procedure:
1. Close Read & Watch.
2. Run the uninstaller for Build B (or install Build A over Build B).
3. **Database Compatibility Consideration:**
   - Before applying any forward schema migration, Read & Watch automatically creates a backup snapshot of `read-watch.sqlite3` under `user-data/.backup/`.
   - If Build A's schema version is lower than Build B's, the application detects the schema mismatch on startup, displays a safe recovery prompt, and allows restoring from the pre-migration snapshot.
4. Launch Build A; library and annotations load cleanly from the compatible snapshot.

---

## 7. Build and Packaging Commands

### Reproducible Build Pipeline
From `App/app/`:
```powershell
# 1. Build web application assets (React 19 + Vite/vinext)
npm run build

# 2. Package Windows desktop application (NSIS installer + portable)
npm run package:win
```

### Packaging Artifact Rules
- Installers are saved externally to `dist/installers/` or the external review directory.
- All built `.exe` and `.nsis` files are strictly excluded by `.gitignore`.
- Zero personal data, credentials, or actual book files are packaged into the installer.
