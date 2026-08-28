import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS_SHAPE } from '../../src/lib/defaults';
import { StartPage } from '../../src/components/pages/StartPage/StartPage';

vi.mock('@/lib/bridge', () => ({
  send: vi.fn(),
  ask: async () => [{ url: 'https://github.com/', host: 'github.com', title: 'GitHub', faviconDataUrl: null }],
  getBridge: () => null,
  isRunningInShell: () => false,
}));

let settings = { ...DEFAULT_SETTINGS_SHAPE, startPageWidgets: ['clock', 'search', 'topSites'] as const };
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: unknown }) => unknown) => select({ settings }),
}));

const updateSettings = vi.fn();
vi.mock('@/components/settings/shared/options', () => ({
  updateSettings: (patch: unknown) => updateSettings(patch),
}));

beforeEach(() => {
  settings = { ...DEFAULT_SETTINGS_SHAPE, startPageWidgets: ['clock', 'search', 'topSites'] as const };
  updateSettings.mockClear();
});

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

describe('once the notice has been read', () => {
  it('offers a way to get somewhere', () => {
    settings = { ...settings, hushNoticeDismissed: true };
    render(<StartPage tabId="t1" isHush />);

    expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
    expect(screen.queryByText(/This is a Hush tab/i)).toBeNull();
  });

  /**
   * The distinction the page rests on: a search field is a way to get
   * somewhere, and the sites you visit most are a report of where you went.
   * Only the second has any business being withheld — and it stays withheld.
   */
  it('still never shows what you have already done', async () => {
    settings = { ...settings, hushNoticeDismissed: true };
    render(<StartPage tabId="t1" isHush />);

    expect(screen.queryByText('github.com')).toBeNull();
    expect(screen.queryByText(/most-visited sites will collect here/i)).toBeNull();
  });

  it('shows the most visited sites in an ordinary tab, so that check means something', async () => {
    render(<StartPage tabId="t1" />);
    expect(await screen.findByText('github.com')).toBeTruthy();
  });
});

describe('dismissing it', () => {
  it('is offered', () => {
    render(<StartPage tabId="t1" isHush />);
    expect(screen.getByRole('button', { name: /don.t show this again/i })).toBeTruthy();
  });

  // A Hush tab keeps nothing, so it could not remember having been read itself.
  it('is remembered as a setting rather than by the tab', () => {
    render(<StartPage tabId="t1" isHush />);
    fireEvent.click(screen.getByRole('button', { name: /don.t show this again/i }));

    expect(updateSettings).toHaveBeenCalledWith({ hushNoticeDismissed: true });
  });
});
