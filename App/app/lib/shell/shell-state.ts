/**
 * Shared desktop shell state model.
 *
 * Both the library shell and the static product pages (Settings, Privacy,
 * Terms, Knowledge, Canvas Notes, Study & Highlights) drive the same sidebar
 * and the same title-panel modes. Keeping the transitions here — instead of
 * re-implementing them inside each component — is what stops the two copies
 * from drifting apart again.
 */

export type SidebarMode = 'expanded' | 'collapsed';
export type DetailMode = 'split' | 'maximized' | 'closed';

export interface ShellState {
  sidebar: SidebarMode;
  detail: DetailMode;
}

export function initialShellState(
  overrides: Partial<ShellState> = {},
): ShellState {
  return {
    sidebar: overrides.sidebar ?? 'expanded',
    detail: overrides.detail ?? 'split',
  };
}

export function toggleSidebar(state: ShellState): ShellState {
  return {
    ...state,
    sidebar: state.sidebar === 'collapsed' ? 'expanded' : 'collapsed',
  };
}

export function toggleMaximize(state: ShellState): ShellState {
  return {
    ...state,
    detail: state.detail === 'maximized' ? 'split' : 'maximized',
  };
}

/**
 * Escape collapses the widest surface first: maximized -> split -> closed.
 */
export function escapeShell(state: ShellState, { hasSelection }: { hasSelection: boolean }): ShellState {
  if (state.detail === 'maximized') return { ...state, detail: 'split' };
  if (hasSelection && state.detail === 'split') return { ...state, detail: 'closed' };
  return state;
}

export function closeDetail(state: ShellState): ShellState {
  return { ...state, detail: 'closed' };
}

/** Selecting a row while the panel is closed re-opens it in split mode. */
export function selectItem(state: ShellState): ShellState {
  return state.detail === 'closed' ? { ...state, detail: 'split' } : state;
}

export function sidebarWidthClass(mode: SidebarMode): string {
  return mode === 'collapsed'
    ? 'w-14 px-2 py-3'
    : 'w-[var(--sidebar-width)] px-3 py-4';
}

/** The library list is hidden only while the title panel is maximized. */
export function libraryListVisible(state: ShellState, hasSelection: boolean): boolean {
  return !(state.detail === 'maximized' && hasSelection);
}

export function titlePanelVisible(state: ShellState, hasSelection: boolean): boolean {
  return hasSelection && state.detail !== 'closed';
}

