'use client';

/**
 * Shared application sidebar.
 *
 * The library shell and every static/product page render this same primitive so
 * the collapsible icon-rail behaviour, the workspace links, and the bottom-left
 * Settings anchor cannot drift apart.
 */

import Link from 'next/link';
import {
  BookOpen,
  Clapperboard,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sidebarWidthClass, type SidebarMode } from '@/lib/shell/shell-state';

export type ShellCollection = 'read' | 'watch';

const COLLECTIONS: ReadonlyArray<{
  value: ShellCollection;
  label: string;
  Icon: typeof BookOpen;
}> = [
  { value: 'read', label: 'Read', Icon: BookOpen },
  { value: 'watch', label: 'Watch', Icon: Clapperboard },
];

/**
 * The primary sidebar is deliberately limited to the two global collections and
 * Settings.
 *
 * Watch titles own their knowledge workspace and Read titles own their study
 * workspace, so the old global Highlights / Knowledge & Diagrams / Canvas Notes
 * destinations are no longer primary navigation. Their routes still exist for
 * compatibility, deep links, migration and recovery, and can be reached
 * directly (and from the reader's canvas pane).
 */
const WORKSPACE_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  Icon: typeof PenTool;
}> = [];

export interface AppSidebarProps {
  sidebar: SidebarMode;
  onToggleSidebar: () => void;
  /** Present on the interactive library shell; static pages link instead. */
  activeCollection?: ShellCollection | null;
  onSelectCollection?: (collection: ShellCollection) => void;
  counts?: Partial<Record<ShellCollection, number | undefined>>;
  totalItemsLabel?: string;
}

export function AppSidebar({
  sidebar,
  onToggleSidebar,
  activeCollection = null,
  onSelectCollection,
  counts,
  totalItemsLabel,
}: AppSidebarProps) {
  const collapsed = sidebar === 'collapsed';

  return (
    <aside
      aria-label="Application navigation"
      data-sidebar={sidebar}
      className={`hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-150 md:flex ${sidebarWidthClass(sidebar)}`}
    >
      <div
        className={`flex items-center ${
          collapsed ? 'justify-center pb-2' : 'justify-between px-2 pb-2'
        }`}
      >
        {!collapsed && (
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Collections
          </p>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          onClick={onToggleSidebar}
          className="text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </Button>
      </div>

      <nav aria-label="Library collections" className="space-y-1 text-sm">
        {COLLECTIONS.map(({ value, label, Icon }) => {
          const count = counts?.[value];
          const isActive = activeCollection === value;
          const linkClass = collapsed
            ? `grid size-9 place-items-center mx-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-surface-muted'
              }`
            : `flex h-9 w-full items-center gap-2 rounded-md px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
                isActive
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-surface-muted'
              }`;
          const title = count === undefined ? label : `${label} (${count})`;

          if (!onSelectCollection) {
            return (
              <Link
                key={value}
                href={`/?collection=${value}`}
                aria-label={collapsed ? title : undefined}
                title={collapsed ? title : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={linkClass}
              >
                <Icon size={collapsed ? 17 : 16} />
                {!collapsed && <span className="flex-1">{label}</span>}
                {!collapsed && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {count ?? ''}
                  </span>
                )}
              </Link>
            );
          }

          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelectCollection(value)}
              aria-label={collapsed ? title : undefined}
              title={collapsed ? title : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={linkClass}
            >
              <Icon size={collapsed ? 17 : 16} />
              {!collapsed && <span className="flex-1">{label}</span>}
              {!collapsed && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {count ?? ''}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {collapsed && <div className="my-2 h-px w-6 mx-auto bg-sidebar-border" />}
      {!collapsed && (
        <p className="mb-2 mt-5 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Workspace
        </p>
      )}

      <nav aria-label="Workspace" className="space-y-1 text-sm">
        {WORKSPACE_LINKS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-label={collapsed ? label : undefined}
            title={collapsed ? label : undefined}
            className={
              collapsed
                ? 'grid size-9 place-items-center mx-auto rounded-md text-sidebar-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring'
                : 'flex h-9 items-center gap-2 rounded-md px-2 text-sidebar-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring'
            }
          >
            <Icon size={collapsed ? 17 : 16} />
            {!collapsed && label}
          </Link>
        ))}
      </nav>

      <div className="flex-1 min-h-6" />

      <div className="border-t border-sidebar-border pt-2">
        <Link
          href="/settings"
          aria-label={collapsed ? 'Settings' : undefined}
          title={collapsed ? 'Settings' : undefined}
          className={
            collapsed
              ? 'grid size-9 place-items-center mx-auto rounded-md text-sidebar-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring'
              : 'flex h-9 items-center gap-2 rounded-md px-2 text-sidebar-foreground outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-sidebar-ring'
          }
        >
          <Settings size={collapsed ? 17 : 16} />
          {!collapsed && 'Settings'}
        </Link>
        {!collapsed && totalItemsLabel && (
          <div className="px-2 pt-2 text-xs leading-5 text-muted-foreground">
            {totalItemsLabel}
          </div>
        )}
      </div>
    </aside>
  );
}
