import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/defaults';
import type { Settings } from '@shared/types';

const updateSettings = vi.fn();
vi.mock('@/components/views/settings/shared/options', () => ({
  updateSettings: (patch: unknown) => updateSettings(patch),
}));
const sent = vi.fn();
vi.mock('@/lib/bridge', () => ({
  send: (call: (api: unknown) => void) =>
    call({ permissions: { forget: (origin: string, kind: string) => sent(origin, kind) } }),
}));

let settings: Settings = DEFAULT_SETTINGS_SHAPE;
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: Settings }) => unknown) => select({ settings }),
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

  it('resets one site, leaving the others', () => {
    render(<SitesPane />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset' })[0]!);
    expect(updateSettings).toHaveBeenCalledWith({
      permissionDecisions: {},
      zoomLevels: {},
      blockerAllowlist: ['shop.example.net'],
    });
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
    expect(screen.getByText('Refused without asking, unless you allowed the site.')).toBeTruthy();
  });
});
