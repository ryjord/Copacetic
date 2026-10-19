import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const setSurface = vi.fn();
const openSettings = vi.fn();
const state = {
  setSurface,
  openSettings,
  toggleSurface: vi.fn(),
  requestOmniboxFocus: vi.fn(),
  orderedTabs: [
    {
      id: 'a',
      url: 'https://example.com/',
      title: 'Example',
      isStartPage: false,
      isBookmarked: false,
      zoomFactor: 1,
    },
    {
      id: 'b',
      url: 'https://docs.rust-lang.org/book/',
      title: 'The Book',
      isStartPage: false,
      isBookmarked: false,
      zoomFactor: 1,
    },
  ],
  activeTab: {
    id: 'a',
    url: 'https://example.com/',
    title: 'Example',
    isStartPage: false,
    isBookmarked: false,
    isPinned: false,
    isAudible: false,
    isMuted: false,
    groupId: null,
    zoomFactor: 1,
  },
  hasClosedTabs: false,
  split: null,
  namedSessions: [],
  settings: { appearance: 'system', defaultZoomFactor: 1, shortcutOverrides: { 'new-tab': 'Alt+CmdOrCtrl+T' } },
};

vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (value: typeof state) => unknown) => select(state),
}));
vi.mock('@/lib/bridge/bridge', () => ({
  send: vi.fn(),
  ask: async (_action: unknown, fallback: unknown) => fallback,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

const { CommandPalette } = await import('@/components/views/palette/CommandPalette');

beforeEach(() => {
  setSurface.mockClear();
  openSettings.mockClear();
});
afterEach(cleanup);

const input = () => screen.getByRole('combobox', { name: 'Search commands and open tabs' });

describe('the command palette', () => {
  // The highlighted row was never announced: focus stays in the field, so it has to say which option is active.
  it('tells assistive technology which command is highlighted, and moves it with the arrows', () => {
    render(<CommandPalette />);
    const first = input().getAttribute('aria-activedescendant');
    expect(document.getElementById(first ?? '')?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(input().getAttribute('aria-activedescendant')).not.toBe(first);
  });

  it('names each group once, not on every row', () => {
    render(<CommandPalette />);
    expect(screen.getAllByText('Tabs')).toHaveLength(1);
    expect(screen.getAllByText('Go to')).toHaveLength(1);
  });

  it('finds an open tab by its address', () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: 'rust-lang' } });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringContaining('The Book'),
    ]);
  });

  it('offers a Hush tab, by name or by the word people use for it', () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: 'private' } });
    expect(screen.getByRole('option', { name: /New Hush tab/ })).toBeTruthy();
  });

  it('closes when the backdrop is clicked', () => {
    const { container } = render(<CommandPalette />);
    fireEvent.mouseDown(container.firstElementChild as HTMLElement);
    expect(setSurface).toHaveBeenCalledWith('none');
  });

  it('says so when nothing matches', () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: 'qqqqzz' } });
    expect(screen.getByText('No command or tab matches.')).toBeTruthy();
  });

  // The audit found the palette could not reach pinning, sleeping, groups, DevTools, import or clearing.
  it('reaches every tab command, not only the ones with a shortcut', () => {
    render(<CommandPalette />);
    ['Pin tab', 'Add tab to a new group', 'Put other tabs to sleep', 'Developer tools'].forEach((label) => {
      fireEvent.change(input(), { target: { value: label } });
      expect(screen.getByRole('option', { name: new RegExp(label) })).toBeTruthy();
    });
  });

  it('opens Your data for clearing and importing', () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: 'firefox' } });
    fireEvent.click(screen.getByRole('option', { name: /Import bookmarks and history/ }));
    expect(openSettings).toHaveBeenCalledWith('data');
  });

  it('teaches a shortcut where it has been moved to, not where it started', () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: 'New tab' } });
    const option = screen.getAllByRole('option').find((candidate) => candidate.textContent?.startsWith('New tab'));
    expect(option?.textContent).toMatch(/Alt|⌥/);
  });

  // Tab search is the palette with nothing in it but tabs, the one in front included.
  it('lists only the open tabs when opened as tab search', () => {
    render(<CommandPalette scope="tabs" />);
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual([expect.stringContaining('Example'), expect.stringContaining('The Book')]);
    expect(screen.getByRole('combobox', { name: 'Search open tabs' })).toBeTruthy();
  });
});
