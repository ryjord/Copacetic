import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SettingsSurface } from '@/components/views/settings/SettingsSurface';
import { NAV_GROUPS, PANE_TITLES, SETTINGS_PANES, searchSettings } from '@/components/views/settings/shared/panes';

vi.mock('@/lib/bridge/bridge', async () => (await import('./bridge-mock')).fallbackBridge);

afterEach(cleanup);

// Derived from the registry, so a pane added later is covered the moment it exists.
const PANES = SETTINGS_PANES.map((pane) => pane.label);

const openPane = (label: string) => {
  render(<SettingsSurface />);
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('button', { name: label }),
  );
};

describe('settings is grouped rather than one long page', () => {
  it('lists every section in the sidebar, as a list a screen reader can count', () => {
    render(<SettingsSurface />);
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    // One list under each heading, so the sections are counted a group at a time.
    expect(within(nav).getAllByRole('list')).toHaveLength(NAV_GROUPS.length);
    for (const label of PANES) {
      expect(within(nav).getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('marks exactly one section as current, and moves the mark', () => {
    openPane('Privacy and security');
    const current = screen.getAllByRole('button').filter((button) => button.getAttribute('aria-current') === 'page');
    expect(current.map((button) => button.textContent)).toEqual(['Privacy and security']);
  });

  // A pane that renders nothing means a setting that silently no longer exists.
  it.each(SETTINGS_PANES.map((pane) => [pane.label, PANE_TITLES[pane.id] ?? pane.label]))(
    '%s shows a titled page',
    (label, title) => {
      openPane(label);
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeTruthy();
    },
  );

  it('puts every pane under exactly one heading', () => {
    const grouped = NAV_GROUPS.flatMap((group) => group.paneIds);
    expect(grouped.toSorted()).toEqual(SETTINGS_PANES.map((pane) => pane.id).toSorted());
  });

  it.each(PANES)('%s names every control', (label) => {
    openPane(label);
    const unnamed = screen
      .getAllByRole('button')
      .filter((button) => (button.textContent ?? '').trim() === '' && !button.getAttribute('aria-label'));
    expect(unnamed).toEqual([]);
  });
});

describe('finding a setting', () => {
  it('finds it by the word people use, and names the page it is on', () => {
    expect(searchSettings('dns')).toContainEqual({
      paneId: 'privacy',
      paneLabel: 'Privacy and security',
      term: 'DNS',
    });
    expect(searchSettings('   ')).toEqual([]);
  });

  it('opens the page a result names', () => {
    render(<SettingsSurface />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), { target: { value: 'wallpaper' } });
    fireEvent.click(screen.getByRole('button', { name: /Wallpaper/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Appearance' })).toBeTruthy();
  });

  it('says so when nothing matches', () => {
    render(<SettingsSurface />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No setting matches/)).toBeTruthy();
  });
});

describe('the frame every pane shares', () => {
  it('finds the row a search term names, by every word in it', async () => {
    const { matchesTerm } = await import('@/components/views/settings/shared/panes');
    expect(matchesTerm('Reopen the tabs from last time', 'Reopen tabs')).toBe(true);
    expect(matchesTerm('Search engine', 'Reopen tabs')).toBe(false);
  });

  it('resets only settings that exist', async () => {
    const { PANE_SETTINGS } = await import('@/components/views/settings/shared/panes');
    const { DEFAULT_SETTINGS_SHAPE } = await import('@/lib/state/defaults');
    const owned = Object.values(PANE_SETTINGS).flat();
    expect(owned.every((key) => key in DEFAULT_SETTINGS_SHAPE)).toBe(true);
  });
});
