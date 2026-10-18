import type { BookmarkFolder } from '../../shared/bookmark-folders';
import { PUSH } from '../../shared/channels';
import type { GroupColourId } from '../../shared/tab-groups';
import type { BrowserStore } from '../data/store';

interface BookmarkCommandsDeps {
  store: BrowserStore;
  changed: () => void;
  push: (channel: string, payload?: unknown) => void;
}

/** Saved pages and the folders they are filed in. */
export class BookmarkCommands {
  constructor(private readonly deps: BookmarkCommandsDeps) {}

  /**
   * Says that the saved things changed.
   *
   * Filing a bookmark or recolouring a folder changes no tab, so the tab
   * snapshot the chrome already watches says nothing about it — a surface
   * watching only that shows a stale tree until something unrelated happens.
   */
  changed(): void {
    this.deps.push(PUSH.bookmarksChanged);
  }

  /** Asks the surface to put the folder's name into an editable field. */
  renameFolder(id: string): void {
    this.deps.push(PUSH.renameBookmarkFolder, id);
  }

  createFolder(name: string, colour: GroupColourId, parentId: string | null): BookmarkFolder {
    const folder = this.deps.store.createBookmarkFolder(name, colour, parentId);
    this.changed();
    return folder;
  }

  moveFolder(id: string, parentId: string | null): boolean {
    const moved = this.deps.store.moveBookmarkFolder(id, parentId);
    this.changed();
    return moved;
  }

  updateFolder(id: string, changes: { name?: string; colour?: GroupColourId; collapsed?: boolean }): void {
    this.deps.store.updateBookmarkFolder(id, changes);
    this.changed();
  }

  file(id: string, folderId: string | null): void {
    this.deps.store.fileBookmark(id, folderId);
    this.changed();
    this.deps.changed();
  }

  remove(id: string): void {
    this.deps.store.removeBookmark(id);
    this.changed();
    this.deps.changed();
  }

  /** Deletes a folder, keeping everything that was in it, and says what moved. */
  deleteFolder(id: string): { folders: number; bookmarks: number } {
    const moved = this.deps.store.deleteBookmarkFolder(id);
    this.changed();
    this.deps.changed();
    return moved;
  }
}
