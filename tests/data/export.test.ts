import { describe, expect, it } from 'vitest';
import { bookmarksToHtml, historyToJson } from '../../electron/main/data/export';

const AT = Date.UTC(2026, 7, 11, 9, 0, 0);

describe('bookmarksToHtml', () => {
  it('writes the format every browser imports', () => {
    const html = bookmarksToHtml(
      [{ id: 'a', url: 'https://example.com/', title: 'Example', createdAt: AT, folderId: null }],
      AT,
    );
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    expect(html).toContain('<A HREF="https://example.com/"');
    expect(html).toContain('>Example</A>');
    // Seconds, not milliseconds, which is what the format specifies.
    expect(html).toContain(`ADD_DATE="${Math.floor(AT / 1000)}"`);
  });

  // A title is page-controlled text going into a file the user will open and
  // other browsers will parse.
  it('escapes a title that tries to write markup of its own', () => {
    const html = bookmarksToHtml(
      [
        {
          id: 'a',
          url: 'https://example.com/',
          title: '</A><script>alert(1)</script>',
          createdAt: AT,
          folderId: null,
        },
      ],
      AT,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a URL that tries to break out of the attribute', () => {
    const html = bookmarksToHtml(
      [{ id: 'a', url: 'https://example.com/"><script>x</script>', title: 'x', createdAt: AT, folderId: null }],
      AT,
    );
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&quot;');
  });

  it('handles an empty collection without producing something malformed', () => {
    const html = bookmarksToHtml([], AT);
    expect(html).toContain('<DL><p>');
    expect(html.trim().endsWith('</DL><p>')).toBe(true);
  });

  it('falls back to the URL when a bookmark has no title', () => {
    expect(
      bookmarksToHtml([{ id: 'a', url: 'https://example.com/', title: '', createdAt: AT, folderId: null }], AT),
    ).toContain('>https://example.com/</A>');
  });
});

describe('historyToJson', () => {
  it('is valid JSON a person can read', () => {
    const json = historyToJson(
      [{ id: 'a', url: 'https://example.com/', title: 'Example', visitCount: 3, lastVisitedAt: AT }],
      AT,
    );
    const parsed = JSON.parse(json);
    expect(parsed.source).toBe('Copacetic');
    expect(parsed.entries).toEqual([
      {
        url: 'https://example.com/',
        title: 'Example',
        visitCount: 3,
        lastVisitedAt: new Date(AT).toISOString(),
      },
    ]);
  });

  it('writes dates as something legible rather than a number', () => {
    const parsed = JSON.parse(historyToJson([], AT));
    expect(parsed.exportedAt).toBe(new Date(AT).toISOString());
    expect(parsed.entries).toEqual([]);
  });
});

/**
 * Folders shipped in 1.4.0 and the export threw them away: everything was
 * flattened into one folder and `folderId` was dropped, so someone exporting to
 * move to another browser lost the arrangement they had made and got a heap.
 * The format has had nested folders since Netscape; there was nothing to invent.
 */
describe('bookmarksToHtml with folders', () => {
  const folder = (id: string, name: string, parentId: string | null = null) => ({
    id,
    name,
    parentId,
    colour: 'ocean' as const,
    collapsed: false,
    createdAt: AT,
  });
  const mark = (id: string, url: string, folderId: string | null) => ({
    id,
    url,
    title: id,
    createdAt: AT,
    folderId,
  });

  it('writes a folder as a folder', () => {
    const html = bookmarksToHtml([mark('a', 'https://a.example/', 'work')], AT, [folder('work', 'Work')]);
    expect(html).toContain('<DT><H3>Work</H3>');
    expect(html.indexOf('<DT><H3>Work</H3>')).toBeLessThan(html.indexOf('https://a.example/'));
  });

  it('nests a folder inside its parent', () => {
    const html = bookmarksToHtml([mark('a', 'https://deep.example/', 'inner')], AT, [
      folder('outer', 'Outer'),
      folder('inner', 'Inner', 'outer'),
    ]);
    // Outer opens, Inner opens inside it, and the bookmark is inside Inner.
    expect(html.indexOf('<DT><H3>Outer</H3>')).toBeLessThan(html.indexOf('<DT><H3>Inner</H3>'));
    expect(html.indexOf('<DT><H3>Inner</H3>')).toBeLessThan(html.indexOf('https://deep.example/'));
  });

  it('keeps an unfiled bookmark, outside every folder', () => {
    const html = bookmarksToHtml([mark('a', 'https://loose.example/', null)], AT, [folder('work', 'Work')]);
    expect(html).toContain('https://loose.example/');
    // After the folder's list closes, rather than inside it.
    expect(html.indexOf('https://loose.example/')).toBeGreaterThan(html.indexOf('<DT><H3>Work</H3>'));
  });

  /*
   * A bookmark pointing at a folder that is not there must not vanish. Losing
   * the arrangement is the bug being fixed; losing the bookmark would be worse
   * than the bug.
   */
  it('keeps a bookmark whose folder is missing', () => {
    const html = bookmarksToHtml([mark('a', 'https://orphan.example/', 'gone')], AT, []);
    expect(html).toContain('https://orphan.example/');
  });

  it('writes an empty folder rather than pretending it was not there', () => {
    const html = bookmarksToHtml([], AT, [folder('empty', 'Empty')]);
    expect(html).toContain('<DT><H3>Empty</H3>');
  });

  // The counterweight: no folders at all still produces the flat list it always did.
  it('writes a flat list when there are no folders', () => {
    const html = bookmarksToHtml([mark('a', 'https://flat.example/', null)], AT, []);
    expect(html).toContain('https://flat.example/');
    expect(html).not.toContain('<DT><H3>Work</H3>');
  });

  it('escapes a folder name, like every other thing a person typed', () => {
    const html = bookmarksToHtml([], AT, [folder('x', '<script>alert(1)</script>')]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
