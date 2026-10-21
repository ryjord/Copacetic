import { describe, expect, it, vi } from 'vitest';
import {
  attachTabEvents,
  dropBlankEntries,
  markLoadRequested,
  settleUnstartedLoad,
  type TabEventDeps,
} from '../../../../electron/main/tabs/tab-events';
import type { TabRecord } from '../../../../electron/main/tabs/tab-record';
import { MAX_PINCH_ZOOM } from '../../../../electron/shared/types';
import { HUSH_RECORD, storedRecord } from '../../../../electron/main/tabs/browsing-record';

/** A stand-in for the tab's web contents that lets a test fire what a page reports. */
function fakeContents() {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    id: 1,
    setZoomFactor: vi.fn(),
    setVisualZoomLevelLimits: vi.fn(async () => {}),
    navigationHistory: { getAllEntries: () => [], getActiveIndex: () => 0, removeEntryAtIndex: vi.fn(() => true) },
    on(name: string, handler: (...args: unknown[]) => void) {
      const existing = handlers.get(name) ?? [];
      existing.push(handler);
      handlers.set(name, existing);
      return this;
    },
    emit(name: string, ...args: unknown[]) {
      for (const handler of handlers.get(name) ?? []) {
        handler(...args);
      }
    },
  };
}

function setup(overrides: Partial<TabRecord> = {}) {
  const contents = fakeContents();
  const store = {
    recordVisit: vi.fn(),
    setFavicon: vi.fn(),
    getFavicon: vi.fn(() => null),
    getZoomForOrigin: vi.fn(() => null),
    getSettings: vi.fn(() => ({ defaultZoomFactor: 1 })),
  };
  // Chosen the way the tab manager chooses it: by whether the tab is Hush, once.
  const record = overrides.isHush ? HUSH_RECORD : storedRecord(store as never, { remember: vi.fn() } as never);
  const tab = {
    record,
    id: 'tab-1',
    view: { webContents: contents },
    isHush: false,
    isPinned: false,
    isAsleep: false,
    url: 'https://example.com/page',
    title: 'Example',
    faviconDataUrl: null,
    isLoading: false,
    error: null,
    loadStartedAt: null,
    loadMs: null,
    zoomFactor: 1,
    isMuted: false,
    pendingFaviconUrl: null,
    ...overrides,
  } as unknown as TabRecord;

  const deps = {
    store,
    blocker: { resetCount: vi.fn(), setPageSite: vi.fn() },
    httpsFirst: { committed: vi.fn() },
    forgetBlockedCount: vi.fn(),
    onPageChanged: vi.fn(),
    onChanged: vi.fn(),
    applyVisibility: vi.fn(),
    cacheFavicon: vi.fn(),
    onFoundInPage: vi.fn(),
    onContextMenu: vi.fn(),
  } as unknown as TabEventDeps;

  attachTabEvents(tab, deps);
  return { contents, tab, deps };
}

describe('a Hush tab leaves nothing behind', () => {
  it('does not record a visit when the page reports its title', () => {
    const { contents, deps } = setup({ isHush: true });
    contents.emit('page-title-updated', {}, 'Something private');
    expect(deps.store.recordVisit).not.toHaveBeenCalled();
  });

  // Asked for, so the tab can show it; whether it is kept is the record's to decide, and a Hush record keeps nothing.
  it('shows the favicon the page offers without keeping it', () => {
    const { contents, deps, tab } = setup({ isHush: true });
    contents.emit('page-favicon-updated', {}, ['https://example.com/icon.png']);
    expect(deps.cacheFavicon).toHaveBeenCalled();
    tab.record.keepFavicon('https://example.com/', 'data:image/png;base64,AAAA');
    expect(deps.store.setFavicon).not.toHaveBeenCalled();
  });
});

// The same events on an ordinary tab, so the tests above fail for the right
// reason: a guard that never fires would pass them just as well as a correct one.
describe('an ordinary tab still records what it should', () => {
  it('records the visit', () => {
    const { contents, deps } = setup();
    contents.emit('page-title-updated', {}, 'Example');
    expect(deps.store.recordVisit).toHaveBeenCalledWith('https://example.com/page', 'Example');
  });

  it('caches the favicon', () => {
    const { contents, deps } = setup();
    contents.emit('page-favicon-updated', {}, ['https://example.com/icon.png']);
    expect(deps.cacheFavicon).toHaveBeenCalled();
  });
});

