/**
 * Read & Watch Canonical Annotation Type System.
 *
 * Phase 09 — Unified Annotation Foundation.
 *
 * Ownership rules:
 *   - This module owns all annotation domain types.
 *   - No PDF.js or Foliate-JS internal objects appear here.
 *   - Anchors are engine-independent normalized coordinates or CFI ranges.
 *   - SQLite is the canonical store; external JSON is crash-recovery mirror.
 *   - Source EPUBs and PDFs are NEVER mutated.
 */

export const ANNOTATION_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Annotation Kind
// ---------------------------------------------------------------------------

/** Text marks applied to a text selection. */
export type TextMarkSubKind = 'highlight' | 'underline' | 'strike';

/** Vector drawing shapes applied to a PDF page surface. */
export type DrawingSubKind =
  | 'pen'
  | 'highlighter'
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'ellipse'
  | 'text-box';

export type AnnotationKind =
  | 'text-mark'    // highlight, underline, strike — both PDF and reflowable
  | 'comment'      // anchored comment bubble
  | 'excerpt'      // quoted passage with optional note
  | 'drawing';     // vector markup — PDF only (reflowable disables)

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export type AnnotationLifecycle =
  | 'active'       // visible, canonical
  | 'edited'       // soft-revision, still visible (last save pending)
  | 'hidden'       // hidden by user preference — not deleted
  | 'soft-deleted'; // logically removed, recoverable until hard-purge

// ---------------------------------------------------------------------------
// Anchor — PDF geometry
// ---------------------------------------------------------------------------

export interface NormalizedRect {
  readonly x: number;      // 0.0–1.0 from page left
  readonly y: number;      // 0.0–1.0 from page top
  readonly width: number;  // 0.0–1.0 fraction of page width
  readonly height: number; // 0.0–1.0 fraction of page height
}

/** Text-selection anchor for a fixed-layout PDF page. */
export interface PdfTextAnchor {
  readonly kind: 'pdf-text';
  /** 1-based page number. */
  readonly pageNumber: number;
  /** Normalized page-relative bounding rects (zoom / rotation invariant). */
  readonly rects: ReadonlyArray<NormalizedRect>;
  /** Selected text quote. */
  readonly quote: string;
  /** Characters before the selection for fuzzy re-resolution. */
  readonly prefix?: string;
  /** Characters after the selection for fuzzy re-resolution. */
  readonly suffix?: string;
  /** SHA-256 of the source PDF at annotation creation time. */
  readonly sourceHash: string;
}

/** Drawing / vector markup anchor for a PDF page. */
export interface PdfDrawingAnchor {
  readonly kind: 'pdf-drawing';
  /** 1-based page number. */
  readonly pageNumber: number;
  /**
   * Normalized page-relative control points (zoom / rotation invariant).
   * For shapes: [topLeft, bottomRight]. For paths: ordered stroke points.
   */
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  /** Normalized axis-aligned bounding box of the entire drawing object. */
  readonly bounds: NormalizedRect;
  /** SHA-256 of the source PDF at annotation creation time. */
  readonly sourceHash: string;
}

// ---------------------------------------------------------------------------
// Anchor — Reflowable (EPUB / etc.)
// ---------------------------------------------------------------------------

/** CFI range anchor for a reflowable book. */
export interface ReflowableTextAnchor {
  readonly kind: 'reflowable-text';
  /** Start EPUB CFI. */
  readonly startCfi: string;
  /** End EPUB CFI. */
  readonly endCfi: string;
  /** 0-based spine index. */
  readonly spineIndex: number;
  /** Selected text quote (exact). */
  readonly quote: string;
  /** Characters before selection for fallback resolution. */
  readonly prefix?: string;
  /** Characters after selection for fallback resolution. */
  readonly suffix?: string;
  /** SHA-256 of the source EPUB at annotation creation time. */
  readonly sourceHash: string;
}

