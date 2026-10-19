import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SettingsSurface } from '@/components/views/settings/SettingsSurface';
import { SETTINGS_PANES, searchSettings } from '@/components/views/settings/shared/panes';

vi.mock('@/lib/bridge', async () => (await import('./bridge-mock')).fallbackBridge);

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
    expect(within(nav).getByRole('list')).toBeTruthy();
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
  it.each(PANES)('%s shows a titled page', (label) => {
    openPane(label);
    expect(screen.getByRole('heading', { level: 2, name: label })).toBeTruthy();
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
