// Libs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Components
import { ProfilesPane } from '@/components/views/settings/profiles/ProfilesPane';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

const create = vi.fn(async (name: string, colour: string) => ({ id: 'abcdef012345', name, colour }));
const openWindow = vi.fn(async () => undefined);
const remove = vi.fn(async () => true);
const update = vi.fn(async () => undefined);

vi.mock('@/lib/bridge/bridge', () => ({
  send: (action: (api: unknown) => unknown) => action({ profiles: { create, openWindow, remove, update } }),
  ask: async () => null,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

const PERSONAL = { id: 'default', name: 'Personal', colour: 'ocean' } as const;
const WORK = { id: 'aaaaaaaaaaaa', name: 'Work', colour: 'moss' } as const;
const FAMILY = { id: 'bbbbbbbbbbbb', name: 'Family', colour: 'clay' } as const;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const showIn = (current: typeof PERSONAL | typeof WORK) => {
  useBrowserStore.setState({ profile: current, profiles: [PERSONAL, WORK, FAMILY] });
  render(<ProfilesPane />);
};

describe('the profiles pane', () => {
  it('lists every profile and says which this window is', () => {
    showIn(WORK);
    expect(screen.getByText('Personal')).toBeTruthy();
    expect(screen.getByText('Family')).toBeTruthy();
    expect(screen.getByText('This window')).toBeTruthy();
  });

  // The first profile holds everything from before profiles; removing this window's would close it mid-answer.
  it('offers to remove only profiles that are neither the first nor this window', () => {
    showIn(WORK);
    expect(screen.getAllByRole('button', { name: 'Remove…' })).toHaveLength(1);
  });

  it('removes only after it is confirmed', async () => {
    showIn(PERSONAL);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove…' })[0]!);
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(remove).toHaveBeenCalledWith('aaaaaaaaaaaa');
  });

  it('adds a profile and opens a window of it', async () => {
    showIn(PERSONAL);
    fireEvent.change(screen.getByLabelText('New profile name'), { target: { value: 'School' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(openWindow).toHaveBeenCalledWith('abcdef012345'));
    expect(create).toHaveBeenCalledWith('School', 'moss');
  });

  it('will not add a profile with no name', () => {
    showIn(PERSONAL);
    expect(screen.getByRole('button', { name: 'Add' }).hasAttribute('disabled')).toBe(true);
  });
});
