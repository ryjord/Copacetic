// Libs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Components
import { Toolbar } from '@/components/shell/Toolbar/Toolbar';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

const openMenu = vi.fn();

vi.mock('@/lib/bridge/bridge', () => ({
  send: (action: (api: unknown) => unknown) =>
    action({ profiles: { openMenu }, omnibox: { showSuggestions: vi.fn() } }),
  ask: async () => null,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PERSONAL = { id: 'default', name: 'Personal', colour: 'ocean' } as const;
const WORK = { id: 'aaaaaaaaaaaa', name: 'Work', colour: 'moss' } as const;

describe('which profile a window is', () => {
  // With one profile there is nothing to tell apart, and a chip would only take room.
  it('is not shown while there is only one profile', () => {
    useBrowserStore.setState({ profile: PERSONAL, profiles: [PERSONAL] });
    render(<Toolbar tab={null} />);
    expect(screen.queryByRole('button', { name: /^Profile:/ })).toBeNull();
  });

  it('is shown once there are two, and opens the profile menu', () => {
    useBrowserStore.setState({ profile: WORK, profiles: [PERSONAL, WORK] });
    render(<Toolbar tab={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profile: Work' }));
    expect(openMenu).toHaveBeenCalledTimes(1);
  });
});
