# Linux Packaging Assets

## Purpose

This directory manages Linux-specific icons, desktop application entries, and MIME database XML definitions.

## Required Asset Specifications

1. **Freedesktop Application Icons:**
   - Vector icon: `read-and-watch.svg` (installed to `/usr/share/icons/hicolor/scalable/apps/`).
   - Raster icons: `read-and-watch.png` at standardized sizes:
     - 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512 pixels.
     - Installed to `/usr/share/icons/hicolor/<size>/apps/`.
2. **Desktop Entry File (`read-and-watch.desktop`):**
   - Compliant with FreeDesktop Desktop Entry Specification v1.5.
   - Includes localized strings, categories, window class matching, and MIME type associations.
3. **MIME Database Package (`read-and-watch-mime.xml`):**
   - FreeDesktop Shared MIME-Info database XML registering document associations.

## Asset Policy

- Assets must be verified for correct rendering across major Linux desktop environments (GNOME, KDE Plasma, XFCE).
- Do not fabricate placeholder branding; asset definitions will be populated in the dedicated Linux implementation run.
