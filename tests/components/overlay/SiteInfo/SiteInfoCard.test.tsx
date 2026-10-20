import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { TabState } from '@shared/types';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';

vi.mock('@/lib/bridge/bridge', () => ({
  send: () => {},
  ask: async (_action: unknown, fallback: unknown) => fallback,
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

const tab = (certificateChange = ''): TabState =>
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
    blockedCount: 0,
    loadMs: null,
    zoomFactor: 1,
    isStartPage: false,
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

  it('appears when there is', () => {
    render(<SiteInfoCard tab={tab('Something is reading this connection.')} />);
    expect(screen.getByText('This certificate has changed')).toBeTruthy();
    expect(document.body.textContent).toContain('Something is reading this connection.');
  });

  // Announced, because someone using a screen reader has no other way to know
  // the panel gained a warning.
  it('is announced rather than only shown', () => {
    render(<SiteInfoCard tab={tab('Something is reading this connection.')} />);
    const statuses = document.querySelectorAll('[role="status"]');
    expect([...statuses].some((node) => node.textContent?.includes('reading this connection'))).toBe(true);
  });
});
