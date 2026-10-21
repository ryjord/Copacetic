// Libs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Components
import { Toolbar } from '@/components/shell/Toolbar/Toolbar';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

const openMenu = vi.fn();
const openBookmarksMenu = vi.fn();
const navigate = vi.fn();

vi.mock('@/lib/bridge/bridge', () => ({
  send: (action: (api: unknown) => unknown) =>
    action({
      profiles: { openMenu },
      bookmarks: { openMenu: openBookmarksMenu },
      tabs: { navigate },
      omnibox: { showSuggestions: vi.fn() },
    }),
  ask: async () => null,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PERSONAL = { id: 'default', name: 'Personal', colour: 'ocean', pictureVersion: null } as const;
const WORK = { id: 'aaaaaaaaaaaa', name: 'Work', colour: 'moss', pictureVersion: null } as const;

describe('which profile a window is', () => {
  // Always there, so the profile menu is one click away before a second profile exists.
  it('is shown with a single profile, and opens the profile menu', () => {
    useBrowserStore.setState({ profile: PERSONAL, profiles: [PERSONAL] });
    render(<Toolbar tab={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profile: Personal' }));
    expect(openMenu).toHaveBeenCalledTimes(1);
  });

  it('shows initials when there is no picture', () => {
    useBrowserStore.setState({ profile: WORK, profiles: [PERSONAL, WORK] });
    render(<Toolbar tab={null} />);
    expect(screen.getByRole('button', { name: 'Profile: Work' }).textContent).toBe('W');
  });
});

describe('the buttons someone chose', () => {
  it('shows only the chosen ones', () => {
    useBrowserStore.setState((state) => ({ settings: { ...state.settings, toolbarItems: ['home', 'downloads'] } }));
    render(<Toolbar tab={null} />);
    expect(screen.getByRole('button', { name: 'Start page' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bookmarks' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Profile:/ })).toBeNull();
  });

  it('opens the bookmarks menu under its button', () => {
    useBrowserStore.setState((state) => ({ settings: { ...state.settings, toolbarItems: ['bookmarks'] } }));
    render(<Toolbar tab={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bookmarks' }));
    expect(openBookmarksMenu).toHaveBeenCalledTimes(1);
  });
});

describe('a header laid out on one line', () => {
  // The tabs share the toolbar's row, and that row is the window's title bar.
  it('holds the tabs it is given, and can be dragged as the title bar', () => {
    const { container } = render(<Toolbar tab={null} tabStrip={<div role="tablist" aria-label="Open tabs" />} />);
    expect(screen.getByRole('tablist', { name: 'Open tabs' })).toBeTruthy();
    expect(container.firstElementChild?.classList.contains('drag-region')).toBe(true);
  });

  it('is not the title bar under a tab strip of its own', () => {
    const { container } = render(<Toolbar tab={null} />);
    expect(container.firstElementChild?.classList.contains('drag-region')).toBe(false);
  });
});
