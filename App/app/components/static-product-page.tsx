'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { LibraryBig } from 'lucide-react';

import { AppSidebar } from '@/components/app-sidebar';
import { initialShellState, toggleSidebar } from '@/lib/shell/shell-state';

export function StaticProductPage({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  const [shell, setShell] = useState(() => initialShellState());

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
        <AppSidebar
          sidebar={shell.sidebar}
          onToggleSidebar={() => setShell(toggleSidebar)}
        />
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
