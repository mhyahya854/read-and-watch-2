# Linux Desktop Packaging Layer

## Purpose and Strategy

Read & Watch on Linux delivers a native, first-class workstation experience across both bleeding-edge and long-term stable Linux distributions.

The packaging strategy employs three distribution formats:
1. **Arch Linux Native Package (`.pkg.tar.zst`):** Primary deep-certification target. Engineered for direct integration with `pacman` on the user's primary Linux development environment.
2. **Debian Package (`.deb`):** Secondary broad compatibility target. Tested and certified on Ubuntu LTS for maximum mainstream Linux reach.
3. **AppImage (`.AppImage`):** Portable, self-contained single-file executable for distribution-agnostic execution.

---

## Linux Target Certification Matrix

| Target | Distribution / Base | Format | Purpose | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Arch Linux** | Arch Linux (Rolling, current kernel) | `.pkg.tar.zst` | Primary deep-certification platform | **NOT_STARTED** |
| **Ubuntu LTS** | Ubuntu 24.04 LTS (Noble Numbat) | `.deb` | Secondary mainstream enterprise/desktop platform | **NOT_STARTED** |
| **General Linux** | Cross-distro standard | `.AppImage` | Standalone portable zero-install execution | **NOT_STARTED** |

---

## Linux Technical and Architectural Considerations

Future platform implementation and certification runs must explicitly address and verify the following Linux-specific systems concerns:

1. **XDG Base Directory Compliance:**
   - User Data: `$XDG_DATA_HOME/read-and-watch` (defaults to `~/.local/share/read-and-watch`)
   - Configuration: `$XDG_CONFIG_HOME/read-and-watch` (defaults to `~/.config/read-and-watch`)
   - Cache: `$XDG_CACHE_HOME/read-and-watch` (defaults to `~/.cache/read-and-watch`)
2. **Desktop Integration:**
   - Standard `.desktop` desktop entry file under `/usr/share/applications/` or `~/.local/share/applications/`.
   - Categories: `Office;Viewer;Literature;Database;Education;`
   - `StartupWMClass`: `read-and-watch`
   - `Exec=read-and-watch %U` (supporting URI and file argument passing).
3. **MIME Type and Open-With Registration:**
   - XML MIME definition installed into `/usr/share/mime/packages/` or `~/.local/share/mime/packages/`.
   - File associations registered for `.epub`, `.pdf`, `.mobi`, `.azw`, `.azw3`, `.fb2`, `.fbz`, `.cbz`.
   - Seamless integration with `xdg-open` and desktop file managers (Thunar, Dolphin, Nautilus).
4. **Display Servers:**
   - Native Wayland support with automatic fallback to X11 (`--ozone-platform-hint=auto`).
   - Window title bar, decoration, and scaling verification across Wayland and X11 compositors (KWin, Mutter, Sway, Hyprland).
5. **Filesystem and POSIX Conventions:**
   - Strict case-sensitive filesystem path handling.
   - Standard POSIX forward-slash path resolution.
   - Verification of executable bit permissions (`+x`) on shipped binaries and helper processes.
6. **IPC and Single-Instance Forwarding:**
   - Robust single-instance locking via Electron `app.requestSingleInstanceLock()`.
   - Secondary instance CLI argument forwarding to the primary active window over local Unix domain socket / loopback.
7. **AppImage and Runtime Dependencies:**
   - FUSE dependency considerations (libfuse2 vs libfuse3 compatibility on modern systems).
   - Electron SUID sandbox vs unprivileged user namespaces (`kernel.unprivileged_userns_clone`).
   - Clean dynamic link audit (`ldd`) verifying no unmet shared library dependencies on clean systems.
8. **Uninstall and Data Retention Semantics:**
   - Package manager removal (`pacman -R read-and-watch`, `apt remove read-and-watch`) removes application binaries while strictly preserving `$XDG_DATA_HOME` user data.
