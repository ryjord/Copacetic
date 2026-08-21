import { describe, expect, it, vi } from 'vitest';
import { attachTabEvents, type TabEventDeps } from '../../electron/main/tabs/tab-events';
import type { TabRecord } from '../../electron/main/tabs/tab-record';

/** A stand-in for the tab's web contents that lets a test fire what a page reports. */
function fakeContents() {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    id: 1,
    setZoomFactor: vi.fn(),
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
  const tab = {
    id: 'tab-1',
    view: { webContents: contents },
    isHush: false,
    isStartPage: false,
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
    store: {
      recordVisit: vi.fn(),
      getFavicon: vi.fn(() => null),
      getZoomForOrigin: vi.fn(() => null),
      getSettings: vi.fn(() => ({ defaultZoomFactor: 1 })),
    },
    blocker: { resetCount: vi.fn(), setPageSite: vi.fn() },
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

  it('does not cache the favicon the page offers', () => {
    const { contents, deps } = setup({ isHush: true });
    contents.emit('page-favicon-updated', {}, ['https://example.com/icon.png']);
    expect(deps.cacheFavicon).not.toHaveBeenCalled();
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

  it('does not record a visit for the start page', () => {
    const { contents, deps } = setup({ isStartPage: true });
    contents.emit('page-title-updated', {}, 'New tab');
    expect(deps.store.recordVisit).not.toHaveBeenCalled();
  });

  it('does not record a visit for a page that failed to load', () => {
    const { contents, deps } = setup({ error: { code: -105, name: 'x', description: 'y', url: 'z' } });
    contents.emit('page-title-updated', {}, 'Cannot reach');
    expect(deps.store.recordVisit).not.toHaveBeenCalled();
  });
});
