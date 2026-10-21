import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_ZOOM_DIR } }));

const { BrowserStore } = await import('../../../../electron/main/data/store');

let store: InstanceType<typeof BrowserStore>;

beforeEach(() => {
  process.env.COPA_ZOOM_DIR = mkdtempSync(path.join(tmpdir(), 'copacetic-zoom-'));
  store = new BrowserStore();
});

describe('per-site zoom', () => {
  // A permission or a zoom granted to one origin must never apply to another.
  it('is null for a site never zoomed, and keeps origins separate', () => {
    store.setZoomForOrigin('https://example.com', 1.5);
    expect(store.getZoomForOrigin('https://never.example')).toBeNull();
    expect(store.getZoomForOrigin('https://other.example')).toBeNull();
    expect(store.getZoomForOrigin('http://example.com')).toBeNull();
  });

  it('can be reset explicitly', () => {
    store.setZoomForOrigin('https://example.com', 2);
    store.forgetZoomForOrigin('https://example.com');
    expect(store.getZoomForOrigin('https://example.com')).toBeNull();
  });

  it('ignores an empty origin rather than storing one', () => {
    store.setZoomForOrigin('', 2);
    expect(store.getSettings().zoomLevels).toEqual({});
  });

  // settings.json is a file the user can edit, so it is untrusted input.
  it('bounds a level loaded from disk', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      path.join(process.env.COPA_ZOOM_DIR!, 'settings.json'),
      JSON.stringify({ zoomLevels: { 'https://a.example': 500, 'https://b.example': -3, 'https://c.example': 'x' } }),
    );

    const reopened = new BrowserStore();
    expect(reopened.getZoomForOrigin('https://a.example')).toBe(5);
    expect(reopened.getZoomForOrigin('https://b.example')).toBe(0.25);
    // Not a number at all, so it is dropped rather than coerced.
    expect(reopened.getZoomForOrigin('https://c.example')).toBeNull();
  });
});

describe('interface density', () => {
  it.each([
    { name: 'accepts only the two it knows', stored: 'enormous', expected: 'comfortable' },
    { name: 'keeps a valid choice', stored: 'compact', expected: 'compact' },
  ])('$name', async ({ stored, expected }) => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(process.env.COPA_ZOOM_DIR!, 'settings.json'), JSON.stringify({ density: stored }));
    expect(new BrowserStore().getSettings().density).toBe(expected);
  });
});

describe('history paging', () => {
  const seed = (count: number) => {
    for (let i = 0; i < count; i += 1) {
      store.recordVisit(`https://site${i}.example/`, `Page ${i}`);
    }
  };

  // The bug this replaces: a search could never reach a match past the cap, and nothing said anything had been left out.
  it('reports the total, reaches entries past the first page, and is empty past the end', () => {
    seed(420);
    const first = store.listHistory('', 300);
    expect(first.entries).toHaveLength(300);
    expect(first.total).toBe(420);

    const second = store.listHistory('', 300, 300);
    expect(second.entries).toHaveLength(120);
    expect(second.total).toBe(420);
    expect(second.entries[0]?.url).not.toBe(first.entries[0]?.url);

    expect(store.listHistory('', 300, 999).entries).toEqual([]);
  });

  it('exports everything, never a page', () => {
    seed(420);
    expect(store.allHistory()).toHaveLength(420);
  });
});

describe('start page widgets', () => {
  const writeSettings = async (value: unknown) => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(process.env.COPA_ZOOM_DIR!, 'settings.json'), JSON.stringify(value));
    return new BrowserStore();
  };

  // Someone upgrading has the old booleans and no list. Reading their answers
  // rather than resetting them is the difference between an upgrade and losing
  // your setup. settings.json is editable by hand, so it is untrusted input.
  it.each([
    {
      name: 'carries the old booleans over on upgrade',
      stored: { showStartPageClock: false, showTopSites: true },
      expected: ['search', 'topSites'],
    },
    {
      name: 'keeps search even when both old toggles were off',
      stored: { showStartPageClock: false, showTopSites: false },
      expected: ['search'],
    },
    {
      name: 'prefers an explicit list over the old booleans',
      stored: { showStartPageClock: true, showTopSites: true, startPageWidgets: ['search'] },
      expected: ['search'],
    },
    {
      name: 'keeps the order it is given, since order is the point',
      stored: { startPageWidgets: ['topSites', 'clock', 'search'] },
      expected: ['topSites', 'clock', 'search'],
    },
    {
      name: 'drops widgets it does not know and duplicates',
      stored: { startPageWidgets: ['clock', 'nonsense', 'clock', 'search', 42] },
      expected: ['clock', 'search'],
    },
    { name: 'allows an empty start page', stored: { startPageWidgets: [] }, expected: [] },
  ])('$name', async ({ stored, expected }) => {
    const reopened = await writeSettings(stored);
    expect(reopened.getSettings().startPageWidgets).toEqual(expected);
  });
});
