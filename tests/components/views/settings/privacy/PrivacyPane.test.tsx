import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PrivacyPane } from '@/components/views/settings/privacy/PrivacyPane';

let blockedThisWeek = 0;
vi.mock('@/lib/bridge/bridge', () => ({
  send: vi.fn(),
  ask: async (action: (api: unknown) => Promise<unknown>) =>
    action({ history: { blockedThisWeek: async () => blockedThisWeek } }),
  getBridge: () => null,
  isRunningInShell: () => false,
}));

afterEach(() => {
  cleanup();
  blockedThisWeek = 0;
});

describe('the privacy pane', () => {
  it('takes the tracker count from the blocker', () => {
    const info = { blockerRuleCount: 122, filterLists: [] } as unknown as Parameters<typeof PrivacyPane>[0]['info'];
    render(<PrivacyPane info={info} openPane={() => {}} />);
    expect(document.body.textContent).toContain('122 domains');
  });

  it('says secure connections fall back only after asking', () => {
    render(<PrivacyPane info={null} openPane={() => {}} />);
    expect(document.body.textContent).toContain('asks before falling back to HTTP');
  });

  // A number the blocker kept, not one written into the copy.
  it('says what tracker blocking stopped this week', async () => {
    blockedThisWeek = 1234;
    render(<PrivacyPane info={null} openPane={() => {}} />);
    expect(await screen.findByText(/Blocked 1234 requests/)).toBeTruthy();
  });

  it('names what calls and video can see in plain words', () => {
    render(<PrivacyPane info={null} openPane={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Your public address' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Only through a proxy' })).toBeTruthy();
  });

  // Who would resolve every address is seen before encryption is switched on.
  it('shows the DNS provider before encrypted lookups are on', () => {
    render(<PrivacyPane info={null} openPane={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'DNS provider' })).toBeTruthy();
  });
});
