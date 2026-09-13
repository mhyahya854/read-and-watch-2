import type { HTMLAttributes } from 'react';

const baseClass =
  'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors whitespace-nowrap';

const variants = {
  default: 'bg-accent text-accent-foreground border border-primary/20',
  secondary: 'bg-surface-muted text-muted-foreground border border-border',
  outline: 'border border-border text-foreground bg-transparent',
  teal: 'bg-primary/10 text-primary border border-primary/25',
  destructive: 'bg-destructive/10 text-destructive border border-destructive/25',
} as const;

export type BadgeVariant = keyof typeof variants;

export function Badge({
  className,
  variant = 'secondary',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={`${baseClass} ${variants[variant]} ${className ?? ''}`}
      {...props}
    />
  );
}
