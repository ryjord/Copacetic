// Libs
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Components
import { StartPage } from '@/components/views/start/StartPage';

// Utils
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/defaults';

// Types
import type { Settings } from '@shared/types';

vi.mock('@/lib/bridge', () => ({
  send: vi.fn(),
  ask: async () => [{ url: 'https://github.com/', host: 'github.com', title: 'GitHub', faviconDataUrl: null }],
  getBridge: () => null,
  isRunningInShell: () => false,
}));

let settings: Settings = { ...DEFAULT_SETTINGS_SHAPE, startPageWidgets: ['clock', 'search', 'topSites'] };
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: unknown }) => unknown) => select({ settings }),
}));

const updateSettings = vi.fn();
vi.mock('@/components/views/settings/shared/options', () => ({
  updateSettings: (patch: unknown) => updateSettings(patch),
}));

beforeEach(() => {
  settings = { ...DEFAULT_SETTINGS_SHAPE, startPageWidgets: ['clock', 'search', 'topSites'] };
  updateSettings.mockClear();
});

afterEach(cleanup);

describe('the start page in a Hush tab', () => {
  it('says what Hush does, and what it does not do', () => {
    render(<StartPage tabId="t1" isHush />);

    expect(screen.getByRole('heading', { name: 'This is a Hush tab' })).toBeTruthy();
    expect(screen.getByText(/Nothing here reaches the disk/i)).toBeTruthy();
    // Only ever saying the first half would be a boast.
    expect(screen.getByText(/It does not hide you/i)).toBeTruthy();
  });

  // The notice sits beside the field rather than in front of it.
  it('can be used at once, before the notice is read', () => {
    render(<StartPage tabId="t1" isHush />);
    expect(screen.getByRole('textbox', { name: 'Search or enter address' })).toBeTruthy();
  });

  it('keeps the search field even when the widgets setting leaves it out', () => {
    settings = { ...settings, startPageWidgets: ['clock'] };
    render(<StartPage tabId="t1" isHush />);
    expect(screen.getByRole('textbox', { name: 'Search or enter address' })).toBeTruthy();
  });

  // A search field is a way to get somewhere; the sites you visit most are a report of where you went.
  it('never shows what you have already done', () => {
    settings = { ...settings, hushNoticeDismissed: true };
    render(<StartPage tabId="t1" isHush />);

    expect(screen.queryByText('github.com')).toBeNull();
    expect(screen.queryByText(/Sites you visit often/i)).toBeNull();
  });

  it('marks the page so the atmosphere can change', () => {
    const { container } = render(<StartPage tabId="t1" isHush />);
    expect(container.querySelector('[data-hush="true"]')).toBeTruthy();
  });

  it('stops showing the notice once it has been read', () => {
    settings = { ...settings, hushNoticeDismissed: true };
    render(<StartPage tabId="t1" isHush />);
    expect(screen.queryByText(/This is a Hush tab/i)).toBeNull();
  });
});

describe('dismissing the Hush notice', () => {
  // A Hush tab keeps nothing, so it could not remember having been read itself.
  it('is remembered as a setting rather than by the tab', () => {
    render(<StartPage tabId="t1" isHush />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    expect(updateSettings).toHaveBeenCalledWith({ hushNoticeDismissed: true });
  });
});

describe('the start page in an ordinary tab', () => {
  it('shows the most visited sites, so the Hush check above means something', async () => {
    render(<StartPage tabId="t1" />);
    expect(await screen.findByText('github.com')).toBeTruthy();
  });

  it('says nothing about Hush', () => {
    render(<StartPage tabId="t1" />);
    expect(screen.queryByText(/This is a Hush tab/i)).toBeNull();
  });
});
