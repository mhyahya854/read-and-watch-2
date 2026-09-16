# Windows Packaging Assets

## Purpose

This directory serves as the designated location for Windows-specific visual and icon assets used during compilation and packaging.

## Required Assets Specification

- `icon.ico`: Multi-resolution Windows icon containing the following standard canvas sizes:
  - 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256 pixels.
  - Required for desktop shortcuts, Start Menu tiles, taskbar icons, and Explorer shell thumbnails.
- `installerHeader.bmp`: (Optional) NSIS installer custom header bitmap (150x57 px).
- `installerSidebar.bmp`: (Optional) NSIS installer custom wizard sidebar bitmap (164x314 px).

## Canonical Asset Policy

- If canonical branding icon files are introduced, they must be committed directly here.
- Do NOT generate random, fake, or low-quality placeholder icons. When no customized icon is present, the default high-resolution application icon bundled in `App/app/build/icon.ico` is utilized.
