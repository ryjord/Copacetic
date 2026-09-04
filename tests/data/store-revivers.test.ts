import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { reviveFavicons } = await import('../../electron/main/data/favicons-store');
const { SESSION_PLAN, reviveSession } = await import('../../electron/main/data/session-store');
const { migrate } = await import('../../electron/main/data/schema');
const { BOOKMARKS_PLAN, reviveBookmarks } = await import('../../electron/main/data/bookmarks-store');
const { reviveFolders } = await import('../../electron/main/data/bookmark-folders-store');
const { reviveGroups } = await import('../../electron/main/data/groups-store');
const { GROUP_COLOURS } = await import('../../electron/shared/tab-groups');

/**
 * These files are read off disk at startup and can be edited, corrupted, or
 * written by something else entirely. Every rule here was in the code and none
 * of it was tested, so a rewrite could quietly drop one — which is exactly what
 * happened while splitting the store apart.
 */
describe('the favicon cache, read back off disk', () => {
  /**
   * Only data URLs are ever cached. A remote URL here would make the chrome
   * renderer fetch from the network, which it must never do — and the chrome is
   * the privileged window, not a page.
   */
  it.each([
    ['a remote image', 'https://tracker.test/pixel.png'],
    ['a protocol-relative url', '//tracker.test/pixel.png'],
    ['a file on disk', 'file:///etc/passwd'],
    ['a script url', 'javascript:alert(1)'],
    ['a non-image data url', 'data:text/html,<script>alert(1)</script>'],
  ])('refuses %s', (_name, dataUrl) => {
    expect(reviveFavicons({ 'https://a.test': { dataUrl, updatedAt: 1 } })).toEqual({});
  });

  it('keeps a real cached image', () => {
    const revived = reviveFavicons({ 'https://a.test': { dataUrl: 'data:image/png;base64,AA', updatedAt: 7 } });
    expect(revived).toEqual({ 'https://a.test': { dataUrl: 'data:image/png;base64,AA', updatedAt: 7 } });
  });

  it('refuses anything that is not a record', () => {
    expect(reviveFavicons([])).toBeNull();
  });
});

describe('the saved session, read back off disk', () => {
  const tabs = (...urls: string[]) => urls.map((url) => ({ url, groupId: null }));

  // An index past the end would select a tab that does not exist.
  it('clamps the active index to the tabs that are actually there', () => {
    expect(reviveSession({ tabs: tabs('a', 'b'), activeIndex: 99 })?.activeIndex).toBe(1);
    expect(reviveSession({ tabs: tabs('a', 'b'), activeIndex: -5 })?.activeIndex).toBe(0);
  });

  it('copes with no tabs at all', () => {
    expect(reviveSession({ tabs: [], activeIndex: 3 })).toEqual({ tabs: [], activeIndex: 0 });
  });

  it('drops entries with no address', () => {
    expect(
      reviveSession({ tabs: [{ url: 'a' }, { url: '' }, 42, null, { url: 'b' }], activeIndex: 0 })?.tabs,
    ).toEqual(tabs('a', 'b'));
  });

  it('keeps which group each tab was in', () => {
    expect(reviveSession({ tabs: [{ url: 'a', groupId: 'g1' }], activeIndex: 0 })?.tabs).toEqual([
      { url: 'a', groupId: 'g1' },
    ]);
  });

  it('treats a group id that is not a string as no group', () => {
    expect(reviveSession({ tabs: [{ url: 'a', groupId: 42 }], activeIndex: 0 })?.tabs).toEqual([
      { url: 'a', groupId: null },
    ]);
  });
});

/**
 * The first time a stored file has changed shape. A session written by 1.3
 * lists bare addresses; this one lists tabs that remember their group.
 */
describe('a session written by an older version', () => {
  const migrated = (raw: unknown) => migrate(raw, 1, SESSION_PLAN);

  it('is brought forward rather than discarded', () => {
    const outcome = migrated({ urls: ['https://a.test/', 'https://b.test/'], activeIndex: 1 });

    expect(outcome.status).toBe('migrated');
    expect(outcome.status === 'migrated' && outcome.data).toEqual({
      tabs: [
        { url: 'https://a.test/', groupId: null },
        { url: 'https://b.test/', groupId: null },
      ],
      activeIndex: 1,
    });
  });

  it('survives the trip through the reviver', () => {
    const outcome = migrated({ urls: ['https://a.test/'], activeIndex: 0 });
    expect(reviveSession(outcome.status === 'migrated' ? outcome.data : null)?.tabs).toEqual([
      { url: 'https://a.test/', groupId: null },
    ]);
  });

  it('copes with an old file that had nothing in it', () => {
    const outcome = migrated({ urls: [], activeIndex: 0 });
    expect(outcome.status === 'migrated' && outcome.data).toEqual({ tabs: [], activeIndex: 0 });
  });
});

