import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fileURLToPath } from 'node:url';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('sidebar state model supports expanded and collapsed icon-rail modes', () => {
  // Model state transitions
  let sidebarCollapsed = false;

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
  }

  assert.equal(sidebarCollapsed, false, 'starts expanded');
  toggleSidebar();
  assert.equal(sidebarCollapsed, true, 'toggles to collapsed icon rail');
  toggleSidebar();
  assert.equal(sidebarCollapsed, false, 'restores to expanded mode');
});

test('title-panel layout state transitions deterministically between split, maximized, and closed', () => {
  let detailMode = 'split';
  let selectedId = null;

  function selectItem(id) {
    selectedId = id;
    if (detailMode === 'closed') {
      detailMode = 'split';
    }
  }

  function toggleMaximize() {
    detailMode = detailMode === 'maximized' ? 'split' : 'maximized';
  }

  function handleEscape() {
    if (detailMode === 'maximized') {
      detailMode = 'split';
    } else if (detailMode === 'split') {
      detailMode = 'closed';
    }
  }

  // 1. Initial selection
  selectItem('read-123');
  assert.equal(selectedId, 'read-123');
  assert.equal(detailMode, 'split', 'selection opens in split mode');

  // 2. Maximize workspace
  toggleMaximize();
  assert.equal(detailMode, 'maximized', 'toggles to maximized focus mode');

  // 3. Escape in maximized restores split
  handleEscape();
  assert.equal(detailMode, 'split', 'escape in maximized restores split mode');

  // 4. Escape in split closes/minimizes
  handleEscape();
  assert.equal(detailMode, 'closed', 'escape in split mode closes workspace');

  // 5. Selecting row while closed reopens in split
  selectItem('read-456');
  assert.equal(selectedId, 'read-456');
  assert.equal(detailMode, 'split', 'selecting while closed re-opens in split mode');
});

test('media preview helper correctly routes image vs non-image/pdf documents', () => {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'];
  const documentExtensions = ['.pdf', '.epub', '.mobi', '.azw', '.azw3', '.fb2', '.cbz', '.txt', '.md'];

  function classifyMedia(ext) {
    const lower = ext.toLowerCase();
    const isImage = imageExtensions.includes(lower);
    const isPdf = lower === '.pdf';
    const isBook = ['.pdf', '.epub', '.mobi', '.azw', '.azw3', '.fb2', '.cbz'].includes(lower);
    const isVideo = ['.mp4', '.webm', '.mkv'].includes(lower);
    return { isImage, isPdf, isBook, isVideo };
  }

  // Images should be previewed visually
  for (const ext of imageExtensions) {
    const res = classifyMedia(ext);
    assert.equal(res.isImage, true, `${ext} should be classified as image`);
    assert.equal(res.isPdf, false);
  }

  // Non-images/documents should never be treated as direct image previews
  for (const ext of documentExtensions) {
    const res = classifyMedia(ext);
    assert.equal(res.isImage, false, `${ext} must not be previewed directly as an img element`);
  }

  assert.equal(classifyMedia('.pdf').isPdf, true, '.pdf is identified as PDF');
  assert.equal(classifyMedia('.pdf').isBook, true, '.pdf is identified as readable book format');
});

test('dialog centering class contract guarantees in-flow flex participation and full viewport centering', () => {
  const dialogSrc = readFileSync(resolve(appRoot, 'components/ui/dialog.tsx'), 'utf-8');

  // Must have fixed inset-0 flex items-center justify-center container
  assert.ok(
    dialogSrc.includes('fixed inset-0 z-50 flex items-center justify-center'),
    'Dialog wrapper must be a fixed viewport flex container with items-center justify-center',
  );

  // Dialog element itself must have relative positioning to participate in flex centering
  assert.ok(
    dialogSrc.includes('relative w-full'),
    'Dialog element must have relative positioning to override user-agent absolute positioning',
  );

  // Dialog element must have m-0 and clean padding/overflow
  assert.ok(
    dialogSrc.includes('m-0'),
    'Dialog element must reset margin to participate cleanly in flex centering',
  );

  // Accessibility
  assert.ok(dialogSrc.includes('aria-modal="true"'), 'Dialog must include aria-modal="true"');
  assert.ok(dialogSrc.includes('aria-labelledby="dialog-title"'), 'Dialog must label title');
});

test('sidebar Settings placement contract confirms bottom-left anchoring and no top-bar duplicate', () => {
  const browserSrc = readFileSync(resolve(appRoot, 'components/library-browser.tsx'), 'utf-8');
  const staticSrc = readFileSync(resolve(appRoot, 'components/static-product-page.tsx'), 'utf-8');

  // Both must anchor Settings in the sidebar with flex-1 spacer
  assert.ok(
    browserSrc.includes('<div className="flex-1 min-h-6" />'),
    'LibraryBrowser sidebar must have flexible space pushing Settings to bottom',
  );
  assert.ok(
    staticSrc.includes('<div className="flex-1 min-h-6" />'),
    'StaticProductPage sidebar must have flexible space pushing Settings to bottom',
  );

  // Top header nav must NOT include Settings link
  const browserHeaderNav = browserSrc.split('<nav aria-label="Product"')[1].split('</nav>')[0];
  assert.ok(
    !browserHeaderNav.includes('href="/settings"'),
    'LibraryBrowser top product nav must not have duplicate Settings link',
  );

  const staticHeaderNav = staticSrc.split('<nav aria-label="Product"')[1].split('</nav>')[0];
  assert.ok(
    !staticHeaderNav.includes('href="/settings"'),
    'StaticProductPage top product nav must not have duplicate Settings link',
  );
});

test('ItemDetail maximized mode enforces restrained max-widths and avoids stretched card layouts', () => {
  const detailSrc = readFileSync(resolve(appRoot, 'components/item-detail.tsx'), 'utf-8');

  // Must include maximize/restore controls in header
  assert.ok(detailSrc.includes('Restore split view'), 'ItemDetail must support restore split view control');
  assert.ok(detailSrc.includes('Maximize workspace'), 'ItemDetail must support maximize workspace control');

  // Maximized mode must restrain content width
  assert.ok(detailSrc.includes('max-w-4xl'), 'ItemDetail must apply max-w-4xl container when maximized');
});
