# macOS Packaging Assets

## Purpose

This directory holds macOS-specific icon assets and bundle metadata.

## Required Asset Specifications

- `icon.icns`: Apple Icon Image format containing multi-scale representations:
  - 16x16, 32x32, 64x64, 128x128, 256x256, 512x512, 1024x1024 points (standard and `@2x` Retina assets).
  - Used for Finder, Dock, Spotlight, and Launchpad display.
- Document Type Icons: (Optional) Distinctive document type icons for `.epub` and `.pdf` files when associated with Read & Watch.

## Policy

- Icon sets must adhere to Apple Human Interface Guidelines (squircle canvas, correct margins, lighting, drop shadows).
- Placeholder icons must not be fabricated; assets will be integrated during the dedicated macOS phase.
