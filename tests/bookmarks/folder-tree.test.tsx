import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { BookmarkFolder } from '../../electron/shared/bookmark-folders';
import type { Bookmark } from '../../electron/shared/types';
import { DRAG_BOOKMARK, DRAG_FOLDER, FolderTree } from '../../src/views/BookmarksSurface/FolderTree';

const file = vi.fn();
const move = vi.fn();
const update = vi.fn();
const openContextMenu = vi.fn();
const create = vi.fn(async () => ({ id: 'new', name: 'Folder', colour: 'violet', parentId: null, collapsed: false }));

vi.mock('@/lib/bridge', () => ({
  send: (action: (api: unknown) => void) =>
    action({
      bookmarks: { file },
      bookmarkFolders: { move, update, openContextMenu, create },
    }),
  ask: async () => [],
  getBridge: () => ({
    bookmarkFolders: { create },
    on: { renameBookmarkFolder: () => () => undefined },
  }),
  isRunningInShell: () => false,
}));

const folder = (id: string, parentId: string | null, over: Partial<BookmarkFolder> = {}): BookmarkFolder => ({
  id,
  name: id,
  colour: 'violet',
  parentId,
  collapsed: false,
  ...over,
});

// work > pacs > dashboards, and reading alongside
const FOLDERS = [folder('work', null), folder('pacs', 'work'), folder('dashboards', 'pacs'), folder('reading', null)];

const MARKS: Bookmark[] = [
  { id: 'b1', url: 'https://a.example/', title: 'A', createdAt: 0, folderId: 'work' },
  { id: 'b2', url: 'https://b.example/', title: 'B', createdAt: 0, folderId: 'pacs' },
  { id: 'b3', url: 'https://c.example/', title: 'C', createdAt: 0, folderId: null },
];

const draw = (selection: Parameters<typeof FolderTree>[0]['selection'] = { kind: 'all' }, onSelect = vi.fn()) => {
  render(
    <FolderTree folders={FOLDERS} bookmarks={MARKS} selection={selection} onSelect={onSelect} onChanged={vi.fn()} />,
  );
  return onSelect;
};

/** A drag event carrying what a real one would, since jsdom has no DataTransfer. */
const carrying = (kind: string, id: string) => ({
  dataTransfer: { types: [kind], getData: (asked: string) => (asked === kind ? id : '') },
});

afterEach(() => {
  cleanup();
  file.mockClear();
  move.mockClear();
  update.mockClear();
  openContextMenu.mockClear();
});

