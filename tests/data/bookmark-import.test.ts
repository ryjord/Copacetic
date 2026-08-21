import { describe, expect, it } from 'vitest';
import { bookmarksFromHtml, decodeEntities } from '../../electron/shared/bookmark-import';
import { bookmarksToHtml } from '../../electron/main/data/export';

const CHROME_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1690000000">Reading</H3>
    <DL><p>
        <DT><A HREF="https://example.com/one" ADD_DATE="1690000001">The first one</A>
        <DT><A HREF="https://example.com/two" ADD_DATE="1690000002">The second one</A>
    </DL><p>
</DL><p>`;

describe('reading a file another browser exported', () => {
  it('finds the bookmarks inside the folders', () => {
    const { bookmarks } = bookmarksFromHtml(CHROME_EXPORT);
    expect(bookmarks).toHaveLength(2);
    expect(bookmarks[0]).toEqual({ url: 'https://example.com/one', title: 'The first one', addedAt: 1690000001 });
  });

  it.each([
    ['attributes in another order', '<DT><A ADD_DATE="123" HREF="https://a.test/x">Title</A>'],
    ['lowercase tags', '<dt><a href="https://a.test/x" add_date="123">Title</a>'],
    [
      'extra attributes',
      '<DT><A HREF="https://a.test/x" ICON="data:image/png;base64,AAA" LAST_MODIFIED="9">Title</A>',
    ],
  ])('copes with %s', (_name, html) => {
    expect(bookmarksFromHtml(html).bookmarks[0]?.url).toBe('https://a.test/x');
  });

  it('decodes entities in titles and urls', () => {
    const html = '<DT><A HREF="https://a.test/?x=1&amp;y=2">Tom &amp; Jerry &lt;the best&gt;</A>';
    const { bookmarks } = bookmarksFromHtml(html);
    expect(bookmarks[0]?.url).toBe('https://a.test/?x=1&y=2');
    expect(bookmarks[0]?.title).toBe('Tom & Jerry <the best>');
  });

  it('falls back to the url when there is no title', () => {
    expect(bookmarksFromHtml('<DT><A HREF="https://a.test/x"></A>').bookmarks[0]?.title).toBe('https://a.test/x');
  });

  it('keeps only the first of a repeated url', () => {
    const html = '<DT><A HREF="https://a.test/x">One</A><DT><A HREF="https://a.test/x">Two</A>';
    expect(bookmarksFromHtml(html).bookmarks).toHaveLength(1);
  });

  it('reports no date rather than inventing one', () => {
    expect(bookmarksFromHtml('<DT><A HREF="https://a.test/x">T</A>').bookmarks[0]?.addedAt).toBeNull();
  });
});

/**
 * The file comes from somewhere else and none of it is trusted. A `javascript:`
 * bookmarklet imported into a list that looks like every other bookmark is a
 * dangerous thing one click away.
 */
describe('what it refuses to import', () => {
  it.each([
    ['a bookmarklet', 'javascript:alert(document.cookie)'],
    ['an inline document', 'data:text/html,<script>alert(1)</script>'],
    ['a path on this machine', 'file:///etc/passwd'],
    ['the legacy scripting scheme', 'vbscript:msgbox(1)'],
    ['nothing at all', ''],
    ['nonsense', 'not a url'],
  ])('refuses %s and counts it', (_name, url) => {
    const result = bookmarksFromHtml(`<DT><A HREF="${url}">Looks ordinary</A>`);
    expect(result.bookmarks).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('keeps the good ones alongside the refused', () => {
    const html = '<DT><A HREF="javascript:evil()">Bad</A><DT><A HREF="https://a.test/x">Good</A>';
    const result = bookmarksFromHtml(html);
    expect(result.bookmarks).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  // Titles are page-controlled text about to be shown in Copacetic's own list.
  it('strips markup and bidi overrides from a title', () => {
    const html = '<DT><A HREF="https://a.test/x">safe‮gnp.eliforp<b>!</b></A>';
    const title = bookmarksFromHtml(html).bookmarks[0]?.title ?? '';
    expect(title).not.toContain('‮');
    expect(title).not.toContain('<b>');
  });

  it('bounds a title made absurdly long', () => {
    const html = `<DT><A HREF="https://a.test/x">${'a'.repeat(5000)}</A>`;
    expect((bookmarksFromHtml(html).bookmarks[0]?.title ?? '').length).toBeLessThan(220);
  });
});

describe('the file we write ourselves', () => {
  /**
   * Export escapes and import decodes; they are inverse operations and have to
   * agree on the character set or a round trip silently mangles a title or a
   * URL. The attribute and the element text are escaped differently, which is
   * the part that would break first.
   */
  it('round trips characters that would break the markup', () => {
    const original = {
      id: 'a',
      // A literal quote, not %22: percent-encoding it is exactly what stops
      // this exercising the attribute escaping at all.
      url: 'https://a.test/?q="quoted"&x=1<>',
      title: 'He said "hello" & <b>left</b>',
      createdAt: 1_690_000_000_000,
    };
    const { bookmarks, skipped } = bookmarksFromHtml(bookmarksToHtml([original], Date.now()));
    expect(skipped).toBe(0);
    expect(bookmarks[0]?.url).toBe(original.url);
    expect(bookmarks[0]?.title).toBe(original.title);
  });

  // Export shipped in 1.2.1; if these two ever disagree, leaving is broken.
  it('reads back what Copacetic exported', () => {
    const html = bookmarksToHtml(
      [
        { id: 'a', url: 'https://a.test/one', title: 'Tom & Jerry', createdAt: 1_690_000_000_000 },
        { id: 'b', url: 'https://b.test/two', title: 'Second', createdAt: 1_690_000_100_000 },
      ],
      Date.now(),
    );
    const { bookmarks, skipped } = bookmarksFromHtml(html);
    expect(skipped).toBe(0);
    expect(bookmarks.map((entry) => entry.url)).toEqual(['https://a.test/one', 'https://b.test/two']);
    expect(bookmarks[0]?.title).toBe('Tom & Jerry');
  });
});

describe('entities', () => {
  it.each([
    ['&amp;', '&'],
    ['&lt;', '<'],
    ['&gt;', '>'],
    ['&quot;', '"'],
    ['&#39;', "'"],
    ['&#x2764;', '❤'],
    ['&#8212;', '—'],
  ])('decodes %s', (entity, expected) => {
    expect(decodeEntities(entity)).toBe(expected);
  });

  it('leaves something it does not know alone', () => {
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;');
  });
});
