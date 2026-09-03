import { describe, expect, it } from 'vitest';
import {
  afterDeleting,
  childrenOf,
  countIn,
  descendantsOf,
  pathOf,
  visibleTree,
  wouldCycle,
  type BookmarkFolder,
} from '../../electron/shared/bookmark-folders';
import type { Bookmark } from '../../electron/shared/types';

const folder = (id: string, parentId: string | null, over: Partial<BookmarkFolder> = {}): BookmarkFolder => ({
  id,
  name: id,
  colour: 'violet',
  parentId,
  collapsed: false,
  ...over,
});

// work > pacs > dashboards, work > unigrade, reading (alone)
const TREE = [
  folder('work', null),
  folder('pacs', 'work'),
  folder('dashboards', 'pacs'),
  folder('unigrade', 'work'),
  folder('reading', null),
];

const mark = (id: string, folderId: string | null): Bookmark => ({
  id,
  url: `https://${id}.example/`,
  title: id,
  createdAt: 0,
  folderId,
});

describe('what is inside a folder', () => {
  it('finds the folders directly inside one', () => {
    expect(childrenOf(TREE, 'work').map((entry) => entry.id)).toEqual(['pacs', 'unigrade']);
  });

  it('finds folders at the top level', () => {
    expect(childrenOf(TREE, null).map((entry) => entry.id)).toEqual(['work', 'reading']);
  });

  it('reaches every depth, not just the first', () => {
    expect(descendantsOf(TREE, 'work').map((entry) => entry.id)).toEqual(['pacs', 'unigrade', 'dashboards']);
  });

  it('says a leaf has nothing under it', () => {
    expect(descendantsOf(TREE, 'dashboards')).toEqual([]);
  });

  /*
   * Nothing in the app can write a cycle — wouldCycle refuses the move that
   * would — but a file on disk can hold one, whether hand-edited or half
   * written. Walking it must end.
   */
  it('terminates on a tree that arrived already holding a cycle', () => {
    const looped = [folder('a', 'b'), folder('b', 'a')];
    expect(descendantsOf(looped, 'a').map((entry) => entry.id)).toEqual(['b']);
    expect(pathOf(looped, 'a').map((entry) => entry.id)).toEqual(['b', 'a']);
  });
});

/**
 * The move that makes a folder its own ancestor is one drag away, and the
 * damage is permanent: the subtree detaches from the top level, so there is no
 * longer anywhere to drag it back from.
 */
describe('a folder cannot swallow itself', () => {
  it('refuses a folder dropped onto itself', () => {
    expect(wouldCycle(TREE, 'work', 'work')).toBe(true);
  });

  it('refuses a folder dropped into its own child', () => {
    expect(wouldCycle(TREE, 'work', 'pacs')).toBe(true);
  });

  it('refuses a folder dropped into a grandchild', () => {
    expect(wouldCycle(TREE, 'work', 'dashboards')).toBe(true);
  });

  it('allows a move to an unrelated folder', () => {
    expect(wouldCycle(TREE, 'work', 'reading')).toBe(false);
  });

  it('allows a move up to the top level', () => {
    expect(wouldCycle(TREE, 'dashboards', null)).toBe(false);
  });

  it('allows a child to move into its own sibling', () => {
    expect(wouldCycle(TREE, 'pacs', 'unigrade')).toBe(false);
  });
});

describe('where a folder sits', () => {
  it('reads outermost first, for a breadcrumb', () => {
    expect(pathOf(TREE, 'dashboards').map((entry) => entry.id)).toEqual(['work', 'pacs', 'dashboards']);
  });

  it('is just itself at the top level', () => {
    expect(pathOf(TREE, 'work').map((entry) => entry.id)).toEqual(['work']);
  });
});

/**
 * A tree makes every count ambiguous, so both numbers are kept: anything that
 * acts on a folder names the one it is about to act on.
 */
describe('counting what is in a folder', () => {
  const marks = [
    mark('a', 'work'),
    mark('b', 'work'),
    mark('c', 'pacs'),
    mark('d', 'dashboards'),
    mark('e', 'reading'),
    mark('f', null),
  ];

  it('separates what is here from what is inside', () => {
    expect(countIn(marks, TREE, 'work')).toEqual({ here: 2, withDescendants: 4 });
  });

  it('agrees with itself when a folder has no children', () => {
    expect(countIn(marks, TREE, 'reading')).toEqual({ here: 1, withDescendants: 1 });
  });

  it('does not count what is filed nowhere', () => {
    expect(countIn(marks, TREE, 'dashboards')).toEqual({ here: 1, withDescendants: 1 });
  });
});

describe('drawing the tree', () => {
  it('carries the depth each row is drawn at', () => {
    expect(visibleTree(TREE).map((row) => [row.folder.id, row.depth])).toEqual([
      ['work', 0],
      ['pacs', 1],
      ['dashboards', 2],
      ['unigrade', 1],
      ['reading', 0],
    ]);
  });

  it('leaves out what a collapsed folder is hiding', () => {
    const shut = TREE.map((entry) => (entry.id === 'pacs' ? { ...entry, collapsed: true } : entry));
    expect(visibleTree(shut).map((row) => row.folder.id)).toEqual(['work', 'pacs', 'unigrade', 'reading']);
  });

  it('says which rows can be opened, so the chevron is not drawn on a leaf', () => {
    const opens = visibleTree(TREE).filter((row) => row.hasChildren);
    expect(opens.map((row) => row.folder.id)).toEqual(['work', 'pacs']);
  });
});

/**
 * The promise the tab strip already makes with "Ungroup these tabs — tabs stay
 * open": deleting a container never deletes what someone put in it.
 */
describe('deleting a folder', () => {
  const marks = [mark('a', 'work'), mark('b', 'pacs'), mark('c', null)];

  it('keeps the bookmarks that were in it, one level up', () => {
    const after = afterDeleting(TREE, marks, 'pacs');
    expect(after.bookmarks.find((entry) => entry.id === 'b')?.folderId).toBe('work');
  });

  it('keeps the folders that were in it, one level up', () => {
    const after = afterDeleting(TREE, marks, 'pacs');
    expect(after.folders.find((entry) => entry.id === 'dashboards')?.parentId).toBe('work');
  });

  it('promotes to the top level when the folder was there', () => {
    const after = afterDeleting(TREE, marks, 'work');
    expect(after.folders.find((entry) => entry.id === 'pacs')?.parentId).toBeNull();
    expect(after.bookmarks.find((entry) => entry.id === 'a')?.folderId).toBeNull();
  });

  it('removes only the folder itself', () => {
    const after = afterDeleting(TREE, marks, 'pacs');
    expect(after.folders.map((entry) => entry.id)).toEqual(['work', 'dashboards', 'unigrade', 'reading']);
    expect(after.bookmarks).toHaveLength(marks.length);
  });

  it('counts what moved, so the confirmation can say it', () => {
    expect(afterDeleting(TREE, marks, 'work').moved).toEqual({ folders: 2, bookmarks: 1 });
  });

  it('leaves everything alone when the folder is not there', () => {
    const after = afterDeleting(TREE, marks, 'gone');
    expect(after.folders).toEqual(TREE);
    expect(after.moved).toEqual({ folders: 0, bookmarks: 0 });
  });
});
