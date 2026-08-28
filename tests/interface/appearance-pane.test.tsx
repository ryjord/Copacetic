import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS_SHAPE } from '../../src/lib/defaults';
import { AppearancePane } from '../../src/components/settings/appearance/AppearancePane';

let settings = { ...DEFAULT_SETTINGS_SHAPE };
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: unknown }) => unknown) => select({ settings }),
}));

const updateSettings = vi.fn();
vi.mock('@/components/settings/shared/options', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/components/settings/shared/options')>();
  return { ...actual, updateSettings: (patch: unknown) => updateSettings(patch) };
});

vi.mock('@/lib/bridge', () => ({
  send: vi.fn(),
  ask: async (_action: unknown, fallback: unknown) => fallback,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

beforeEach(() => {
  settings = { ...DEFAULT_SETTINGS_SHAPE };
  updateSettings.mockClear();
});
afterEach(cleanup);

/**
 * The whole point of the rework: every appearance setting used to be confirmed
 * before it could be seen. Nothing may reach the saved settings until someone
 * says so.
 */
describe('choosing before committing', () => {
  it('changes nothing when a choice is made', () => {
    render(<AppearancePane />);
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));

    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('saves the whole draft when it is kept', () => {
    render(<AppearancePane />);
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));
    fireEvent.click(screen.getByRole('button', { name: /keep these/i }));

    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({ density: 'compact' }));
  });

  it('puts it back exactly as it was when discarded', () => {
    render(<AppearancePane />);
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));

    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByText(/this is what is saved/i)).toBeTruthy();
  });

  it('says whether there is anything unsaved', () => {
    render(<AppearancePane />);
    expect(screen.getByText(/this is what is saved/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));
    expect(screen.getByText(/not saved yet/i)).toBeTruthy();
  });

  // Keeping nothing would be a button that appears to do something.
  it('offers neither action until something has changed', () => {
    render(<AppearancePane />);
    expect(screen.getByRole('button', { name: /keep these/i })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /discard/i })).toHaveProperty('disabled', true);
  });
});

describe('the atmosphere colour', () => {
  it('shows the theme itself before anything is turned', () => {
    render(<AppearancePane />);
    expect(screen.getByLabelText('Atmosphere colour')).toHaveProperty('value', '#123043');
  });

  it('turns the atmosphere when a colour is typed', () => {
    render(<AppearancePane />);
    fireEvent.change(screen.getByLabelText('Atmosphere colour'), { target: { value: '#43122f' } });

    expect(Number((screen.getByLabelText('Atmosphere hue') as HTMLInputElement).value)).toBeGreaterThan(0);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('ignores what is not a colour rather than jumping somewhere', () => {
    render(<AppearancePane />);
    const before = (screen.getByLabelText('Atmosphere hue') as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText('Atmosphere colour'), { target: { value: 'nonsense' } });

    expect((screen.getByLabelText('Atmosphere hue') as HTMLInputElement).value).toBe(before);
  });

  // A new atmosphere is a fresh start, not the old turn applied to new colours.
  it('starts a chosen theme unturned', () => {
    render(<AppearancePane />);
    fireEvent.change(screen.getByLabelText('Atmosphere hue'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Moss' }));

    expect((screen.getByLabelText('Atmosphere hue') as HTMLInputElement).value).toBe('0');
  });
});
