import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { act } from 'react';
import type { BrowserState, DownloadState, TabState } from '../electron/shared/types';
import { DEFAULT_SETTINGS_SHAPE } from '../src/lib/defaults';
import { useBrowserStore } from '../src/store/useBrowserStore';

vi.mock('@/lib/bridge', () => ({
  send: () => {},
  ask: async (_a: unknown, fallback: unknown) => fallback,
  getBridge: () => null,
  isRunningInShell: () => false,
}));

const tab = (id: string): TabState => ({
  id,
  url: `https://${id}.example/`,
  displayUrl: `https://${id}.example/`,
  title: id,
  faviconDataUrl: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  isAudible: false,
  isMuted: false,
  security: { level: 'secure', scheme: 'https', host: `${id}.example`, detail: '', certificate: null },
  error: null,
  blockedCount: 0,
  loadMs: null,
  zoomFactor: 1,
  isStartPage: false,
  isBookmarked: false,
});

const download = (receivedBytes: number): DownloadState => ({
  id: 'd',
  filename: 'big.iso',
  savePath: '/tmp/big.iso',
  url: 'https://example.com/big.iso',
  receivedBytes,
  totalBytes: 1_000_000,
  bytesPerSecond: 1000,
  status: 'progressing',
  startedAt: 0,
  completedAt: null,
  fileExists: false,
});

const state = (downloads: DownloadState[]): BrowserState => ({
  tabs: [tab('one'), tab('two'), tab('three')],
  tabOrder: ['one', 'two', 'three'],
  activeTabId: 'one',
  downloads,
  find: { isOpen: false, query: '', activeMatch: 0, totalMatches: 0, matchCase: false },
  permissionPrompts: [],
  authPrompts: [],
  settings: DEFAULT_SETTINGS_SHAPE,
  hasClosedTabs: false,
  update: {
    status: { state: 'idle' },
    delivery: 'unsupported',
    manualReason: null,
    lastCheckedAt: null,
    releasesUrl: '',
  },
});

/** Deserialised afresh, exactly as a push from the main process arrives. */
const pushed = (value: BrowserState): BrowserState => JSON.parse(JSON.stringify(value)) as BrowserState;

afterEach(cleanup);

describe('a download does not re-render the rest of the interface', () => {
  it('leaves components selecting other slices alone', () => {
    let settingsRenders = 0;
    let tabsRenders = 0;

    function WatchesSettings() {
      useBrowserStore((s) => s.settings);
      settingsRenders += 1;
      return null;
    }
    function WatchesTabs() {
      useBrowserStore((s) => s.orderedTabs);
      tabsRenders += 1;
      return null;
    }

    act(() => useBrowserStore.getState().applyState(pushed(state([download(0)]))));
    render(
      <>
        <WatchesSettings />
        <WatchesTabs />
      </>,
    );

    const settingsBefore = settingsRenders;
    const tabsBefore = tabsRenders;

    // Twenty progress updates, which is a second or two of a real download.
    act(() => {
      for (let i = 1; i <= 20; i += 1) {
        useBrowserStore.getState().applyState(pushed(state([download(i * 1000)])));
      }
    });

    expect(settingsRenders - settingsBefore).toBe(0);
    expect(tabsRenders - tabsBefore).toBe(0);
  });

  it('still re-renders what genuinely changed', () => {
    let downloadRenders = 0;
    function WatchesDownloads() {
      useBrowserStore((s) => s.downloads);
      downloadRenders += 1;
      return null;
    }

    act(() => useBrowserStore.getState().applyState(pushed(state([download(0)]))));
    render(<WatchesDownloads />);
    const before = downloadRenders;

    act(() => useBrowserStore.getState().applyState(pushed(state([download(5000)]))));
    expect(downloadRenders).toBeGreaterThan(before);
  });
});

describe('a realistic session still reports the truth', () => {
  const push = (next: BrowserState) => act(() => useBrowserStore.getState().applyState(pushed(next)));
  const read = () => useBrowserStore.getState();

  it('reflects every change through a sequence of pushes', () => {
    // 1. A fresh window with three tabs.
    push(state([]));
    expect(read().orderedTabs.map((t) => t.id)).toEqual(['one', 'two', 'three']);
    expect(read().activeTab?.id).toBe('one');

    // 2. The active tab starts loading.
    const loading = state([]);
    loading.tabs[0] = { ...loading.tabs[0]!, isLoading: true };
    push(loading);
    expect(read().activeTab?.isLoading).toBe(true);
    expect(read().orderedTabs[1]?.isLoading).toBe(false);

    // 3. It finishes, with a title and a favicon.
    const loaded = state([]);
    loaded.tabs[0] = { ...loaded.tabs[0]!, title: 'Example Domain', faviconDataUrl: 'data:image/png;base64,AA' };
    push(loaded);
    expect(read().activeTab?.title).toBe('Example Domain');
    expect(read().activeTab?.faviconDataUrl).toBe('data:image/png;base64,AA');
    expect(read().activeTab?.isLoading).toBe(false);

    // 4. The user switches tabs.
    const switched = { ...loaded, activeTabId: 'three' };
    push(switched);
    expect(read().activeTab?.id).toBe('three');

    // 5. A tab closes.
    const closed = { ...switched, tabs: switched.tabs.slice(0, 2), tabOrder: ['one', 'two'], activeTabId: 'two' };
    push(closed);
    expect(read().orderedTabs.map((t) => t.id)).toEqual(['one', 'two']);
    expect(read().activeTab?.id).toBe('two');

    // 6. Tabs are reordered — every tab identical, only the order different.
    const reordered = { ...closed, tabOrder: ['two', 'one'] };
    push(reordered);
    expect(read().orderedTabs.map((t) => t.id)).toEqual(['two', 'one']);

    // 7. A setting changes.
    const themed = { ...reordered, settings: { ...reordered.settings, density: 'compact' as const } };
    push(themed);
    expect(read().settings.density).toBe('compact');

    // 8. A download appears and progresses.
    push({ ...themed, downloads: [download(0)] });
    expect(read().downloads[0]?.receivedBytes).toBe(0);
    push({ ...themed, downloads: [download(750_000)] });
    expect(read().downloads[0]?.receivedBytes).toBe(750_000);

    // 9. A tracker is blocked on the active page.
    const blocked = state([download(750_000)]);
    blocked.tabs[1] = { ...blocked.tabs[1]!, blockedCount: 4 };
    push({ ...blocked, activeTabId: 'two' });
    expect(read().activeTab?.blockedCount).toBe(4);
  });

  it('does not hand back a tab object that no longer exists', () => {
    push(state([]));
    const firstTab = read().orderedTabs[0]!;

    push({ ...state([]), tabs: state([]).tabs.slice(1), tabOrder: ['two', 'three'], activeTabId: 'two' });
    expect(read().orderedTabs.some((t) => t.id === firstTab.id)).toBe(false);
  });
});
