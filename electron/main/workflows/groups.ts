import { descendantsOf } from '../../shared/bookmark-folders';
import { PUSH } from '../../shared/channels';
import { OPEN_WITHOUT_ASKING, openFolderMessage, savedGroupMessage } from '../../shared/notices';
import type { GroupColourId } from '../../shared/tab-groups';
import type { TabId } from '../../shared/types';
import type { NoticeCentre } from '../notices/notice-centre';
import type { BrowserStore } from '../data/store';
import type { SessionRegistry } from '../sessions/session-registry';
import type { TabManager } from '../tabs/tabs';
import type { BookmarkCommands } from './bookmarks';
import { t } from '../../shared/i18n/translate';

interface GroupCommandsDeps {
  store: BrowserStore;
  tabs: TabManager;
  sessions: SessionRegistry;
  notices: NoticeCentre;
  bookmarks: BookmarkCommands;
  changed: () => void;
  push: (channel: string, payload?: unknown) => void;
}

/** Tab groups, and their conversion to and from bookmark folders. */
export class GroupCommands {
  constructor(private readonly deps: GroupCommandsDeps) {}

  /** Makes a group and puts the tab that asked for it inside. */
  create(tabId: TabId, name: string, colour: GroupColourId, ownSession: boolean): string {
    const group = this.deps.store.createGroup(name, colour, ownSession);
    this.deps.tabs.setGroup(tabId, group.id);
    this.deps.changed();
    return group.id;
  }

  /**
   * Opens everything in a bookmark folder as one tab group.
   *
   * A folder is the resting form of a group - the same name, the same palette,
   * the same set of pages - so the two convert rather than merely resembling
   * each other. Everything nested inside comes too, which is why anything that
   * offers this names the number it is about to open.
   *
   * The group does not inherit its own session. That is decided when a group is
   * made and never afterwards, so a folder cannot smuggle one in.
   */
  openFolder(id: string): { opened: number; asked: boolean } {
    const folders = this.deps.store.listBookmarkFolders();
    const folder = this.deps.store.folderFor(id);
    if (!folder) {
      return { opened: 0, asked: false };
    }

    const within = new Set([id, ...descendantsOf(folders, id).map((entry) => entry.id)]);
    const urls = this.deps.store
      .listBookmarks()
      .filter((bookmark) => bookmark.folderId !== null && within.has(bookmark.folderId))
      .map((bookmark) => bookmark.url);

    if (urls.length === 0) {
      return { opened: 0, asked: false };
    }

    // Naming the number on a button is not the same as consenting to it: a
    // folder of two hundred pages opens two hundred tabs from one click, and
    // no window survives that in a state anyone can use.
    if (urls.length > OPEN_WITHOUT_ASKING) {
      this.deps.notices.notify(
        {
          id: `open-folder-${id}`,
          tone: 'ask',
          key: `open-folder-${id}`,
          message: openFolderMessage(urls.length, folder.name),
          confirm: t('main.notices.openTabs', { count: urls.length }),
        },
        () => this.openTabs(urls, folder.name, folder.colour),
      );
      return { opened: 0, asked: true };
    }

    this.openTabs(urls, folder.name, folder.colour);
    return { opened: urls.length, asked: false };
  }

  private openTabs(urls: readonly string[], name: string, colour: GroupColourId): void {
    const [first, ...rest] = urls;
    if (!first) {
      return;
    }
    const founding = this.deps.tabs.create(first, { activate: true });
    const groupId = this.create(founding, name, colour, false);
    for (const url of rest) {
      this.deps.tabs.create(url, { groupId });
    }
    this.deps.changed();
  }

  /**
   * Saves a tab group as a bookmark folder, which is the same conversion the
   * other way round.
   *
   * A Hush tab is never saved. Hush makes one promise - that nothing it does
   * reaches the disk - and a bookmark is a disk. The count of what was left out
   * comes back so it can be said plainly rather than discovered later.
   *
   * A page already bookmarked is filed where it is, not saved again. It keeps
   * the title and date it had, because neither is what this was asked to change.
   */
  saveAsFolder(id: string): { saved: number; skippedHush: number } {
    const group = this.deps.store.groupFor(id);
    if (!group) {
      return { saved: 0, skippedHush: 0 };
    }

    const folder = this.deps.store.createBookmarkFolder(group.name, group.colour, null);
    let saved = 0;
    let skippedHush = 0;

    for (const tab of this.deps.tabs.tabsInGroup(id)) {
      if (tab.isHush) {
        skippedHush += 1;
        continue;
      }
      // Not toggled: a tab whose page was already bookmarked would have had
      // that bookmark deleted, and the count would not even have said so.
      const bookmark = this.deps.store.ensureBookmark(tab.url, tab.title);
      this.deps.store.fileBookmark(bookmark.id, folder.id);
      saved += 1;
    }

    this.deps.bookmarks.changed();
    this.deps.changed();
    this.deps.notices.notify({
      id: `saved-group-${folder.id}`,
      tone: skippedHush > 0 ? 'info' : 'done',
      key: 'saved-group',
      message: savedGroupMessage(saved, skippedHush, folder.name),
    });
    return { saved, skippedHush };
  }

  update(id: string, changes: { name?: string; colour?: GroupColourId; collapsed?: boolean }): void {
    // A collapsed group hides its tabs, and one of them may be the tab being
    // looked at - its page would stay on screen with nothing in the strip
    // pointing at it. Activation steps out of the group first, and the group
    // refuses to collapse at all when there is nowhere for it to step to.
    if (changes.collapsed === true && !this.deps.tabs.leaveCollapsingGroup(id)) {
      return;
    }
    this.deps.store.updateGroup(id, changes);
    this.deps.changed();
  }

  /** The group goes; its tabs stay open with nothing to belong to. */
  remove(id: string): void {
    for (const tab of this.deps.tabs.tabsInGroup(id)) {
      this.deps.tabs.setGroup(tab.id, null);
    }
    this.deps.store.removeGroup(id);
    this.deps.changed();
  }

  /** Closes everything in a group and the group with it, including its own session's data. */
  close(id: string): void {
    const hadOwnSession = this.deps.store.groupFor(id)?.ownSession === true;
    for (const tab of this.deps.tabs.tabsInGroup(id)) {
      this.deps.tabs.close(tab.id);
    }
    this.deps.store.removeGroup(id);
    if (hadOwnSession) {
      void this.deps.sessions.clearGroup(id);
    }
    this.deps.changed();
  }

  setForTab(tabId: TabId, groupId: string | null): void {
    this.deps.tabs.setGroup(tabId, groupId);
    this.deps.changed();
  }

  /** Asks the chrome to put the group's name into an editable field in the strip. */
  rename(id: string): void {
    this.deps.push(PUSH.renameGroup, id);
  }
}
