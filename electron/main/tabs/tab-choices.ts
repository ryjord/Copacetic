import type { SessionSnapshot, SessionTab } from '../data/session-store';
import type { TabId } from '../../shared/types';

/**
 * The decisions `tabs.ts` makes that do not need a window to make.
 *
 * That file owns every view, every navigation and every favicon, and at nine
 * hundred lines it had no unit test at all — the only thing exercising it was
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
}

/**
 * The tabs to reopen next launch, and which of them was in front.
 *
 * Two exclusions, for different reasons. A start page is not a place anyone
 * navigated to, so restoring one is restoring nothing. A Hush tab is left out
 * because the session file is on disk and listing its address there would be
 * the single place that tab left a trace — its group goes with it, since the
 * tab that belonged to the group is never written at all.
 *
 * The index is counted against the list being built rather than against the
 * order it came from. Taken from the original it is off by one for every start
 * page sitting to the left of the active tab, which restores the wrong site —
 * quietly, and only for people who keep a start page open.
 */
export function sessionFrom(tabs: readonly SessionCandidate[], activeId: TabId | null): SessionSnapshot {
  const saved: SessionTab[] = [];
  let activeIndex = 0;

  for (const tab of tabs) {
    if (tab.isStartPage || tab.isHush) {
      continue;
    }
    if (tab.id === activeId) {
      activeIndex = saved.length;
    }
    saved.push({ url: tab.url, groupId: tab.groupId });
  }

  return { tabs: saved, activeIndex };
}
