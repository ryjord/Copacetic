import type { Bookmark, HistoryEntry } from '../shared/types';

// Getting your own data back out.

/** Netscape bookmark format — what every browser's importer expects. */
export function bookmarksToHtml(bookmarks: readonly Bookmark[], exportedAt: number): string {
  const rows = bookmarks
    .map((bookmark) => {
      const added = Math.floor(bookmark.createdAt / 1000);
      return `        <DT><A HREF="${escapeAttribute(bookmark.url)}" ADD_DATE="${added}">${escapeText(
        bookmark.title || bookmark.url,
      )}</A>`;
    })
    .join('\n');

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- Exported from Copacetic on ${new Date(exportedAt).toISOString()}.
     This is the standard bookmark format; any browser will import it. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Copacetic</H3>
    <DL><p>
${rows}
    </DL><p>
</DL><p>
`;
}

/** History as JSON rather than the Netscape format, which has no place for a visit count. */
export function historyToJson(entries: readonly HistoryEntry[], exportedAt: number): string {
  return `${JSON.stringify(
    {
      exportedAt: new Date(exportedAt).toISOString(),
      source: 'Copacetic',
      entries: entries.map((entry) => ({
        url: entry.url,
        title: entry.title,
        visitCount: entry.visitCount,
        lastVisitedAt: new Date(entry.lastVisitedAt).toISOString(),
      })),
    },
    null,
    2,
  )}\n`;
}

// A title is page-controlled text being written into an HTML file that the user will open, and that other browsers will parse.
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}
