# Windows Packaging Scripts

## Purpose

This directory holds helper scripts, validation tools, and build orchestration utilities specific to the Windows build and distribution process.

## Canonical Build Commands

The primary packaging commands remain defined in `App/app/package.json`:

```bash
# Generate unpacked desktop application directory for inspection:
npm run desktop:pack
# Equivalent to: electron-builder --win --x64 --dir

# Produce certified NSIS installer executable and portable binary:
npm run package:win
# Equivalent to: electron-builder --win --x64
```

## Security and Integrity Guidelines

- Build scripts must never execute commands requiring administrator privileges.
- Packaging scripts must verify clean local working trees before building release artifacts.
- Output binaries are placed into `App/app/dist-electron/` which is strictly excluded by `.gitignore`.
