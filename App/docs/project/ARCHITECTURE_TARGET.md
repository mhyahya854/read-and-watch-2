# Architecture Target

## Ownership rule

> Engines provide capabilities. Read & Watch owns the experience.

Read & Watch owns UI, navigation, library, metadata, stable identity, storage, annotations, bookmarks, notes, reading positions, drawings, canvases, OCR orchestration, diagrams, relationships, search UX, settings, privacy/legal UX, export, and future intelligence. Engines never become canonical owners of user data.

```text
                              READ & WATCH
                                   |
                    OUR UI + OUR DATA + OUR LOGIC
                                   |
          +------------------------+------------------------+
          |                        |                        |
       LIBRARY                   READER                 KNOWLEDGE
          |                        |                        |
        React               DocumentAdapter                 |
          |                        |                        |
          |              +---------+---------+              |
          |              |                   |              |
          |      REFLOWABLE BOOK             PDF             |
          |              |                   |              |
          |         Foliate-JS             PDF.js            |
          |                                                  |
          |                         OUR ANNOTATIONS           |
          |                               |                  |
          |                    +----------+----------+       |
          |                    |                     |       |
          |                PAGE MARKS           BOOK NOTES   |
          |                                          |       |
          |                                      Excalidraw  |
          |                                                  |
          |                                           +------+------+
          |                                           |             |
          |                                      React Flow      Mermaid
          |                                     when useful     when useful
          |
          +---------------- OUR LIBRARY DATA ----------------+
                                   |
                         Read & Watch SQLite
                         + file-first recovery
                                   |
                      READ_WATCH_DATA_ROOT
```

## Adapter boundary

The reader contract is capability-driven. A candidate baseline is:

```text
DocumentAdapter

open()
close()

getMetadata()
getTOC()

getCurrentLocation()
goTo()

search()

getSelection()
createTextAnchor()
resolveTextAnchor()

getCapabilities()
```

PDF and reflowable differences stay behind adapters and capability checks. Unrelated React components must not accumulate scattered format conditionals.

## Data target

Phase 01 must validate a Read & Watch-owned SQLite database plus file-first export/recovery. The common layer supports stable ID, collection type, title, manual metadata, custom properties, status, tags, rating, images, provenance, relationships, search, notes, and attachments.

Read-specific extensions include authors, formats, series, series position, languages, progress, locations, highlights, bookmarks, and canvases. Watch-specific extensions include creators/directors, media type, genre, progress, notes, and preserved Notion-derived properties. Watch is not forced into a book schema.

Existing stable IDs, 90 Notion-derived records, the user-added-book model, source immutability, and file-first recovery are compatibility constraints.

## Late OCR extension

The application must be fully usable without OCR.

```text
LATE OCR EXTENSION

PDF.js
  |
  +-- usable text PDF -> native text layer
  |
  +-- flat / unusable scan PDF
            |
            +-- PaddleOCR-VL
            +-- Tesseract validator
            +-- benchmarked Urdu/Nastaliq specialist
            +-- human review / correction memory
```

OCR does not alter original PDFs and is not an early dependency.
