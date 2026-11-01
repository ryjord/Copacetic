// Libs
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// Types
import type { TabState } from '@shared/types';

const replaceSplitPane = vi.fn();
vi.mock('@/lib/bridge/bridge', () => ({
  send: (action: (api: unknown) => void) => action({ tabs: { replaceSplitPane, activate: vi.fn() } }),
  ask: async () => ({}),
  getBridge: () => null,
  isRunningInShell: () => false,
}));
// The pages themselves are not what is under test, only what is drawn around them.
vi.mock('@/components/shell/InternalPage/InternalPage', () => ({ InternalPage: () => null }));
vi.mock('@/components/views/error/ErrorPage', () => ({ ErrorPage: () => null }));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  replaceSplitPane.mockClear();
});

const { SplitView } = await import('@/components/shell/SplitView/SplitView');

function tab(id: string, overrides: Partial<TabState> = {}): TabState {
  return {
    id,
    url: `https://${id}.example/`,
    displayUrl: `https://${id}.example/`,
    title: id,
    faviconDataUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isHush: false,
    isPinned: false,
    isAsleep: false,
    lastActiveAt: 0,
    isAudible: false,
    isMuted: false,
    security: {
      level: 'secure',
      scheme: 'https',
      host: `${id}.example`,
      detail: '',
      certificate: null,
      certificateChange: 'none',
    },
    error: null,
    blockedCount: 0,
    loadMs: null,
    zoomFactor: 1,
    internalPage: null,
    isBookmarked: false,
    groupId: null,
    ...overrides,
  };
}

const startTab = (id: string) => tab(id, { url: 'copacetic://start', title: 'New Tab', internalPage: 'start' });

describe('the empty half of a split', () => {
  const split = { leftId: 'left', rightId: 'empty', ratio: 0.5 };

  it('offers the other open tabs, and puts the chosen one there', () => {
    const tabs = [tab('left'), startTab('empty'), tab('mail'), tab('docs'), startTab('another-new-tab')];
    render(<SplitView split={split} tabs={tabs} activeTabId="empty" />);

    const picker = screen.getByRole('region', { name: 'Show an open tab here' });
    const offered = within(picker)
      .getAllByRole('button')
      .map((button) => button.lastElementChild?.textContent);
    // Not the half already showing, and not another tab with nothing in it.
    expect(offered).toEqual(['mail', 'docs']);

    fireEvent.click(within(picker).getByRole('button', { name: 'docs' }));
    expect(replaceSplitPane).toHaveBeenCalledWith('empty', 'docs');
  });

  it('offers nothing once both halves show a page', () => {
    render(<SplitView split={{ ...split, rightId: 'mail' }} tabs={[tab('left'), tab('mail')]} activeTabId="left" />);
    expect(screen.queryByRole('region', { name: 'Show an open tab here' })).toBeNull();
  });

  it('stays out of the way when there is no other tab to offer', () => {
    render(<SplitView split={split} tabs={[tab('left'), startTab('empty')]} activeTabId="empty" />);
    expect(screen.queryByRole('region', { name: 'Show an open tab here' })).toBeNull();
  });
});

/**
 * Hundreds of open tabs listed in full pushed the page out of its half and
 * could not be read; the picker now shows the few used last and finds the rest.
 */
describe('choosing among many open tabs', () => {
  const split = { leftId: 'left', rightId: 'empty', ratio: 0.5 };
  const many = Array.from({ length: 300 }, (_unused, index) =>
    tab(`tab-${index}`, { title: `Page ${index}`, url: `https://site-${index}.example/`, lastActiveAt: index }),
  );
  const offeredIn = (picker: HTMLElement) =>
    within(picker)
      .queryAllByRole('listitem')
      .map((item) => item.querySelector('button')?.lastElementChild?.textContent);

  it('shows the eight used most recently, newest first, and says how many more there are', () => {
    render(<SplitView split={split} tabs={[tab('left'), startTab('empty'), ...many]} activeTabId="empty" />);
    const picker = screen.getByRole('region', { name: 'Show an open tab here' });
    expect(offeredIn(picker)).toEqual(Array.from({ length: 8 }, (_unused, index) => `Page ${299 - index}`));
    expect(within(picker).getByText('292 more tabs match. Keep typing to narrow them down.')).toBeTruthy();
  });

  it('finds any of them by title or address, and Enter puts the first in this half', () => {
    render(<SplitView split={split} tabs={[tab('left'), startTab('empty'), ...many]} activeTabId="empty" />);
    const picker = screen.getByRole('region', { name: 'Show an open tab here' });
    const search = within(picker).getByRole('searchbox', { name: 'Find an open tab' });
    fireEvent.change(search, { target: { value: 'site-42.' } });
    expect(offeredIn(picker)).toEqual(['Page 42']);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(replaceSplitPane).toHaveBeenCalledWith('empty', 'tab-42');
  });

  it('says so when nothing matches, and Enter does nothing', () => {
    render(<SplitView split={split} tabs={[tab('left'), startTab('empty'), ...many]} activeTabId="empty" />);
    const picker = screen.getByRole('region', { name: 'Show an open tab here' });
    const search = within(picker).getByRole('searchbox', { name: 'Find an open tab' });
    fireEvent.change(search, { target: { value: 'nowhere at all' } });
    expect(within(picker).getByText('No open tab matches that.')).toBeTruthy();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(replaceSplitPane).not.toHaveBeenCalled();
  });
});
