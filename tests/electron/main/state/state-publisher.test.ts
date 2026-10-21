import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserState, TabState } from '../../../../electron/shared/types';
import { changedSlices } from '../../../../electron/shared/ipc/state-slices';
import { MIN_PUSH_INTERVAL_MS, StatePublisher } from '../../../../electron/main/state/state-publisher';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';

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
  isPinned: false,
  isAsleep: false,
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
  internalPage: null,
  isBookmarked: false,
  ...over,
});

const state = (over: Partial<BrowserState> = {}): BrowserState => ({
  groups: [],
  tabs: [tab('one'), tab('two')],
  tabOrder: ['one', 'two'],
  activeTabId: 'one',
  siteInfo: null,
  bookmarkSheet: null,
  passwordOffer: null,
  split: null,
  namedSessions: [],
  profile: { id: 'default', name: 'Personal', colour: 'ocean', pictureVersion: null },
  profiles: [],
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
    releaseNotes: null,
    currentVersion: '',
    includesBetas: false,
    canOpenInstaller: false,
  },
  ...over,
});

describe('what a push carries', () => {
  // A download's progress used to re-send every tab and the whole settings record.
  it('carries everything the first time, then only what changed, then nothing', () => {
    const first = changedSlices(new Map(), state());
    expect(Object.keys(first.patch).sort()).toEqual(Object.keys(state()).sort());

    const second = changedSlices(first.sent, state({ hasClosedTabs: true }));
    expect(second.patch).toEqual({ hasClosedTabs: true });

    expect(changedSlices(second.sent, state({ hasClosedTabs: true })).patch).toEqual({});
  });
});

describe('how often the chrome is told', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function publisher(current: () => BrowserState) {
    const sent: Partial<BrowserState>[] = [];
    let saved = 0;
    const instance = new StatePublisher(
      { snapshot: current, send: (patch) => sent.push(patch), canSend: () => true, beforeSend: () => (saved += 1) },
      () => Date.now(),
    );
    return { instance, sent, saves: () => saved };
  }

  it('folds a burst of changes into one push', async () => {
    const { instance, sent } = publisher(() => state());
    instance.schedule();
    instance.schedule();
    instance.schedule();
    await vi.runAllTimersAsync();
    expect(sent).toHaveLength(1);
  });

  it('pushes no faster than its interval, and still delivers the last change', async () => {
    let downloads = 0;
    const { instance, sent } = publisher(() => state({ hasClosedTabs: downloads % 2 === 1 }));
    instance.schedule();
    await vi.advanceTimersByTimeAsync(0);
    downloads += 1;
    instance.schedule();
    await vi.advanceTimersByTimeAsync(MIN_PUSH_INTERVAL_MS - 5);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual({ hasClosedTabs: true });
  });

  it('sends everything again to a chrome that reloaded', async () => {
    const { instance, sent } = publisher(() => state());
    instance.schedule();
    await vi.runAllTimersAsync();
    instance.forgetWhatWasSent();
    instance.schedule();
    await vi.runAllTimersAsync();
    expect(Object.keys(sent[1] ?? {}).length).toBe(Object.keys(state()).length);
  });

  it('stops once quitting has begun', async () => {
    const { instance, sent } = publisher(() => state());
    instance.stop();
    instance.schedule();
    await vi.runAllTimersAsync();
    expect(sent).toHaveLength(0);
  });
});