// ---------------------------------------------------------------------------
// Union anchor type
// ---------------------------------------------------------------------------

export type AnnotationAnchor =
  | PdfTextAnchor
  | PdfDrawingAnchor
  | ReflowableTextAnchor;

// ---------------------------------------------------------------------------
// Content payloads per kind
// ---------------------------------------------------------------------------

export interface TextMarkContent {
  readonly subKind: TextMarkSubKind;
  /** Hex color string for the mark. Default per subKind if absent. */
  readonly color?: string;
  /**
   * Optional user note attached to this mark. The note belongs to the mark
   * itself: deleting the note never deletes the mark, and no separate notes
   * document or table is involved.
   */
  readonly note?: string;
  /** Last time the attached note was edited (ISO 8601 UTC). */
  readonly noteUpdatedAt?: string;
}

export interface CommentContent {
  /** Optional anchor subKind when created from a text selection. */
  readonly selectionSubKind?: TextMarkSubKind;
  /** Optional selection color. */
  readonly color?: string;
  /** The comment body text (Markdown). */
  readonly body: string;
}

export interface ExcerptContent {
  /** The quoted passage (mirrors anchor.quote but may be user-edited). */
  readonly passage: string;
  /** Optional user note on this excerpt (Markdown). */
  readonly note?: string;
}

export interface DrawingContent {
  readonly subKind: DrawingSubKind;
  /** Stroke color (hex). */
  readonly color: string;
  /** Stroke width in normalized units. */
  readonly strokeWidth: number;
  /** Fill color (hex) — for rectangle/ellipse/text-box. */
  readonly fill?: string;
  /** Text content for text-box drawing. */
  readonly text?: string;
  /** Optional user note attached to this markup. */
  readonly note?: string;
  /** Last time the attached note was edited (ISO 8601 UTC). */
  readonly noteUpdatedAt?: string;
}

export type AnnotationContent =
  | TextMarkContent
  | CommentContent
  | ExcerptContent
  | DrawingContent;

// ---------------------------------------------------------------------------
// Style envelope (optional display overrides)
// ---------------------------------------------------------------------------

export interface AnnotationStyle {
  readonly opacity?: number; // 0.0–1.0
  readonly hidden?: boolean; // per-annotation visibility override
}

// ---------------------------------------------------------------------------
// Canonical Annotation Record
// ---------------------------------------------------------------------------

export interface Annotation {
  /** Schema version — always 1 for Phase 09. */
  readonly schemaVersion: typeof ANNOTATION_SCHEMA_VERSION;
  /** Stable UUID (crypto.randomUUID()). */
  readonly id: string;
  /** Library item ID (e.g. "read-<sha>"). */
  readonly itemId: string;
  /** Opaque asset/candidate ID identifying the specific file within the item. */
  readonly assetId: string;
  /** Annotation kind discriminant. */
  readonly kind: AnnotationKind;
  /** Engine-independent anchor. */
  readonly anchor: AnnotationAnchor;
  /** Kind-specific content payload. */
  readonly content: AnnotationContent;
  /** Optional display style overrides. */
  readonly style?: AnnotationStyle;
  /** SHA-256 of the source document when the annotation was created. */
  readonly sourceHash: string;
  /** Monotonically increasing optimistic-concurrency revision counter. */
  readonly revision: number;
  /** Lifecycle state. */
  readonly lifecycle: AnnotationLifecycle;
  /** ISO 8601 UTC creation timestamp. */
  readonly createdAt: string;
  /** ISO 8601 UTC last-modification timestamp. */
  readonly updatedAt: string;
  /** ISO 8601 UTC soft-deletion timestamp (null when not deleted). */
  readonly deletedAt: string | null;
}

// ---------------------------------------------------------------------------
// Source hash mismatch result
// ---------------------------------------------------------------------------

export interface SourceHashMismatchResult {
  readonly annotationId: string;
  readonly expectedHash: string;
  readonly actualHash: string;
}
