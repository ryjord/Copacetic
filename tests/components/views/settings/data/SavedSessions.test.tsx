import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { NamedSessionSummary } from '@shared/data/named-sessions';

const calls: string[] = [];
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (api: unknown) => void) =>
    call({
      sessions: {
        open: (id: string) => calls.push(`open ${id}`),
        rename: (id: string, name: string) => calls.push(`rename ${id} ${name}`),
        remove: (id: string) => calls.push(`remove ${id}`),
      },
    }),
}));

let sessions: NamedSessionSummary[] = [];
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { namedSessions: NamedSessionSummary[] }) => unknown) =>
    select({ namedSessions: sessions }),
}));

const { SavedSessions } = await import('@/components/views/settings/data/SavedSessions');

afterEach(() => {
  cleanup();
  calls.length = 0;
});

describe('saved sessions in Settings', () => {
  it('renames a session where it is listed', () => {
    sessions = [{ id: 's1', name: 'GitHub and 2 more', savedAt: Date.UTC(2026, 9, 1), tabCount: 3 }];
    render(<SavedSessions />);
    expect(screen.getByText(/3 tabs, saved/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: 'Thesis research' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(calls).toContain('rename s1 Thesis research');
  });

  it('opens and deletes from the same row', () => {
    sessions = [{ id: 's1', name: 'Work', savedAt: Date.UTC(2026, 9, 1), tabCount: 1 }];
    render(<SavedSessions />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(calls).toEqual(['open s1', 'remove s1']);
  });
});
