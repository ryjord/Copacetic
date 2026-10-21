import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { BookmarkFolder } from '../../../../electron/shared/data/bookmark-folders';
import type { Bookmark } from '../../../../electron/shared/types';
import { DRAG_BOOKMARK, DRAG_FOLDER, FolderTree } from '@/components/views/bookmarks/FolderTree';

const file = vi.fn();
const move = vi.fn();
const update = vi.fn();
const openContextMenu = vi.fn();
const create = vi.fn(async () => ({ id: 'new', name: 'Folder', colour: 'violet', parentId: null, collapsed: false }));

vi.mock('@/lib/bridge/bridge', () => ({
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

/**
 * A drag event carrying what a real one would, since jsdom has no DataTransfer.
 * setData is part of it: a dragstart handler calls it, and a stub without it
 * throws before the handler can record what is being dragged.
 */
const carrying = (kind: string, id: string) => ({
  dataTransfer: {
    types: [kind],
    getData: (asked: string) => (asked === kind ? id : ''),
    setData: () => undefined,
  },
});

afterEach(() => {
  cleanup();
  file.mockClear();
  move.mockClear();
  update.mockClear();
  openContextMenu.mockClear();
});

describe('the folder tree', () => {
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

  // A second click used to rename, which nobody could discover and anybody could trigger by accident.
  it('does not rename it when it is clicked again', () => {
    draw({ kind: 'folder', id: 'work' });
    fireEvent.click(screen.getByRole('button', { name: /^work$/ }));
    expect(screen.queryByRole('textbox', { name: /Rename work/ })).toBeNull();
  });

  it.each([
    ['a double-click', (row: HTMLElement) => fireEvent.doubleClick(row)],
    ['F2', (row: HTMLElement) => fireEvent.keyDown(row, { key: 'F2' })],
  ])('renames it on %s', (_how, ask) => {
    draw({ kind: 'folder', id: 'work' });
    ask(screen.getByRole('button', { name: /^work$/ }));
    expect(screen.getByRole('textbox', { name: /Rename work/ })).toBeTruthy();
  });

  it('keeps a new name when the field is left', () => {
    draw({ kind: 'folder', id: 'work' });
    fireEvent.doubleClick(screen.getByRole('button', { name: /^work$/ }));
    const field = screen.getByRole('textbox', { name: /Rename work/ }) as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'Client work' } });
    fireEvent.blur(field);
    expect(update).toHaveBeenCalledWith('work', { name: 'Client work' });
  });

  it('discards the typing on Escape, and puts the old name back in the field', () => {
    draw({ kind: 'folder', id: 'work' });
    fireEvent.doubleClick(screen.getByRole('button', { name: /^work$/ }));
    const field = screen.getByRole('textbox', { name: /Rename work/ }) as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'Thrown away' } });
    fireEvent.keyDown(field, { key: 'Escape' });

    // Asserted on the field itself. Escape unmounts it, so a blur fired after
    // this lands on a detached node and proves nothing about what was kept -
    // which is all the previous version of this test was checking.
    expect(field.value).toBe('work');
    fireEvent.blur(field);
    expect(update).not.toHaveBeenCalled();
  });
});

/**
 * Whether a drag is allowed to land is decided in dragover, before any drop
 * happens - it is what shows the drop as possible or refuses it under the
 * cursor. Each row checks the verdict and the drop, so stubbing `accepts` to
 * refuse everything cannot pass.
 *
 * A folder dropped into its own child or grandchild is refused, not undone
 * afterwards: the subtree would detach from the top level and leave nowhere to
 * drag it back from. Every bookmark is already in All, so a drop there could
 * only unfile it without saying so.
 */
describe('dragging onto a folder', () => {
  const rowFor = (targetName: string): HTMLElement => {
    if (targetName === 'All bookmarks') {
      return screen.getByText('All bookmarks').closest('button') as HTMLElement;
    }
    return screen.getByRole('button', { name: new RegExp(`^${targetName}$`) }).parentElement as HTMLElement;
  };

  it.each([
    { name: 'a folder into an unrelated folder', kind: DRAG_FOLDER, id: 'work', target: 'reading', allowed: true },
    { name: 'a folder into its own child', kind: DRAG_FOLDER, id: 'work', target: 'pacs', allowed: false },
    { name: 'a folder into its own grandchild', kind: DRAG_FOLDER, id: 'work', target: 'dashboards', allowed: false },
    { name: 'a folder onto itself', kind: DRAG_FOLDER, id: 'work', target: 'work', allowed: false },
    { name: 'a bookmark into a folder', kind: DRAG_BOOKMARK, id: 'b3', target: 'reading', allowed: true },
    { name: 'a bookmark onto All bookmarks', kind: DRAG_BOOKMARK, id: 'b1', target: 'All bookmarks', allowed: false },
    { name: 'something it does not recognise', kind: 'text/plain', id: 'anything', target: 'work', allowed: false },
  ])('treats $name as allowed: $allowed', ({ kind, id, target, allowed }) => {
    draw();
    if (kind === DRAG_FOLDER) {
      fireEvent.dragStart(screen.getByRole('button', { name: new RegExp(`^${id}$`) }), carrying(kind, id));
    }
    const row = rowFor(target);

    // fireEvent returns false when the handler called preventDefault, which is
    // how a drop target says it will take what is being dragged.
    const takenOnDragOver = fireEvent.dragOver(row, carrying(kind, id)) === false;
    fireEvent.drop(row, carrying(kind, id));

    expect(takenOnDragOver).toBe(allowed);
    if (allowed && kind === DRAG_FOLDER) {
      expect(move).toHaveBeenCalledWith(id, target);
    } else if (allowed) {
      expect(file).toHaveBeenCalledWith(id, target);
    } else {
      expect(move).not.toHaveBeenCalled();
      expect(file).not.toHaveBeenCalled();
    }
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
