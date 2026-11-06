import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { TabState } from '@shared/types';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';

// What the page has contacted so far, as the main process would list it; a test changes it as the page loads.
const connections = vi.hoisted(() => ({ now: [] as unknown[] }));
vi.mock('@/lib/bridge/bridge', () => ({
  send: () => {},
  // Anything but the connection list answers with its fallback, as a bridge that is not there would.
  ask: async (action: (api: unknown) => unknown, fallback: unknown) => {
    try {
      return (await action({ connections: { list: () => connections.now } })) ?? fallback;
    } catch {
      return fallback;
    }
  },
  getBridge: () => null,
  isRunningInShell: () => false,
}));

vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (selector: (state: unknown) => unknown) =>
    selector({
      siteInfo: { tabId: 'a', openedAt: 1_700_000_000_000 },
      settings: DEFAULT_SETTINGS_SHAPE,
    }),
}));

const { SiteInfoCard } = await import('@/components/overlay/SiteInfo/SiteInfoCard');

afterEach(cleanup);

const tab = (certificateChange = '', blockedCount = 0): TabState =>
  ({
    id: 'a',
    url: 'https://example.com/',
    displayUrl: 'https://example.com/',
    title: 'Example',
    faviconDataUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isAudible: false,
    isMuted: false,
    security: {
      level: 'secure',
      scheme: 'https',
      host: 'example.com',
      detail: 'Encrypted.',
      certificate: null,
      certificateChange,
    },
    error: null,
    blockedCount,
    loadMs: null,
    zoomFactor: 1,
    internalPage: null,
    isHush: false,
    isPinned: false,
    isAsleep: false,
    isBookmarked: false,
  }) as TabState;

/**
 * The comparison was tested on its own; this is the half that says the panel
 * actually shows it. A warning nobody sees is not a warning, and this is the
 * one Copacetic gives that other browsers do not.
 */
describe('the certificate change notice', () => {
  it('is absent when there is nothing to say', () => {
    render(<SiteInfoCard tab={tab()} />);
    expect(screen.queryByText('This certificate has changed')).toBeNull();
  });

  // Announced, because someone using a screen reader has no other way to know
  // the panel gained a warning.
  it('is shown and announced as a status when there is something to say', () => {
    render(<SiteInfoCard tab={tab('Something is reading this connection.')} />);
    expect(screen.getByText('This certificate has changed')).toBeTruthy();
    const statuses = screen.getAllByRole('status');
    expect(statuses.some((node) => node.textContent?.includes('reading this connection'))).toBe(true);
  });
});

/**
 * The list was read once, when the panel opened, while the count above it kept
 * climbing as the page loaded: 20 blocked over a list that said 4. It now
 * follows the count.
 */
describe('the hosts a page contacted', () => {
  const host = (name: string, blocked: number) => ({
    host: name,
    requests: blocked + 1,
    blocked,
    isTracker: true,
    rule: null,
  });

  it('catches up with the live count while the panel stays open', async () => {
    connections.now = [host('ads.example', 4)];
    const { rerender } = render(<SiteInfoCard tab={tab('', 4)} />);
    await waitFor(() => expect(screen.getByText('1 host')).toBeTruthy());

    connections.now = [host('ads.example', 12), host('tracker.example', 8)];
    rerender(<SiteInfoCard tab={tab('', 20)} />);
    await waitFor(() => expect(screen.getByText('2 hosts')).toBeTruthy(), { timeout: 2_000 });
    expect(screen.getByText('· 2 of them blocked')).toBeTruthy();
  });
});
