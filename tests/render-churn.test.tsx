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
