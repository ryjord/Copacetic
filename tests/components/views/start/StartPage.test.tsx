// Libs
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Components
import { StartPage } from '@/components/views/start/StartPage';

// Utils
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';

// Types
import type { Settings } from '@shared/types';

vi.mock('@/lib/bridge/bridge', () => ({
  send: vi.fn(),
  ask: async () => [
    {
      url: 'https://github.com/',
      host: 'github.com',
      title: 'GitHub',
      faviconDataUrl: null,
      visitCount: 3,
      label: 'github.com',
      isShortcut: false,
    },
  ],
  getBridge: () => null,
  isRunningInShell: () => false,
}));

let settings: Settings = { ...DEFAULT_SETTINGS_SHAPE, startPageWidgets: ['clock', 'search', 'topSites'] };
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: unknown; surface: string }) => unknown) =>
    select({ settings, surface: 'none' }),
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
  // The notice sits beside the field rather than in front of it.
  it.each([
    {
      name: 'can be used at once, before the notice is read',
      startPageWidgets: ['clock', 'search', 'topSites'] as const,
    },
    {
      name: 'keeps the search field even when the widgets setting leaves it out',
      startPageWidgets: ['clock'] as const,
    },
  ])('$name', ({ startPageWidgets }) => {
    settings = { ...settings, startPageWidgets: [...startPageWidgets] };
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
