import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }));

const { MOST_SAVED, ReadingList } = await import('../../../../electron/main/data/reading-list-store');

const article = (title: string) => ({
  title,
  language: null,
  byline: null,
  siteName: 'Example',
  minutes: 3,
  body: [{ kind: 'element', tag: 'p', href: null, children: [{ kind: 'text', text: `${title} body` }] }],
});

function fresh() {
  let clock = 1_000;
  const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-reading-'));
  return { list: new ReadingList(directory, () => (clock += 1)), directory };
}

describe('the reading list', () => {
  it('keeps the article whole, so it reads with no connection', () => {
    const { list, directory } = fresh();
    const id = list.add('https://example.com/a', article('First')) ?? '';
    expect(list.article(id)?.article.body).toEqual(article('First').body);
    list.flush();
    expect(readFileSync(path.join(directory, 'reading-list.json'), 'utf8')).toContain('First body');
  });

  it('lists unread before read, newest first within each', () => {
    const { list } = fresh();
    const first = list.add('https://example.com/a', article('First')) ?? '';
    list.add('https://example.com/b', article('Second'));
    list.add('https://example.com/c', article('Third'));
    list.setRead(first, true);
    expect(list.list().map((item) => item.title)).toEqual(['Third', 'Second', 'First']);
  });

  // Saving a page again is reading it again later, not a second copy.
  it('brings a page saved again back to the top, unread, under the same id', () => {
    const { list } = fresh();
    const id = list.add('https://example.com/a', article('First')) ?? '';
    list.add('https://example.com/b', article('Second'));
    list.setRead(id, true);
    expect(list.add('https://example.com/a', article('First, revised'))).toBe(id);
    expect(list.list()).toHaveLength(2);
    expect(list.list()[0]).toMatchObject({ id, title: 'First, revised', isRead: false });
  });

  it('refuses an address that is not a web page, and an article it cannot read', () => {
    const { list } = fresh();
    expect(list.add('javascript:alert(1)', article('Bad'))).toBeNull();
    expect(list.add('https://example.com/a', { title: 'No body' })).toBeNull();
    expect(list.list()).toEqual([]);
  });

  it('lets the oldest read pages go first once it is full', () => {
    const { list } = fresh();
    const ids = Array.from({ length: MOST_SAVED }, (_unused, index) =>
      list.add(`https://example.com/${index}`, article(`Page ${index}`)),
    );
    list.setRead(ids[5] ?? '', true);
    list.add('https://example.com/new', article('New'));
    expect(list.list()).toHaveLength(MOST_SAVED);
    expect(list.article(ids[5] ?? '')).toBeNull();
    expect(list.article(ids[0] ?? '')).not.toBeNull();
  });
});
