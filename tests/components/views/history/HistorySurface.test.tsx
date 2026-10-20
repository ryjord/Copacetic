import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { HistoryEntry } from '@shared/types';

const entry = (id: string, url: string, title: string, visitCount = 1): HistoryEntry => ({
  id,
  url,
  title,
  lastVisitedAt: Date.now(),
  visitCount,
  blockedCount: 0,
});
const ENTRIES = [
  entry('a', 'https://mail.example.com/inbox', 'Inbox', 12),
  entry('b', 'https://news.example.org/brief', 'The Morning Brief'),
];

const listed: unknown[] = [];
const removedMany: string[][] = [];
const created: string[] = [];
// A search held here answers only when the test says so.
const held = new Map<string, () => void>();
const api = {
  history: {
    list: async (...args: unknown[]) => {
      listed.push(args);
      const [query] = args;
      const matches = ENTRIES.filter((item) => typeof query !== 'string' || item.title.toLowerCase().includes(query));
      if (typeof query === 'string' && query.startsWith('held')) {
        await new Promise<void>((resolve) => held.set(query, resolve));
        return { entries: ENTRIES, total: ENTRIES.length };
      }
      return { entries: matches, total: matches.length };
    },
    totalBlocked: async () => 0,
    removeMany: (ids: string[]) => removedMany.push(ids),
    openContextMenu: vi.fn(),
  },
  tabs: { create: async (url: string) => created.push(url) },
  favicons: { forUrls: async () => ({}) },
};
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (bridge: typeof api) => unknown) => call(api),
  ask: async (call: (bridge: typeof api) => Promise<unknown>) => call(api),
  getBridge: () => null,
  isRunningInShell: () => false,
}));

const setSurface = vi.fn();
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { activeTabId: string; setSurface: () => void }) => unknown) =>
    select({ activeTabId: 'tab', setSurface }),
}));

const { HistorySurface } = await import('@/components/views/history/HistorySurface');

beforeEach(() => {
  listed.length = 0;
  removedMany.length = 0;
  created.length = 0;
});
afterEach(cleanup);

describe('the history list', () => {
  it('drops a slow search that answers after a newer one', async () => {
    render(<HistorySurface />);
    await screen.findByText('Inbox');
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'held' } });
    await waitFor(() => expect(held.has('held')).toBe(true));
    fireEvent.change(search, { target: { value: 'brief' } });
    await waitFor(() => expect(screen.queryByText('Inbox')).toBeNull());
    held.get('held')?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Inbox')).toBeNull();
    expect(screen.getByText('The Morning Brief')).toBeTruthy();
  });

  it('asks for only the days chosen, and in the order chosen', async () => {
    render(<HistorySurface />);
    await screen.findByText('Inbox');
    fireEvent.click(screen.getByRole('radio', { name: 'Yesterday' }));
    await waitFor(() => expect(listed.at(-1)).toEqual(['', 0, { range: 'yesterday', order: 'recent' }]));
  });

  it('deletes everything selected at once', async () => {
    render(<HistorySurface />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Inbox' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select The Morning Brief' }));
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(removedMany).toEqual([['a', 'b']]);
    expect(screen.queryByText('Inbox')).toBeNull();
  });

  it('opens what is selected in tabs, in the order listed', async () => {
    render(<HistorySurface />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select The Morning Brief' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Inbox' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open in tabs' }));
    await waitFor(() =>
      expect(created).toEqual(['https://mail.example.com/inbox', 'https://news.example.org/brief']),
    );
  });

  it('groups by site when asked', async () => {
    render(<HistorySurface />);
    await screen.findByText('Inbox');
    fireEvent.click(screen.getByRole('button', { name: 'Group by site' }));
    expect(screen.getByRole('heading', { name: 'mail.example.com' })).toBeTruthy();
  });
});
