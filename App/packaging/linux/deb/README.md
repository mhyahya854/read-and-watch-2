# Debian / Ubuntu Package (`.deb`)

## Purpose

This directory manages Debian-family binary package metadata, control files, and post-installation hook definitions for Ubuntu LTS and Debian-derived systems.

## Target Platform

- **Distribution:** Ubuntu 24.04 LTS (Noble Numbat) / Debian 12 (Bookworm)
- **Package Architecture:** `amd64`
- **Output Artifact:** `read-and-watch_<version>_amd64.deb` (Untracked, external)

## Package Specifications

- **Installation Directory:** `/opt/ReadAndWatch/` or `/usr/lib/read-and-watch/`
- **Binary Symlink:** `/usr/bin/read-and-watch`
- **Package Dependencies:** Explicitly declared in Debian control file (e.g., `libnotify4`, `libnss3`, `xdg-utils`, `ca-certificates`).
- **Maintainer Scripts:**
  - `postinst`: Invokes `update-desktop-database` and `update-mime-database`.
  - `postrm`: Cleanly deregisters desktop/MIME caches. Strictly preserves `$XDG_DATA_HOME` user data.

## Future Certification Scope

In the dedicated Ubuntu LTS certification run:
- Unattended installation via `dpkg -i` / `apt install`.
- Verification of cold launch, offline capability, MIME associations, data persistence across package removal, and complete reinstallation verification.
