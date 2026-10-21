import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';
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

vi.mock('@/lib/bridge/bridge', async () => (await import('../bridge-mock')).fallbackBridge);

beforeEach(() => {
  settings = { ...DEFAULT_SETTINGS_SHAPE };
  updateSettings.mockClear();
});
afterEach(cleanup);

describe('the browser', () => {
  it.each([
    { name: 'light and dark', label: 'Dark', patch: { appearance: 'dark' } },
    { name: 'the density', label: 'Compact', patch: { density: 'compact' } },
    { name: 'the accent', label: 'Teal', patch: { accentColour: 'teal' } },
    { name: 'the text size', label: 'Larger', patch: { interfaceTextSize: 'larger' } },
  ])('changes $name', ({ label, patch }) => {
    render(<AppearancePane />);
    fireEvent.click(screen.getByRole('radio', { name: label }));
    expect(updateSettings).toHaveBeenCalledWith(patch);
  });

  it('adds and removes toolbar buttons', () => {
    render(<AppearancePane />);
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(updateSettings).toHaveBeenCalledWith({ toolbarItems: ['bookmarks', 'profile', 'downloads', 'home'] });
    fireEvent.click(screen.getByRole('button', { name: 'Downloads' }));
    expect(updateSettings).toHaveBeenLastCalledWith({ toolbarItems: ['bookmarks', 'profile'] });
  });
});

describe('the start page background', () => {
  // A new colour is a fresh start, not the old turn applied to different colours.
  it('starts a chosen colour unturned', () => {
    settings = { ...DEFAULT_SETTINGS_SHAPE, ambientHue: 120 };
    render(<AppearancePane />);
    fireEvent.click(screen.getByRole('radio', { name: 'Moss' }));
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'moss', ambientHue: 0 });
  });

  it.each([
    { name: 'turns the colour when one is typed', typed: '#43122f', turns: true },
    { name: 'ignores what is not a colour rather than jumping somewhere', typed: 'nonsense', turns: false },
  ])('$name', ({ typed, turns }) => {
    render(<AppearancePane />);
    fireEvent.change(screen.getByLabelText('Start page colour as hex'), { target: { value: typed } });
    if (!turns) {
      expect(updateSettings).not.toHaveBeenCalled();
      return;
    }
    const [patch] = updateSettings.mock.calls.at(-1) ?? [];
    expect((patch as { ambientHue: number }).ambientHue).toBeGreaterThan(0);
  });

  // A drag is one change: saving every step wrote the settings file a hundred times a second.
  it('saves the shade when the slider is let go, not while it moves', () => {
    render(<AppearancePane />);
    const slider = screen.getByRole('slider', { name: 'Start page shade' });
    fireEvent.change(slider, { target: { value: '90' } });
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Start page colour as hex')).not.toHaveProperty('value', '#123043');
    fireEvent.pointerUp(slider);
    expect(updateSettings).toHaveBeenCalledWith({ ambientHue: 90 });
  });
});

describe('the start page widgets', () => {
  it('names each reorder handle for the widget it moves, and moves it with the arrow keys', () => {
    render(<AppearancePane />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Clock' }), { key: 'ArrowDown' });
    expect(updateSettings).toHaveBeenCalledWith({ startPageWidgets: ['search', 'clock', 'topSites'] });
  });

  it('does not move the first widget further up', () => {
    render(<AppearancePane />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Clock' }), { key: 'ArrowUp' });
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('shows and hides a widget with its switch', () => {
    render(<AppearancePane />);
    fireEvent.click(screen.getByRole('switch', { name: 'Show Bookmarks' }));
    expect(updateSettings).toHaveBeenCalledWith({ startPageWidgets: ['clock', 'search', 'topSites', 'bookmarks'] });
    fireEvent.click(screen.getByRole('switch', { name: 'Show Search' }));
    expect(updateSettings).toHaveBeenLastCalledWith({ startPageWidgets: ['clock', 'topSites'] });
  });
});
