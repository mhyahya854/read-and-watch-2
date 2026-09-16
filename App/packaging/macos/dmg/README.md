# Apple Disk Image (DMG) Configuration

## Purpose

This directory specifies the layout, background image, and window geometry for the user-facing macOS DMG installer.

## DMG Specifications

- **Format:** UDZO (zlib-compressed read-only disk image).
- **Window Dimensions:** Standard 540x380 px or 660x400 px centered window.
- **Visual Presentation:**
  - Background image indicating drag-to-Applications workflow.
  - Left icon: `Read & Watch.app` (`x: 180, y: 170`).
  - Right icon: `/Applications` symlink (`x: 480, y: 170`).
  - Standard Finder view options (icon size 128x128 px, hidden status bar/path bar).

## Output Policy

- Generated `.dmg` files are stored in `App/app/dist-electron/` and are strictly excluded from version control.
