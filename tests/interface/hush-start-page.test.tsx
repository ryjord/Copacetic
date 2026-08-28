import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS_SHAPE } from '../../src/lib/defaults';
import { StartPage } from '../../src/components/pages/StartPage/StartPage';

vi.mock('@/lib/bridge', () => ({
  send: vi.fn(),
  ask: async () => [{ url: 'https://github.com/', host: 'github.com', title: 'GitHub', faviconDataUrl: null }],
  getBridge: () => null,
  isRunningInShell: () => false,
}));

vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: typeof DEFAULT_SETTINGS_SHAPE }) => unknown) =>
    select({ settings: { ...DEFAULT_SETTINGS_SHAPE, startPageWidgets: ['clock', 'search', 'topSites'] } }),
}));

afterEach(cleanup);

/**
 * The widgets are a record of what someone does — the sites they visit most,
 * a field that searches. None of it belongs on a page whose whole promise is
 * that it keeps nothing, and a Hush tab that looks like every other new tab is
 * the failure this is all about.
 */
describe('the start page in a Hush tab', () => {
  it('shows none of the widgets an ordinary new tab shows', () => {
    render(<StartPage tabId="t1" isHush />);

    expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
    expect(screen.queryByText('Copacetic')).toBeNull();
  });

  it('says what Hush does, and what it does not do', () => {
    render(<StartPage tabId="t1" isHush />);

    expect(screen.getByText(/This is a Hush tab/i)).toBeTruthy();
    expect(screen.getByText(/Nothing here reaches the disk/i)).toBeTruthy();
    // Only ever saying the first half would be a boast.
    expect(screen.getByText(/It does not hide you/i)).toBeTruthy();
  });

  it('marks the page so the atmosphere can go dark', () => {
    const { container } = render(<StartPage tabId="t1" isHush />);
    expect(container.querySelector('[data-hush="true"]')).toBeTruthy();
  });
});

describe('the start page in an ordinary tab', () => {
  it('still shows the widgets, so the test above fails for the right reason', () => {
    render(<StartPage tabId="t1" />);
    expect(screen.getByText('Copacetic')).toBeTruthy();
  });

  it('says nothing about Hush', () => {
    render(<StartPage tabId="t1" />);
    expect(screen.queryByText(/This is a Hush tab/i)).toBeNull();
  });
});
