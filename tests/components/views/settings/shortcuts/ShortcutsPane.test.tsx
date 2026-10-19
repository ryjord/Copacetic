import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const updateSettings = vi.fn();
const recording: boolean[] = [];
let overrides: Record<string, string> = {};

vi.mock('@/components/views/settings/shared/options', () => ({
  updateSettings: (patch: unknown) => updateSettings(patch),
}));
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (api: unknown) => void) =>
    call({ shortcuts: { setRecording: (isRecording: boolean) => recording.push(isRecording) } }),
}));
vi.mock('@/lib/platform', () => ({ isMacPlatform: () => false }));
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: { shortcutOverrides: Record<string, string> } }) => unknown) =>
    select({ settings: { shortcutOverrides: overrides } }),
}));

const { ShortcutsPane } = await import('@/components/views/settings/shortcuts/ShortcutsPane');

beforeEach(() => {
  overrides = {};
  updateSettings.mockClear();
  recording.length = 0;
});
afterEach(cleanup);

const changePrint = () => {
  fireEvent.change(screen.getByLabelText('Search shortcuts'), { target: { value: 'print' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change' }));
  return screen.getByRole('button', { name: 'Recording…' });
};

describe('the shortcuts pane', () => {
  it('finds a shortcut by what it does', () => {
    render(<ShortcutsPane />);
    fireEvent.change(screen.getByLabelText('Search shortcuts'), { target: { value: 'zoom' } });
    expect(screen.getByText('Zoom in')).toBeTruthy();
    expect(screen.queryByText('New tab')).toBeNull();
  });

  it('moves a shortcut to the keys pressed, and lets the menu go while recording', () => {
    render(<ShortcutsPane />);
    fireEvent.keyDown(changePrint(), { code: 'KeyP', ctrlKey: true, altKey: true });
    expect(updateSettings).toHaveBeenCalledWith({ shortcutOverrides: { print: 'CmdOrCtrl+Alt+P' } });
    expect(recording).toContain(true);
    expect(recording.at(-1)).toBe(false);
  });

  it('refuses keys another shortcut already has, and says which', () => {
    render(<ShortcutsPane />);
    fireEvent.keyDown(changePrint(), { code: 'KeyT', ctrlKey: true });
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Ctrl + T is already used for New tab.')).toBeTruthy();
  });

  it('keeps the old keys on Escape', () => {
    render(<ShortcutsPane />);
    fireEvent.keyDown(changePrint(), { code: 'Escape', key: 'Escape' });
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Recording…' })).toBeNull();
  });

  it('puts a moved shortcut back', () => {
    overrides = { print: 'CmdOrCtrl+Alt+P' };
    render(<ShortcutsPane />);
    fireEvent.change(screen.getByLabelText('Search shortcuts'), { target: { value: 'print' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(updateSettings).toHaveBeenCalledWith({ shortcutOverrides: {} });
  });

  it('cannot move keys that are not menu items', () => {
    render(<ShortcutsPane />);
    fireEvent.change(screen.getByLabelText('Search shortcuts'), { target: { value: 'topmost panel' } });
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });
});
