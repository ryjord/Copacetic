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

  it('discards the typing on Escape, and puts the old name back in the field', () => {
    draw({ kind: 'folder', id: 'work' });
    fireEvent.click(screen.getByRole('button', { name: /^work$/ }));
    const field = screen.getByRole('textbox', { name: /Rename work/ }) as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'Thrown away' } });
    fireEvent.keyDown(field, { key: 'Escape' });

    // Asserted on the field itself. Escape unmounts it, so a blur fired after
    // this lands on a detached node and proves nothing about what was kept —
    // which is all the previous version of this test was checking.
    expect(field.value).toBe('work');
    fireEvent.blur(field);
    expect(update).not.toHaveBeenCalled();
  });
});

/**
 * Whether a drag is allowed to land is decided in dragover, before any drop
 * happens — it is what shows the drop as possible or refuses it under the
 * cursor. Every test below this used to fire `drop` directly, so `accepts`
 * could be stubbed to refuse everything, breaking the feature entirely, and
 * all of them still passed.
 */
describe('dragging over a folder', () => {
  // fireEvent returns false when the handler called preventDefault, which is
  // how a drop target says it will take what is being dragged.
  const dragOver = (name: RegExp, event: ReturnType<typeof carrying>) => {
    const row = screen.getByRole('button', { name }).parentElement as HTMLElement;
    return fireEvent.dragOver(row, event) === false;
  };

  it('takes a bookmark anywhere', () => {
    draw();
    expect(dragOver(/^work$/, carrying(DRAG_BOOKMARK, 'b3'))).toBe(true);
  });

  it('takes a folder dropped somewhere unrelated', () => {
    draw();
    fireEvent.dragStart(screen.getByRole('button', { name: /^work$/ }), carrying(DRAG_FOLDER, 'work'));
    expect(dragOver(/^reading$/, carrying(DRAG_FOLDER, 'work'))).toBe(true);
  });

  it('refuses a folder over its own child while the cursor is still there', () => {
    draw();
    fireEvent.dragStart(screen.getByRole('button', { name: /^work$/ }), carrying(DRAG_FOLDER, 'work'));
    expect(dragOver(/^pacs$/, carrying(DRAG_FOLDER, 'work'))).toBe(false);
  });

  it('refuses a folder over itself', () => {
    draw();
    fireEvent.dragStart(screen.getByRole('button', { name: /^work$/ }), carrying(DRAG_FOLDER, 'work'));
    expect(dragOver(/^work$/, carrying(DRAG_FOLDER, 'work'))).toBe(false);
  });

  it('takes nothing it does not recognise', () => {
    draw();
    expect(dragOver(/^work$/, carrying('text/plain', 'anything'))).toBe(false);
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
