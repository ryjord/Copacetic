import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_UNDO_DIR } }));

const { BrowserStore } = await import('../../../../electron/main/data/store');

let store: InstanceType<typeof BrowserStore>;

beforeEach(() => {
  process.env.COPA_UNDO_DIR = mkdtempSync(path.join(tmpdir(), 'copacetic-undo-'));
  store = new BrowserStore();
});

describe('putting back what was removed', () => {
  it('returns a bookmark to its place among the others', () => {
    store.toggleBookmark('https://one.example/', 'One');
    store.toggleBookmark('https://two.example/', 'Two');
    store.toggleBookmark('https://three.example/', 'Three');
    const middle = store.listBookmarks()[1];
    const snapshot = store.bookmarkSnapshot(middle?.id ?? '');
    store.removeBookmark(middle?.id ?? '');
    store.restoreBookmark(snapshot!);
    expect(store.listBookmarks().map((bookmark) => bookmark.title)).toEqual(['Three', 'Two', 'One']);
  });

  it('unfiles a bookmark whose folder was deleted since', () => {
    const folder = store.createBookmarkFolder('Reading', 'ocean', null);
    store.toggleBookmark('https://one.example/', 'One');
    const [bookmark] = store.listBookmarks();
    store.fileBookmark(bookmark?.id ?? '', folder.id);
    const snapshot = store.bookmarkSnapshot(bookmark?.id ?? '');
    store.removeBookmark(bookmark?.id ?? '');
    store.deleteBookmarkFolder(folder.id);
    store.restoreBookmark(snapshot!);
    expect(store.listBookmarks()[0]?.folderId).toBeNull();
  });

  it('returns a history entry with its counts', () => {
    store.recordVisit('https://news.example/', 'News');
    const [entry] = store.listHistory().entries;
    store.removeHistory(entry?.id ?? '');
    expect(store.listHistory().entries).toHaveLength(0);
    store.restoreHistory(entry!);
    expect(store.listHistory().entries[0]).toMatchObject({
      url: 'https://news.example/',
      visitCount: entry?.visitCount,
    });
  });

  it('leaves an entry gone once it is older than history is kept', () => {
    store.recordVisit('https://old.example/', 'Old');
    const [entry] = store.listHistory().entries;
    store.removeHistory(entry?.id ?? '');
    store.restoreHistory({ ...entry!, lastVisitedAt: store.historyKeptSince() - 1 });
    expect(store.listHistory().entries).toHaveLength(0);
  });

  it('returns a saved session, and a start page tile or hidden site', () => {
    const saved = store.saveNamedSession('Work', [{ url: 'https://a.example/', title: 'A' }]);
    const tabs = store.namedSessionTabs(saved.id);
    store.removeNamedSession(saved.id);
    store.restoreNamedSession(saved, tabs);
    expect(store.namedSessionTabs(saved.id)).toEqual(tabs);

    store.recordVisit('https://often.example/', 'Often');
    const undoHide = store.removeStartTile('https://often.example/');
    expect(store.hiddenStartSites()).toEqual(['often.example']);
    undoHide();
    expect(store.hiddenStartSites()).toEqual([]);
  });
});
