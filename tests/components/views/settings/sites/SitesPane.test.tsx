import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';
import type { Settings } from '@shared/types';

const updateSettings = vi.fn();
vi.mock('@/components/views/settings/shared/options', () => ({
  updateSettings: (patch: unknown) => updateSettings(patch),
}));
const sent = vi.fn();
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (api: unknown) => void) =>
    call({
      permissions: { forget: (origin: string, kind: string) => sent(origin, kind) },
      settings: { resetSite: (site: string) => sent(site) },
    }),
}));

let settings: Settings = DEFAULT_SETTINGS_SHAPE;
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: Settings; groups: [] }) => unknown) =>
    select({ settings, groups: [] }),
}));

const { SitesPane } = await import('@/components/views/settings/sites/SitesPane');

beforeEach(() => {
  settings = {
    ...DEFAULT_SETTINGS_SHAPE,
    permissionDecisions: { 'https://maps.example.com|geolocation': 'allow' },
    zoomLevels: { 'https://docs.example.com': 1.5 },
    blockerAllowlist: ['shop.example.net'],
  };
  updateSettings.mockClear();
  sent.mockClear();
});
afterEach(cleanup);

describe('the site settings pane', () => {
  it('lists each site with what is kept about it', () => {
    render(<SitesPane />);
    expect(screen.getByText('example.com')).toBeTruthy();
    expect(screen.getByText('Location allowed · Zoom 150%')).toBeTruthy();
    expect(screen.getByText('shop.example.net')).toBeTruthy();
  });

  // Forgotten in the main process, which offers to put it back; one menu away rather than a button in the row.
  it('forgets one site from its menu', async () => {
    render(<SitesPane />);
    const more = screen.getByRole('button', { name: 'More for example.com' });
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Forget this site' }));
    expect(sent).toHaveBeenCalledWith('example.com');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('asks a site again about one permission, from its own row', () => {
    render(<SitesPane />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }));
    expect(sent).toHaveBeenCalledWith('https://maps.example.com', 'geolocation');
  });

  it('finds a site by part of its name', () => {
    render(<SitesPane />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search sites' }), { target: { value: 'shop' } });
    expect(screen.queryByText('example.com')).toBeNull();
    expect(screen.getByText('shop.example.net')).toBeTruthy();
  });

  it('says plainly when nothing is kept', () => {
    settings = DEFAULT_SETTINGS_SHAPE;
    render(<SitesPane />);
    expect(screen.getByText('Nothing is kept about any site yet')).toBeTruthy();
  });

  it('offers a default for every kind a site can ask about, even with no sites kept', () => {
    settings = { ...DEFAULT_SETTINGS_SHAPE };
    render(<SitesPane />);
    expect(screen.getByText('When a site asks')).toBeTruthy();
    ['Notifications', 'Location', 'Camera and microphone', 'Clipboard', 'MIDI devices', 'Opening other apps'].forEach(
      (name) => expect(screen.getByLabelText(`${name} by default`)).toBeTruthy(),
    );
  });

  it('says what a blocking default means', () => {
    settings = { ...DEFAULT_SETTINGS_SHAPE, permissionDefaults: { notifications: 'block' } };
    render(<SitesPane />);
    expect(screen.getByText('Refused without asking.')).toBeTruthy();
  });

  // One place to review every site's answer for a kind, beside the switch that sets the rest.
  it('counts the sites that answered for themselves, and lists only them on request', () => {
    settings = {
      ...DEFAULT_SETTINGS_SHAPE,
      permissionDefaults: { notifications: 'block' },
      permissionDecisions: {
        'https://mail.example.com|notifications': 'allow',
        'https://news.example.org|notifications': 'deny',
        'https://maps.example.net|geolocation': 'allow',
      },
    };
    render(<SitesPane />);
    expect(screen.getByText('Refused without asking, allowed on 1 site, blocked on 1 site.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '2 sites' }));
    expect(screen.getByText('example.com')).toBeTruthy();
    expect(screen.getByText('example.org')).toBeTruthy();
    expect(screen.queryByText('example.net')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show every site' }));
    expect(screen.getByText('example.net')).toBeTruthy();
  });

  it('decides for a site before it has asked', () => {
    settings = { ...DEFAULT_SETTINGS_SHAPE };
    render(<SitesPane />);
    fireEvent.change(screen.getByLabelText('Site address'), { target: { value: 'news.example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(updateSettings).toHaveBeenCalledWith({
      permissionDecisions: { 'https://news.example.org|notifications': 'deny' },
    });
  });

  it('says so when the address is not a site', () => {
    settings = { ...DEFAULT_SETTINGS_SHAPE };
    render(<SitesPane />);
    fireEvent.change(screen.getByLabelText('Site address'), { target: { value: 'nonsense' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByText(/not a web address/)).toBeTruthy();
  });
});

describe('narrowing the list', () => {
  it('shows only the sites with what was asked for', () => {
    render(<SitesPane />);
    fireEvent.click(screen.getByRole('radio', { name: 'Trackers allowed' }));
    expect(screen.queryByText('example.com')).toBeNull();
    expect(screen.getByText('shop.example.net')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Zoom' }));
    expect(screen.getByText('example.com')).toBeTruthy();
    expect(screen.queryByText('shop.example.net')).toBeNull();
  });
});
