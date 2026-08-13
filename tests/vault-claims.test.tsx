import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { VaultFacts, VaultLock, VaultState } from '../electron/shared/types';

let facts: VaultFacts = {
  filePath: '/Users/someone/Library/Application Support/Copacetic/vault.json',
  hasKeychain: true,
  canAskWhoYouAre: true,
  isSigned: false,
  entryCount: 2,
};
const vaultState: VaultState = { availability: 'ready', detail: '', entries: [], unreadableCount: 0 };
const lockState: VaultLock = { isUnlocked: true, method: 'touch-id', detail: 'Locking hides your passwords.' };

vi.mock('@/lib/bridge', () => ({
  send: () => {},
  ask: async (action: (api: unknown) => unknown, fallback: unknown) => {
    const api = {
      vault: {
        list: async () => vaultState,
        lockState: async () => lockState,
        facts: async () => facts,
        reveal: async () => '',
        add: async () => ({ id: 'x' }),
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

/**
 * Settings is where Copacetic makes claims about itself, and a claim that
 * drifts from what the code does is worse than no claim. These are the ones a
 * password manager is usually quiet about.
 */
describe('what the vault admits to', () => {
  it('shows the real path rather than describing one', async () => {
    render(<PasswordsPane />);
    await waitFor(() => expect(screen.getByText(facts.filePath)).toBeTruthy());
  });

  it.each([
    'Does it fill passwords in for me?',
    'Does anything leave this machine?',
    'What is actually protecting them?',
    'Where are my passwords?',
  ])('answers %o', async (question) => {
    render(<PasswordsPane />);
    await waitFor(() => expect(screen.getByText(question)).toBeTruthy());
  });

  // The uncomfortable one. Every password manager has this property and almost
  // none of them say it.
  it('admits software running as you can ask for the same key', async () => {
    render(<PasswordsPane />);
    await waitFor(() => expect(document.body.textContent).toContain('software running as you'));
    expect(document.body.textContent).toContain('most do not');
  });

  it('warns that an unsigned update can cost the keychain entry', async () => {
    facts = { ...facts, isSigned: false };
    render(<PasswordsPane />);
    await waitFor(() => expect(screen.getByText('Could an update lose them?')).toBeTruthy());
    expect(document.body.textContent).toContain('not deleted');
  });

  // That warning is only true while the builds are unsigned; it must not
  // outlive the reason for it.
  it('drops that warning once the builds are signed', async () => {
    facts = { ...facts, isSigned: true };
    render(<PasswordsPane />);
    await waitFor(() => expect(screen.getByText('Where are my passwords?')).toBeTruthy());
    expect(screen.queryByText('Could an update lose them?')).toBeNull();
    facts = { ...facts, isSigned: false };
  });

  it('says locking is one click where the machine cannot ask who you are', async () => {
    facts = { ...facts, canAskWhoYouAre: false };
    render(<PasswordsPane />);
    await waitFor(() => expect(document.body.textContent).toContain('unlocking is one click'));
    facts = { ...facts, canAskWhoYouAre: true };
  });
});

/**
 * The claim that Copacetic never runs code inside a page is the reason
 * save-on-submit was dropped. If a preload is ever added to web content the
 * claim becomes false, and this fails rather than leaving a lie in Settings.
 */
describe('the promise not to read your pages', () => {
  it('is still true of the code', () => {
    const tabs = readFileSync('electron/main/tabs.ts', 'utf8');
    expect(tabs).toMatch(/preload:\s*undefined/);
  });

  it('is what the pane tells the user', async () => {
    render(<PasswordsPane />);
    await waitFor(() => expect(document.body.textContent).toContain('ships without any'));
  });
});
