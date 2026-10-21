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
} from '../../../../electron/shared/data/bookmark-folders';
import type { Bookmark } from '../../../../electron/shared/types';

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
  it.each([
    ['the folders directly inside one', 'work', ['pacs', 'unigrade']],
    ['the folders at the top level', null, ['work', 'reading']],
  ])('finds %s', (_caseName, parentId, expected) => {
    expect(childrenOf(TREE, parentId).map((entry) => entry.id)).toEqual(expected);
  });

  it.each([
    ['every depth, not just the first', 'work', ['pacs', 'unigrade', 'dashboards']],
    ['nothing under a leaf', 'dashboards', []],
  ])('reaches %s', (_caseName, folderId, expected) => {
    expect(descendantsOf(TREE, folderId).map((entry) => entry.id)).toEqual(expected);
  });

  /*
   * Nothing in the app can write a cycle - wouldCycle refuses the move that
   * would - but a file on disk can hold one, whether hand-edited or half
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
  it.each([
    ['refuses a folder dropped onto itself', 'work', 'work', true],
    ['refuses a folder dropped into its own child', 'work', 'pacs', true],
    ['refuses a folder dropped into a grandchild', 'work', 'dashboards', true],
    ['allows a move to an unrelated folder', 'work', 'reading', false],
    ['allows a move up to the top level', 'dashboards', null, false],
    ['allows a child to move into its own sibling', 'pacs', 'unigrade', false],
  ])('%s', (_caseName, folderId, targetId, expected) => {
    expect(wouldCycle(TREE, folderId, targetId)).toBe(expected);
  });
});

describe('where a folder sits', () => {
  it.each([
    ['outermost first, for a breadcrumb', 'dashboards', ['work', 'pacs', 'dashboards']],
    ['just itself at the top level', 'work', ['work']],
  ])('reads %s', (_caseName, folderId, expected) => {
    expect(pathOf(TREE, folderId).map((entry) => entry.id)).toEqual(expected);
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

  it.each([
    ['separates what is here from what is inside', 'work', { here: 2, withDescendants: 4 }],
    ['agrees with itself when a folder has no children', 'reading', { here: 1, withDescendants: 1 }],
    ['does not count what is filed nowhere', 'dashboards', { here: 1, withDescendants: 1 }],
  ])('%s', (_caseName, folderId, expected) => {
    expect(countIn(marks, TREE, folderId)).toEqual(expected);
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
 * The promise the tab strip already makes with "Ungroup these tabs - tabs stay
 * open": deleting a container never deletes what someone put in it.
 */
describe('deleting a folder', () => {
  const marks = [mark('a', 'work'), mark('b', 'pacs'), mark('c', null)];

  it.each([
    ['one level up', 'pacs', 'b', 'work', 'dashboards', 'work'],
    ['to the top level when the folder was there', 'work', 'a', null, 'pacs', null],
  ])(
    'keeps its bookmarks and folders %s',
    (_caseName, deletedId, bookmarkId, bookmarkFolderId, folderId, parentId) => {
      const after = afterDeleting(TREE, marks, deletedId);
      expect(after.bookmarks.find((entry) => entry.id === bookmarkId)?.folderId).toBe(bookmarkFolderId);
      expect(after.folders.find((entry) => entry.id === folderId)?.parentId).toBe(parentId);
    },
  );

  it.each([
    ['pacs', ['work', 'dashboards', 'unigrade', 'reading'], { folders: 1, bookmarks: 1 }],
    ['work', ['pacs', 'dashboards', 'unigrade', 'reading'], { folders: 2, bookmarks: 1 }],
    ['gone', ['work', 'pacs', 'dashboards', 'unigrade', 'reading'], { folders: 0, bookmarks: 0 }],
  ])('removes only %s, counts what moved and leaves the bookmarks', (deletedId, remainingIds, moved) => {
    const after = afterDeleting(TREE, marks, deletedId);
    expect(after.folders.map((entry) => entry.id)).toEqual(remainingIds);
    expect(after.bookmarks).toHaveLength(marks.length);
    expect(after.moved).toEqual(moved);
  });
});
