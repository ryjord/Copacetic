import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { reviveFavicons } = await import('../../../../electron/main/data/favicons-store');
const { SESSION_PLAN, reviveSession } = await import('../../../../electron/main/data/session-store');
const { migrate } = await import('../../../../electron/main/data/schema');
const { reviveBookmarks } = await import('../../../../electron/main/data/bookmarks-store');
const { reviveFolders } = await import('../../../../electron/main/data/bookmark-folders-store');
const { reviveGroups } = await import('../../../../electron/main/data/groups-store');
const { GROUP_COLOURS } = await import('../../../../electron/shared/tabs/tab-groups');

/**
 * These files are read off disk at startup and can be edited, corrupted, or
 * written by something else entirely. Every rule here was in the code and none
 * of it was tested, so a rewrite could quietly drop one - which is exactly what
 * happened while splitting the store apart.
 */
describe('the favicon cache, read back off disk', () => {
  /**
   * Only data URLs are ever cached. A remote URL here would make the chrome
   * renderer fetch from the network, which it must never do - and the chrome is
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
  // One window's worth, which is what each of these is about.
  const oneWindow = (window: unknown) => reviveSession({ windows: [window] })?.windows[0];

  // A position is two whole numbers in range; anything else in the file is dropped rather than scrolled to.
  it('brings back a scroll position only when it is one', () => {
    const scrollOf = (scroll: unknown) =>
      oneWindow({ tabs: [{ url: 'https://a.example/', scroll }] })?.tabs[0]?.scroll;
    expect(scrollOf({ x: 0, y: 2400 })).toEqual({ x: 0, y: 2400 });
    expect(scrollOf({ x: -1, y: 2400 })).toBeUndefined();
    expect(scrollOf({ x: 0, y: 1e12 })).toBeUndefined();
    expect(scrollOf({ x: 0, y: '2400' })).toBeUndefined();
    expect(scrollOf({ x: 0, y: 0 })).toBeUndefined();
    expect(scrollOf(null)).toBeUndefined();
  });

  // An index past the end would select a tab that does not exist.
  it('clamps the active index to the tabs that are actually there', () => {
    expect(oneWindow({ tabs: tabs('a', 'b'), activeIndex: 99 })?.activeIndex).toBe(1);
    expect(oneWindow({ tabs: tabs('a', 'b'), activeIndex: -5 })?.activeIndex).toBe(0);
  });

  it('brings a split back only when it names two different tabs that are there', () => {
    expect(
      oneWindow({ tabs: tabs('a', 'b'), activeIndex: 0, split: { leftIndex: 0, rightIndex: 1, ratio: 0.3 } })?.split,
    ).toEqual({ leftIndex: 0, rightIndex: 1, ratio: 0.3 });
    expect(
      oneWindow({ tabs: tabs('a', 'b'), activeIndex: 0, split: { leftIndex: 0, rightIndex: 5, ratio: 0.3 } })?.split,
    ).toBeUndefined();
    expect(
      oneWindow({ tabs: tabs('a', 'b'), activeIndex: 0, split: { leftIndex: 1, rightIndex: 1, ratio: 0.3 } })?.split,
    ).toBeUndefined();
    expect(
      oneWindow({ tabs: tabs('a', 'b'), activeIndex: 0, split: { leftIndex: 0, rightIndex: 1, ratio: 9 } })?.split
        ?.ratio,
    ).toBe(0.8);
  });

  // A window with nothing to reopen is not a window to bring back; the rest keep the order they were saved in.
  it('leaves out a window with no tabs at all, and keeps every other window in order', () => {
    const saved = reviveSession({
      windows: [
        { tabs: tabs('a'), activeIndex: 0 },
        { tabs: [], activeIndex: 3 },
        { tabs: tabs('b', 'c'), activeIndex: 1 },
      ],
    });
    expect(saved).toEqual({
      windows: [
        { tabs: tabs('a'), activeIndex: 0 },
        { tabs: tabs('b', 'c'), activeIndex: 1 },
      ],
    });
  });

  it('drops entries with no address', () => {
    expect(oneWindow({ tabs: [{ url: 'a' }, { url: '' }, 42, null, { url: 'b' }], activeIndex: 0 })?.tabs).toEqual(
      tabs('a', 'b'),
    );
  });

  it.each([
    {
      name: 'keeps which group a tab was in',
      entry: { url: 'a', groupId: 'g1' },
      expected: { url: 'a', groupId: 'g1' },
    },
    {
      name: 'keeps a tab pinned',
      entry: { url: 'a', isPinned: true },
      expected: { url: 'a', groupId: null, isPinned: true },
    },
    {
      name: 'reads a tab from before pinning as not pinned',
      entry: { url: 'b' },
      expected: { url: 'b', groupId: null },
    },
    {
      name: 'treats a group id that is not a string as no group',
      entry: { url: 'a', groupId: 42 },
      expected: { url: 'a', groupId: null },
    },
  ])('$name', ({ entry, expected }) => {
    expect(oneWindow({ tabs: [entry], activeIndex: 0 })?.tabs).toEqual([expected]);
  });

  it('refuses a file that holds no list of windows', () => {
    expect(reviveSession({ tabs: tabs('a'), activeIndex: 0 })).toBeNull();
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
      windows: [
        {
          tabs: [
            { url: 'https://a.test/', groupId: null },
            { url: 'https://b.test/', groupId: null },
          ],
          activeIndex: 1,
        },
      ],
    });
  });

  it('survives the trip through the reviver', () => {
    const outcome = migrated({ urls: ['https://a.test/'], activeIndex: 0 });
    expect(reviveSession(outcome.status === 'migrated' ? outcome.data : null)?.windows[0]?.tabs).toEqual([
      { url: 'https://a.test/', groupId: null },
    ]);
  });

  it('copes with an old file that had nothing in it', () => {
    const outcome = migrated({ urls: [], activeIndex: 0 });
    expect(outcome.status === 'migrated' && outcome.data).toEqual({ windows: [{ tabs: [], activeIndex: 0 }] });
  });

  // Every session before version 3 was one window, and it comes back as one.
  it('brings a single window from version 2 into the list of windows', () => {
    const outcome = migrate({ tabs: [{ url: 'https://a.test/', groupId: 'g1' }], activeIndex: 0 }, 2, SESSION_PLAN);
    expect(outcome.status === 'migrated' && outcome.data).toEqual({
      windows: [{ tabs: [{ url: 'https://a.test/', groupId: 'g1' }], activeIndex: 0 }],
    });
  });
});

describe('bookmarks, read back off disk', () => {
  // A bookmark with no address is a row that can never be opened.
  it.each([[''], [42], [null], [undefined]])('drops an entry whose url is %o', (url) => {
    expect(reviveBookmarks([{ id: 'a', url, title: 'x', createdAt: 1 }])).toEqual([]);
  });

  it('falls back to the url when there is no title, and gives an entry an id when the file has none', () => {
    const [bookmark] = reviveBookmarks([{ url: 'https://a.test/x' }]) ?? [];
    expect(bookmark?.title).toBe('https://a.test/x');
    expect(bookmark?.id).toBeTruthy();
  });
});

/**
 * A folder that cannot be read back is a folder full of bookmarks nobody can
 * reach, so every field falls back rather than dropping the folder - except the
 * id, which is the only thing a bookmark refers to it by.
 */
describe('bookmark folders, read back off disk', () => {
  it('reads a folder written by this build', () => {
    expect(reviveFolders([{ id: 'f1', name: 'Work', colour: 'violet', parentId: null, collapsed: false }])).toEqual([
      { id: 'f1', name: 'Work', colour: 'violet', parentId: null, collapsed: false },
    ]);
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

  // The same fallback groups use for the colour, rather than a second opinion about it.
  it.each([
    {
      name: 'keeps a folder whose colour this build does not have',
      entry: { id: 'f1', name: 'Work', colour: 'chartreuse' },
      field: 'colour',
      expected: GROUP_COLOURS[0].id,
    },
    {
      name: 'names an unnamed folder rather than showing a blank row',
      entry: { id: 'f1', name: '   ' },
      field: 'name',
      expected: 'Folder',
    },
    {
      name: 'clamps a name long enough to break the row it is drawn in',
      entry: { id: 'f1', name: 'x'.repeat(400) },
      field: 'name',
      expected: 'x'.repeat(60),
    },
    {
      name: 'treats a non-string parent as the top level',
      entry: { id: 'f1', name: 'Work', parentId: 12 },
      field: 'parentId',
      expected: null,
    },
    {
      name: 'treats anything but true as not collapsed, so nothing hides itself',
      entry: { id: 'f1', name: 'Work', collapsed: 'yes' },
      field: 'collapsed',
      expected: false,
    },
  ])('$name', ({ entry, field, expected }) => {
    const [folder] = reviveFolders([entry]) ?? [];
    expect(folder?.[field as keyof typeof folder]).toEqual(expected);
  });
});

/**
 * Every bookmark saved before folders existed is filed in none of them, which
 * is what the interface calls Unfiled. The import into the database relies on
 * the reviver for that now, rather than on a schema step.
 */
describe('bookmarks written by an older version', () => {
  // The folder a bookmark was filed in survives; a bookmark from before folders, or with a non-string folder, is unfiled.
  it.each([
    { name: 'files a bookmark from before folders nowhere', folderId: undefined, expected: null },
    { name: 'keeps the folder it was filed in', folderId: 'f1', expected: 'f1' },
    { name: 'treats a non-string folder as unfiled rather than dropping the bookmark', folderId: 42, expected: null },
  ])('$name', ({ folderId, expected }) => {
    const [bookmark] =
      reviveBookmarks([
        {
          id: 'b1',
          url: 'https://example.com/',
          title: 'Example',
          createdAt: 5,
          ...(folderId === undefined ? {} : { folderId }),
        },
      ]) ?? [];
    expect(bookmark).toEqual({
      id: 'b1',
      url: 'https://example.com/',
      title: 'Example',
      createdAt: 5,
      folderId: expected,
    });
  });
});

/** The lists that hold folders, groups and bookmarks share the same rules about what is not a list and what has no id. */
describe('every stored list, read back off disk', () => {
  it.each([
    { name: 'bookmarks', revive: reviveBookmarks, raw: { bookmarks: 'nope' } },
    { name: 'bookmark folders', revive: reviveFolders, raw: { id: 'f1' } },
    { name: 'tab groups', revive: reviveGroups, raw: { id: 'g1' } },
  ])('refuses $name that are not a list, so nothing is brought in', ({ revive, raw }) => {
    expect(revive(raw)).toBeNull();
  });

  // Nothing could be filed in, or point at, an entry with no id, so it is dropped rather than repaired.
  it.each([
    { name: 'bookmark folders', revive: reviveFolders },
    { name: 'tab groups', revive: reviveGroups },
  ])('drops an entry of $name with no id', ({ revive }) => {
    expect(revive([{ name: 'Nameless' }, { id: 'x1', name: 'Work' }])).toHaveLength(1);
  });
});

/**
 * A group that cannot be read back is a run of tabs with no name and no colour,
 * and - worse - a session that may have been kept separate losing the fact that
 * it was. Every field falls back rather than dropping the group, except the id,
 * which is the only thing a tab refers to it by.
 */
describe('tab groups, read back off disk', () => {
  it('reads a group written by this build', () => {
    const groups = reviveGroups([{ id: 'g1', name: 'Work', colour: 'violet', ownSession: true, collapsed: false }]);
    expect(groups).toEqual([{ id: 'g1', name: 'Work', colour: 'violet', ownSession: true, collapsed: false }]);
  });

  /*
   * The dangerous direction is only one way round. A group that kept its own
   * browsing and is read back as sharing would put its tabs in the ordinary
   * session - signing someone into pages they had deliberately kept apart - so
   * anything but a literal true has to mean false.
   */
  it('treats anything but true as sharing, never the other way round', () => {
    const [shared] = reviveGroups([{ id: 'g1', name: 'Work', ownSession: 'yes' }]) ?? [];
    expect(shared?.ownSession).toBe(false);
    const [separate] = reviveGroups([{ id: 'g2', name: 'Work', ownSession: true }]) ?? [];
    expect(separate?.ownSession).toBe(true);
  });

  it.each([
    {
      name: 'keeps a group whose colour this build does not have',
      entry: { id: 'g1', name: 'Work', colour: 'chartreuse' },
      field: 'colour',
      expected: GROUP_COLOURS[0].id,
    },
    {
      name: 'treats anything but true as not collapsed, so nothing hides itself',
      entry: { id: 'g1', name: 'Work', collapsed: 'yes' },
      field: 'collapsed',
      expected: false,
    },
  ])('$name', ({ entry, field, expected }) => {
    const [group] = reviveGroups([entry]) ?? [];
    expect(group?.[field as keyof typeof group]).toEqual(expected);
  });
});

/**
 * The migration reads whatever is on disk, which is not always what this build
 * last wrote: a file can be hand-edited, truncated by a full disk, or written by
 * a version that never existed. It has to survive all of it.
 */
describe('a session file that is not what it should be', () => {
  const migrated = (raw: unknown) => migrate(raw, 1, SESSION_PLAN);

  it.each([
    { name: 'a string', raw: 'nonsense' },
    { name: 'null', raw: null },
    { name: 'an array', raw: [1, 2, 3] },
    { name: 'urls that are a string', raw: { urls: 'https://example.com/' } },
    { name: 'urls that are null', raw: { urls: null } },
  ])('survives a file that is $name', ({ raw }) => {
    expect(() => migrated(raw)).not.toThrow();
  });

  it('keeps the addresses it can read and drops the ones it cannot', () => {
    const outcome = migrated({ urls: ['https://example.com/', 42, null, 'https://two.example/'], activeIndex: 0 });
    const data =
      outcome.status === 'migrated' ? (outcome.data as { windows: { tabs: unknown[] }[] }) : { windows: [] };
    expect(data.windows[0]?.tabs).toHaveLength(2);
  });
});

describe('back history in the session, read back off disk', () => {
  const read = (history: unknown) =>
    reviveSession({ windows: [{ tabs: [{ url: 'https://example.com/b', groupId: null, history }], activeIndex: 0 }] })
      ?.windows[0]?.tabs[0]?.history;

  it('comes back whole', () => {
    const history = {
      entries: [
        { url: 'https://example.com/a', title: 'A' },
        { url: 'https://example.com/b', title: 'B' },
      ],
      index: 1,
    };
    expect(read(history)).toEqual(history);
  });

  // An edited file must not make Back load something a tab could never open.
  it.each([
    [
      'a script address',
      {
        entries: [
          { url: 'javascript:alert(1)', title: '' },
          { url: 'https://example.com/b', title: 'B' },
        ],
        index: 1,
      },
    ],
    [
      'an index past the end',
      {
        entries: [
          { url: 'https://example.com/a', title: 'A' },
          { url: 'https://example.com/b', title: 'B' },
        ],
        index: 5,
      },
    ],
    ['not a list', { entries: 'https://example.com/a', index: 0 }],
  ])('is dropped for %s, keeping the tab', (_name, history) => {
    expect(read(history)).toBeUndefined();
  });
});
