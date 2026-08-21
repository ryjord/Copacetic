import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { reviveFavicons } = await import('../../electron/main/data/favicons-store');
const { reviveSession } = await import('../../electron/main/data/session-store');
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
  // An index past the end would select a tab that does not exist.
  it('clamps the active index to the tabs that are actually there', () => {
    expect(reviveSession({ urls: ['a', 'b'], activeIndex: 99 })?.activeIndex).toBe(1);
    expect(reviveSession({ urls: ['a', 'b'], activeIndex: -5 })?.activeIndex).toBe(0);
  });

  it('copes with no tabs at all', () => {
    expect(reviveSession({ urls: [], activeIndex: 3 })).toEqual({ urls: [], activeIndex: 0 });
  });

  it('drops entries that are not strings', () => {
    expect(reviveSession({ urls: ['a', 42, null, 'b'], activeIndex: 0 })?.urls).toEqual(['a', 'b']);
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
