import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_TILES_DIR } }));

const { BrowserStore } = await import('../../../../electron/main/data/store');

let store: InstanceType<typeof BrowserStore>;

beforeEach(() => {
  process.env.COPA_TILES_DIR = mkdtempSync(path.join(tmpdir(), 'copacetic-start-tiles-'));
  store = new BrowserStore();
  [
    'https://often.example/a',
    'https://often.example/b',
    'https://sometimes.example/',
    'https://mine.example/',
  ].forEach((url) => store.recordVisit(url, 'Page'));
});

describe('the start page tiles', () => {
  it('puts shortcuts first, and does not show a shortcut site twice', () => {
    store.saveStartShortcut(null, { url: 'https://mine.example/', title: 'Mine', icon: null });
    const tiles = store.topSites(8);
    expect(tiles[0]).toMatchObject({ label: 'Mine', isShortcut: true });
    expect(tiles.filter((tile) => tile.host === 'mine.example')).toHaveLength(1);
  });

  it('stops suggesting a site that was removed, and keeps doing so after history is cleared', () => {
    store.removeStartTile('https://often.example/');
    expect(store.topSites(8).map((tile) => tile.host)).not.toContain('often.example');
    store.clearHistory('all');
    store.recordVisit('https://often.example/again', 'Page');
    expect(store.topSites(8).map((tile) => tile.host)).not.toContain('often.example');
  });

  it('lets forgetting a site take its tiles with it', () => {
    store.saveStartShortcut(null, { url: 'https://mine.example/', title: 'Mine', icon: null });
    expect(store.tracesOf('https://mine.example/').startTiles).toBe(1);
    store.forgetSite('https://mine.example/');
    expect(store.topSites(8).some((tile) => tile.isShortcut)).toBe(false);
  });
});
