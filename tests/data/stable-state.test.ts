import { describe, expect, it } from 'vitest';
import type { BrowserState, TabState } from '../../electron/shared/types';
import { isSameValue, keepIfSame, keepTabs, stabiliseState } from '../../src/lib/stableState';
import { DEFAULT_SETTINGS_SHAPE } from '../../src/lib/defaults';

const tab = (id: string, over: Partial<TabState> = {}): TabState => ({
  id,
  url: `https://${id}.example/`,
  displayUrl: `https://${id}.example/`,
  title: id,
  faviconDataUrl: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  isHush: false,
  groupId: null,
  isAudible: false,
  isMuted: false,
  security: {
    level: 'secure',
    scheme: 'https',
    host: `${id}.example`,
    detail: '',
    certificate: null,
    certificateChange: 'none',
  },
  error: null,
  blockedCount: 0,
  loadMs: null,
  zoomFactor: 1,
  isStartPage: false,
  isBookmarked: false,
  ...over,
});

const state = (over: Partial<BrowserState> = {}): BrowserState => ({
  groups: [],
  tabs: [tab('one'), tab('two')],
  tabOrder: ['one', 'two'],
  activeTabId: 'one',
  downloads: [],
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
  ...over,
});

/** A fresh copy, as IPC deserialisation produces on every single push. */
const deserialised = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('isSameValue', () => {
  it('sees through a fresh copy', () => {
    const original = { a: [1, { b: 'c' }], d: null };
    expect(isSameValue(original, deserialised(original))).toBe(true);
  });

  it.each([
    [{ a: 1 }, { a: 2 }],
    [{ a: 1 }, { a: 1, b: 2 }],
    [
      [1, 2],
      [1, 2, 3],
    ],
    [
      [1, 2],
      [2, 1],
    ],
    [{ a: null }, { a: 0 }],
  ])('tells %o from %o', (a, b) => {
    expect(isSameValue(a, b)).toBe(false);
  });
});

describe('keepTabs', () => {
  it('keeps the whole array when nothing changed', () => {
    const before = [tab('one'), tab('two')];
    expect(keepTabs(before, deserialised(before))).toBe(before);
  });

  // The point of doing this per tab: one tab loading should re-render one tab.
  it('keeps the tabs that did not change when one did', () => {
    const before = [tab('one'), tab('two')];
    const after = deserialised(before);
    after[1] = tab('two', { isLoading: true });

    const result = keepTabs(before, after);
    expect(result[0]).toBe(before[0]);
    expect(result[1]).not.toBe(before[1]);
    expect(result[1]?.isLoading).toBe(true);
  });

  it('notices a reorder even though every tab is unchanged', () => {
    const before = [tab('one'), tab('two')];
    const after = [deserialised(before[1]!), deserialised(before[0]!)];
    expect(keepTabs(before, after)).not.toBe(before);
  });

  it('handles tabs opening and closing', () => {
    const before = [tab('one')];
    expect(keepTabs(before, [tab('one'), tab('two')])).toHaveLength(2);
    expect(keepTabs(before, [])).toHaveLength(0);
  });
});

describe('stabiliseState', () => {
  it('changes nothing when nothing changed', () => {
    const before = state();
    const result = stabiliseState(before, deserialised(before));

    expect(result.tabs).toBe(before.tabs);
    expect(result.settings).toBe(before.settings);
    expect(result.downloads).toBe(before.downloads);
    expect(result.find).toBe(before.find);
    expect(result.update).toBe(before.update);
  });

  // The measured problem: a download ticking re-rendered the tab strip, the
  // settings panel and everything else selecting on an untouched slice.
  it('leaves every other slice alone when only downloads change', () => {
    const before = state();
    const after = deserialised(before);
    after.downloads = [
      {
        id: 'd',
        filename: 'x',
        savePath: '/x',
        url: 'https://e/x',
        receivedBytes: 10,
        totalBytes: 100,
        bytesPerSecond: null,
        urlChain: [],
        sha256: null,
        status: 'progressing',
        startedAt: 0,
        completedAt: null,
        fileExists: false,
      },
    ];

    const result = stabiliseState(before, after);
    expect(result.downloads).not.toBe(before.downloads);
    expect(result.tabs).toBe(before.tabs);
    expect(result.settings).toBe(before.settings);
    expect(result.find).toBe(before.find);
  });

  it('lets a real settings change through', () => {
    const before = state();
    const after = deserialised(before);
    after.settings = { ...after.settings, density: 'compact' };

    const result = stabiliseState(before, after);
    expect(result.settings).not.toBe(before.settings);
    expect(result.settings.density).toBe('compact');
    expect(result.tabs).toBe(before.tabs);
  });

  it('never reports stale data', () => {
    const before = state();
    const after = deserialised(before);
    after.tabs[0]!.title = 'renamed';
    after.activeTabId = 'two';
    after.hasClosedTabs = true;

    const result = stabiliseState(before, after);
    expect(result.tabs[0]?.title).toBe('renamed');
    expect(result.activeTabId).toBe('two');
    expect(result.hasClosedTabs).toBe(true);
  });
});

describe('keepIfSame', () => {
  it('keeps the old reference for equal values and takes the new one otherwise', () => {
    const previous = { a: 1 };
    expect(keepIfSame(previous, { a: 1 })).toBe(previous);
    expect(keepIfSame(previous, { a: 2 })).not.toBe(previous);
  });
});
