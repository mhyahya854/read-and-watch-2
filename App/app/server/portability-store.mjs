/**
 * Portability Store — Canonical Export, Backup, Restore, and Derivative Engine.
 *
 * Phase 12 — Export and Portability.
 *
 * Architecture:
 *   - Canonical application data is authoritative.
 *   - Exports are representations; they do not become the runtime truth.
 *   - Zero absolute paths are exported.
 *   - Original source publications (EPUB, PDF, etc.) are NEVER mutated or overwritten.
 *   - `pdf-lib` is used exclusively for creating NEW annotated PDF derivatives.
 *   - The derived SQLite FTS5 search index is NEVER backed up; it is rebuilt after restore.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  PORTABLE_FORMATS,
  PORTABILITY_SCHEMA_VERSION,
  assertSafePath,
  sanitizeExportFilename,
  validateBackupPackage,
} from './portability-schema.mjs';
import { normalizeLibraryState, readLibraryState } from './library-state.mjs';

function nowUtc() {
  return new Date().toISOString();
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256String(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

function writeAtomic(target, content) {
  mkdirSync(dirname(target), { recursive: true });
  const tmp = join(
    dirname(target),
    `.${basename(target)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  );
  writeFileSync(tmp, content, typeof content === 'string' ? 'utf8' : undefined);
  renameSync(tmp, target);
}

function parseHexColor(hex, fallback = { r: 0.15, g: 0.15, b: 0.15 }) {
  if (!hex || typeof hex !== 'string') return fallback;
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return { r, g, b };
    }
  } else if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return { r, g, b };
    }
  }
  return fallback;
}

export function createPortabilityStore({
  databasePath: _databasePath,
  libraryRoot = null,
  userDataRoot = null,
  libraryStore,
  annotationStore,
  readerStore,
  userDataStore,
  canvasStore,
  searchStore = null,
  knowledgeStore = null,
}) {

  function currentLibraryStateForBackup() {
    const file = readLibraryState(userDataRoot);
    if (file.present) {
      if (!file.ok) {
        throw new Error(file.diagnostics[0]?.message ?? 'Invalid library-state.json.');
      }
      return file.state;
    }
    return normalizeLibraryState({
      schemaVersion: 1,
      savedViews: libraryStore.listViews().map((view) => ({
        id: view.id,
        name: view.name,
        definition: view.definition,
        revision: view.revision,
        createdAtUtc: view.created_at_utc,
        updatedAtUtc: view.updated_at_utc,
      })),
      relationships: libraryStore.listRelationships(),
    });
  }

  // -------------------------------------------------------------------------
  // P12-T002: Annotation Exports (JSON & Markdown)
  // -------------------------------------------------------------------------

  function exportAnnotationsJson({ itemId, includeDeleted = false } = {}) {
    let annotations = [];
    let bookmarks = [];
    let source = undefined;

    if (itemId) {
      annotations = annotationStore.getAnnotations(itemId, { includeDeleted });
      bookmarks = readerStore.getBookmarks(itemId);
      const catalog = libraryStore.getCatalog();
      const item = catalog.items.find((i) => i.id === itemId);
      if (item) {
        source = {
          itemId: item.id,
          title: item.title,
          sourceHash: annotations[0]?.sourceHash ?? (bookmarks[0]?.sourceHash || ''),
          format: item.media?.[0]?.extension?.toUpperCase() || 'DOCUMENT',
        };
      }
    } else {
      // Library-wide annotations
      const catalog = libraryStore.getCatalog();
      for (const item of catalog.items) {
        const itemAnnots = annotationStore.getAnnotations(item.id, { includeDeleted });
        annotations.push(...itemAnnots);
        const itemBms = readerStore.getBookmarks(item.id);
        bookmarks.push(...itemBms);
      }
    }

    // Deterministic sorting
    annotations.sort((a, b) => {
      if (a.itemId !== b.itemId) return a.itemId.localeCompare(b.itemId);
      const pageA = a.anchor?.pageNumber ?? (a.anchor?.spineIndex ?? 0);
      const pageB = b.anchor?.pageNumber ?? (b.anchor?.spineIndex ?? 0);
      if (pageA !== pageB) return pageA - pageB;
      return a.id.localeCompare(b.id);
    });

    bookmarks.sort((a, b) => {
      if (a.itemId !== b.itemId) return a.itemId.localeCompare(b.itemId);
      const pageA = a.pageNumber ?? 0;
      const pageB = b.pageNumber ?? 0;
      if (pageA !== pageB) return pageA - pageB;
      return a.id.localeCompare(b.id);
    });

    const counts = {
      textMarks: annotations.filter((a) => a.kind === 'text-mark').length,
      comments: annotations.filter((a) => a.kind === 'comment').length,
      excerpts: annotations.filter((a) => a.kind === 'excerpt').length,
      drawings: annotations.filter((a) => a.kind === 'drawing').length,
      bookmarks: bookmarks.length,
      total: annotations.length + bookmarks.length,
    };

    const payload = {
      schemaVersion: PORTABILITY_SCHEMA_VERSION,
      format: PORTABLE_FORMATS.ANNOTATIONS,
      exportedAt: nowUtc(),
      app: {
        name: 'Read & Watch',
        version: '0.1.0',
      },
      scope: itemId ? 'item' : 'library',
      ...(source ? { source } : {}),
      annotations,
      bookmarks,
      counts,
    };

    const checksumSha256 = sha256String(JSON.stringify({ annotations, bookmarks }));
    payload.checksumSha256 = checksumSha256;

    return payload;
  }

  function exportAnnotationsMarkdown({ itemId, includeDeleted = false } = {}) {
    const pkg = exportAnnotationsJson({ itemId, includeDeleted });
    const catalog = libraryStore.getCatalog();

    const lines = [];
    lines.push('# Annotations and Reading Notes');
    lines.push('');
    lines.push(`**Exported:** ${pkg.exportedAt}`);
    lines.push(`**Application:** Read & Watch v${pkg.app.version}`);
    lines.push(`**Scope:** ${pkg.scope === 'item' ? (pkg.source?.title || pkg.source?.itemId) : 'Entire Library'}`);
    if (pkg.source?.sourceHash) {
      lines.push(`**Source SHA-256:** \`${pkg.source.sourceHash}\``);
    }
    lines.push('');
    lines.push('> *Notice: This Markdown document is a human-readable projection of your annotations and notes.');
    lines.push('> Some normalized coordinates and drawing vectors are described textually and cannot be restored from Markdown.');
    lines.push('> For lossless restoration into Read & Watch, use the companion `.json` export package.*');
    lines.push('');
    lines.push('---');
    lines.push('');

    // Group by item
    const byItem = new Map();
    for (const a of pkg.annotations) {
      if (!byItem.has(a.itemId)) byItem.set(a.itemId, { annotations: [], bookmarks: [] });
      byItem.get(a.itemId).annotations.push(a);
    }
    for (const b of (pkg.bookmarks || [])) {
      if (!byItem.has(b.itemId)) byItem.set(b.itemId, { annotations: [], bookmarks: [] });
      byItem.get(b.itemId).bookmarks.push(b);
    }

    for (const [itId, data] of byItem) {
      const it = catalog.items.find((i) => i.id === itId);
      const title = it?.title || itId;

      lines.push(`## ${title}`);
      lines.push('');

      // Bookmarks first
      if (data.bookmarks.length > 0) {
        lines.push('### Bookmarks');
        lines.push('');
        for (const bm of data.bookmarks) {
          const loc = bm.pageNumber ? `Page ${bm.pageNumber}` : (bm.snippet || 'Bookmark');
          const label = bm.label ? `**${bm.label}** — ` : '';
          lines.push(`- ${label}${loc} (${bm.createdAt})`);
        }
        lines.push('');
      }

      // Annotations
      if (data.annotations.length > 0) {
        lines.push('### Annotations & Highlights');
        lines.push('');
        for (const a of data.annotations) {
          const page = a.anchor?.pageNumber ? `Page ${a.anchor.pageNumber}` : `Section ${a.anchor?.spineIndex ?? 0}`;
          const kindLabel = a.kind === 'text-mark'
            ? (a.content?.subKind ? a.content.subKind.toUpperCase() : 'HIGHLIGHT')
            : a.kind.toUpperCase();

          lines.push(`#### ${page} • ${kindLabel}`);
          lines.push('');

          // Quote / passage
          const quote = a.anchor?.quote || a.content?.passage;
          if (quote) {
            // Sanitize quote to prevent markdown injection
            const cleanQuote = quote.replace(/\r?\n/g, '\n> ');
            lines.push(`> ${cleanQuote}`);
            lines.push('');
          }

          // Comment / note body
          if (a.content?.body) {
            lines.push(`**Comment:** ${a.content.body}`);
            lines.push('');
          }
          if (a.content?.note) {
            lines.push(`**Note:** ${a.content.note}`);
            lines.push('');
          }

          // Drawing text descriptor
          if (a.kind === 'drawing') {
            const sub = a.content?.subKind || 'drawing';
            const col = a.content?.color || '#000';
            lines.push(`*[Vector Drawing: ${sub} (color: ${col})]*`);
            lines.push('');
          }

          lines.push(`*Created:* ${a.createdAt} • *ID:* \`${a.id}\``);
          lines.push('');
          lines.push('---');
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // P12-T003: Notes & Canvas Exports
  // -------------------------------------------------------------------------

  function exportNotes({ itemId } = {}) {
    const catalog = libraryStore.getCatalog();
    const itemsToExport = itemId
      ? catalog.items.filter((i) => i.id === itemId)
      : catalog.items;

    const notesList = [];
    for (const item of itemsToExport) {
      let thoughts = null;
      let notes = null;
      let thoughtsMod = null;
      let notesMod = null;

      try {
        const loadedThoughts = userDataStore.load('thoughts', item.id);
        if (loadedThoughts?.content) {
          thoughts = loadedThoughts.content;
          thoughtsMod = loadedThoughts.modified;
        }
      } catch {}

      try {
        const loadedNotes = userDataStore.load('notes', item.id);
        if (loadedNotes?.content) {
          notes = loadedNotes.content;
          notesMod = loadedNotes.modified;
        }
      } catch {}

      if (thoughts !== null || notes !== null) {
        notesList.push({
          itemId: item.id,
          title: item.title,
          sourceHash: item.media?.[0]?.sourceSha256 || '',
          thoughtsMarkdown: thoughts,
          thoughtsModifiedAt: thoughtsMod,
          notesMarkdown: notes,
          notesModifiedAt: notesMod,
        });
      }
    }

    const payload = {
      schemaVersion: PORTABILITY_SCHEMA_VERSION,
      format: PORTABLE_FORMATS.NOTES,
      exportedAt: nowUtc(),
      app: {
        name: 'Read & Watch',
        version: '0.1.0',
      },
      scope: itemId ? 'item' : 'library',
      notes: notesList,
      counts: {
        itemsWithNotes: notesList.filter((n) => n.notesMarkdown !== null).length,
        itemsWithThoughts: notesList.filter((n) => n.thoughtsMarkdown !== null).length,
        total: notesList.length,
      },
    };

    payload.checksumSha256 = sha256String(JSON.stringify(notesList));
    return payload;
  }

  function exportCanvasPackage(canvasId) {
    return canvasStore.exportCanvas(canvasId);
  }

  function exportAllCanvases({ itemId } = {}) {
    const list = canvasStore.listCanvases({ itemId });
    return list.map((c) => exportCanvasPackage(c.id));
  }

  // -------------------------------------------------------------------------
  // P12-T004: Library Metadata & Backup
  // -------------------------------------------------------------------------

  function exportLibraryMetadata() {
    const catalog = libraryStore.getCatalog();
    const libraryState = currentLibraryStateForBackup();
    const portableItems = catalog.items.map((it) => {
      const mediaDescriptors = (it.media || []).map((m) => {
        assertSafePath(m.name, 'media name');
        return {
          name: m.name,
          extension: m.extension,
          sourceSha256: m.sourceSha256,
          byteSize: m.byteSize,
        };
      });

      return {
        id: it.id,
        title: it.title,
        collection: it.collection,
        itemType: it.type,
        status: it.status,
        sourceAdded: it.added,
        summary: it.summary,
        tags: it.tags || [],
        notionProperties: it.notionProperties || {},
        media: mediaDescriptors,
        relationshipIds: it.relationshipIds || [],
      };
    });

    const payload = {
      schemaVersion: PORTABILITY_SCHEMA_VERSION,
      format: PORTABLE_FORMATS.LIBRARY_METADATA,
      exportedAt: nowUtc(),
      app: {
        name: 'Read & Watch',
        version: '0.1.0',
      },
      counts: catalog.counts,
      items: portableItems,
      libraryState,
    };

    payload.checksumSha256 = sha256String(
      JSON.stringify({ items: portableItems, libraryState }),
    );
    return payload;
  }

  function createBackupBundle() {
    const libraryPkg = exportLibraryMetadata();
    const annotationsPkg = exportAnnotationsJson();
    const notesPkg = exportNotes();
    const canvasesList = exportAllCanvases();

    const librarySha = sha256String(JSON.stringify(libraryPkg.items));
    const libraryStateSha = sha256String(JSON.stringify({
      savedViews: libraryPkg.libraryState?.savedViews ?? [],
      relationships: libraryPkg.libraryState?.relationships ?? [],
    }));
    const annotationsSha = sha256String(JSON.stringify({
      annotations: annotationsPkg.annotations,
      bookmarks: annotationsPkg.bookmarks,
    }));
    const notesSha = sha256String(JSON.stringify(notesPkg.notes));
    const canvasesSha = sha256String(JSON.stringify(canvasesList));

    const knowledgeGraphs = knowledgeStore
      ? knowledgeStore.listGraphs().map((g) => knowledgeStore.getGraph(g.id))
      : [];
    const mermaidDiagrams = knowledgeStore ? knowledgeStore.listDiagrams() : [];
    const knowledgeSha = sha256String(
      JSON.stringify({ graphs: knowledgeGraphs, diagrams: mermaidDiagrams }),
    );

    const totalCanvasAssets = canvasesList.reduce(
      (sum, c) => sum + (c.document?.assets?.length || 0),
      0,
    );

    const backupId = `rw-backup-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const createdUtc = nowUtc();

    const bundle = {
      schemaVersion: PORTABILITY_SCHEMA_VERSION,
      format: PORTABLE_FORMATS.BACKUP,
      exportedAt: createdUtc,
      app: {
        name: 'Read & Watch',
        version: '0.1.0',
      },
      backupId,
      policy: {
        sourceBooksIncluded: false,
        description: 'This backup contains Read & Watch user data and metadata. Original publication files (EPUB/PDF) are not included.',
      },
      manifest: {
        backupId,
        createdUtc,
        appVersion: '0.1.0',
        memberCounts: {
          items: libraryPkg.items.length,
          annotations: annotationsPkg.annotations.length,
          bookmarks: (annotationsPkg.bookmarks || []).length,
          notes: notesPkg.notes.length,
          canvases: canvasesList.length,
          canvasAssets: totalCanvasAssets,
          knowledgeGraphs: knowledgeGraphs.length,
          mermaidDocuments: mermaidDiagrams.length,
          savedViews: libraryPkg.libraryState?.savedViews?.length ?? 0,
          relationships: libraryPkg.libraryState?.relationships?.length ?? 0,
        },
        checksums: {
          librarySha256: librarySha,
          libraryStateSha256: libraryStateSha,
          annotationsSha256: annotationsSha,
          notesSha256: notesSha,
          canvasesSha256: canvasesSha,
          knowledgeSha256: knowledgeSha,
        },
      },
      library: libraryPkg,
      libraryState: libraryPkg.libraryState,
      annotations: annotationsPkg,
      notes: notesPkg,
      canvases: canvasesList,
      knowledge: {
        graphs: knowledgeGraphs,
        diagrams: mermaidDiagrams,
      },
    };

    bundle.checksumSha256 = sha256String(JSON.stringify(bundle.manifest));
    return bundle;
  }

  // -------------------------------------------------------------------------
  // P12-T005: Annotated PDF Derivative Export
  // -------------------------------------------------------------------------

  async function exportAnnotatedPdf({ itemId, targetPath, includeCommentsSummaryPage = true }) {
    if (!itemId || typeof itemId !== 'string') {
      throw new Error('Invalid item ID for PDF derivative export');
    }

    let candidate = null;
    if (readerStore) {
      if (typeof readerStore.resolveItem === 'function') {
        try {
          const { candidates } = readerStore.resolveItem(itemId);
          const pdfCandidate = candidates.find((c) => c.format === 'PDF');
          if (pdfCandidate) {
            candidate = {
              format: 'PDF',
              absolutePath: pdfCandidate.source,
              displayName: pdfCandidate.name,
            };
          }
        } catch {}
      } else if (typeof readerStore.resolveLaunchCandidate === 'function') {
        candidate = readerStore.resolveLaunchCandidate(itemId);
      }
    }

    if (!candidate && libraryStore) {
      try {
        const catalog = libraryStore.getCatalog();
        const item = catalog.items.find((i) => i.id === itemId);
        const pdfMedia = item?.media?.find((m) => m.extension?.toLowerCase() === '.pdf' || m.path?.toLowerCase().endsWith('.pdf'));
        if (pdfMedia) {
          const libRoot = libraryRoot || (userDataRoot ? resolve(userDataRoot, '..', 'library') : null);
          const absPath = libRoot ? resolve(libRoot, pdfMedia.path) : resolve(pdfMedia.path);
          if (existsSync(absPath)) {
            candidate = {
              format: 'PDF',
              absolutePath: absPath,
              displayName: pdfMedia.name || item.title,
            };
          }
        }
      } catch {}
    }

    if (!candidate || candidate.format !== 'PDF') {
      throw new Error(`Item ${itemId} does not have a readable PDF candidate`);
    }

    const sourcePath = candidate.absolutePath;
    if (!existsSync(sourcePath)) {
      throw new Error(`Source PDF not found at ${sourcePath}`);
    }

    // Determine target path if not specified
    const finalTargetPath = targetPath
      ? resolve(targetPath)
      : join(dirname(sourcePath), `${sanitizeExportFilename(candidate.displayName || 'Document')} - Annotated.pdf`);

    // Refusal Guard: Never overwrite source document
    if (resolve(finalTargetPath).toLowerCase() === resolve(sourcePath).toLowerCase()) {
      throw new Error('Refusing to overwrite original source PDF with derivative export');
    }

    // Capture pre-export immutability baseline
    const sourceStatPre = statSync(sourcePath);
    const sourceBytesPre = readFileSync(sourcePath);
    const sourceShaPre = sha256Buffer(sourceBytesPre);
    const sourceMtimePre = sourceStatPre.mtimeMs;
    const sourceSizePre = sourceStatPre.size;

    // Load PDF via pdf-lib for NEW derivative creation ONLY
    const pdfDoc = await PDFDocument.load(sourceBytesPre);
    const pages = pdfDoc.getPages();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Get active annotations
    const annotations = annotationStore.getAnnotations(itemId, { includeDeleted: false });
    let annotationsExported = 0;
    const commentsList = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNumber = i + 1;
      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();

      const pageAnnots = annotations.filter(
        (a) => a.anchor?.kind === 'pdf-text' || a.anchor?.kind === 'pdf-drawing',
      ).filter((a) => a.anchor.pageNumber === pageNumber);

      for (const a of pageAnnots) {
        // Hash verification: skip if annotation was made on a different source hash
        if (a.sourceHash && a.sourceHash !== sourceShaPre) {
          continue;
        }

        if (a.kind === 'text-mark') {
          const subKind = a.content?.subKind || 'highlight';
          const rects = a.anchor?.rects || [];
          const colorObj = parseHexColor(a.content?.color, subKind === 'highlight' ? { r: 1, g: 0.85, b: 0 } : { r: 0.2, g: 0.4, b: 0.8 });

          for (const r of rects) {
            // Normalized coordinates (0..1) to PDF points
            const x = r.x * pageWidth;
            const width = r.width * pageWidth;
            // PDF origin is bottom-left
            const y = (1 - r.y - r.height) * pageHeight;
            const height = r.height * pageHeight;

            if (subKind === 'highlight') {
              page.drawRectangle({
                x,
                y,
                width,
                height,
                color: rgb(colorObj.r, colorObj.g, colorObj.b),
                opacity: 0.35,
              });
              annotationsExported++;
            } else if (subKind === 'underline') {
              page.drawLine({
                start: { x, y: y + 1 },
                end: { x: x + width, y: y + 1 },
                thickness: 1.5,
                color: rgb(colorObj.r, colorObj.g, colorObj.b),
                opacity: 0.9,
              });
              annotationsExported++;
            } else if (subKind === 'strike') {
              page.drawLine({
                start: { x, y: y + height / 2 },
                end: { x: x + width, y: y + height / 2 },
                thickness: 1.5,
                color: rgb(colorObj.r, colorObj.g, colorObj.b),
                opacity: 0.9,
              });
              annotationsExported++;
            }
          }
        } else if (a.kind === 'drawing' && a.anchor?.kind === 'pdf-drawing') {
          const sub = a.content?.subKind || 'rectangle';
          const strokeCol = parseHexColor(a.content?.color, { r: 0.2, g: 0.2, b: 0.2 });
          const bounds = a.anchor.bounds;
          if (bounds) {
            const x = bounds.x * pageWidth;
            const width = bounds.width * pageWidth;
            const y = (1 - bounds.y - bounds.height) * pageHeight;
            const height = bounds.height * pageHeight;

            if (sub === 'rectangle') {
              page.drawRectangle({
                x,
                y,
                width,
                height,
                borderColor: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
                borderWidth: a.content?.strokeWidth || 1.5,
                opacity: 0.85,
              });
              annotationsExported++;
            } else if (sub === 'ellipse') {
              page.drawEllipse({
                x: x + width / 2,
                y: y + height / 2,
                xScale: width / 2,
                yScale: height / 2,
                borderColor: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
                borderWidth: a.content?.strokeWidth || 1.5,
                opacity: 0.85,
              });
              annotationsExported++;
            } else if (sub === 'line' || sub === 'arrow') {
              page.drawLine({
                start: { x, y },
                end: { x: x + width, y: y + height },
                thickness: a.content?.strokeWidth || 1.5,
                color: rgb(strokeCol.r, strokeCol.g, strokeCol.b),
                opacity: 0.85,
              });
              annotationsExported++;
            }
          }
        } else if (a.kind === 'comment' || a.kind === 'excerpt') {
          // Record for summary page
          commentsList.push({
            pageNumber,
            kind: a.kind,
            quote: a.anchor?.quote,
            text: a.content?.body || a.content?.note || '',
            date: a.createdAt,
          });

          // Draw visual callout badge on page
          const firstRect = a.anchor?.rects?.[0];
          const badgeX = firstRect ? firstRect.x * pageWidth : 36;
          const badgeY = firstRect ? (1 - firstRect.y) * pageHeight + 2 : pageHeight - 36;

          page.drawRectangle({
            x: Math.max(10, Math.min(pageWidth - 60, badgeX)),
            y: Math.max(10, Math.min(pageHeight - 20, badgeY)),
            width: 50,
            height: 14,
            color: rgb(0.12, 0.45, 0.45),
            opacity: 0.9,
          });
          page.drawText('Note', {
            x: Math.max(10, Math.min(pageWidth - 60, badgeX)) + 4,
            y: Math.max(10, Math.min(pageHeight - 20, badgeY)) + 3,
            size: 8,
            font: helveticaBold,
            color: rgb(1, 1, 1),
          });
          annotationsExported++;
        }
      }
    }

    // Optional Annotation Summary Page
    if (includeCommentsSummaryPage && commentsList.length > 0) {
      const summaryPage = pdfDoc.addPage([595.28, 841.89]); // A4
      let cursorY = 800;

      summaryPage.drawText('Read & Watch — Annotation Summary', {
        x: 50,
        y: cursorY,
        size: 18,
        font: helveticaBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      cursorY -= 25;

      summaryPage.drawText(`Document: ${candidate.displayName || itemId} | Generated: ${nowUtc().slice(0, 10)}`, {
        x: 50,
        y: cursorY,
        size: 9,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });
      cursorY -= 30;

      for (const item of commentsList) {
        if (cursorY < 80) break; // Keep within single summary page for neatness

        summaryPage.drawText(`Page ${item.pageNumber} • ${item.kind.toUpperCase()}`, {
          x: 50,
          y: cursorY,
          size: 11,
          font: helveticaBold,
          color: rgb(0.12, 0.45, 0.45),
        });
        cursorY -= 15;

        if (item.quote) {
          const cleanQuote = item.quote.length > 100 ? `${item.quote.slice(0, 97)}...` : item.quote;
          summaryPage.drawText(`"${cleanQuote}"`, {
            x: 60,
            y: cursorY,
            size: 9,
            font: helvetica,
            color: rgb(0.25, 0.25, 0.25),
          });
          cursorY -= 14;
        }

        if (item.text) {
          const cleanText = item.text.length > 120 ? `${item.text.slice(0, 117)}...` : item.text;
          summaryPage.drawText(`Note: ${cleanText}`, {
            x: 60,
            y: cursorY,
            size: 9,
            font: helvetica,
            color: rgb(0.1, 0.1, 0.1),
          });
          cursorY -= 16;
        }
        cursorY -= 8;
      }
    }

    // Set provenance metadata
    pdfDoc.setTitle(`${candidate.displayName || 'Document'} (Annotated)`);
    pdfDoc.setCreator('Read & Watch');
    pdfDoc.setProducer('Read & Watch Portability Engine');
    pdfDoc.setSubject('Annotated derivative export');

    // Save derivative to final path atomically
    const derivativeBytes = await pdfDoc.save();
    writeAtomic(finalTargetPath, Buffer.from(derivativeBytes));

    // Hard Post-Export Source Immutability Verification
    const sourceStatPost = statSync(sourcePath);
    const sourceBytesPost = readFileSync(sourcePath);
    const sourceShaPost = sha256Buffer(sourceBytesPost);

    if (sourceShaPost !== sourceShaPre) {
      throw new Error(`CRITICAL SOURCE MUTATION DETECTED: Source SHA-256 changed from ${sourceShaPre} to ${sourceShaPost}`);
    }
    if (sourceStatPost.size !== sourceSizePre) {
      throw new Error(`CRITICAL SOURCE MUTATION DETECTED: Source size changed from ${sourceSizePre} to ${sourceStatPost.size}`);
    }
    if (sourceStatPost.mtimeMs !== sourceMtimePre) {
      throw new Error(`CRITICAL SOURCE MUTATION DETECTED: Source mtime changed from ${sourceMtimePre} to ${sourceStatPost.mtimeMs}`);
    }

    return {
      ok: true,
      targetPath: finalTargetPath,
      pageCount: pdfDoc.getPageCount(),
      annotationsExported,
      sourceSha256: sourceShaPre,
    };
  }

  function verifyBackupChecksums(validated) {
    const checksums = validated.manifest?.checksums;
    if (!checksums) return;

    if (checksums.librarySha256) {
      const computed = sha256String(JSON.stringify(validated.library.items));
      if (computed !== checksums.librarySha256) {
        throw new Error(`Backup tampering detected: library items checksum mismatch`);
      }
    }

    if (checksums.libraryStateSha256) {
      const computed = sha256String(JSON.stringify({
        savedViews: validated.libraryState?.savedViews ?? [],
        relationships: validated.libraryState?.relationships ?? [],
      }));
      if (computed !== checksums.libraryStateSha256) {
        throw new Error('Backup tampering detected: library state checksum mismatch');
      }
    }

    if (checksums.annotationsSha256) {
      const computed = sha256String(JSON.stringify({
        annotations: validated.annotations.annotations,
        bookmarks: validated.annotations.bookmarks || [],
      }));
      if (computed !== checksums.annotationsSha256) {
        throw new Error(`Backup tampering detected: annotations checksum mismatch`);
      }
    }

    if (checksums.notesSha256) {
      const computed = sha256String(JSON.stringify(validated.notes.notes));
      if (computed !== checksums.notesSha256) {
        throw new Error(`Backup tampering detected: notes checksum mismatch`);
      }
    }

    if (checksums.canvasesSha256) {
      const computed = sha256String(JSON.stringify(validated.canvases));
      if (computed !== checksums.canvasesSha256) {
        throw new Error(`Backup tampering detected: canvases checksum mismatch`);
      }
    }
  }

  function preflightRestore(backupPackage) {
    const validated = validateBackupPackage(backupPackage);
    verifyBackupChecksums(validated);
    const conflicts = [];
    const warnings = [];

    const catalog = libraryStore.getCatalog();
    const existingItemMap = new Map(catalog.items.map((i) => [i.id, i]));

    // Check library item conflicts
    for (const item of validated.library.items) {
      const existing = existingItemMap.get(item.id);
      if (existing) {
        if (existing.title === item.title && existing.collection === item.collection) {
          conflicts.push({
            entityType: 'item',
            entityId: item.id,
            kind: 'IDENTICAL',
            message: `Item ${item.title} (${item.id}) already exists identically.`,
          });
        } else {
          conflicts.push({
            entityType: 'item',
            entityId: item.id,
            kind: 'CONFLICT_DIVERGENT',
            message: `Item ${item.id} has divergent metadata locally (${existing.title} vs incoming ${item.title}).`,
          });
        }
      }
    }

    // Check annotation conflicts
    for (const annot of validated.annotations.annotations) {
      try {
        const existing = annotationStore.getAnnotation(annot.id);
        if (existing) {
          if (existing.revision === annot.revision && existing.sourceHash === annot.sourceHash) {
            conflicts.push({
              entityType: 'annotation',
              entityId: annot.id,
              kind: 'IDENTICAL',
              message: `Annotation ${annot.id} already exists with identical revision.`,
              currentRevision: existing.revision,
              incomingRevision: annot.revision,
            });
          } else {
            conflicts.push({
              entityType: 'annotation',
              entityId: annot.id,
              kind: 'CONFLICT_DIVERGENT',
              message: `Annotation ${annot.id} exists locally at revision ${existing.revision} (incoming: ${annot.revision}).`,
              currentRevision: existing.revision,
              incomingRevision: annot.revision,
            });
          }
        }
      } catch {}

      // Check if source book is present in local library
      if (!existingItemMap.has(annot.itemId)) {
        warnings.push(`Annotation ${annot.id} references item ${annot.itemId} which is missing from local library.`);
      }
    }

    // Check canvas conflicts
    for (const c of validated.canvases) {
      const canvasDoc = c.document;
      if (canvasDoc?.canvasId) {
        try {
          const existing = canvasStore.getCanvas(canvasDoc.canvasId);
          if (existing) {
            conflicts.push({
              entityType: 'canvas',
              entityId: canvasDoc.canvasId,
              kind: 'CONFLICT_DIVERGENT',
              message: `Canvas ${canvasDoc.canvasId} (${canvasDoc.title}) already exists locally.`,
              currentRevision: existing.revision,
              incomingRevision: canvasDoc.revision,
            });
          }
        } catch {}
      }
    }

    // Check knowledge graph and diagram conflicts
    if (knowledgeStore && validated.knowledge) {
      if (Array.isArray(validated.knowledge.graphs)) {
        for (const g of validated.knowledge.graphs) {
          try {
            const existing = knowledgeStore.getGraph(g.id);
            if (existing) {
              conflicts.push({
                entityType: 'knowledge-graph',
                entityId: g.id,
                kind: existing.revision === g.revision ? 'IDENTICAL' : 'CONFLICT_DIVERGENT',
                message: `Knowledge graph ${g.id} (${g.title}) already exists locally.`,
                currentRevision: existing.revision,
                incomingRevision: g.revision,
              });
            }
          } catch {}
        }
      }
      if (Array.isArray(validated.knowledge.diagrams)) {
        for (const d of validated.knowledge.diagrams) {
          try {
            const existing = knowledgeStore.getDiagram(d.id);
            if (existing) {
              conflicts.push({
                entityType: 'mermaid-diagram',
                entityId: d.id,
                kind: existing.revision === d.revision ? 'IDENTICAL' : 'CONFLICT_DIVERGENT',
                message: `Mermaid diagram ${d.id} (${d.title}) already exists locally.`,
                currentRevision: existing.revision,
                incomingRevision: d.revision,
              });
            }
          } catch {}
        }
      }
    }

    if (validated.libraryState) {
      const existingViews = libraryStore.listViews();
      const existingRelationships = libraryStore.listRelationships();
      const viewIds = new Set(existingViews.map((view) => view.id));
      const viewNames = new Set(
        existingViews.map((view) => view.name.toLocaleLowerCase()),
      );
      for (const view of validated.libraryState.savedViews) {
        if (
          viewIds.has(view.id) ||
          viewNames.has(view.name.toLocaleLowerCase())
        ) {
          conflicts.push({
            entityType: 'saved-view',
            entityId: view.id,
            kind: 'CONFLICT_DIVERGENT',
            message: `Saved view "${view.name}" already exists locally.`,
          });
        }
      }
      const relationshipIds = new Set(
        existingRelationships.map((relationship) => relationship.id),
      );
      for (const relationship of validated.libraryState.relationships) {
        if (relationshipIds.has(relationship.id)) {
          conflicts.push({
            entityType: 'relationship',
            entityId: relationship.id,
            kind: 'CONFLICT_DIVERGENT',
            message: `Relationship ${relationship.id} already exists locally.`,
          });
        }
      }
    }

    return {
      canRestore: true,
      schemaVersion: validated.schemaVersion,
      format: validated.format,
      appVersion: validated.app.version,
      counts: {
        incomingItems: validated.library.items.length,
        incomingAnnotations: validated.annotations.annotations.length,
        incomingBookmarks: (validated.annotations.bookmarks || []).length,
        incomingNotes: validated.notes.notes.length,
        incomingCanvases: validated.canvases.length,
        incomingKnowledgeGraphs: validated.knowledge?.graphs?.length || 0,
        incomingMermaidDocuments: validated.knowledge?.diagrams?.length || 0,
        incomingSavedViews: validated.libraryState?.savedViews?.length || 0,
        incomingRelationships: validated.libraryState?.relationships?.length || 0,
      },
      conflicts,
      warnings,
    };
  }

  function applyRestore(backupPackage, { conflictResolution = 'skip' } = {}) {
    const validated = validateBackupPackage(backupPackage);
    verifyBackupChecksums(validated);

    const restoredCounts = {
      items: 0,
      annotations: 0,
      bookmarks: 0,
      notes: 0,
      canvases: 0,
      knowledgeGraphs: 0,
      mermaidDocuments: 0,
      savedViews: 0,
      relationships: 0,
    };
    const skippedCounts = {
      items: 0,
      annotations: 0,
      bookmarks: 0,
      notes: 0,
      canvases: 0,
      knowledgeGraphs: 0,
      mermaidDocuments: 0,
      savedViews: 0,
      relationships: 0,
    };
    const warnings = [];

    // 1. Restore Annotations
    for (const a of validated.annotations.annotations) {
      let existing = null;
      try {
        existing = annotationStore.getAnnotation(a.id);
      } catch {}

      if (existing) {
        if (conflictResolution === 'skip' || (existing.revision >= a.revision && conflictResolution !== 'overwrite')) {
          skippedCounts.annotations++;
          continue;
        } else if (conflictResolution === 'overwrite') {
          try {
            annotationStore.updateAnnotation(a.id, {
              anchor: a.anchor,
              content: a.content,
              style: a.style,
              expectedRevision: existing.revision,
            });
            restoredCounts.annotations++;
          } catch {
            skippedCounts.annotations++;
          }
          continue;
        }
      }

      // Create fresh annotation
      try {
        annotationStore.createAnnotation({
          id: a.id,
          itemId: a.itemId,
          assetId: a.assetId,
          kind: a.kind,
          anchor: a.anchor,
          content: a.content,
          style: a.style,
          sourceHash: a.sourceHash,
        });
        restoredCounts.annotations++;
      } catch {
        skippedCounts.annotations++;
      }
    }

    // 2. Restore Bookmarks
    if (Array.isArray(validated.annotations.bookmarks)) {
      for (const bm of validated.annotations.bookmarks) {
        try {
          const list = readerStore.getBookmarks(bm.itemId);
          if (!list.some((b) => b.id === bm.id)) {
            readerStore.addBookmark(bm.itemId, bm);
            restoredCounts.bookmarks++;
          } else {
            skippedCounts.bookmarks++;
          }
        } catch {
          skippedCounts.bookmarks++;
        }
      }
    }

    // 3. Restore Notes
    for (const n of validated.notes.notes) {
      try {
        if (n.thoughtsMarkdown !== null && n.thoughtsMarkdown !== undefined) {
          const currentThoughts = userDataStore.load('thoughts', n.itemId);
          if (currentThoughts?.content && conflictResolution === 'skip') {
            skippedCounts.notes++;
          } else {
            userDataStore.save('thoughts', n.itemId, n.thoughtsMarkdown, currentThoughts?.revision);
            restoredCounts.notes++;
          }
        }
        if (n.notesMarkdown !== null && n.notesMarkdown !== undefined) {
          const currentNotes = userDataStore.load('notes', n.itemId);
          if (currentNotes?.content && conflictResolution === 'skip') {
            skippedCounts.notes++;
          } else {
            userDataStore.save('notes', n.itemId, n.notesMarkdown, currentNotes?.revision);
            restoredCounts.notes++;
          }
        }
      } catch {
        skippedCounts.notes++;
      }
    }

    // 4. Restore Canvases
    for (const c of validated.canvases) {
      try {
        canvasStore.importCanvas(c, { newId: conflictResolution === 'copy' });
        restoredCounts.canvases++;
      } catch (err) {
        if (String(err).includes('already exists')) {
          skippedCounts.canvases++;
        } else {
          skippedCounts.canvases++;
        }
      }
    }

    // 5. Restore Knowledge (Graphs & Diagrams)
    if (knowledgeStore && validated.knowledge) {
      if (Array.isArray(validated.knowledge.graphs)) {
        for (const g of validated.knowledge.graphs) {
          try {
            let existing = null;
            try {
              existing = knowledgeStore.getGraph(g.id);
            } catch {}

            if (existing) {
              if (conflictResolution === 'skip' || (existing.revision >= g.revision && conflictResolution !== 'overwrite')) {
                skippedCounts.knowledgeGraphs++;
              } else if (conflictResolution === 'overwrite') {
                knowledgeStore.saveGraphDocument(g.id, {
                  title: g.title,
                  description: g.description,
                  tags: g.tags,
                  nodes: g.nodes,
                  edges: g.edges,
                  expectedRevision: existing.revision,
                });
                restoredCounts.knowledgeGraphs++;
              }
            } else {
              knowledgeStore.createGraph(g);
              restoredCounts.knowledgeGraphs++;
            }
          } catch {
            skippedCounts.knowledgeGraphs++;
          }
        }
      }

      if (Array.isArray(validated.knowledge.diagrams)) {
        for (const d of validated.knowledge.diagrams) {
          try {
            let existing = null;
            try {
              existing = knowledgeStore.getDiagram(d.id);
            } catch {}

            if (existing) {
              if (conflictResolution === 'skip' || (existing.revision >= d.revision && conflictResolution !== 'overwrite')) {
                skippedCounts.mermaidDocuments++;
              } else if (conflictResolution === 'overwrite') {
                knowledgeStore.updateDiagram(d.id, {
                  title: d.title,
                  description: d.description,
                  diagramType: d.diagramType,
                  sourceText: d.sourceText,
                  tags: d.tags,
                  associatedItemId: d.associatedItemId,
                  expectedRevision: existing.revision,
                });
                restoredCounts.mermaidDocuments++;
              }
            } else {
              knowledgeStore.createDiagram(d);
              restoredCounts.mermaidDocuments++;
            }
          } catch {
            skippedCounts.mermaidDocuments++;
          }
        }
      }
    }

    // 6. Restore durable library state (saved views and relationships)
    if (validated.libraryState) {
      try {
        const restoredLibraryState = libraryStore.restoreLibraryState(
          validated.libraryState,
          { conflictResolution },
        );
        restoredCounts.savedViews = restoredLibraryState.restored.savedViews;
        restoredCounts.relationships = restoredLibraryState.restored.relationships;
        skippedCounts.savedViews = restoredLibraryState.skipped.savedViews;
        skippedCounts.relationships = restoredLibraryState.skipped.relationships;
        warnings.push(...(restoredLibraryState.warnings ?? []));
      } catch (error) {
        skippedCounts.savedViews += validated.libraryState.savedViews.length;
        skippedCounts.relationships += validated.libraryState.relationships.length;
        warnings.push({
          code: 'LIBRARY_STATE_RESTORE_FAILED',
          message: String(error?.message ?? error),
        });
      }
    }

    // 7. Post-Restore Search Rebuild (derived index is NEVER restored from backup)
    let searchRebuilt = false;
    if (searchStore) {
      try {
        if (typeof searchStore.rebuildIndex === 'function') {
          searchStore.rebuildIndex();
          searchRebuilt = true;
        } else if (typeof searchStore.rebuild === 'function') {
          searchStore.rebuild();
          searchRebuilt = true;
        }
      } catch (err) {
        console.error('Failed to rebuild search store after restore:', err);
      }
    }

    return {
      ok: true,
      restoredCounts,
      skippedCounts,
      warnings,
      searchRebuilt,
    };
  }

  function exportKnowledgeGraph(graphId) {
    if (!knowledgeStore) throw new Error('Knowledge store not available');
    const doc = knowledgeStore.getGraph(graphId);
    return {
      schemaVersion: PORTABILITY_SCHEMA_VERSION,
      format: PORTABLE_FORMATS.KNOWLEDGE_GRAPH,
      exportedAt: nowUtc(),
      app: { name: 'Read & Watch', version: '0.1.0' },
      graph: doc,
    };
  }

  function exportMermaidDiagram(diagramId) {
    if (!knowledgeStore) throw new Error('Knowledge store not available');
    const doc = knowledgeStore.getDiagram(diagramId);
    return {
      schemaVersion: PORTABILITY_SCHEMA_VERSION,
      format: PORTABLE_FORMATS.MERMAID_DIAGRAM,
      exportedAt: nowUtc(),
      app: { name: 'Read & Watch', version: '0.1.0' },
      diagram: doc,
    };
  }

  return {
    exportAnnotationsJson,
    exportAnnotationsMarkdown,
    exportNotes,
    exportCanvasPackage,
    exportAllCanvases,
    exportLibraryMetadata,
    createBackupBundle,
    exportAnnotatedPdf,
    exportKnowledgeGraph,
    exportMermaidDiagram,
    preflightRestore,
    applyRestore,
  };
}
