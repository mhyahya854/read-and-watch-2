# macOS Desktop Packaging Layer

## Purpose and Targets

Read & Watch delivers a native macOS application bundle conforming to Apple's design, security, and sandboxing standards.

### Target Artifacts

1. **`Read & Watch.app`:** Standard macOS application bundle.
2. **Apple Disk Image (`.dmg`):** Standard drag-to-Applications user installer with background styling.
3. **Zip Archive (`.zip`):** Compressed application bundle for auto-updater distribution.

### Architecture Support

- **Apple Silicon (`arm64`):** Primary modern target (M1/M2/M3/M4 Macs).
- **Intel (`x64`):** Legacy compatibility target where practical.
- **Universal Binary (`universal`):** Optional unified binary combining arm64 and x64 slices.

---

## Legitimate Infrastructure Policy

> **CRITICAL RULE:** macOS artifacts must be built and certified strictly on authentic Apple-backed macOS infrastructure.

1. **No Host Hackintosh VMs:** Do NOT attempt to run an unsupported, pirated, or unauthorized macOS virtual machine on the Windows host.
2. **Authorized Build & Packaging Infrastructure:**
   - GitHub-hosted macOS runners (`macos-14`, `macos-15`) provide legitimate, compliant Apple hardware for continuous integration, packaging, and headless testing.
   - Genuine Apple Mac hardware or authorized Apple-hosted cloud instances provide the foundation for manual interactive verification.
3. **Signing and Notarization Boundary:**
   - Apple Developer Program credentials (Developer ID Application certificate, private key, notarization API keys) are required for Gatekeeper compliance.
   - Credentials must strictly reside in secure CI secret stores (GitHub Secrets), NEVER in repository code.
   - Unsigned development builds must never be confused with notarized release-ready artifacts.

---

## Runtime Lifecycle Nuances

- **macOS `open-file` Event:** Document opening from Finder or Spotlight triggers Electron's `app.on('open-file', ...)` lifecycle event rather than relying exclusively on process CLI argument parsing. This will be wired and validated in the dedicated macOS implementation phase.
- **Menu Bar & Native Shortcuts:** macOS uses the system menu bar (`Command+Q`, `Command+Comma` for Settings) which requires platform-native window menu integration.