describe('the folder tree', () => {
  it('draws every folder, and the two rows that are not folders', () => {
    draw();
    expect(screen.getByText('All bookmarks')).toBeTruthy();
    expect(screen.getByText('Unfiled')).toBeTruthy();
    for (const name of ['work', 'pacs', 'dashboards', 'reading']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}$`) })).toBeTruthy();
    }
  });

  it('indents each row by its depth, so the drop target and the eye agree', () => {
    draw();
    const indent = (name: string) =>
      Number.parseInt(
        (screen.getByRole('button', { name: new RegExp(`^${name}$`) }).parentElement as HTMLElement).style
          .paddingLeft,
        10,
      );
    expect(indent('work')).toBeLessThan(indent('pacs'));
    expect(indent('pacs')).toBeLessThan(indent('dashboards'));
  });

  it('counts what is inside a folder, not just what is directly in it', () => {
    draw();
    const row = screen.getByRole('button', { name: /^work$/ }).parentElement as HTMLElement;
    expect(row.textContent).toContain('2');
  });

  it('hides what a collapsed folder holds', () => {
    render(
      <FolderTree
        folders={FOLDERS.map((entry) => (entry.id === 'work' ? { ...entry, collapsed: true } : entry))}
        bookmarks={MARKS}
        selection={{ kind: 'all' }}
        onSelect={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /^pacs$/ })).toBeNull();
  });
});

/**
 * Selecting and renaming are the same click on the same word, so the first one
 * has to be free to say which folder is being looked at.
 */
describe('clicking a folder', () => {
  it('selects it when it is not the selected one', () => {
    const onSelect = draw({ kind: 'all' });
    fireEvent.click(screen.getByRole('button', { name: /^work$/ }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'folder', id: 'work' });
  });

  it('renames it when it already is', () => {
    draw({ kind: 'folder', id: 'work' });
    fireEvent.click(screen.getByRole('button', { name: /^work$/ }));
    expect(screen.getByRole('textbox', { name: /Rename work/ })).toBeTruthy();
  });

  it('keeps a new name when the field is left', () => {
    draw({ kind: 'folder', id: 'work' });
    fireEvent.click(screen.getByRole('button', { name: /^work$/ }));
    const field = screen.getByRole('textbox', { name: /Rename work/ }) as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'Client work' } });
    fireEvent.blur(field);
    expect(update).toHaveBeenCalledWith('work', { name: 'Client work' });
  });

  it('discards the typing on Escape, and the blur that follows does not put it back', () => {
    draw({ kind: 'folder', id: 'work' });
    fireEvent.click(screen.getByRole('button', { name: /^work$/ }));
    const field = screen.getByRole('textbox', { name: /Rename work/ }) as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'Thrown away' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.blur(field);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('dropping onto a folder', () => {
  it('files a bookmark there', () => {
    draw();
    const row = screen.getByRole('button', { name: /^reading$/ }).parentElement as HTMLElement;
    fireEvent.drop(row, carrying(DRAG_BOOKMARK, 'b3'));
    expect(file).toHaveBeenCalledWith('b3', 'reading');
  });

  it('moves a folder into an unrelated one', () => {
    draw();
    const row = screen.getByRole('button', { name: /^reading$/ }).parentElement as HTMLElement;
    fireEvent.drop(row, carrying(DRAG_FOLDER, 'work'));
    expect(move).toHaveBeenCalledWith('work', 'reading');
  });

  /*
   * The drop that makes a folder its own ancestor is one drag away and the
   * damage is permanent: the subtree detaches from the top level, so there is
   * nowhere left to drag it back from. It is refused, not undone afterwards.
   */
  it('refuses a folder dropped into its own child', () => {
    draw();
    const row = screen.getByRole('button', { name: /^pacs$/ }).parentElement as HTMLElement;
    fireEvent.drop(row, carrying(DRAG_FOLDER, 'work'));
    expect(move).not.toHaveBeenCalled();
  });

  it('refuses a folder dropped into its own grandchild', () => {
    draw();
    const row = screen.getByRole('button', { name: /^dashboards$/ }).parentElement as HTMLElement;
    fireEvent.drop(row, carrying(DRAG_FOLDER, 'work'));
    expect(move).not.toHaveBeenCalled();
  });

  it('refuses a folder dropped onto itself', () => {
    draw();
    const row = screen.getByRole('button', { name: /^work$/ }).parentElement as HTMLElement;
    fireEvent.drop(row, carrying(DRAG_FOLDER, 'work'));
    expect(move).not.toHaveBeenCalled();
  });

  it('unfiles a bookmark dropped on All bookmarks', () => {
    draw();
    fireEvent.drop(screen.getByText('All bookmarks').closest('button') as HTMLElement, carrying(DRAG_BOOKMARK, 'b1'));
    expect(file).toHaveBeenCalledWith('b1', null);
  });
});

describe('the rest of a folder row', () => {
  it('collapses without selecting, so renaming is never hidden behind a collapse', () => {
    const onSelect = draw();
    fireEvent.click(screen.getByRole('button', { name: /Collapse work/ }));
    expect(update).toHaveBeenCalledWith('work', { collapsed: true });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens the native menu on right-click, which is where colour and delete live', () => {
    draw();
    const row = screen.getByRole('button', { name: /^work$/ }).parentElement as HTMLElement;
    fireEvent.contextMenu(row);
    expect(openContextMenu).toHaveBeenCalledWith('work');
  });
});
