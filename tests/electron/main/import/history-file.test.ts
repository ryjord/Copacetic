import { describe, expect, it } from 'vitest';
import { historyToJson } from '../../../../electron/main/data/export';
import { visitsFromHistoryFile } from '../../../../electron/main/import/history-file';

describe('reading a history file back in', () => {
  // The only file it must certainly read is the one it writes.
  it('reads what the export writes', () => {
    const exported = historyToJson(
      [
        { id: 'a', url: 'https://example.com/', title: 'Example', visitCount: 3, lastVisitedAt: 1_700_000_000_000 },
      ] as never,
      1_700_000_100_000,
    );
    expect(visitsFromHistoryFile(exported)).toEqual({
      visits: [{ url: 'https://example.com/', title: 'Example', visitCount: 3, lastVisitedAt: 1_700_000_000_000 }],
      skipped: 0,
    });
  });

  it('refuses entries that are not web pages, and counts them', () => {
    const file = JSON.stringify({
      entries: [
        { url: 'javascript:alert(1)', title: 'x', visitCount: 1, lastVisitedAt: '2026-01-01T00:00:00Z' },
        { url: 'https://ok.test/', title: '<b>Bold</b>', visitCount: -4, lastVisitedAt: '2026-01-01T00:00:00Z' },
        { url: 'https://undated.test/', title: 'x' },
      ],
    });
    const read = visitsFromHistoryFile(file);
    expect(read?.visits.map((visit) => [visit.url, visit.visitCount])).toEqual([['https://ok.test/', 1]]);
    expect(read?.skipped).toBe(2);
  });

  it('says nothing could be read from a file that is not one', () => {
    expect(visitsFromHistoryFile('not json')).toBeNull();
    expect(visitsFromHistoryFile('{"bookmarks": []}')).toBeNull();
  });
});
