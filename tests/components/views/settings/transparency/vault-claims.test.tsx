import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { VaultFacts } from '../../../../../electron/shared/types';

let facts: VaultFacts = {
  filePath: '/Users/someone/Library/Application Support/Copacetic/vault.json',
  hasKeychain: true,
  canAskWhoYouAre: true,
  isSigned: false,
  entryCount: 2,
};

vi.mock('@/lib/bridge', () => ({
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

const { TransparencyPane } =
  await import('../../../../../src/components/views/settings/transparency/TransparencyPane');

afterEach(cleanup);

/** The things a password manager is usually quiet about, each read from where it actually is. */
describe('what the vault admits to', () => {
  it('shows the real path rather than describing one', async () => {
    render(<TransparencyPane info={null} />);
    await waitFor(() => expect(screen.getByText(facts.filePath)).toBeTruthy());
  });

  it.each([
    'Where are they?',
    'What protects them?',
    'Does it fill passwords in?',
    'Does it offer to save passwords?',
  ])('answers %o', (question) => {
    render(<TransparencyPane info={null} />);
    expect(screen.getByText(question)).toBeTruthy();
  });

  // The uncomfortable one, and true of every password manager on every platform.
  it('admits software running as you can ask for the same key', async () => {
    render(<TransparencyPane info={null} />);
    await waitFor(() => expect(document.body.textContent).toContain('software running as you'));
  });

  it('warns that an unsigned update can cost the keychain key', async () => {
    facts = { ...facts, isSigned: false };
    render(<TransparencyPane info={null} />);
    await waitFor(() => expect(screen.getByText('Could an update lose them?')).toBeTruthy());
    expect(document.body.textContent).toContain('Nothing is deleted');
  });

  // Only true while the builds are unsigned; it must not outlive the reason.
  it('drops that warning once the builds are signed', async () => {
    facts = { ...facts, isSigned: true };
    render(<TransparencyPane info={null} />);
    await waitFor(() => expect(screen.getByText(facts.filePath)).toBeTruthy());
    expect(screen.queryByText('Could an update lose them?')).toBeNull();
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
 * becomes false, and this fails rather than leaving it standing.
 */
describe('the promise not to watch what you type', () => {
  it('is still true of the code: no preload reaches web content', () => {
    expect(readFileSync('electron/main/tabs/tabs.ts', 'utf8')).toMatch(/preload:\s*undefined/);
  });

  it('is what the page tells you, beside the fill that does run', () => {
    render(<TransparencyPane info={null} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('code running in every page');
    expect(text).toContain('Fill password');
  });
});
