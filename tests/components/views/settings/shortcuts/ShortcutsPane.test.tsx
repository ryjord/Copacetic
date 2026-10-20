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

  // Another changeable shortcut on the key is a trade, not a dead end.
  it('offers to swap with the shortcut that has the keys', () => {
    render(<ShortcutsPane />);
    fireEvent.keyDown(changePrint(), { code: 'KeyT', ctrlKey: true });
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Ctrl + T is used for New tab, which Swap moves to Ctrl + P.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
    expect(updateSettings).toHaveBeenCalledWith({
      shortcutOverrides: { print: 'CmdOrCtrl+T', 'new-tab': 'CmdOrCtrl+P' },
    });
  });

  it('refuses keys that cannot move, and says which', () => {
    render(<ShortcutsPane />);
    fireEvent.keyDown(changePrint(), { code: 'Digit1', ctrlKey: true });
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Ctrl + 1 is already used for Select tab by position.')).toBeTruthy();
  });

  it('removes a shortcut, leaving the command without one', () => {
    render(<ShortcutsPane />);
    fireEvent.change(screen.getByLabelText('Search shortcuts'), { target: { value: 'print' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(updateSettings).toHaveBeenCalledWith({ shortcutOverrides: { print: '' } });
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
    expect(screen.getByText('Built into how tabs and the keyboard work, so these cannot move.')).toBeTruthy();
  });
});
