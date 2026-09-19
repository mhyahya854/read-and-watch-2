import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Clapperboard,
  Highlighter,
  LibraryBig,
  PenTool,
  Settings,
  Workflow,
} from 'lucide-react';

export function StaticProductPage({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="flex h-14 items-center border-b border-border bg-surface px-3 md:px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <LibraryBig size={17} />
          </span>
          <span className="font-editorial text-lg font-semibold tracking-tight">
            Read &amp; Watch
          </span>
        </Link>
        <nav aria-label="Product" className="ml-auto flex items-center gap-1 text-xs sm:text-sm">
          <Link
            href="/"
            className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground sm:px-3 sm:py-2"
          >
            Library
          </Link>
          <Link
            href="/privacy"
            className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground sm:px-3 sm:py-2"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground sm:px-3 sm:py-2"
          >
            Terms
          </Link>
        </nav>
      </header>
      <div className="flex min-h-[calc(100dvh-3.5rem)]">
        <aside className="hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Collections
          </p>
          <nav aria-label="Library collections" className="space-y-1 text-sm">
            <Link
              href="/?collection=read"
              className="flex h-9 items-center gap-2 rounded-md px-2 text-sidebar-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <BookOpen size={16} />
              Read
            </Link>
            <Link
              href="/?collection=watch"
              className="flex h-9 items-center gap-2 rounded-md px-2 text-sidebar-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <Clapperboard size={16} />
              Watch
            </Link>
          </nav>
          <p className="mb-2 mt-6 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Workspace
          </p>
          <nav aria-label="Workspace" className="space-y-1 text-sm">
            {[
              ['/highlights', 'Highlights', Highlighter],
              ['/knowledge', 'Knowledge & Diagrams', Workflow],
              ['/canvas-notes', 'Canvas Notes', PenTool],
            ].map(([href, label, Icon]) => (
              <Link
                key={href as string}
                href={href as string}
                className="flex h-9 items-center gap-2 rounded-md px-2 text-sidebar-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <Icon size={16} />
                {label as string}
              </Link>
            ))}
          </nav>
          <div className="flex-1 min-h-6" />
          <div className="border-t border-sidebar-border pt-3">
            <Link
              href="/settings"
              className="flex h-9 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <Settings size={16} />
              Settings
            </Link>
          </div>
        </aside>
        <article id="main-content" className="mx-auto w-full max-w-3xl px-5 py-10 md:px-10 md:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            {eyebrow}
          </p>
          <h1 className="font-editorial mt-2 text-4xl font-semibold tracking-tight">
            {title}
          </h1>
          <div className="mt-8 space-y-6 text-base leading-7 text-muted-foreground">
            {children}
          </div>
        </article>
      </div>
    </main>
  );
}
