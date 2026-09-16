# Linux Packaging Scripts

## Purpose

This directory serves as the home for Linux build automation, packaging wrappers, and environment verification scripts.

## Planned Command Contract

Future Linux build orchestration will be invoked from project scripts:

```bash
# General Linux packaging (AppImage, deb):
npm run package:linux

# Explicit architecture-specific targets:
npm run package:linux:x64
```

## Security and Portability Policies

- Scripts must avoid hardcoding distribution-specific binary paths (`/bin` vs `/usr/bin`).
- Dynamic library dependency audits (`ldd`) must be automated to detect glibc or system library version mismatches.
- All packaging outputs are written to `App/app/dist-electron/` and must never be tracked in Git.
