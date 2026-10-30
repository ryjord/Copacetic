import { describe, expect, it } from 'vitest';
import { type OrderedItem, reorderedIds } from '../../../../electron/shared/data/bookmark-order';

// Positions are one list across every folder, so siblings can sit apart with another folder's items between them.
const ITEMS: OrderedItem[] = [
  { id: 'a', parentId: null },
  { id: 'work-1', parentId: 'work' },
  { id: 'b', parentId: null },
  { id: 'work-2', parentId: 'work' },
  { id: 'c', parentId: null },
];

describe('reordering bookmarks within a folder', () => {
  it.each([
    ['moves one before another', 'c', 'a', ['c', 'a', 'work-1', 'b', 'work-2']],
    ['moves one later, before a sibling further on', 'a', 'c', ['work-1', 'b', 'work-2', 'a', 'c']],
    ['moves one to the end of its folder', 'a', null, ['work-1', 'b', 'work-2', 'c', 'a']],
    ['moves within a folder past another folder’s items', 'work-2', 'work-1', ['a', 'work-2', 'work-1', 'b', 'c']],
    [
      'puts the last of a folder after its last sibling, not at the very end',
      'work-1',
      null,
      ['a', 'b', 'work-2', 'work-1', 'c'],
    ],
    ['leaves everything where it was when dropped before itself', 'b', 'b', ['a', 'work-1', 'b', 'work-2', 'c']],
  ])('%s', (_caseName, id, beforeId, expected) => {
    expect(reorderedIds(ITEMS, id, beforeId)).toEqual(expected);
  });

  // Reordering is not filing: a place in another folder would move the bookmark there by the back door.
  it.each([
    ['a place in another folder', 'a', 'work-1'],
    ['an item that is not there', 'missing', 'a'],
    ['a place that is not there', 'a', 'missing'],
  ])('refuses %s', (_caseName, id, beforeId) => {
    expect(reorderedIds(ITEMS, id, beforeId)).toBeNull();
  });

  it('keeps every id exactly once', () => {
    const result = reorderedIds(ITEMS, 'work-2', 'work-1') ?? [];
    expect([...result].sort()).toEqual(ITEMS.map((item) => item.id).sort());
  });
});
