// Utils
import {
  MAX_SESSION_HISTORY,
  type SessionHistory,
  type SessionSnapshot,
  type SessionTab,
} from '../data/session-store';
import { isPageNavigableUrl } from '../../shared/browsing/url';

// Types
import type { TabId } from '../../shared/types';
import type { SplitView } from '../../shared/tabs/split-view';

/**
 * The decisions `tabs.ts` makes that do not need a window to make.
 *
 * That file owns every view, every navigation and every favicon, and at nine
 * hundred lines it had no unit test at all - the only thing exercising it was
 * the smoke suite, through a running application. The parts below are the ones
 * where being wrong is quiet: a tab that comes back pointing at the wrong site,
 * or a close that lands you somewhere you did not expect.
 */

/**
 * Which tab to show after closing the one you were looking at.
 *
 * The neighbour on the right, which is what every other browser does, falling
 * back to the left when the tab that closed was the last one. `index` is where
 * the closed tab used to be, read against the order it has already left.
 */
export function tabAfterClosing(order: readonly TabId[], closedIndex: number): TabId | null {
  if (order.length === 0) {
    return null;
  }
  const at = Math.min(Math.max(0, closedIndex), order.length - 1);
  return order[at] ?? null;
}

/** What a tab needs to be for the session file to have an opinion about it. */
export interface SessionCandidate {
  id: TabId;
  url: string;
  groupId: string | null;
  isStartPage: boolean;
  isHush: boolean;
  isPinned: boolean;
  /** Its back and forward list as the page has it, page state and all; only addresses and titles are kept. */
  history: { entries: readonly { url: string; title: string }[]; index: number } | null;
}

/**
 * The part of a tab's history worth writing down: none for a single page, and
 * none at all if any entry is not a page, since a gap would send Back somewhere
 * the tab never was. A long history keeps the stretch around where the tab is.
 */
export function historyToKeep(history: SessionCandidate['history']): SessionHistory | null {
  if (!history || history.entries.length < 2 || !history.entries.every((entry) => isPageNavigableUrl(entry.url))) {
    return null;
  }
  const forwardRoom = 10;
  const latestStart = Math.max(0, history.entries.length - MAX_SESSION_HISTORY);
  const start = Math.min(Math.max(0, history.index - (MAX_SESSION_HISTORY - forwardRoom)), latestStart);
  const entries = history.entries
    .slice(start, start + MAX_SESSION_HISTORY)
    .map((entry) => ({ url: entry.url, title: entry.title }));
  return { entries, index: history.index - start };
}

/**
 * The tabs to reopen next launch, and which of them was in front.
 *
 * Two exclusions, for different reasons. A start page is not a place anyone
 * navigated to, so restoring one is restoring nothing. A Hush tab is left out
 * because the session file is on disk and listing its address there would be
 * the single place that tab left a trace - its group goes with it, since the
 * tab that belonged to the group is never written at all.
 *
 * The index is counted against the list being built rather than against the
 * order it came from. Taken from the original it is off by one for every start
 * page sitting to the left of the active tab, which restores the wrong site -
 * quietly, and only for people who keep a start page open.
 */
export function sessionFrom(
  tabs: readonly SessionCandidate[],
  activeId: TabId | null,
  split: SplitView | null = null,
): SessionSnapshot {
  const saved: SessionTab[] = [];
  const placeOf = new Map<TabId, number>();
  let activeIndex = 0;

  for (const tab of tabs) {
    if (tab.isStartPage || tab.isHush) {
      continue;
    }
    if (tab.id === activeId) {
      activeIndex = saved.length;
    }
    placeOf.set(tab.id, saved.length);
    const history = historyToKeep(tab.history);
    saved.push({
      url: tab.url,
      groupId: tab.groupId,
      ...(tab.isPinned ? { isPinned: true } : {}),
      ...(history ? { history } : {}),
    });
  }

  const leftIndex = split ? placeOf.get(split.leftId) : undefined;
  const rightIndex = split ? placeOf.get(split.rightId) : undefined;
  const isSplitKept = split !== null && leftIndex !== undefined && rightIndex !== undefined;
  return {
    tabs: saved,
    activeIndex,
    ...(isSplitKept ? { split: { leftIndex, rightIndex, ratio: split.ratio } } : {}),
  };
}

/**
 * The strip's order with every pinned tab ahead of every other.
 *
 * Stable, so each run keeps its own order: a tab just pinned lands at the end
 * of the pinned run, one just unpinned becomes the first of the rest, and a
 * tab opened beside a pinned one cannot land inside the pinned run.
 */
export function pinnedFirst(order: readonly TabId[], isPinned: (id: TabId) => boolean): TabId[] {
  return [...order.filter(isPinned), ...order.filter((id) => !isPinned(id))];
}

/** Where a moved tab may go: inside its own run, so dragging cannot mix pinned tabs with the rest. */
export function clampToRun(
  order: readonly TabId[],
  isPinned: (id: TabId) => boolean,
  id: TabId,
  toIndex: number,
): number {
  const pinnedCount = order.filter(isPinned).length;
  const [lowest, highest] = isPinned(id) ? [0, pinnedCount - 1] : [pinnedCount, order.length - 1];
  return Math.min(Math.max(lowest, toIndex), highest);
}

/** What deciding whether a tab may sleep needs to know about it. */
export interface SleepCandidate {
  id: TabId;
  isActive: boolean;
  /** A page Copacetic draws, which has nothing of its own to give back. */
  isInternalPage: boolean;
  isAsleep: boolean;
  /** Playing sound, which someone is listening to whether or not they are looking. */
  isAudible: boolean;
  lastActiveAt: number;
}

/**
 * The tabs left alone long enough to give up their memory.
 *
 * Never the one in front, one playing sound, a page of ours that holds nothing,
 * or one already asleep. Zero minutes means never.
 */
export function tabsToSleep(tabs: readonly SleepCandidate[], now: number, afterMinutes: number): TabId[] {
  if (afterMinutes <= 0) {
    return [];
  }
  const cutoff = now - afterMinutes * 60_000;
  return tabs.filter((tab) => canSleepNow(tab) && tab.lastActiveAt <= cutoff).map((tab) => tab.id);
}

function canSleepNow(tab: SleepCandidate): boolean {
  return !tab.isActive && !tab.isInternalPage && !tab.isAsleep && !tab.isAudible;
}

// Left alone at least this long before memory running low can put a tab to sleep early.
export const MEMORY_SLEEP_IDLE_MINUTES = 5;

/**
 * The one tab to give back its memory early, when the machine runs low: the
 * one left alone longest, so a page just glanced away from is not reloaded.
 * One at a time, so each look at memory sees what the last sleep gave back.
 * Turning sleeping off turns this off too.
 */
export function tabToSleepForMemory(
  tabs: readonly SleepCandidate[],
  now: number,
  afterMinutes: number,
): TabId | null {
  if (afterMinutes <= 0) {
    return null;
  }
  const cutoff = now - MEMORY_SLEEP_IDLE_MINUTES * 60_000;
  const [longestIdle] = tabs
    .filter((tab) => canSleepNow(tab) && tab.lastActiveAt <= cutoff)
    .toSorted((aTab, bTab) => aTab.lastActiveAt - bTab.lastActiveAt);
  return longestIdle?.id ?? null;
}
