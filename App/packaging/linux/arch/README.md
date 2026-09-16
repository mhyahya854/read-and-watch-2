# Arch Linux Native Packaging

## Purpose

This directory manages native packaging configuration for Arch Linux, the user's primary desktop Linux environment.

## Key Principles

- **Primary Deep-Certification Target:** Arch Linux represents the primary Linux desktop platform for Read & Watch.
- **Native Package Format:** Targets a native `pacman`-compatible package (`.pkg.tar.zst`) for seamless installation via `pacman -U`.
- **Clean VM Verification:** Certification will be performed inside an official clean Arch Linux installation in an isolated Oracle VirtualBox VM.
- **External Artifacts:** Produced `.pkg.tar.zst` packages are untracked and archived externally.
- **No Speculative PKGBUILD:** Actual `PKGBUILD` scripts will be introduced during the dedicated Arch implementation phase once the build pipeline is finalized.
- **No AUR Publishing in this Phase:** Packaging remains strictly focused on deterministic local artifact generation and clean VM validation.

## Future Arch Certification Scope

- Verification of installation via `pacman -U <package>`.
- Verification of standard Arch desktop conventions (systemd user units if needed, XDG compliance, Wayland/X11 compositors).
- Execution of the full installed-product smoke test suite.
