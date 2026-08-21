import { describe, expect, it } from 'vitest';
import { bookmarksToHtml, historyToJson } from '../../electron/main/data/export';

const AT = Date.UTC(2026, 7, 11, 9, 0, 0);

describe('bookmarksToHtml', () => {
  it('writes the format every browser imports', () => {
    const html = bookmarksToHtml([{ id: 'a', url: 'https://example.com/', title: 'Example', createdAt: AT }], AT);
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
      [{ id: 'a', url: 'https://example.com/', title: '</A><script>alert(1)</script>', createdAt: AT }],
      AT,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a URL that tries to break out of the attribute', () => {
    const html = bookmarksToHtml(
      [{ id: 'a', url: 'https://example.com/"><script>x</script>', title: 'x', createdAt: AT }],
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
    expect(bookmarksToHtml([{ id: 'a', url: 'https://example.com/', title: '', createdAt: AT }], AT)).toContain(
      '>https://example.com/</A>',
    );
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
