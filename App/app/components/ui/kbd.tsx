import type { HTMLAttributes } from 'react';

export function Kbd({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={`inline-flex items-center justify-center rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground shadow-[0_1px_0_0_rgba(0,0,0,0.05)] ${className ?? ''}`}
      {...props}
    >
      {children}
    </kbd>
  );
}
