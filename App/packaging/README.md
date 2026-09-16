# Read & Watch Cross-Platform Desktop Packaging Architecture

## Core Architectural Principle

> **"ONE READ & WATCH APPLICATION, THREE THIN DISTRIBUTION LAYERS."**

Read & Watch is engineered from a single, shared canonical application codebase. The core application logic, Next.js/Vinext server components, React UI, document adapters (Foliate reflowable engine, PDF.js engine), Excalidraw note canvas, Mermaid graph rendering, full-text search (SQLite FTS5), and Electron main orchestration reside strictly within `App/app/`.

The platform directories under `App/packaging/` represent thin, non-forking distribution layers responsible solely for operating-system packaging metadata, installer creation, file association definitions, static packaging icons, entitlements, and deployment automation.

---

## Directory Organization

```text
App/packaging/
├── shared/       # Shared branding specifications, document extensions, metadata
├── windows/      # Windows NSIS and portable packaging layer (Certified)
├── linux/        # Linux packaging layer (Arch Linux pkg.tar.zst, Debian/Ubuntu .deb, AppImage)
└── macos/        # macOS packaging layer (Apple Silicon arm64, Intel x64, DMG, entitlements)
```

---

## Non-Forking Invariants

1. **One Authoritative Application:** Application source lives exclusively in `App/app/`. Platform folders must never contain copied React trees, duplicated Electron main processes, alternative storage implementations, or divergent reader engines.
2. **Runtime Code Boundaries:** If platform-specific runtime behaviors are required (such as macOS `open-file` event handling or Linux XDG path resolution), they must reside in structured internal modules (e.g., `App/app/electron/platform/`), never in duplicate application shells.
3. **No Generated Binaries in Git:** Installers (`.exe`, `.AppImage`, `.deb`, `.pkg.tar.zst`, `.dmg`), unpacked distribution directories (`dist-electron/`), and intermediate compilation artifacts must never be committed to Git.
4. **Zero Credential Exposure:** Code-signing certificates, private keys, keystores, Apple Developer notarization credentials, and API secrets are strictly forbidden from entering Git.
5. **Zero Private Data Exposure:** Personal databases, source books, notes, annotations, and user libraries remain external under `READ_WATCH_DATA_ROOT`.
6. **Zero Virtual Machine Disks in Git:** ISO files, VirtualBox VDI/VMDK disks, and VM configuration states are external test assets.
7. **External Evidence Vault:** Full certification logs, VM run records, and visual evidence are archived externally under `READ_WATCH_DATA_ROOT/hardening/`.

---

## Target Matrix and Distribution Formats

| Operating System | Primary Target Format | Secondary / Auxiliary Target | Architecture(s) | Certification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Windows** | NSIS Installer (`.exe`) | Portable Executable (`.exe`) | `x64` | **CERTIFIED** (Phase 16) |
| **Arch Linux** | Pacman Native Package (`.pkg.tar.zst`) | AppImage (`.AppImage`) | `x64` | **NOT_STARTED** (Pre-OCR Gate) |
| **Ubuntu LTS** | Debian Package (`.deb`) | AppImage (`.AppImage`) | `x64` | **NOT_STARTED** (Pre-OCR Gate) |
| **macOS** | Disk Image (`.dmg` containing `.app`) | Zip Archive (`.zip`) | `arm64` (Apple Silicon), `x64` (Intel) | **NOT_STARTED** (Pre-OCR Gate) |

---

## Pre-Phase-17 Hard Certification Gate

By project governance mandate, **all four platform certification stages must achieve 100% PASS before Phase 17 (OCR Foundation) may begin**:

1. **Windows** — Certified via isolated clean Windows 11 Pro VirtualBox VM.
2. **Arch Linux** — Primary deep Linux certification in clean Arch Linux VM (pacman native package + AppImage).
3. **Ubuntu LTS** — Secondary mainstream Linux compatibility certification in clean Ubuntu VM (`.deb` + AppImage).
4. **macOS** — Apple Silicon/Intel build automation and genuine macOS environment certification.
5. **Phase 17 OCR Foundation** — Gated strictly until all four platforms are fully certified.
