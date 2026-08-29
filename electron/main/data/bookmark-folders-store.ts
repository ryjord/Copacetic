import { type BookmarkFolder, wouldCycle } from '../../shared/bookmark-folders';
import { GROUP_COLOURS, type GroupColourId } from '../../shared/tab-groups';
import { PersistedFile, asString, isRecord, newId } from './persistence';

const MAX_NAME = 60;

/**
 * The folders bookmarks are filed in.
 *
 * Kept in their own file rather than nested inside bookmarks.json, for the same
 * reason groups are kept out of the session: a tree written inline has to be
 * rewritten whole every time one bookmark moves, and a half-written tree is the
 * one shape from which nothing can be recovered.
 */
export class BookmarkFoldersStore {
  private readonly file = new PersistedFile<BookmarkFolder[]>('bookmark-folders.json', () => [], reviveFolders);

  list(): BookmarkFolder[] {
    return this.file.get();
  }

  find(id: string): BookmarkFolder | null {
    return this.file.get().find((folder) => folder.id === id) ?? null;
  }

  create(name: string, colour: GroupColourId, parentId: string | null): BookmarkFolder {
    // A parent that has gone leaves the folder at the top level rather than
    // out of reach: an id nothing resolves would hide it from every view.
    const parent = parentId && this.find(parentId) ? parentId : null;
    const folder: BookmarkFolder = {
      id: newId(),
      name: name.trim().slice(0, MAX_NAME) || 'Folder',
      colour,
      parentId: parent,
      collapsed: false,
    };
    this.file.update((folders) => [...folders, folder]);
    return folder;
  }

  /** Everything about a folder can be changed except where it sits, which is a move. */
  update(id: string, changes: { name?: string; colour?: GroupColourId; collapsed?: boolean }): void {
    this.file.update((folders) =>
      folders.map((folder) =>
        folder.id === id
          ? {
              ...folder,
              ...(changes.name !== undefined ? { name: changes.name.trim().slice(0, MAX_NAME) || folder.name } : {}),
              ...(changes.colour !== undefined ? { colour: changes.colour } : {}),
              ...(changes.collapsed !== undefined ? { collapsed: changes.collapsed } : {}),
            }
          : folder,
      ),
    );
  }

  /**
   * Moves a folder under another, and reports whether it went.
   *
   * A move that would make a folder its own ancestor is refused here as well as
   * in the interface. The interface refuses it so a drop can be shown as
   * impossible while the cursor is still over it; this refuses it because the
   * interface is not the only thing that can ask.
   */
  move(id: string, parentId: string | null): boolean {
    const folders = this.file.get();
    if (!folders.some((folder) => folder.id === id)) {
      return false;
    }
    if (parentId !== null && !folders.some((folder) => folder.id === parentId)) {
      return false;
    }
    if (wouldCycle(folders, id, parentId)) {
      return false;
    }
    this.file.update((current) => current.map((folder) => (folder.id === id ? { ...folder, parentId } : folder)));
    return true;
  }

  /** Replaces the whole tree, which is how a delete promotes what was inside. */
  replace(folders: readonly BookmarkFolder[]): void {
    this.file.update(() => [...folders]);
  }

  flush(): void {
    this.file.flush();
  }
}

export function reviveFolders(raw: unknown): BookmarkFolder[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }

  const colours = new Set<string>(GROUP_COLOURS.map((colour) => colour.id));

  return raw.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const id = asString(item.id);
    if (!id) {
      return [];
    }
    const colour = asString(item.colour);
    return [
      {
        id,
        name: asString(item.name).trim().slice(0, MAX_NAME) || 'Folder',
        // An unknown colour is a colour this build does not have. Falling back
        // keeps the folder; refusing it would lose what someone filed.
        colour: (colours.has(colour) ? colour : 'ash') as GroupColourId,
        parentId: asString(item.parentId) || null,
        collapsed: item.collapsed === true,
      },
    ];
  });
}
