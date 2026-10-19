import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Bookmark, BookmarkEditResult } from '../../../../electron/shared/types';
import { BookmarkEditor } from '@/components/views/bookmarks/BookmarkEditor';

let answer: BookmarkEditResult = 'saved';
const update = vi.fn(async () => answer);

vi.mock('@/lib/bridge/bridge', () => ({
  ask: (action: (api: unknown) => Promise<unknown>) => action({ bookmarks: { update } }),
}));

afterEach(() => {
  cleanup();
  update.mockClear();
  answer = 'saved';
});

const BOOKMARK: Bookmark = { id: 'b1', url: 'https://old.example/', title: 'Old', createdAt: 0, folderId: null };

describe('editing a bookmark', () => {
  it('sends the new title and address, and says it was saved', async () => {
    const onDone = vi.fn();
    render(<BookmarkEditor bookmark={BOOKMARK} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'new.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
    expect(update).toHaveBeenCalledWith('b1', { title: 'New', url: 'new.example' });
  });

  it('stays open and says why when the address is taken', async () => {
    answer = 'already-saved';
    const onDone = vi.fn();
    render(<BookmarkEditor bookmark={BOOKMARK} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Another bookmark already has that address.');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('closes without saving on Escape', () => {
    const onDone = vi.fn();
    render(<BookmarkEditor bookmark={BOOKMARK} onDone={onDone} />);
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' });
    expect(onDone).toHaveBeenCalledWith(false);
    expect(update).not.toHaveBeenCalled();
  });
});
