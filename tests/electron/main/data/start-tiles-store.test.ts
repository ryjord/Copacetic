import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { StartTilesStore } = await import('../../../../electron/main/data/start-tiles-store');
const { openDatabase } = await import('../../../../electron/main/data/database');

let store: InstanceType<typeof StartTilesStore>;
beforeEach(() => {
  store = new StartTilesStore(
    openDatabase(path.join(mkdtempSync(path.join(tmpdir(), 'copacetic-tiles-')), 'copacetic.db')),
  );
});

describe('start page tiles', () => {
  it('keeps shortcuts in the order they were made, and edits one in its place', () => {
    store.saveShortcut(null, { url: 'https://one.example/', title: 'One', icon: null });
    store.saveShortcut(null, { url: 'https://two.example/', title: 'Two', icon: null });
    store.saveShortcut('https://one.example/', {
      url: 'https://uno.example/',
      title: 'Uno',
      icon: 'data:image/png;base64,AA==',
    });
    expect(store.shortcuts().map((shortcut) => shortcut.title)).toEqual(['Uno', 'Two']);
    expect(store.shortcuts()[0]?.icon).toBe('data:image/png;base64,AA==');
  });

  it('remembers a site not to suggest, and forgets both kinds with the site', () => {
    store.saveShortcut(null, { url: 'https://www.news.example/', title: 'News', icon: null });
    store.hideSite('news.example');
    expect(store.countForSite('https://news.example/')).toBe(2);
    store.forgetSite('news.example');
    expect(store.shortcuts()).toEqual([]);
    expect(store.hiddenSites()).toEqual([]);
  });
});
