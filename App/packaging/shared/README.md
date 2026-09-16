# Shared Packaging Specifications and Metadata

## Purpose

The `App/packaging/shared/` directory defines cross-platform specifications, shared metadata, supported document format registries, and naming conventions used across all distribution channels (Windows, Linux, macOS).

**Strict Constraint:** This directory contains configuration definitions, asset specifications, and verification schemas only. No runtime application source, React components, Electron main logic, or backend server code may be placed or duplicated here.

---

## Shared Application Metadata

- **Application Name:** `Read & Watch`
- **Package Name / Binary Name:** `read-and-watch` (lowercase, kebab-case for Unix systems; `Read & Watch.exe` on Windows)
- **Application ID:** `com.readandwatch.desktop`
- **Current Canonical Version:** `0.1.0`
- **Description:** Calibre-class private local personal media and knowledge workstation.
- **License:** Permissive (MIT / Apache-2.0 / ISC compliance per `docs/project/UPSTREAM_AND_LICENSE_LEDGER.md`).

---

## Canonical Document Format Associations

All distribution targets must register file associations and MIME handlers for certified publication formats without aggressively seizing default handlers:

| Extension | MIME Type | Format Description | Engine |
| :--- | :--- | :--- | :--- |
| `.epub` | `application/epub+zip` | Electronic Publication (Reflowable / Fixed) | Foliate-JS |
| `.pdf` | `application/pdf` | Portable Document Format | PDF.js |
| `.mobi` | `application/x-mobipocket-ebook` | Mobipocket eBook | Foliate-JS |
| `.azw` | `application/x-mobipocket-ebook` | Amazon Kindle Document | Foliate-JS |
| `.azw3` | `application/x-mobipocket-ebook` | Amazon Kindle Format 8 | Foliate-JS |
| `.fb2` | `application/x-fictionbook+xml` | FictionBook 2.0 | Foliate-JS |
| `.fbz` | `application/x-zip-compressed-fb2` | Compressed FictionBook | Foliate-JS |
| `.cbz` | `application/vnd.comicbook+zip` | Comic Book Archive (ZIP) | Foliate-JS |

---

## Artifact Naming Conventions

All distribution targets follow standardized, deterministic artifact naming patterns:

- **Windows NSIS:** `Read & Watch Setup <version>.exe`
- **Windows Portable:** `Read & Watch <version>.exe`
- **Linux AppImage:** `Read_and_Watch-<version>-x86_64.AppImage`
- **Linux Debian:** `read-and-watch_<version>_amd64.deb`
- **Linux Arch:** `read-and-watch-<version>-1-x86_64.pkg.tar.zst`
- **macOS DMG:** `Read & Watch-<version>-<arch>.dmg` (`arm64` or `x64`)
- **macOS App Bundle:** `Read & Watch.app`

---

## Versioning and Release Policy

1. **Semantic Versioning:** Follows `MAJOR.MINOR.PATCH` semantics.
2. **Synchronized Platform Versions:** All platform installers for a given release must correspond bit-for-bit to the exact same canonical Git commit SHA.
3. **Reproducibility Guarantee:** Any packaged build must be traceable to a specific source commit with matching dependency lockfiles (`package-lock.json`).
