import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/defaults';
import { AppearancePane } from '@/components/views/settings/appearance/AppearancePane';

let settings = { ...DEFAULT_SETTINGS_SHAPE };
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: unknown }) => unknown) => select({ settings }),
}));

const updateSettings = vi.fn();
vi.mock('@/components/views/settings/shared/options', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/views/settings/shared/options')>();
  return { ...actual, updateSettings: (patch: unknown) => updateSettings(patch) };
});

vi.mock('@/lib/bridge', async () => (await import('../bridge-mock')).fallbackBridge);

beforeEach(() => {
  settings = { ...DEFAULT_SETTINGS_SHAPE };
  updateSettings.mockClear();
});
afterEach(cleanup);

// The staged "Keep these" step is gone: every choice applies as it is made, and the preview shows the result.
describe('a choice applies as it is made', () => {
  it('switches light and dark', () => {
    render(<AppearancePane />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(updateSettings).toHaveBeenCalledWith({ appearance: 'dark' });
  });

  it('changes the density', () => {
    render(<AppearancePane />);
    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));
    expect(updateSettings).toHaveBeenCalledWith({ density: 'compact' });
  });

  // A new colour is a fresh start, not the old turn applied to different colours.
  it('starts a chosen colour unturned', () => {
    settings = { ...DEFAULT_SETTINGS_SHAPE, ambientHue: 120 };
    render(<AppearancePane />);
    fireEvent.click(screen.getByRole('radio', { name: 'Moss' }));
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'moss', ambientHue: 0 });
  });
});

describe('the start page shade', () => {
  it('shows the colour itself before anything is turned', () => {
    render(<AppearancePane />);
    expect(screen.getByLabelText('Start page colour as hex')).toHaveProperty('value', '#123043');
  });

  it('turns the colour when one is typed', () => {
    render(<AppearancePane />);
    fireEvent.change(screen.getByLabelText('Start page colour as hex'), { target: { value: '#43122f' } });
    const [patch] = updateSettings.mock.calls.at(-1) ?? [];
    expect((patch as { ambientHue: number }).ambientHue).toBeGreaterThan(0);
  });

  it('ignores what is not a colour rather than jumping somewhere', () => {
    render(<AppearancePane />);
    fireEvent.change(screen.getByLabelText('Start page colour as hex'), { target: { value: 'nonsense' } });
    expect(updateSettings).not.toHaveBeenCalled();
  });
});

describe('the start page widgets', () => {
  it('names each reorder button for the widget it moves, and disables the moves that go nowhere', () => {
    render(<AppearancePane />);
    const first = settings.startPageWidgets[0];
    const label = { clock: 'Clock', search: 'Search', topSites: 'Most visited', bookmarks: 'Bookmarks' }[first!];
    expect(screen.getByRole('button', { name: `Move ${label} up` })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: `Move ${label} down` })).toHaveProperty('disabled', false);
  });
});
