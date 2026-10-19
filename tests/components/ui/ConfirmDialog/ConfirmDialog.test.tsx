import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';

afterEach(cleanup);

const dialog = (onConfirm = vi.fn()) =>
  render(
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      title="Clear browsing data?"
      confirmLabel="Clear"
      onConfirm={onConfirm}
      isDestructive
    >
      History, cookies and the cache will be removed.
    </ConfirmDialog>,
  );

describe('asking before something cannot be undone', () => {
  it('says what will happen before it happens', () => {
    dialog();
    expect(screen.getByRole('alertdialog', { name: 'Clear browsing data?' })).toBeTruthy();
    expect(screen.getByText('History, cookies and the cache will be removed.')).toBeTruthy();
  });

  // Enter on a dialog that deletes should not delete.
  it('puts the keyboard on Cancel, not on the destructive button', () => {
    dialog();
    expect(document.activeElement?.textContent).toBe('Cancel');
  });

  it('does it only when confirmed', () => {
    const onConfirm = vi.fn();
    dialog(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
