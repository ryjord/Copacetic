import type { BrowserWindow } from 'electron';
import { homedir } from 'node:os';
import { bookmarksFromHtml } from '../../shared/bookmark-import';
import { credentialsFromCsv, credentialsToCsv } from '../../shared/credential-csv';
import type { ExportKind, ImportSource } from '../../shared/types';
import { fileStamp, readChosenFile, writeChosenFile } from '../system/file-dialogs';
import type { VaultSession } from '../vault/vault-session';
import { bookmarksToHtml, historyToJson } from '../data/export';
import { MAX_HISTORY_AGE_MS, MAX_HISTORY_ENTRIES } from '../data/history-store';
import { findReadableProfiles } from '../import/browser-profiles';
import { visitsFromHistoryFile } from '../import/history-file';
import type { Machine } from '../import/chromium-profiles';
import { describeError, log } from '../system/diagnostics';
import type { BrowserStore } from '../data/store';
import type { BookmarkCommands } from './bookmarks';

interface DataTransferDeps {
  window: BrowserWindow;
  store: BrowserStore;
  vaultSession: VaultSession;
  bookmarks: BookmarkCommands;
  changed: () => void;
}

const THIS_MACHINE = (): Machine => ({ platform: process.platform, home: homedir(), env: process.env });

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

  /** Reads the bookmark file every browser exports, for the ones whose profiles are not read directly. */
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

    const { added, alreadyHad } = this.deps.store.importBookmarks(bookmarks, 'Imported bookmarks');
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

  /** Reads the history file Copacetic exports, from this machine or another. */
  async importHistory(): Promise<string> {
    const chosen = await readChosenFile(this.deps.window, {
      title: 'Import history',
      filters: [{ name: 'History', extensions: ['json'] }],
    });
    if (chosen.value === null) {
      return chosen.message;
    }
    const read = visitsFromHistoryFile(chosen.value);
    if (!read) {
      return 'That is not a history file Copacetic exported.';
    }
    // Only what history would still be keeping, newest first, the same bounds as any other import.
    const since = Date.now() - MAX_HISTORY_AGE_MS;
    const recent = read.visits
      .filter((visit) => visit.lastVisitedAt >= since)
      .sort((aVisit, bVisit) => bVisit.lastVisitedAt - aVisit.lastVisitedAt)
      .slice(0, MAX_HISTORY_ENTRIES);
    const { added } = this.deps.store.importHistory(recent);
    this.deps.changed();
    const older = read.visits.length - recent.length;
    const parts = [`added ${added} ${added === 1 ? 'page' : 'pages'}`];
    if (older > 0) {
      parts.push(`${older} older than history keeps`);
    }
    if (read.skipped > 0) {
      parts.push(`${read.skipped} that were not web addresses`);
    }
    return `Imported: ${parts.join(', ')}.`;
  }

  /** The renderer is told names and ids only; where each profile lives stays here. */
  importSources(): ImportSource[] {
    return findReadableProfiles(THIS_MACHINE()).map((profile) => ({ id: profile.id, label: profile.label }));
  }

  /** Bookmarks and the history this browser keeps, from another browser's profile. Passwords stay where they are. */
  importFromBrowser(sourceId: string): string {
    const source = findReadableProfiles(THIS_MACHINE()).find((profile) => profile.id === sourceId);
    if (!source) {
      return 'That browser is no longer on this computer.';
    }

    const parts: string[] = [];
    try {
      const read = source.readBookmarks();
      if (read) {
        const { added, alreadyHad } = this.deps.store.importBookmarks(
          read.bookmarks,
          `Imported from ${source.label}`,
        );
        const counted = `${added} ${added === 1 ? 'bookmark' : 'bookmarks'}`;
        parts.push(alreadyHad > 0 ? `${counted} (${alreadyHad} you already had)` : counted);
      }
    } catch (error) {
      log.warn('could not read bookmarks to import', describeError(error));
      parts.push('no bookmarks, as its bookmarks could not be read');
    }

    try {
      const visits = source.readHistory({ since: Date.now() - MAX_HISTORY_AGE_MS, limit: MAX_HISTORY_ENTRIES });
      if (visits) {
        const { added } = this.deps.store.importHistory(visits);
        parts.push(`${added} ${added === 1 ? 'page' : 'pages'} of history`);
      }
    } catch (error) {
      log.warn('could not read history to import', describeError(error));
      parts.push('no history, as its history could not be read');
    }

    this.deps.bookmarks.changed();
    this.deps.changed();
    return parts.length > 0
      ? `From ${source.label}: ${parts.join(', and ')}.`
      : `${source.label} had nothing to import.`;
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
