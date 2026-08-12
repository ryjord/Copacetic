import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingsSurface } from '../src/components/surfaces/SettingsSurface';
import { SETTINGS_PANES } from '../src/components/surfaces/settings/panes';

vi.mock('@/lib/bridge', () => ({
  send: () => {},
  ask: async (_action: unknown, fallback: unknown) => fallback,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

afterEach(cleanup);

// Derived from the registry, so a pane added for a new feature is covered here
// the moment it exists rather than whenever someone remembers this file.
const PANES = SETTINGS_PANES.map((pane) => pane.label);

describe('settings is grouped rather than one long page', () => {
  it('offers every section in the rail', () => {
    render(<SettingsSurface />);
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    for (const label of PANES) {
      expect(nav.textContent).toContain(label);
    }
  });

  it('shows one pane at a time', () => {
    render(<SettingsSurface />);
    // Appearance is the landing pane, so Search's engine list is not rendered.
    expect(screen.queryByText('DuckDuckGo')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('DuckDuckGo')).toBeTruthy();
  });

  it('marks the current section for assistive technology', () => {
    render(<SettingsSurface />);
    const appearance = screen.getByRole('button', { name: 'Appearance' });
    expect(appearance.getAttribute('aria-current')).toBe('page');

    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    expect(screen.getByRole('button', { name: 'Privacy' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Appearance' }).getAttribute('aria-current')).toBeNull();
  });

  // Every section has to be reachable: a pane that renders nothing means a
  // setting that silently no longer exists.
  it.each(PANES)('%s shows something', (label) => {
    render(<SettingsSurface />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    const panes = document.querySelectorAll('h2');
    expect(panes.length).toBeGreaterThan(0);
  });

  it('answers the questions people actually ask, in About', () => {
    render(<SettingsSurface />);
    fireEvent.click(screen.getByRole('button', { name: 'About' }));

    expect(screen.getByText('Does Copacetic track me?')).toBeTruthy();
    expect(screen.getByText('Does it phone home?')).toBeTruthy();
    expect(screen.getByText('Where is my data?')).toBeTruthy();
    // The disclaimer must not be quietly dropped in a redesign.
    expect(document.body.textContent).toContain('It has not been security audited.');
    expect(document.body.textContent).toContain('The builds are not code-signed.');
  });
});
