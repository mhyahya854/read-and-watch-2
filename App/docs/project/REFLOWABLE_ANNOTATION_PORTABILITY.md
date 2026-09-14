# Reflowable Annotation Portability Strategy & Limitations

**Phase:** PHASE-12 (Export and Portability)  
**Task:** P12-T006  
**Status:** Approved Architectural Policy  

---

## 1. The Reflowable In-Place Mutation Dilemma

Many proprietary or ad-hoc eBook readers attempt to write user highlights directly into EPUB files by unzipping the archive, injecting `<mark>` tags or inline CSS styles into XHTML documents, and repacking the ZIP file.

Read & Watch **strictly rejects in-place reflowable mutation** for the following technical and architectural reasons:

1. **Source Immutability Principle:**  
   User library sources are immutable primary assets. Mutating an EPUB alters its cryptographic SHA-256 digest, breaking all existing content-hash relationships across user notes, reading history, canvas links, and library manifests.
2. **Standard Non-Existence:**  
   There is no vendor-neutral, universally supported standard for embedding arbitrary user highlights inside EPUB files. Injected markup is routinely stripped, ignored, or rendered incorrectly by other readers (e.g. Apple Books, Calibre, KOReader).
3. **DRM and Digital Signature Invalidation:**  
   Modifying file contents within an EPUB breaks EPUB canonical signatures and container checksums.
4. **Archive Repackaging Divergence:**  
   Repackaging an EPUB archive can alter ZIP compression levels, directory ordering, or introduce Zip-Slip security risks.
5. **Non-EPUB Reflowable Formats:**  
   Formats such as MOBI, AZW, AZW3, FB2, and CBZ are binary or distinct archive formats with zero mechanism for standard highlight injection.

---

## 2. The Read & Watch External Sidecar Strategy

Read & Watch implements **lossless external sidecar portability**:

1. **Deterministic Sidecar Files:**  
   Annotations are exported into standardized, versioned `read-watch.annotations` JSON packages (or companion human-readable Markdown files) stored outside the source publication.
2. **Anchor Resilience Envelope:**  
   Reflowable anchors store an EPUB Canonical Fragment Identifier (CFI) range (`startCfi`, `endCfi`), spine index, exact selected quote text, and prefix/suffix character context.
3. **Integrity & Re-resolution:**  
   The sidecar records the source document's SHA-256 digest. When reopened in Read & Watch, the engine matches the anchor:
   - Primary: Exact CFI match.
   - Secondary (Fuzzy): If the book edition or font layout shifts slightly, prefix/quote/suffix context re-identifies the passage without losing user thoughts.
   - Guard: If the source hash completely diverges, the reader reports a calm mismatch notice rather than corrupting the display.
4. **Human-Readable Markdown Companion:**  
   For reading notes on arbitrary devices, export produces clean Markdown containing quoted passages, chapter headings, and notes.

---

## 3. Truthful Compatibility Claims

- **Guaranteed:** 100% lossless export, transfer, and restoration between Read & Watch installations across any machine or operating system.
- **Explicit Non-Claim:** Read & Watch does NOT claim that third-party EPUB reading devices will natively display Read & Watch highlights directly inside the source EPUB file, because no standard exists for doing so safely.
- **Zero Source Writes:** The source EPUB, MOBI, AZW, FB2, and CBZ files remain 100% byte-identical before, during, and after all export operations.
