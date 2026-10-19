import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { VaultState } from '../../../../../electron/shared/types';

let vaultState: VaultState = { availability: 'ready', detail: '', entries: [], unreadableCount: 0 };

vi.mock('@/lib/bridge/bridge', () => ({
  send: () => {},
  ask: async (action: (api: unknown) => unknown, fallback: unknown) => {
    const api = {
      vault: {
        list: async () => vaultState,
        reveal: async () => 'hunter2',
        add: async () => ({ id: 'new' }),
        remove: async () => null,
        lockState: async () => ({ isUnlocked: true, method: 'none', detail: '' }),
      },
    };
    try {
      return await action(api);
    } catch {
      return fallback;
    }
  },
  getBridge: () => null,
  isRunningInShell: () => false,
}));

const { PasswordsPane } = await import('@/components/views/settings/passwords/PasswordsPane');

afterEach(cleanup);

const entry = (id: string, isReadable: boolean) => ({
  id,
  origin: 'https://example.com',
  username: 'riley',
  createdAt: 1,
  updatedAt: 1,
  isReadable,
});

describe('the passwords pane', () => {
  it('says nothing is saved when nothing is', async () => {
    vaultState = { availability: 'ready', detail: '', entries: [], unreadableCount: 0 };
    render(<PasswordsPane />);
    await waitFor(() => expect(screen.getByText('No passwords saved yet')).toBeTruthy());
  });

  it('lists what is saved, with a way to see it', async () => {
    vaultState = { availability: 'ready', detail: '', entries: [entry('a', true)], unreadableCount: 0 };
    render(<PasswordsPane />);
    await waitFor(() => expect(screen.getByText('example.com')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy();
  });

  // Filling shipped in 1.3.2 while Settings denied it for four releases; the claim stays tied to the code.
  it('names the control that fills, and says it never offers to save', () => {
    render(<PasswordsPane />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Fill password');
    expect(text).toContain('never offers to save what you type');
  });

  /**
   * An update that loses the keychain entry must never read as "you have no
   * passwords": that is the sentence that makes someone believe their data is
   * gone and stop looking for it.
   */
  describe('when the secrets cannot be decrypted', () => {
    const unreadable: VaultState = {
      availability: 'unreadable',
      detail: '1 of your saved passwords cannot be decrypted on this machine. They have not been deleted.',
      entries: [entry('a', false)],
      unreadableCount: 1,
    };

    it('never claims nothing is saved, and says why in words', async () => {
      vaultState = unreadable;
      render(<PasswordsPane />);
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('have not been deleted'));
      expect(screen.queryByText('No passwords saved yet')).toBeNull();
    });

    it('marks the entry rather than offering to show a password it cannot read', async () => {
      vaultState = unreadable;
      render(<PasswordsPane />);
      await waitFor(() => expect(screen.getAllByText('Unreadable').length).toBeGreaterThan(0));
      expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
    });
  });

  describe('when there is no keychain at all', () => {
    const unavailable: VaultState = {
      availability: 'unavailable',
      detail: 'This machine has no keychain Copacetic can use, so there is nowhere safe to keep a password.',
      entries: [],
      unreadableCount: 0,
    };

    // Offering a form that cannot save anything is worse than offering none.
    it('explains why, and does not offer to add one', async () => {
      vaultState = unavailable;
      render(<PasswordsPane />);
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('nowhere safe'));
      expect(screen.queryByRole('button', { name: 'Add password' })).toBeNull();
    });
  });

  it('offers to add one when the vault is usable', async () => {
    vaultState = { availability: 'ready', detail: '', entries: [], unreadableCount: 0 };
    render(<PasswordsPane />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add password' })).toBeTruthy());
  });
});