describe('bookmarks, read back off disk', () => {
  // A bookmark with no address is a row that can never be opened.
  it.each([[''], [42], [null], [undefined]])('drops an entry whose url is %o', (url) => {
    expect(reviveBookmarks([{ id: 'a', url, title: 'x', createdAt: 1 }])).toEqual([]);
  });

  it('falls back to the url when there is no title', () => {
    expect(reviveBookmarks([{ url: 'https://a.test/x' }])?.[0]?.title).toBe('https://a.test/x');
  });

  it('gives an entry an id when the file has none', () => {
    expect(reviveBookmarks([{ url: 'https://a.test/x' }])?.[0]?.id).toBeTruthy();
  });
});

/**
 * A folder that cannot be read back is a folder full of bookmarks nobody can
 * reach, so every field falls back rather than dropping the folder — except the
 * id, which is the only thing a bookmark refers to it by.
 */
describe('bookmark folders, read back off disk', () => {
  it('reads a folder written by this build', () => {
    expect(reviveFolders([{ id: 'f1', name: 'Work', colour: 'violet', parentId: null, collapsed: false }])).toEqual([
      { id: 'f1', name: 'Work', colour: 'violet', parentId: null, collapsed: false },
    ]);
  });

  it('refuses a file that is not a list', () => {
    expect(reviveFolders({ id: 'f1' })).toBeNull();
  });

  it('drops an entry with no id, because nothing could be filed in it', () => {
    expect(reviveFolders([{ name: 'Nameless' }, { id: 'f1', name: 'Work' }])).toHaveLength(1);
  });

  // The same fallback groups use, rather than a second opinion about it.
  it('keeps a folder whose colour this build does not have', () => {
    const [folder] = reviveFolders([{ id: 'f1', name: 'Work', colour: 'chartreuse' }]) ?? [];
    expect(folder?.colour).toBe(GROUP_COLOURS[0].id);
  });

  it('files a folder whose parent is not in the file at the top level', () => {
    // Otherwise it is neither a root nor anybody's child, and it and everything
    // under it vanish from every view while staying on disk.
    const folders = reviveFolders([
      { id: 'child', name: 'Child', parentId: 'gone' },
      { id: 'kept', name: 'Kept', parentId: 'child' },
    ]);
    expect(folders?.find((entry) => entry.id === 'child')?.parentId).toBeNull();
    expect(folders?.find((entry) => entry.id === 'kept')?.parentId).toBe('child');
  });

  it('names an unnamed folder rather than showing a blank row', () => {
    const [folder] = reviveFolders([{ id: 'f1', name: '   ' }]) ?? [];
    expect(folder?.name).toBe('Folder');
  });

  it('clamps a name long enough to break the row it is drawn in', () => {
    const [folder] = reviveFolders([{ id: 'f1', name: 'x'.repeat(400) }]) ?? [];
    expect(folder?.name).toHaveLength(60);
  });

  it('treats a non-string parent as the top level', () => {
    const [folder] = reviveFolders([{ id: 'f1', name: 'Work', parentId: 12 }]) ?? [];
    expect(folder?.parentId).toBeNull();
  });

  it('treats anything but true as not collapsed, so nothing hides itself', () => {
    const [folder] = reviveFolders([{ id: 'f1', name: 'Work', collapsed: 'yes' }]) ?? [];
    expect(folder?.collapsed).toBe(false);
  });
});

/**
 * Every bookmark saved before folders existed is filed in none of them, which
 * is what the interface calls Unfiled — not a state anyone has to be told about.
 */
describe('bookmarks written by an older version', () => {
  const migrated = (raw: unknown) => migrate(raw, 1, BOOKMARKS_PLAN);

  it('files every old bookmark nowhere', () => {
    const outcome = migrated([
      { id: 'b1', url: 'https://example.com/', title: 'Example', createdAt: 5, folderId: null },
    ]);
    expect(outcome.status).toBe('migrated');
    expect(outcome.status === 'migrated' && outcome.data).toEqual([
      { id: 'b1', url: 'https://example.com/', title: 'Example', createdAt: 5, folderId: null },
    ]);
  });

  it('keeps what the old file already said', () => {
    const outcome = migrated([
      { id: 'b1', url: 'https://example.com/', title: 'Kept', createdAt: 5, folderId: null },
    ]);
    const [first] = outcome.status === 'migrated' ? (outcome.data as { title: string }[]) : [];
    expect(first?.title).toBe('Kept');
  });

  it('survives a file that is not a list at all', () => {
    expect(() => migrated({ bookmarks: 'nope' })).not.toThrow();
  });

  it('leaves entries it cannot read for the reviver to drop', () => {
    const outcome = migrated(['not-a-bookmark', { id: 'b1', url: 'https://example.com/' }]);
    const data = outcome.status === 'migrated' ? outcome.data : [];
    expect(Array.isArray(data) && data).toHaveLength(2);
    expect(reviveBookmarks(data)).toHaveLength(1);
  });

  it('does nothing to a file already at this version', () => {
    const current = [{ id: 'b1', url: 'https://example.com/', title: 'Example', createdAt: 5, folderId: 'f1' }];
    expect(migrate(current, 2, BOOKMARKS_PLAN)).toEqual({ status: 'current', data: current });
  });
});

