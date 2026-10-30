/** One bookmark or folder as ordering sees it: what it is, and which folder it sits in. */
export interface OrderedItem {
  id: string;
  /** The folder it is in, or null at the top level. */
  parentId: string | null;
}

/**
 * Every id in its new order after moving one item just before another in the
 * same folder, or after the last of its folder when none is named.
 *
 * Null when the move is refused - an unknown item, or a place in another
 * folder - so a reorder can never refile something by the back door.
 */
export function reorderedIds(items: readonly OrderedItem[], id: string, beforeId: string | null): string[] | null {
  const moving = items.find((item) => item.id === id);
  const before = beforeId === null ? null : items.find((item) => item.id === beforeId);
  if (!moving || before === undefined || (before !== null && before.parentId !== moving.parentId)) {
    return null;
  }
  if (beforeId === id) {
    return items.map((item) => item.id);
  }
  const others = items.filter((item) => item.id !== id);
  const lastSibling = others.findLastIndex((item) => item.parentId === moving.parentId);
  const index = before ? others.indexOf(before) : lastSibling === -1 ? others.length : lastSibling + 1;
  const ids = others.map((item) => item.id);
  ids.splice(index, 0, id);
  return ids;
}
