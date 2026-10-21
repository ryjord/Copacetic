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

  // A number the blocker kept, not one written into the copy.
  it('says what tracker blocking stopped this week', async () => {
    blockedThisWeek = 1234;
    render(<PrivacyPane info={null} openPane={() => {}} />);
    expect(await screen.findByText(/Blocked 1234 requests/)).toBeTruthy();
  });
});
