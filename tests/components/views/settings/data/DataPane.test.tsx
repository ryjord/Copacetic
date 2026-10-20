import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';

vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { settings: unknown; namedSessions: [] }) => unknown) =>
    select({ settings: DEFAULT_SETTINGS_SHAPE, namedSessions: [] }),
}));

const clearKept = vi.fn();
const importFromBrowser = vi.fn(async () => 'Imported from Chrome.');
let preview: { bookmarks: number; historyPages: number } | null = { bookmarks: 12, historyPages: 340 };
vi.mock('@/lib/bridge/bridge', () => ({
  send: vi.fn(),
  ask: async (action: (api: unknown) => Promise<unknown>, fallback: unknown) => {
    const api = {
      data: {
        kept: async () => ({ zoom: 2, permissions: 0, blockingOff: 0, certificates: 1, downloads: 0 }),
        importSources: async () => [{ id: 'chrome-default', label: 'Chrome' }],
        previewFromBrowser: async () => preview,
        importFromBrowser,
        clearKept: async (kind: string) => clearKept(kind),
      },
      sessions: { list: async () => [] },
      translation: { installedBytes: async () => 0 },
    };
    try {
      return await action(api);
    } catch {
      return fallback;
    }
  },
  getBridge: () => null,
  isRunningInShell: () => false,
}));

const { DataPane } = await import('@/components/views/settings/data/DataPane');

beforeEach(() => {
  clearKept.mockClear();
  importFromBrowser.mockClear();
  preview = { bookmarks: 12, historyPages: 340 };
});
afterEach(cleanup);

describe('clearing what is kept', () => {
  // A zoom can be put back from the Undo notice, so it goes at once.
  it('clears what can be undone without asking', async () => {
    render(<DataPane />);
    const row = (await screen.findByText('Zoom set on 2 sites')).closest('[data-setting-row]') as HTMLElement;
    fireEvent.click(row.querySelector('button') as HTMLElement);
    await waitFor(() => expect(clearKept).toHaveBeenCalledWith('zoom'));
  });

  it('asks first about what cannot be put back', async () => {
    render(<DataPane />);
    const row = (await screen.findByText('Certificate remembered for 1 site')).closest(
      '[data-setting-row]',
    ) as HTMLElement;
    fireEvent.click(row.querySelector('button') as HTMLElement);
    expect(clearKept).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(clearKept).toHaveBeenCalledWith('certificates'));
  });
});

describe('importing from another browser', () => {
  it('shows what it found before bringing anything in', async () => {
    render(<DataPane />);
    fireEvent.click(await screen.findByRole('button', { name: 'Look…' }));
    expect(await screen.findByText('Found 12 bookmarks and 340 pages of history in Chrome.')).toBeTruthy();
    expect(importFromBrowser).not.toHaveBeenCalled();
    // The browser's own row comes first in the group, before the two file imports.
    fireEvent.click(screen.getAllByRole('button', { name: 'Import' })[0]!);
    await waitFor(() => expect(importFromBrowser).toHaveBeenCalledWith('chrome-default'));
    expect(await screen.findByText('Imported from Chrome.')).toBeTruthy();
  });

  it('offers nothing to import when nothing was found', async () => {
    preview = { bookmarks: 0, historyPages: 0 };
    render(<DataPane />);
    fireEvent.click(await screen.findByRole('button', { name: 'Look…' }));
    expect(await screen.findByText('Nothing to import was found in Chrome.')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: 'Import' })).toHaveLength(2);
  });
});
