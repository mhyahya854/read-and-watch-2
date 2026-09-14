import type { ButtonHTMLAttributes } from 'react';

const baseClass =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const variants = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'border-border bg-surface text-secondary-foreground hover:bg-surface-muted',
  outline: 'border-border bg-transparent text-foreground hover:bg-surface-muted',
  destructive: 'bg-destructive text-white hover:bg-destructive/90',
  ghost: 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
} as const;

const sizes = {
  default: 'h-9 px-3',
  sm: 'h-8 px-2.5 text-sm',
  'icon-sm': 'size-8',
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      data-slot="button"
      className={`${baseClass} ${variants[variant]} ${sizes[size]} ${className ?? ''}`}
      {...props}
    />
  );
}

export { Button };
