'use client';

import { AlertDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button/Button';
import { t } from '@shared/i18n/translate';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What will happen, in a sentence or a short list. */
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  /** Destructive confirmations are red; everything else is the accent. */
  isDestructive?: boolean;
  /** For a choice made inside the dialog that is not yet complete. */
  disabled?: boolean;
}

/**
 * Asks before something that cannot be undone.
 *
 * Portalled to the body, so it stacks above everything by DOM order alone.
 * Cancel is focused first: Enter on a dialog that deletes should not delete.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  onConfirm,
  isDestructive = false,
  disabled = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="animate-fade fixed inset-0 bg-void/60" />
        <AlertDialog.Content className="animate-pop fixed left-1/2 top-1/2 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-raised p-5 shadow-dialog">
          <AlertDialog.Title className="text-title font-semibold text-ink">{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-body text-ink-dim">{children}</div>
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">{t('shell.ui.confirmDialog.cancel')}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={isDestructive ? 'danger' : 'primary'} disabled={disabled} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
