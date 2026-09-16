# Windows Installer Configuration

## Purpose

This directory documents the configuration, registry integration, and lifecycle specifications for the Windows NSIS installer.

## NSIS Configuration Properties (Active in `App/app/package.json`)

- **Installation Scope:** `oneClick: false`, `perMachine: false`, `allowToChangeInstallationDirectory: true`.
  - Default Target Path: `%LOCALAPPDATA%\Programs\ReadAndWatch`
  - Privilege Level: Standard User (No administrator elevation / UAC prompt required for setup).
- **Uninstall Data Preservation Policy:**
  - `deleteAppDataOnUninstall: false` (Protects user databases, notes, and local library data across uninstall/reinstall cycles).
- **Shortcuts:**
  - `createDesktopShortcut: true`
  - `createStartMenuShortcut: true`
  - Shortcut Name: `Read & Watch`

## File Association Registration

Registry entries are written under `HKEY_CURRENT_USER\Software\Classes` mapping document extensions to `Read & Watch.exe`:
- `.epub`, `.pdf`, `.mobi`, `.azw`, `.azw3`, `.fb2`, `.fbz`, `.cbz`
- Non-hijacking policy: registers open-with capability without overriding system defaults.
