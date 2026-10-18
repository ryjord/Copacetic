import type { BrowserWindow } from 'electron';
import { bookmarksFromHtml } from '../../shared/bookmark-import';
import { credentialsFromCsv, credentialsToCsv } from '../../shared/credential-csv';
import type { ExportKind } from '../../shared/types';
import { fileStamp, readChosenFile, writeChosenFile } from '../app/file-dialogs';
import type { VaultSession } from '../app/vault-session';
import { bookmarksToHtml, historyToJson } from '../data/export';
import type { BrowserStore } from '../data/store';
import type { BookmarkCommands } from './bookmarks';

interface DataTransferDeps {
  window: BrowserWindow;
  store: BrowserStore;
  vaultSession: VaultSession;
  bookmarks: BookmarkCommands;
  changed: () => void;
}

/** Everything that goes to or comes from a file the person chooses. */
export class DataTransfer {
  constructor(private readonly deps: DataTransferDeps) {}

  async exportPasswords(): Promise<string> {
    if (!this.deps.vaultSession.isOpen()) {
      return 'Your vault is locked. Unlock it, then try exporting again.';
    }

    const { credentials, unreadable } = this.deps.vaultSession.vault.exportAll();
    if (credentials.length === 0) {
      return unreadable > 0
        ? `None of your ${unreadable} saved passwords could be decrypted on this machine, so there was nothing to write.`
        : 'There are no saved passwords to export.';
    }

    const written = await writeChosenFile(
      this.deps.window,
      {
        title: 'Export passwords',
        defaultPath: `copacetic-passwords-${fileStamp(Date.now())}.csv`,
        filters: [{ name: 'Passwords', extensions: ['csv'] }],
      },
      () => credentialsToCsv(credentials),
    );
    if (written.value === null) {
      return written.message;
    }

    // A short count has to be explained, or it reads as everything.
    return unreadable > 0
      ? `Wrote ${credentials.length}. ${unreadable} could not be decrypted on this machine and were left out.`
      : '';
  }

  /**
   * Reads the bookmark file every browser exports. Reading a live Chrome or
   * Firefox database would mean shipping a SQLite dependency inside the app for
   * a once-ever operation; this needs nothing and works for all of them.
   */
  async importBookmarks(): Promise<string> {
    const chosen = await readChosenFile(this.deps.window, {
      title: 'Import bookmarks',
      filters: [{ name: 'Bookmarks', extensions: ['html', 'htm'] }],
    });
    if (chosen.value === null) {
      return chosen.message;
    }
    const html = chosen.value;

    const { bookmarks, skipped } = bookmarksFromHtml(html);
    if (bookmarks.length === 0) {
      return skipped > 0
        ? `Nothing in that file could be imported. ${skipped} entries were not ordinary web addresses.`
        : 'No bookmarks were found in that file.';
    }

    const { added, alreadyHad } = this.deps.store.addBookmarks(bookmarks);
    // An import adds bookmarks without touching a tab, so nothing else would
    // tell a surface that is already open that its list is now wrong.
    this.deps.bookmarks.changed();
    this.deps.changed();

    const parts = [`added ${added}`];
    if (alreadyHad > 0) {
      parts.push(`${alreadyHad} you already had`);
    }
    if (skipped > 0) {
      parts.push(`${skipped} refused for not being web addresses`);
    }
    return `Imported: ${parts.join(', ')}.`;
  }

  async importPasswords(): Promise<string> {
    const chosen = await readChosenFile(this.deps.window, {
      title: 'Import passwords',
      filters: [{ name: 'Passwords', extensions: ['csv'] }],
    });
    if (chosen.value === null) {
      return chosen.message;
    }
    const text = chosen.value;

    const { credentials, skipped: unusable } = credentialsFromCsv(text);
    if (credentials.length === 0) {
      return 'No passwords were found in that file. It needs a header row naming a url and a password column.';
    }

    const { added, updated, skipped } = this.deps.vaultSession.vault.importMany(credentials);
    const parts = [];
    if (added > 0) {
      parts.push(`added ${added}`);
    }
    if (updated > 0) {
      parts.push(`updated ${updated}`);
    }
    const ignored = skipped + unusable;
    if (ignored > 0) {
      parts.push(`ignored ${ignored} that had no site or no password`);
    }
    return parts.length > 0 ? `Imported: ${parts.join(', ')}.` : 'Nothing in that file could be imported.';
  }

  async exportData(kind: ExportKind): Promise<string> {
    const now = Date.now();
    const stamp = fileStamp(now);
    const isBookmarks = kind === 'bookmarks';

    const written = await writeChosenFile(
      this.deps.window,
      {
        title: isBookmarks ? 'Export bookmarks' : 'Export history',
        defaultPath: isBookmarks ? `copacetic-bookmarks-${stamp}.html` : `copacetic-history-${stamp}.json`,
        filters: isBookmarks
          ? [{ name: 'Bookmarks', extensions: ['html'] }]
          : [{ name: 'History', extensions: ['json'] }],
      },
      () =>
        isBookmarks
          ? bookmarksToHtml(this.deps.store.listBookmarks(), now, this.deps.store.listBookmarkFolders())
          : historyToJson(this.deps.store.allHistory(), now),
    );
    return written.value === null ? written.message : '';
  }
}
