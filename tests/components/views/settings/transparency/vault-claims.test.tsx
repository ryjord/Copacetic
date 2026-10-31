import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { VaultFacts } from '../../../../../electron/shared/types';

let facts: VaultFacts = {
  filePath: '/Users/someone/Library/Application Support/Copacetic/vault.json',
  hasKeychain: true,
  keychainName: 'the macOS Keychain',
  keychainProblem: '',
  canAskWhoYouAre: true,
  isSigned: false,
  entryCount: 2,
};

vi.mock('@/lib/bridge/bridge', () => ({
  send: () => {},
  ask: async (action: (api: unknown) => unknown, fallback: unknown) => {
    try {
      return await action({ vault: { facts: async () => facts } });
    } catch {
      return fallback;
    }
  },
  getBridge: () => null,
  isRunningInShell: () => false,
}));

const { TransparencyPane } = await import('@/components/views/settings/transparency/TransparencyPane');

afterEach(cleanup);

/** The things a password manager is usually quiet about, each read from where it actually is. */
describe('what the vault admits to', () => {
  it('shows the real path rather than describing one', async () => {
    render(<TransparencyPane info={null} />);
    await waitFor(() => expect(screen.getByText(facts.filePath)).toBeTruthy());
  });

  // The warning is only true while the builds are unsigned; it must not outlive the reason.
  it.each([
    { name: 'warns that an unsigned update can cost the keychain key', isSigned: false, isWarned: true },
    { name: 'drops that warning once the builds are signed', isSigned: true, isWarned: false },
  ])('$name', async ({ isSigned, isWarned }) => {
    facts = { ...facts, isSigned };
    render(<TransparencyPane info={null} />);
    await waitFor(() => expect(screen.getByText(facts.filePath)).toBeTruthy());
    if (isWarned) {
      expect(screen.getByText('Could an update lose them?')).toBeTruthy();
      expect(document.body.textContent).toContain('Nothing is deleted');
    } else {
      expect(screen.queryByText('Could an update lose them?')).toBeNull();
    }
    facts = { ...facts, isSigned: false };
  });

  it('says locking is one click where the machine cannot ask who you are', async () => {
    facts = { ...facts, canAskWhoYouAre: false };
    render(<TransparencyPane info={null} />);
    await waitFor(() => expect(document.body.textContent).toContain('unlocking is one click'));
    facts = { ...facts, canAskWhoYouAre: true };
  });
});

/**
 * Nothing of Copacetic's sits in a page permanently, which is why it never
 * offers to save what you type. If a preload ever reaches web content the claim
 * becomes false, and this fails rather than leaving it standing. Only an
 * extension's own page is given one; extensions.smoke.ts proves a website the
 * tab goes on to gets a fresh view without it.
 */
describe('the promise not to watch what you type', () => {
  it('is still true of the code: a preload reaches only an extension page, never web content', () => {
    const source = readFileSync('electron/main/tabs/tabs.ts', 'utf8');
    expect(source).toMatch(/preload:\s*extensionPreload,/);
    const preloadsGiven = [...source.matchAll(/this\.makeView\(([^)]*)\)/g)]
      .map((call) => call[1]?.split(',')[2]?.trim())
      .filter((preload) => preload !== undefined);
    expect(preloadsGiven.length).toBeGreaterThan(0);
    expect(preloadsGiven.every((preload) => preload === 'extensionPage?.host.preload')).toBe(true);
    expect(source).toContain('this.guardExtensionView(tab, tab.extensionPage)');
  });

  it('names what keeps the key, and says why when nothing can', async () => {
    render(<TransparencyPane info={null} />);
    await waitFor(() => expect(document.body.textContent).toContain('A key kept by the macOS Keychain'));
    cleanup();

    facts = { ...facts, hasKeychain: false, keychainName: '', keychainProblem: 'No keyring is running.' };
    render(<TransparencyPane info={null} />);
    await waitFor(() => expect(document.body.textContent).toContain('No keyring is running.'));
    facts = { ...facts, hasKeychain: true, keychainName: 'the macOS Keychain', keychainProblem: '' };
  });
});
