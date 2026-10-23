// Libs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Components
import { HiddenFromBar } from '@/components/views/settings/appearance/HiddenFromBar';

const hidden = ['b1', 'f1', 'gone'];
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: { hiddenFromBookmarksBar: string[] } }) => unknown) =>
    select({ settings: { hiddenFromBookmarksBar: hidden } }),
}));
vi.mock('@/lib/bridge/bridge', () => ({
  ask: (action: (api: unknown) => Promise<unknown>) =>
    action({
      bookmarks: { list: async () => [{ id: 'b1', title: 'Rust book', url: 'https://doc.rust-lang.org/book/' }] },
      bookmarkFolders: { list: async () => [{ id: 'f1', name: 'Work' }] },
    }),
}));
const updateSettings = vi.fn();
vi.mock('@/components/views/settings/shared/options', () => ({
  updateSettings: (patch: unknown) => updateSettings(patch),
}));

afterEach(cleanup);

describe('what is left off the bookmarks bar', () => {
  it('names each by its title, and puts one back on the bar', async () => {
    render(<HiddenFromBar />);
    expect(await screen.findByText('Rust book is left off the bar')).toBeTruthy();
    expect(screen.getByText('Work is left off the bar')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Show on the bar' })[0]!);
    expect(updateSettings).toHaveBeenCalledWith({ hiddenFromBookmarksBar: ['f1', 'gone'] });
  });

  // One deleted after it was hidden has nothing to show again, so it is not listed.
  it('leaves out one that no longer exists', async () => {
    render(<HiddenFromBar />);
    await screen.findByText('Rust book is left off the bar');
    expect(screen.getAllByRole('button', { name: 'Show on the bar' })).toHaveLength(2);
  });
});