describe('a bookmark filed somewhere, read back off disk', () => {
  it('keeps the folder it was filed in', () => {
    const [bookmark] = reviveBookmarks([{ id: 'b1', url: 'https://example.com/', folderId: 'f1' }]) ?? [];
    expect(bookmark?.folderId).toBe('f1');
  });

  it('treats a non-string folder as unfiled rather than dropping the bookmark', () => {
    const [bookmark] = reviveBookmarks([{ id: 'b1', url: 'https://example.com/', folderId: 42 }]) ?? [];
    expect(bookmark?.folderId).toBeNull();
  });
});

/**
 * A group that cannot be read back is a run of tabs with no name and no colour,
 * and — worse — a session that may have been kept separate losing the fact that
 * it was. Every field falls back rather than dropping the group, except the id,
 * which is the only thing a tab refers to it by.
 */
describe('tab groups, read back off disk', () => {
  it('reads a group written by this build', () => {
    const groups = reviveGroups([{ id: 'g1', name: 'Work', colour: 'violet', ownSession: true, collapsed: false }]);
    expect(groups).toEqual([{ id: 'g1', name: 'Work', colour: 'violet', ownSession: true, collapsed: false }]);
  });

  it('refuses a file that is not a list', () => {
    expect(reviveGroups({ id: 'g1' })).toBeNull();
  });

  it('drops an entry with no id, because no tab could point at it', () => {
    expect(reviveGroups([{ name: 'Nameless' }, { id: 'g1', name: 'Work' }])).toHaveLength(1);
  });

  it('keeps a group whose colour this build does not have', () => {
    const [group] = reviveGroups([{ id: 'g1', name: 'Work', colour: 'chartreuse' }]) ?? [];
    expect(group?.colour).toBe(GROUP_COLOURS[0].id);
  });

  /*
   * The dangerous direction is only one way round. A group that kept its own
   * browsing and is read back as sharing would put its tabs in the ordinary
   * session — signing someone into pages they had deliberately kept apart — so
   * anything but a literal true has to mean false.
   */
  it('treats anything but true as sharing, never the other way round', () => {
    const [shared] = reviveGroups([{ id: 'g1', name: 'Work', ownSession: 'yes' }]) ?? [];
    expect(shared?.ownSession).toBe(false);
    const [separate] = reviveGroups([{ id: 'g2', name: 'Work', ownSession: true }]) ?? [];
    expect(separate?.ownSession).toBe(true);
  });

  it('treats anything but true as not collapsed, so nothing hides itself', () => {
    const [group] = reviveGroups([{ id: 'g1', name: 'Work', collapsed: 'yes' }]) ?? [];
    expect(group?.collapsed).toBe(false);
  });
});

/**
 * The migration reads whatever is on disk, which is not always what this build
 * last wrote: a file can be hand-edited, truncated by a full disk, or written by
 * a version that never existed. It has to survive all of it.
 */
describe('a session file that is not what it should be', () => {
  const migrated = (raw: unknown) => migrate(raw, 1, SESSION_PLAN);

  it('survives a file that is not a record at all', () => {
    expect(() => migrated('nonsense')).not.toThrow();
    expect(() => migrated(null)).not.toThrow();
    expect(() => migrated([1, 2, 3])).not.toThrow();
  });

  it('survives urls being the wrong shape entirely', () => {
    expect(() => migrated({ urls: 'https://example.com/' })).not.toThrow();
    expect(() => migrated({ urls: null })).not.toThrow();
  });

  it('keeps the addresses it can read and drops the ones it cannot', () => {
    const outcome = migrated({ urls: ['https://example.com/', 42, null, 'https://two.example/'], activeIndex: 0 });
    const data = outcome.status === 'migrated' ? (outcome.data as { tabs: unknown[] }) : { tabs: [] };
    expect(data.tabs).toHaveLength(2);
  });
});
