# Windows Desktop Packaging Layer

## Status: CERTIFIED (Phase 16)

Windows packaging and distribution is fully operational and certified.

- **Packaging Authority:** `electron-builder` configuration in `App/app/package.json`
- **Current Certified Targets:**
  1. `nsis` — Nullsoft Scriptable Install System per-user installer
  2. `portable` — Standalone zero-install portable executable
- **Certified Installer Artifact:**
  - File: `Read & Watch Setup 0.1.0.exe`
  - Size: 195,706,134 bytes
  - SHA-256: `FBAA12C9EB86146E802FEA28BC16E4CAB0D97B4E328A15B7420CF94428F87CE3`
  - Source Commit: `47c4fd79e774ff71c3a2cceb8ea6486d192dbae5`
- **Certified Clean-Install Environment:** Official clean Windows 11 Pro (Build 26200, 64-bit) VM under Oracle VirtualBox 7.2.18 (12/12 gates PASS).
- **Certified File Associations:** `.epub`, `.pdf`, `.mobi`, `.azw`, `.azw3`, `.fb2`, `.fbz`, `.cbz`.

---

## Authority and Migration Safeguards

1. **Current Authority Remains `App/app/package.json`:** The active `build.win` and `build.nsis` configurations in `App/app/package.json` remain authoritative.
2. **Zero Modification in Structural Run:** This scaffolding run does not alter, move, or refactor working Windows packaging scripts or configurations.
3. **No Certification Invalidation:** Certified Windows evidence remains 100% valid because application runtime and packaging configurations are untouched.
4. **Future Normalization:** If packaging configuration is eventually normalized into external configuration files (e.g., `electron-builder.windows.yml`), such migration must occur only under a dedicated Windows regression test.
