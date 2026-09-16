# Linux AppImage Distribution

## Purpose

AppImage provides an upstream-packaged, self-contained single-file executable designed to run on any modern Linux distribution without administrative installation.

## Key Principles

- **Supplementary Format:** AppImage serves as a broad portable distribution option; it does **not** substitute for deep native package testing on Arch Linux or Debian/Ubuntu LTS.
- **Self-Containment:** Bundles Chromium, Node runtime, application assets, and necessary native libraries.
- **Untracked Binaries:** Produced `.AppImage` files are output to `App/app/dist-electron/` and are strictly excluded from Git.

## Future Certification Requirements

When the Linux certification phase commences, AppImage verification must satisfy:
1. Cold launch on clean Linux installations without pre-installed development dependencies.
2. Complete 100% offline functionality.
3. Proper runtime desktop integration (desktop entry creation via AppImageLauncher or standard integration tools).
4. Correct sandbox execution on modern Linux kernels.
