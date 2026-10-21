// Libs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Components
import { ExtensionButtons } from '@/components/shell/Toolbar/ExtensionButtons';

const openMenu = vi.fn();
let listed: unknown[] = [];

vi.mock('@/lib/bridge/bridge', () => ({
  ask: async (action: (api: unknown) => Promise<unknown>) => action({ extensions: { list: async () => listed } }),
  send: (action: (api: unknown) => unknown) => action({ extensions: { openMenu, press: vi.fn() } }),
  getBridge: () => null,
}));

afterEach(() => {
  cleanup();
  listed = [];
  vi.clearAllMocks();
});

const action = {
  title: 'Block',
  iconDataUrl: null,
  badgeText: '3',
  badgeColour: '#000',
  hasPopup: true,
  isEnabled: true,
};
const extension = (name: string, over: Record<string, unknown> = {}) => ({
  id: name,
  name,
  isEnabled: true,
  isPinned: true,
  iconDataUrl: null,
  action: { ...action, title: name },
  ...over,
});

describe('the extensions on the toolbar', () => {
  it('shows the pinned ones, with their count, and keeps the rest in the extensions menu', async () => {
    listed = [extension('Blocker'), extension('Loose', { isPinned: false })];
    render(<ExtensionButtons />);
    expect(await screen.findByRole('button', { name: 'Blocker (3)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Loose/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Extensions' }));
    expect(openMenu).toHaveBeenCalledTimes(1);
  });

  it('shows nothing, not even the menu, until an extension is on', async () => {
    listed = [extension('Off', { isEnabled: false })];
    render(<ExtensionButtons />);
    await Promise.resolve();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
