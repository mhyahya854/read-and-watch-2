/**
 * Shared desktop shell contracts.
 *
 * These exercise the real shell state model and the real media classifier that
 * the components import. Static source contracts are kept only where a class or
 * structure genuinely cannot be verified without a browser.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeDetail,
  escapeShell,
  initialShellState,
  libraryListVisible,
  selectItem,
  sidebarWidthClass,
  titlePanelVisible,
  toggleMaximize,
  toggleSidebar,
} from '../lib/shell/shell-state.ts';
import {
  canOpenInReader,
  canPreviewAsImage,
  classifyMediaExtension,
  describeMediaExtension,
} from '../lib/media-kind.ts';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function read(relativePath) {
  return readFileSync(resolve(appRoot, relativePath), 'utf-8');
}

test('sidebar state model supports expanded and collapsed icon-rail modes', () => {
  const expanded = initialShellState();
  assert.equal(expanded.sidebar, 'expanded');
  assert.equal(sidebarWidthClass('expanded'), 'w-[var(--sidebar-width)] px-3 py-4');

  const collapsed = toggleSidebar(expanded);
  assert.equal(collapsed.sidebar, 'collapsed');
  assert.equal(sidebarWidthClass('collapsed'), 'w-14 px-2 py-3');

  assert.equal(toggleSidebar(collapsed).sidebar, 'expanded');
  // Toggling the sidebar must not disturb the title panel mode.
  assert.equal(collapsed.detail, 'split');
});

test('title-panel layout transitions deterministically between split, maximized, and closed', () => {
  let shell = initialShellState();

  shell = selectItem(shell);
  assert.equal(shell.detail, 'split', 'selection opens in split mode');
  assert.equal(libraryListVisible(shell, true), true);
  assert.equal(titlePanelVisible(shell, true), true);

  shell = toggleMaximize(shell);
  assert.equal(shell.detail, 'maximized', 'toggles to maximized focus mode');
  assert.equal(libraryListVisible(shell, true), false, 'list collapses in maximized mode');

  shell = toggleMaximize(shell);
  assert.equal(shell.detail, 'split', 'toggling again restores split mode');

  shell = escapeShell(shell, { hasSelection: true });
  assert.equal(shell.detail, 'closed', 'escape in split mode closes the workspace');
  assert.equal(titlePanelVisible(shell, true), false);

  shell = selectItem(shell);
  assert.equal(shell.detail, 'split', 'selecting while closed re-opens in split mode');

  shell = closeDetail(shell);
  assert.equal(shell.detail, 'closed');
  assert.equal(titlePanelVisible(shell, false), false, 'no panel is rendered without a selection');
});

test('media classification drives real preview, reader, and description decisions', () => {
  for (const ext of ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']) {
    assert.equal(canPreviewAsImage(ext), true, `${ext} must preview as an image`);
    assert.equal(classifyMediaExtension(ext), 'image');
  }
  for (const ext of ['.pdf', '.epub', '.mobi', '.azw', '.azw3', '.fb2', '.cbz']) {
    assert.equal(canPreviewAsImage(ext), false, `${ext} must not render as an img element`);
    assert.equal(canOpenInReader(ext), true, `${ext} must open in the reader`);
  }
  // Case and missing-dot forms are normalised the same way by the component.
  assert.equal(classifyMediaExtension('JPG'), 'image');
  assert.equal(describeMediaExtension('.pdf'), 'PDF Document');
  assert.equal(describeMediaExtension('.EPUB'), 'Publication Document');
  assert.equal(describeMediaExtension('.png'), 'PNG Image');
  assert.equal(describeMediaExtension('.zip'), 'ZIP File');
  assert.equal(canOpenInReader('.zip'), false);
});

test('static pages and the library shell share one collapsible sidebar primitive', () => {
  const browserSrc = read('components/library-browser.tsx');
  const staticSrc = read('components/static-product-page.tsx');
  const sidebarSrc = read('components/app-sidebar.tsx');

  assert.ok(browserSrc.includes('<AppSidebar'), 'library shell must render the shared AppSidebar');
  assert.ok(staticSrc.includes('<AppSidebar'), 'static pages must render the shared AppSidebar');
  assert.ok(
    staticSrc.includes('toggleSidebar'),
    'static pages must support the shared collapse interaction',
  );
  assert.ok(
    !browserSrc.includes('aria-label="Application navigation"'),
    'the library shell must not keep a second sidebar implementation',
  );
  assert.ok(
    !staticSrc.includes('aria-label="Application navigation"'),
    'static pages must not keep a second sidebar implementation',
  );

  // Settings stays anchored at the bottom-left of the shared sidebar.
  assert.ok(sidebarSrc.includes('<div className="flex-1 min-h-6" />'));
  assert.ok(sidebarSrc.includes('href="/settings"'));
});

test('the top product nav never duplicates the sidebar Settings link', () => {
  for (const file of ['components/library-browser.tsx', 'components/static-product-page.tsx']) {
    const src = read(file);
    const productNav = src.split('<nav aria-label="Product"')[1]?.split('</nav>')[0] ?? '';
    assert.ok(
      !productNav.includes('href="/settings"'),
      `${file} top product nav must not have a duplicate Settings link`,
    );
  }
});

test('dialog shell provides centering, a scrollable body, and a footer slot', () => {
  const dialogSrc = read('components/ui/dialog.tsx');

  assert.ok(dialogSrc.includes('fixed inset-0 z-50 flex items-center justify-center'));
  assert.ok(dialogSrc.includes('relative w-full'), 'must override the user-agent dialog positioning');
  assert.ok(dialogSrc.includes('m-0'), 'must reset margin to participate in flex centering');
  assert.ok(dialogSrc.includes('max-h-[calc(100dvh-3.5rem)]'), 'must cap height in short viewports');
  assert.ok(dialogSrc.includes('flex-1 overflow-y-auto'), 'body must scroll instead of overflowing');
  assert.ok(dialogSrc.includes('footer'), 'dialog must expose a footer slot');
  assert.ok(dialogSrc.includes('aria-modal="true"'));
  assert.ok(dialogSrc.includes('aria-labelledby="dialog-title"'));
});

test('ItemDetail maximized mode restrains content width and keeps maximize controls', () => {
  const detailSrc = read('components/item-detail.tsx');

  assert.ok(detailSrc.includes('Restore split view'));
  assert.ok(detailSrc.includes('Maximize workspace'));
  assert.ok(detailSrc.includes('max-w-4xl'));
  assert.ok(
    detailSrc.includes('key={item.id}'),
    'the Watch workspace must remount per title so no stale title state survives',
  );
});

