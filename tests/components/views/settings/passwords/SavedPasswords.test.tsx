import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

let answerReveal: (password: string) => void = () => {};
const reveal = vi.fn(() => new Promise<string>((resolve) => (answerReveal = resolve)));

vi.mock('@/lib/bridge/bridge', () => ({
  send: () => {},
  ask: async (action: (api: unknown) => unknown) => action({ vault: { reveal } }),
  getBridge: () => null,
}));

const { SavedPasswords } = await import('@/components/views/settings/passwords/SavedPasswords');

afterEach(() => {
  cleanup();
  reveal.mockClear();
});

const entries = [
  { id: 'a', origin: 'https://example.com', username: 'riley', createdAt: 1, updatedAt: 1, isReadable: true },
];

function renderPasswords(isUnlocked: boolean) {
  return <SavedPasswords entries={entries} isUnlocked={isUnlocked} onRemove={() => {}} onChanged={() => {}} />;
}

describe('a shown password and the vault lock', () => {
  it('is gone the moment the vault locks, and stays gone once it opens again', async () => {
    const { rerender } = render(renderPasswords(true));
    fireEvent.click(screen.getByRole('button', { name: 'Show the password for example.com' }));
    answerReveal('hunter2');
    expect(await screen.findByText('hunter2')).toBeTruthy();
    rerender(renderPasswords(false));
    expect(screen.queryByText('hunter2')).toBeNull();
    rerender(renderPasswords(true));
    expect(screen.queryByText('hunter2')).toBeNull();
  });

  it('ignores a reveal that answers after the lock', async () => {
    const { rerender } = render(renderPasswords(true));
    fireEvent.click(screen.getByRole('button', { name: 'Show the password for example.com' }));
    rerender(renderPasswords(false));
    rerender(renderPasswords(true));
    await act(async () => {
      answerReveal('hunter2');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByText('hunter2')).toBeNull();
  });

  it('asks once for a double press', () => {
    render(renderPasswords(true));
    const show = screen.getByRole('button', { name: 'Show the password for example.com' });
    fireEvent.click(show);
    fireEvent.click(show);
    expect(reveal).toHaveBeenCalledOnce();
  });
});
