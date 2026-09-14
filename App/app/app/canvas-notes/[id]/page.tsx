'use client';

/**
 * Fullscreen Canvas Workspace Route.
 * Phase 10 — Book-Linked Excalidraw Notes.
 */

import { use } from 'react';
import { ReadWatchCanvas } from '@/components/canvas';

export default function CanvasWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <main className="h-screen w-screen overflow-hidden bg-background">
      <ReadWatchCanvas canvasId={id} isBesideReader={false} />
    </main>
  );
}
