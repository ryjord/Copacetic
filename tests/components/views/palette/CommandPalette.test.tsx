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

const input = () => screen.getByRole('combobox', { name: 'Search commands, tabs, bookmarks, history and settings' });

describe('the command palette', () => {
  // The highlighted row was never announced: focus stays in the field, so it has to say which option is active.
  it('tells assistive technology which command is highlighted, and moves it with the arrows', () => {
    render(<CommandPalette />);
    const first = input().getAttribute('aria-activedescendant');
    expect(document.getElementById(first ?? '')?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(input().getAttribute('aria-activedescendant')).not.toBe(first);
  });

  // A heading inside an option was read as part of that command's name.
  it('lists each group as a labelled group of options', () => {
    render(<CommandPalette />);
    const tabs = screen.getByRole('group', { name: 'Tabs' });
    expect(tabs.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
    screen.getAllByRole('option').forEach((option) => expect(option.textContent).not.toMatch(/^Tabs/));
  });

  it('says the list is open only when something is listed, and says so when nothing matches', () => {
    render(<CommandPalette />);
    expect(input().getAttribute('aria-expanded')).toBe('true');
    fireEvent.change(input(), { target: { value: 'qqqqzz' } });
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Nothing matches.')).toBeTruthy();
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

  // The audit found the palette could not reach pinning, sleeping, groups, DevTools, import or clearing.
  it('reaches every tab command, not only the ones with a shortcut', () => {
    render(<CommandPalette />);
    ['Pin tab', 'Add tab to a new group', 'Put other tabs to sleep', 'Developer tools'].forEach((label) => {
      fireEvent.change(input(), { target: { value: label } });
      expect(screen.getByRole('option', { name: new RegExp(label) })).toBeTruthy();
    });
  });

  // Importing from a browser needs one chosen and looked at first, which is the Data pane's job.
  it('opens Your data to import from another browser', () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: 'firefox' } });
    fireEvent.click(screen.getByRole('option', { name: /Import from another browser/ }));
    expect(openSettings).toHaveBeenCalledWith('data');
  });

  // The rest do the thing rather than opening Settings at it.
  it('opens the clearing dialog for the range named', async () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: 'clear browsing data' } });
    fireEvent.click(screen.getAllByRole('option', { name: /Clear browsing data/ })[0]!);
    expect(openSettings).not.toHaveBeenCalled();
    expect(await screen.findByRole('alertdialog', { name: /Clear browsing data/ })).toBeTruthy();
  });

  it('finds a setting and opens its pane', () => {
    render(<CommandPalette />);
    fireEvent.change(input(), { target: { value: 'wallpaper' } });
    fireEvent.click(screen.getByRole('option', { name: /Settings: Appearance/ }));
    expect(openSettings).toHaveBeenCalledWith('appearance');
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
