// Utils
import { type BookmarkFolder, wouldCycle } from '../../shared/bookmark-folders';
import { GROUP_COLOURS, type GroupColourId } from '../../shared/tab-groups';
import { inTransaction } from './database';
import { importLegacyFile } from './legacy-import';
import { asString, isRecord, newId } from './persistence';
import { t } from '../../shared/i18n/translate';

// Types
import type { DatabaseSync } from 'node:sqlite';

const MAX_NAME = 60;
const LEGACY_FILE = 'bookmark-folders.json';

/** The folders bookmarks are filed in, each holding its parent's id, so moving one bookmark never rewrites the tree. */
export class BookmarkFoldersStore {
  constructor(
    private readonly database: DatabaseSync,
    directory: string,
  ) {
    importLegacyFile(database, directory, LEGACY_FILE, reviveFolders, (folders) => this.write(folders));
  }

  list(): BookmarkFolder[] {
    return this.database
      .prepare('SELECT id, name, colour, parent_id, collapsed FROM bookmark_folders ORDER BY position')
      .all()
      .map(toFolder);
  }

  find(id: string): BookmarkFolder | null {
    const row = this.database
      .prepare('SELECT id, name, colour, parent_id, collapsed FROM bookmark_folders WHERE id = ?')
      .get(id);
    return row ? toFolder(row) : null;
  }

  create(name: string, colour: GroupColourId, parentId: string | null): BookmarkFolder {
    // A parent that has gone leaves the folder at the top level rather than out of reach.
    const parent = parentId && this.find(parentId) ? parentId : null;
    const folder: BookmarkFolder = {
      id: newId(),
      name: name.trim().slice(0, MAX_NAME) || t('main.import.bookmarks.unnamedFolder'),
      colour,
      parentId: parent,
      collapsed: false,
    };
    const last = this.database.prepare('SELECT coalesce(max(position), -1) AS position FROM bookmark_folders').get();
    this.insert(folder, Number(last?.position) + 1);
    return folder;
  }

  /** Everything about a folder can be changed except where it sits, which is a move. */
  update(id: string, changes: { name?: string; colour?: GroupColourId; collapsed?: boolean }): void {
    const folder = this.find(id);
    if (!folder) {
      return;
    }
    this.database
      .prepare('UPDATE bookmark_folders SET name = ?, colour = ?, collapsed = ? WHERE id = ?')
      .run(
        changes.name !== undefined ? changes.name.trim().slice(0, MAX_NAME) || folder.name : folder.name,
        changes.colour ?? folder.colour,
        (changes.collapsed ?? folder.collapsed) ? 1 : 0,
        id,
      );
  }

  /**
   * Moves a folder under another, and reports whether it went.
   *
   * A move that would make a folder its own ancestor is refused here as well as
   * in the interface, because the interface is not the only thing that can ask.
   */
  move(id: string, parentId: string | null): boolean {
    const folders = this.list();
    if (!folders.some((folder) => folder.id === id)) {
      return false;
    }
    if (parentId !== null && !folders.some((folder) => folder.id === parentId)) {
      return false;
    }
    if (wouldCycle(folders, id, parentId)) {
      return false;
    }
    this.database.prepare('UPDATE bookmark_folders SET parent_id = ? WHERE id = ?').run(parentId, id);
    return true;
  }

  /** Replaces the whole tree, which is how a delete promotes what was inside. */
  replace(folders: readonly BookmarkFolder[]): void {
    inTransaction(this.database, () => this.write(folders));
  }

  /** Every write is already on disk; kept so the store's callers flush every part the same way. */
  flush(): void {}

  private insert(folder: BookmarkFolder, position: number): void {
    this.database
      .prepare(
        'INSERT INTO bookmark_folders (id, position, name, colour, parent_id, collapsed) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(folder.id, position, folder.name, folder.colour, folder.parentId, folder.collapsed ? 1 : 0);
  }

  private write(folders: readonly BookmarkFolder[]): void {
    this.database.exec('DELETE FROM bookmark_folders');
    folders.forEach((folder, position) => this.insert(folder, position));
  }
}

function toFolder(row: Record<string, unknown>): BookmarkFolder {
  return {
    id: String(row.id),
    name: String(row.name),
    colour: String(row.colour) as GroupColourId,
    parentId: typeof row.parent_id === 'string' ? row.parent_id : null,
    collapsed: row.collapsed === 1,
  };
}

export function reviveFolders(raw: unknown): BookmarkFolder[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }

  const colours = new Set<string>(GROUP_COLOURS.map((colour) => colour.id));

  const read = raw.flatMap((item) => {
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
        name: asString(item.name).trim().slice(0, MAX_NAME) || t('main.import.bookmarks.unnamedFolder'),
        // An unknown colour is a colour this build does not have. Falling back
        // keeps the folder; refusing it would lose what someone filed.
        colour: (colours.has(colour) ? colour : GROUP_COLOURS[0].id) as GroupColourId,
        parentId: asString(item.parentId) || null,
        collapsed: item.collapsed === true,
      },
    ];
  });

  // A folder whose parent is not here is a folder nobody can reach: the tree is
  // walked down from the top, so it is neither a root nor anybody's child, and
  // it and everything under it vanish from every view while staying on disk.
  // Nothing in the app can write that, but a hand-edited file can.
  const present = new Set(read.map((folder) => folder.id));
  return read.map((folder) =>
    folder.parentId && !present.has(folder.parentId) ? { ...folder, parentId: null } : folder,
  );
}
