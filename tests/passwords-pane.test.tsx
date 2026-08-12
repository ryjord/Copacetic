import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { VaultState } from '../electron/shared/types';

let vaultState: VaultState = { availability: 'ready', detail: '', entries: [], unreadableCount: 0 };

vi.mock('@/lib/bridge', () => ({
  send: () => {},
  ask: async (action: (api: unknown) => unknown, fallback: unknown) => {
    const api = {
      vault: {
        list: async () => vaultState,
        reveal: async () => 'hunter2',
        add: async () => ({ id: 'new' }),
        remove: async () => {},
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

const { PasswordsPane } = await import('../src/components/surfaces/settings/PasswordsPane');

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
    await waitFor(() => expect(screen.getByText('No passwords saved yet.')).toBeTruthy());
  });

  it('lists what is saved', async () => {
    vaultState = { availability: 'ready', detail: '', entries: [entry('a', true)], unreadableCount: 0 };
    render(<PasswordsPane />);
    await waitFor(() => expect(screen.getByText('https://example.com')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy();
  });

  /**
   * The whole reason the vault reports three states rather than a list. An
   * update that loses the keychain entry must never read as "you have no
   * passwords" — that is the sentence that makes someone believe their data is
   * gone and stop looking for it.
   */
  describe('when the secrets cannot be decrypted', () => {
    const unreadable: VaultState = {
      availability: 'unreadable',
      detail: '1 of your saved passwords cannot be decrypted on this machine. They have not been deleted.',
      entries: [entry('a', false)],
      unreadableCount: 1,
    };

    it('never claims nothing is saved', async () => {
      vaultState = unreadable;
      render(<PasswordsPane />);
      await waitFor(() => expect(screen.getByText('https://example.com')).toBeTruthy());
      expect(screen.queryByText('No passwords saved yet.')).toBeNull();
    });

    it('says so, in words, where it will be read', async () => {
      vaultState = unreadable;
      render(<PasswordsPane />);
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('have not been deleted'));
    });

    it('marks the entry rather than offering to show a password it cannot read', async () => {
      vaultState = unreadable;
      render(<PasswordsPane />);
      await waitFor(() => expect(screen.getByText('Unreadable')).toBeTruthy());
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

    it('explains why rather than looking broken', async () => {
      vaultState = unavailable;
      render(<PasswordsPane />);
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('nowhere safe'));
    });

    // Offering a form that cannot save anything is worse than offering none.
    it('does not offer to save one', async () => {
      vaultState = unavailable;
      render(<PasswordsPane />);
      await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
      expect(screen.queryByRole('button', { name: 'Save password' })).toBeNull();
    });
  });

  it('offers the form when the vault is usable', async () => {
    vaultState = { availability: 'ready', detail: '', entries: [], unreadableCount: 0 };
    render(<PasswordsPane />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save password' })).toBeTruthy());
  });
});
