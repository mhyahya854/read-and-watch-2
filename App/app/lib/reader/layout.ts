/**
 * Reader layout model: split / full / minimized.
 *
 * The reader session (document, page, zoom, annotations) is never torn down by a
 * layout change — only which panes are visible changes. These helpers are the
 * single source of that decision for the reader shell.
 */

export type ReaderLayoutMode = 'split' | 'full' | 'minimized';

export const READER_LAYOUTS: ReadonlyArray<{ value: ReaderLayoutMode; label: string }> = [
  { value: 'split', label: 'Split' },
  { value: 'full', label: 'Full reader' },
  { value: 'minimized', label: 'Minimized reader' },
];

/**
 * The reader pane is always MOUNTED. Minimizing hides it with CSS rather than
 * unmounting it, because the document adapter renders into a container element
 * owned by the reader pane; unmounting would destroy that container and lose the
 * live source position the user expects to return to.
 */
export function readerPaneVisible(layout: ReaderLayoutMode): boolean {
  return layout !== 'minimized';
}

export function sidePaneVisible(
  layout: ReaderLayoutMode,
  hasSideContent: boolean,
): boolean {
  return hasSideContent;
}

/**
 * The study pane is hidden (not unmounted) in full-reader mode: an in-progress
 * annotation note draft must survive a full -> split round trip.
 */
export function sidePaneClass(layout: ReaderLayoutMode): string {
  if (layout === 'full') return 'hidden';
  return layout === 'minimized'
    ? 'flex flex-1 min-w-0'
    : 'flex flex-1 min-w-[320px] border-l border-border';
}

export function readerPaneClass(
  layout: ReaderLayoutMode,
  hasSideContent: boolean,
): string {
  // Hidden, not unmounted: the adapter's container must stay in the document.
  if (layout === 'minimized') return 'hidden';
  if (layout === 'full' || !hasSideContent) return 'flex flex-1';
  return 'flex flex-[1.4] min-w-[320px] border-r border-border';
}

/** Entering full mode keeps the study selection; leaving it restores the pane. */
export function toggleFullReader(layout: ReaderLayoutMode): ReaderLayoutMode {
  return layout === 'full' ? 'split' : 'full';
}
