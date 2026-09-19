'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'max-w-md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement as HTMLElement | null;
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousActive?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-foreground/25 backdrop-blur-[2px] overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <dialog
        ref={dialogRef}
        open
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? 'dialog-description' : undefined}
        className={`relative w-full ${maxWidth} max-h-[calc(100dvh-3.5rem)] flex flex-col rounded-lg border border-border bg-surface shadow-2xl overflow-hidden m-0 p-0 text-foreground animate-in fade-in-0 zoom-in-95 duration-150`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 bg-surface shrink-0">
          <div className="min-w-0 flex-1">
            <h2
              id="dialog-title"
              className="font-editorial text-lg font-semibold text-foreground truncate"
            >
              {title}
            </h2>
            {description && (
              <p
                id="dialog-description"
                className="mt-0.5 text-xs text-muted-foreground truncate"
              >
                {description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close dialog"
            onClick={onClose}
            className="shrink-0 -mr-1 -mt-0.5"
          >
            <X size={16} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="border-t border-border px-5 py-3 bg-surface-muted/30 shrink-0 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </dialog>
    </div>
  );
}
