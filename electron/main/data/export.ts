import type { BookmarkFolder } from '../../shared/bookmark-folders';
import type { Bookmark, HistoryEntry } from '../../shared/types';

// Getting your own data back out.

/**
 * Netscape bookmark format — what every browser's importer expects.
 *
 * Folders are written as folders. They were not: everything was flattened into
 * one folder called Copacetic and `folderId` was dropped on the floor, so
 * someone exporting to move to another browser lost the arrangement they had
 * made and got a single heap instead. The format has nested folders and has had
 * them since Netscape; there was nothing to invent.
 */
export function bookmarksToHtml(
  bookmarks: readonly Bookmark[],
  exportedAt: number,
  folders: readonly BookmarkFolder[] = [],
): string {
  const linkRow = (bookmark: Bookmark, depth: number): string => {
    const added = Math.floor(bookmark.createdAt / 1000);
    return `${'    '.repeat(depth)}<DT><A HREF="${escapeAttribute(bookmark.url)}" ADD_DATE="${added}">${escapeText(
      bookmark.title || bookmark.url,
    )}</A>`;
  };

  // Depth-first, because a folder's contents belong inside its own list. A
  // folder whose parent is missing would otherwise never be written at all, so
  // anything unreachable is treated as unfiled rather than quietly lost.
  const written = new Set<string>();

  const branch = (parentId: string | null, depth: number): string[] => {
    const rows: string[] = [];
    for (const folder of folders.filter((candidate) => candidate.parentId === parentId)) {
      written.add(folder.id);
      const inside = [
        ...bookmarks
          .filter((bookmark) => bookmark.folderId === folder.id)
          .map((bookmark) => linkRow(bookmark, depth + 1)),
        ...branch(folder.id, depth + 1),
      ];
      rows.push(
        `${'    '.repeat(depth)}<DT><H3>${escapeText(folder.name)}</H3>`,
        `${'    '.repeat(depth)}<DL><p>`,
        ...inside,
        `${'    '.repeat(depth)}</DL><p>`,
      );
    }
    return rows;
  };

  const tree = branch(null, 2);
  const filedSomewhereReal = (bookmark: Bookmark) => bookmark.folderId !== null && written.has(bookmark.folderId);
  const unfiled = bookmarks
    .filter((bookmark) => !filedSomewhereReal(bookmark))
    .map((bookmark) => linkRow(bookmark, 2));

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- Exported from Copacetic on ${new Date(exportedAt).toISOString()}.
     This is the standard bookmark format; any browser will import it. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Copacetic</H3>
    <DL><p>
${[...tree, ...unfiled].join('\n')}
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
