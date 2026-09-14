# Foliate-JS Engine Provenance

## Upstream Metadata

- **Official Repository**: https://github.com/johnfactotum/foliate-js
- **Maintainer**: John Factotum
- **License**: MIT License (see `LICENSE`)
- **Pinned Commit SHA**: `78914aef4466eb960965702401634c2cb348e9b1`
- **Pinned Branch**: `main`
- **Commit Date**: 2026-05-01 21:24:25 +0200
- **Commit Message**: `Use original hrefs for external links and add isExternal in fb2.js (#129)`
- **Acquisition Date**: 2026-09-14
- **Acquisition Method**: Pinned upstream source snapshot of core reflowable engine modules.

## Included Modules

- `LICENSE`: MIT License
- `README.md`: Upstream documentation and interface specifications
- `view.js`: Custom element `<foliate-view>` coordinating layout, sections, navigation, and events
- `paginator.js`: Reflowable paginator for paginated and continuous layout modes
- `fixed-layout.js`: Fixed-layout renderer for pre-paginated publications
- `epub.js` & `epubcfi.js`: EPUB container, package, manifest, spine, and CFI implementation
- `mobi.js`: Mobipocket and Amazon KF8 / AZW3 parser
- `fb2.js`: FictionBook 2 XML format parser
- `comic-book.js`: CBZ comic archive unpacker
- `progress.js`: Location and section progression calculation
- `overlayer.js`: Overlay and text highlight renderer
- `search.js`: In-book full text search across section documents
- `text-walker.js`: Text node iteration utility
- `uri-template.js`: RFC 6570 URI template utility
- `vendor/zip.js`: Pure JavaScript zip archive decompression (`@zip.js/zip.js`, MIT)
- `vendor/fflate.js`: Pure JavaScript deflate/inflate decompression (`fflate`, MIT)

## Explicitly Excluded Modules

- `pdf.js`: Experimental PDF renderer in Foliate-JS is excluded per Phase 05 constraints (Phase 06 PDF engine owns PDF integration).
- `reader.html`, `reader.js`, `ui/`: Foliate demo application chrome is excluded. Read & Watch owns all application chrome, navigation, toolbars, and visual presentation.
- `dict.js`, `tts.js`, `opds.js`, `footnotes.js`: Non-core features deferred to their designated roadmap phases.

## Local Modifications

- Zero modifications were made to the acquired upstream source files. All integration is conducted through the Phase 04 `DocumentAdapter` contract boundary.