describe('what a page reports about itself is not trusted to be sensible', () => {
  it('ignores a favicon-updated with an empty list', () => {
    const { contents, deps } = setup();
    contents.emit('page-favicon-updated', {}, []);
    expect(deps.cacheFavicon).not.toHaveBeenCalled();
  });

  // The blank view behind one of our pages reports a title of its own, which is neither a visit nor the tab's name.
  it.each(['copacetic://start', 'copacetic://settings/sites'])('neither records nor takes a title on %s', (url) => {
    const { contents, deps, tab } = setup({ url, title: '' });
    contents.emit('page-title-updated', {}, 'about:blank');
    expect(deps.store.recordVisit).not.toHaveBeenCalled();
    expect(tab.title).toBe('');
  });

  it('does not record a visit for a page that failed to load', () => {
    const { contents, deps } = setup({ error: { code: -105, name: 'x', description: 'y', url: 'z' } });
    contents.emit('page-title-updated', {}, 'Cannot reach');
    expect(deps.store.recordVisit).not.toHaveBeenCalled();
  });
});

describe('a load that ends without Chromium starting it', () => {
  it('reads as loading from the moment it is asked for', () => {
    const tab = { isLoading: false };
    markLoadRequested(tab);
    expect(tab.isLoading).toBe(true);
  });

  const contentsThat = (state: { isDestroyed?: boolean; isLoading?: boolean }) => ({
    isDestroyed: () => state.isDestroyed ?? false,
    isLoading: () => state.isLoading ?? false,
  });

  it('stops the tab reading as loading once nothing is', () => {
    const tab = { isLoading: true };
    expect(settleUnstartedLoad(tab, contentsThat({}))).toBe(true);
    expect(tab.isLoading).toBe(false);
  });

  // A newer navigation took over while this load was being asked for; its spinner is not ours to clear.
  it('leaves a tab alone while another load is under way', () => {
    const tab = { isLoading: true };
    expect(settleUnstartedLoad(tab, contentsThat({ isLoading: true }))).toBe(false);
    expect(tab.isLoading).toBe(true);
  });

  it('leaves a tab that already settled', () => {
    const tab = { isLoading: false };
    expect(settleUnstartedLoad(tab, contentsThat({}))).toBe(false);
  });

  it('leaves a tab whose page has gone', () => {
    const tab = { isLoading: true };
    expect(settleUnstartedLoad(tab, contentsThat({ isDestroyed: true }))).toBe(false);
  });
});

describe('a page that has committed', () => {
  // Electron turns trackpad pinching off unless asked, which made pages impossible to pinch closer.
  it('can be pinched closer, as in any browser', () => {
    const { contents } = setup();
    contents.emit('did-navigate', {}, 'https://example.com/next', 200);
    expect(contents.setVisualZoomLevelLimits).toHaveBeenCalledWith(1, MAX_PINCH_ZOOM);
  });
});

describe('the blank page behind one of our pages', () => {
  const historyOf = (urls: string[], active: number) => {
    const entries = urls.map((url) => ({ url }));
    return {
      entries,
      getAllEntries: () => entries,
      getActiveIndex: () => active,
      removeEntryAtIndex: (index: number) => entries.splice(index, 1).length === 1,
    };
  };

  // Settings opened in a site's tab, then a site from History: Back goes to the first site, not to white.
  it('is taken out of the history once a site commits', () => {
    const history = historyOf(['https://a.example/', 'about:blank', 'https://b.example/'], 2);
    dropBlankEntries(history);
    expect(history.entries.map((entry) => entry.url)).toEqual(['https://a.example/', 'https://b.example/']);
  });

  it('is left alone while it is the page in front', () => {
    const history = historyOf(['https://a.example/', 'about:blank'], 1);
    dropBlankEntries(history);
    expect(history.entries).toHaveLength(2);
  });

  it('is taken out wherever it sits, more than once', () => {
    const history = historyOf(['about:blank', 'https://a.example/', 'about:blank', 'https://b.example/'], 3);
    dropBlankEntries(history);
    expect(history.entries.map((entry) => entry.url)).toEqual(['https://a.example/', 'https://b.example/']);
  });
});
