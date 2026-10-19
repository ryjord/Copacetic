// Libs
import { homedir } from 'node:os';

// Utils
import { bookmarksFromHtml } from '../../shared/bookmark-import';
import { credentialsFromCsv, credentialsToCsv } from '../../shared/credential-csv';
import { fileStamp, readChosenFile, writeChosenFile } from '../system/file-dialogs';
import { bookmarksToHtml, historyToJson } from '../data/export';
import { MAX_HISTORY_AGE_MS, MAX_HISTORY_ENTRIES } from '../data/history-store';
import { findReadableProfiles } from '../import/browser-profiles';
import { visitsFromHistoryFile } from '../import/history-file';
import { describeError, log } from '../system/diagnostics';
import { t } from '../../shared/i18n/translate';

// Types
import type { BrowserWindow } from 'electron';
import type { ExportKind, ImportSource } from '../../shared/types';
import type { VaultSession } from '../vault/vault-session';
import type { Machine } from '../import/chromium-profiles';
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
      return t('main.import.passwords.exportLocked');
    }

    const { credentials, unreadable } = this.deps.vaultSession.vault.exportAll();
    if (credentials.length === 0) {
      return unreadable > 0
        ? t('main.import.passwords.noneReadable', { count: unreadable })
        : t('main.import.passwords.nothingToExport');
    }

    const written = await writeChosenFile(
      this.deps.window,
      {
        title: t('main.import.passwords.exportTitle'),
        defaultPath: `copacetic-passwords-${fileStamp(Date.now())}.csv`,
        filters: [{ name: t('main.import.fileTypes.passwords'), extensions: ['csv'] }],
      },
      () => credentialsToCsv(credentials),
    );
    if (written.value === null) {
      return written.message;
    }

    // A short count has to be explained, or it reads as everything.
    return unreadable > 0
      ? t('main.import.passwords.exportedShort', { written: credentials.length, unreadable })
      : '';
  }

  /** Reads the bookmark file every browser exports, for the ones whose profiles are not read directly. */
  async importBookmarks(): Promise<string> {
    const chosen = await readChosenFile(this.deps.window, {
      title: t('main.import.bookmarks.title'),
      filters: [{ name: t('main.import.fileTypes.bookmarks'), extensions: ['html', 'htm'] }],
    });
    if (chosen.value === null) {
      return chosen.message;
    }
    const html = chosen.value;

    const { bookmarks, skipped } = bookmarksFromHtml(html);
    if (bookmarks.length === 0) {
      return skipped > 0
        ? t('main.import.bookmarks.nothingImportable', { count: skipped })
        : t('main.import.bookmarks.none');
    }

    const { added, alreadyHad } = this.deps.store.importBookmarks(bookmarks, t('main.import.bookmarks.folderName'));
    // An import adds bookmarks without touching a tab, so nothing else would
    // tell a surface that is already open that its list is now wrong.
    this.deps.bookmarks.changed();
    this.deps.changed();

    const parts = [t('main.import.bookmarks.added', { count: added })];
    if (alreadyHad > 0) {
      parts.push(t('main.import.bookmarks.alreadyHad', { count: alreadyHad }));
    }
    if (skipped > 0) {
      parts.push(t('main.import.bookmarks.refused', { count: skipped }));
    }
    return t('main.import.summary', { parts: parts.join(', ') });
  }

  /** Reads the history file Copacetic exports, from this machine or another. */
  async importHistory(): Promise<string> {
    const chosen = await readChosenFile(this.deps.window, {
      title: t('main.import.history.title'),
      filters: [{ name: t('main.import.fileTypes.history'), extensions: ['json'] }],
    });
    if (chosen.value === null) {
      return chosen.message;
    }
    const read = visitsFromHistoryFile(chosen.value);
    if (!read) {
      return t('main.import.history.notOurs');
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
    const parts = [t('main.import.history.added', { count: added })];
    if (older > 0) {
      parts.push(t('main.import.history.older', { count: older }));
    }
    if (read.skipped > 0) {
      parts.push(t('main.import.history.notAddresses', { count: read.skipped }));
    }
    return t('main.import.summary', { parts: parts.join(', ') });
  }

  /** The renderer is told names and ids only; where each profile lives stays here. */
  importSources(): ImportSource[] {
    return findReadableProfiles(THIS_MACHINE()).map((profile) => ({ id: profile.id, label: profile.label }));
  }

  /** Bookmarks and the history this browser keeps, from another browser's profile. Passwords stay where they are. */
  importFromBrowser(sourceId: string): string {
    const source = findReadableProfiles(THIS_MACHINE()).find((profile) => profile.id === sourceId);
    if (!source) {
      return t('main.import.browser.gone');
    }

    const parts: string[] = [];
    try {
      const read = source.readBookmarks();
      if (read) {
        const { added, alreadyHad } = this.deps.store.importBookmarks(
          read.bookmarks,
          t('main.import.browser.folderName', { source: source.label }),
        );
        const counted = t('main.notices.bookmarks', { count: added });
        parts.push(
          alreadyHad > 0 ? t('main.import.browser.countedWithExisting', { counted, count: alreadyHad }) : counted,
        );
      }
    } catch (error) {
      log.warn('could not read bookmarks to import', describeError(error));
      parts.push(t('main.import.browser.bookmarksUnreadable'));
    }

    try {
      const visits = source.readHistory({ since: Date.now() - MAX_HISTORY_AGE_MS, limit: MAX_HISTORY_ENTRIES });
      if (visits) {
        const { added } = this.deps.store.importHistory(visits);
        parts.push(t('main.import.browser.historyPages', { count: added }));
      }
    } catch (error) {
      log.warn('could not read history to import', describeError(error));
      parts.push(t('main.import.browser.historyUnreadable'));
    }

    this.deps.bookmarks.changed();
    this.deps.changed();
    return parts.length > 0
      ? t('main.import.browser.summary', { source: source.label, parts: parts.join(', and ') })
      : t('main.import.browser.nothing', { source: source.label });
  }

  async importPasswords(): Promise<string> {
    const chosen = await readChosenFile(this.deps.window, {
      title: t('main.import.passwords.importTitle'),
      filters: [{ name: t('main.import.fileTypes.passwords'), extensions: ['csv'] }],
    });
    if (chosen.value === null) {
      return chosen.message;
    }
    const text = chosen.value;

    const { credentials, skipped: unusable } = credentialsFromCsv(text);
    if (credentials.length === 0) {
      return t('main.import.passwords.none');
    }

    const { added, updated, skipped } = this.deps.vaultSession.vault.importMany(credentials);
    const parts = [];
    if (added > 0) {
      parts.push(t('main.import.passwords.added', { count: added }));
    }
    if (updated > 0) {
      parts.push(t('main.import.passwords.updated', { count: updated }));
    }
    const ignored = skipped + unusable;
    if (ignored > 0) {
      parts.push(t('main.import.passwords.ignored', { count: ignored }));
    }
    return parts.length > 0
      ? t('main.import.summary', { parts: parts.join(', ') })
      : t('main.import.passwords.nothingImportable');
  }

  async exportData(kind: ExportKind): Promise<string> {
    const now = Date.now();
    const stamp = fileStamp(now);
    const isBookmarks = kind === 'bookmarks';

    const written = await writeChosenFile(
      this.deps.window,
      {
        title: isBookmarks ? t('main.import.bookmarks.exportTitle') : t('main.import.history.exportTitle'),
        defaultPath: isBookmarks ? `copacetic-bookmarks-${stamp}.html` : `copacetic-history-${stamp}.json`,
        filters: isBookmarks
          ? [{ name: t('main.import.fileTypes.bookmarks'), extensions: ['html'] }]
          : [{ name: t('main.import.fileTypes.history'), extensions: ['json'] }],
      },
      () =>
        isBookmarks
          ? bookmarksToHtml(this.deps.store.listBookmarks(), now, this.deps.store.listBookmarkFolders())
          : historyToJson(this.deps.store.allHistory(), now),
    );
    return written.value === null ? written.message : '';
  }
}
