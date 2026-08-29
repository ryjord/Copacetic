import { type GroupColourId } from './tab-groups';
import type { Bookmark } from './types';

/**
 * The rules a folder tree has to obey, before any of it is drawn.
 *
 * A tree is where bookmark managers usually turn hostile: a folder is deleted
 * and takes a branch with it, or a drag makes something its own ancestor and
 * the whole subtree stops being reachable. None of that is a drawing problem,
 * so none of it is solved by drawing. It is solved here, where it can be
 * proved, and the interface is left with nothing to decide.
 *
 * Colours are the group palette. One set of six means the same thing wherever
 * it appears, and a folder is the resting form of a tab group.
 */
export interface BookmarkFolder {
  id: string;
  name: string;
  colour: GroupColourId;
  /** The folder this one sits in, or null at the top level. */
  parentId: string | null;
  collapsed: boolean;
}

/** The folders directly inside one, in the order they are stored. */
export function childrenOf(folders: readonly BookmarkFolder[], parentId: string | null): BookmarkFolder[] {
  return folders.filter((folder) => folder.parentId === parentId);
}

/**
 * Every folder beneath one, at any depth.
 *
 * Walked breadth-first from a working set rather than by recursion, so a file
 * that arrived on disk already holding a cycle cannot put this into one: each
 * folder is visited at most once, whatever the parents claim.
 */
export function descendantsOf(folders: readonly BookmarkFolder[], id: string): BookmarkFolder[] {
  const found: BookmarkFolder[] = [];
  const seen = new Set<string>([id]);
  let frontier = [id];

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const parentId of frontier) {
      for (const folder of folders) {
        if (folder.parentId === parentId && !seen.has(folder.id)) {
          seen.add(folder.id);
          found.push(folder);
          next.push(folder.id);
        }
      }
    }
    frontier = next;
  }

  return found;
}

/**
 * Whether moving a folder under a new parent would make it its own ancestor.
 *
 * The move that does this is easy to reach — drag a folder onto something
 * inside it — and the damage is permanent: the subtree detaches from the top
 * level and there is no longer any way to see it, so nothing can be dragged
 * back out. The drop is refused while the cursor is over it rather than
 * accepted and quietly undone.
 */
export function wouldCycle(folders: readonly BookmarkFolder[], id: string, parentId: string | null): boolean {
  if (parentId === null) {
    return false;
  }
  if (parentId === id) {
    return true;
  }
  return descendantsOf(folders, id).some((folder) => folder.id === parentId);
}

/** A folder and its ancestors, outermost first — what a breadcrumb reads. */
export function pathOf(folders: readonly BookmarkFolder[], id: string): BookmarkFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: BookmarkFolder[] = [];
  const seen = new Set<string>();

  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return path;
}

/**
 * How much is in a folder, both ways.
 *
 * A tree makes every count ambiguous, so neither number is left to be guessed
 * at: `here` is what the folder holds itself, `withDescendants` is what opening
 * it would actually produce. Anything that acts on a folder names the second,
 * because 31 tabs is not what someone expecting 18 wants.
 */
export function countIn(
  bookmarks: readonly Bookmark[],
  folders: readonly BookmarkFolder[],
  id: string,
): { here: number; withDescendants: number } {
  const here = bookmarks.filter((bookmark) => bookmark.folderId === id).length;
  const within = new Set(descendantsOf(folders, id).map((folder) => folder.id));
  const withDescendants =
    here + bookmarks.filter((bookmark) => bookmark.folderId !== null && within.has(bookmark.folderId)).length;
  return { here, withDescendants };
}

/**
 * What a folder tree looks like once flattened for drawing, deepest paths kept
 * intact and collapsed branches left out.
 *
 * Depth is carried rather than recomputed at the point of drawing, because the
 * indent has to agree with the drop target: a row that looks like a child of
 * one folder and drops into another is worse than no indent at all.
 */
export function visibleTree(
  folders: readonly BookmarkFolder[],
): { folder: BookmarkFolder; depth: number; hasChildren: boolean }[] {
  const rows: { folder: BookmarkFolder; depth: number; hasChildren: boolean }[] = [];

  // No cycle guard here, unlike descendantsOf: this walks down from the top, so
  // a folder in a loop is never reached at all — it has no ancestor that is a
  // root. The store repairs those on the way in rather than hiding them here.
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of childrenOf(folders, parentId)) {
      const hasChildren = folders.some((candidate) => candidate.parentId === folder.id);
      rows.push({ folder, depth, hasChildren });
      if (!folder.collapsed) {
        walk(folder.id, depth + 1);
      }
    }
  };

  walk(null, 0);
  return rows;
}

/**
 * What deleting a folder does to everything inside it.
 *
 * Nothing is deleted but the folder. Its bookmarks and its child folders move
 * up to where it was, which is the promise the tab strip already makes when it
 * says "Ungroup these tabs — tabs stay open": deleting a container has never
 * deleted what someone put in it, and it should not start here.
 */
export function afterDeleting(
  folders: readonly BookmarkFolder[],
  bookmarks: readonly Bookmark[],
  id: string,
): { folders: BookmarkFolder[]; bookmarks: Bookmark[]; moved: { folders: number; bookmarks: number } } {
  const deleted = folders.find((folder) => folder.id === id);
  const promoteTo = deleted?.parentId ?? null;
  let movedFolders = 0;
  let movedBookmarks = 0;

  const remaining = folders
    .filter((folder) => folder.id !== id)
    .map((folder) => {
      if (folder.parentId !== id) {
        return folder;
      }
      movedFolders += 1;
      return { ...folder, parentId: promoteTo };
    });

  const kept = bookmarks.map((bookmark) => {
    if (bookmark.folderId !== id) {
      return bookmark;
    }
    movedBookmarks += 1;
    return { ...bookmark, folderId: promoteTo };
  });

  return { folders: remaining, bookmarks: kept, moved: { folders: movedFolders, bookmarks: movedBookmarks } };
}
