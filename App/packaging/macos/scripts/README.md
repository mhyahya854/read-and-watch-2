# macOS Packaging Scripts

## Purpose

This directory holds future build, packaging, DMG creation, and notarization orchestration scripts for macOS.

## Planned Command Contract

Future macOS packaging commands will be invoked via project scripts:

```bash
# Produce macOS application bundle and DMG:
npm run package:mac

# Architecture-specific builds:
npm run package:mac:arm64
npm run package:mac:x64
```

## Implementation Notice

- Packaging scripts will be implemented during the dedicated macOS packaging phase.
- Scripts must handle Gatekeeper assessment (`spctl -a -vvv -t install <app>`) and notarization staple verification (`xcrun stapler staple <dmg>`).
