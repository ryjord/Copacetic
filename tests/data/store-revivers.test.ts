import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { reviveFavicons } = await import('../../electron/main/data/favicons-store');
const { SESSION_PLAN, reviveSession } = await import('../../electron/main/data/session-store');
const { migrate } = await import('../../electron/main/data/schema');
const { reviveBookmarks } = await import('../../electron/main/data/bookmarks-store');

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
    expect(reviveBookmarks([{ url: 'https://a.test/x' }])[0]?.title).toBe('https://a.test/x');
  });

  it('gives an entry an id when the file has none', () => {
    expect(reviveBookmarks([{ url: 'https://a.test/x' }])[0]?.id).toBeTruthy();
  });
});
