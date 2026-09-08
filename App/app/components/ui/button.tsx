import type { ButtonHTMLAttributes } from 'react';

const baseClass =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const variants = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/80',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-muted',
  ghost: 'hover:bg-muted hover:text-foreground',
} as const;

const sizes = {
  default: 'h-8 px-2.5',
  sm: 'h-7 px-2.5 text-[0.8rem]',
  'icon-sm': 'size-7',
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
