/**
 * A group is a name, a colour, and how far the separation goes.
 *
 * Tab groups and separate containers are the same idea at two depths, so they
 * are one thing here: a group that keeps its own browsing runs in its own
 * session, and one that does not simply names a set of tabs.
 */

/**
 * Group colours are deliberately not the state colours.
 *
 * The chrome's rule is that colour appears only where it carries state, and
 * each state colour means one thing everywhere. A group colour means "this
 * group", which is different for every person — identity rather than state. So
 * the two palettes are kept apart by chroma: signals are saturated, identities
 * are muted, and a group can never be given a colour that reads as a signal.
 */
export const GROUP_COLOURS = [
  { id: 'violet', hex: '#7d7aa8' },
  { id: 'moss', hex: '#6f8f78' },
  { id: 'clay', hex: '#a87f6f' },
  { id: 'ocean', hex: '#5f8394' },
  { id: 'plum', hex: '#94657f' },
  { id: 'ash', hex: '#7d8894' },
] as const;

export type GroupColourId = (typeof GROUP_COLOURS)[number]['id'];

export interface TabGroup {
  id: string;
  name: string;
  colour: GroupColourId;
  /** Its own cookies, logins and cache. Written to disk, so a Hush tab can never use it. */
  ownSession: boolean;
  collapsed: boolean;
}

export function colourOf(colour: GroupColourId): string {
  return GROUP_COLOURS.find((candidate) => candidate.id === colour)?.hex ?? GROUP_COLOURS[0].hex;
}

/**
 * Which session a tab runs in.
 *
 * A group's own session is persistent and a Hush tab's must not be, so one tab
 * cannot have both. Hush wins: it is the stronger promise, and the weaker one
 * breaking it would be the more expensive mistake. A group's separation simply
 * does not reach a Hush tab inside it.
 */
export function partitionFor(
  options: { isHush: boolean; group: TabGroup | null },
  partitions: { web: string; hush: string },
): string {
  if (options.isHush) {
    return partitions.hush;
  }
  if (options.group?.ownSession) {
    return `persist:copacetic-group-${options.group.id}`;
  }
  return partitions.web;
}

/**
 * What a group can honestly claim about the tabs in it.
 *
 * A group holding both kinds cannot say one thing about all of them, so it is
 * not allowed to say the thing that would be true of only part.
 */
export type GroupClaim = 'separate' | 'shared' | 'mixed';

export function claimOf(group: TabGroup, holdsHush: boolean): GroupClaim {
  if (holdsHush) {
    return 'mixed';
  }
  return group.ownSession ? 'separate' : 'shared';
}

export function describeClaim(claim: GroupClaim): string {
  switch (claim) {
    case 'separate':
      return 'Its own cookies and logins. Signing in here signs you in nowhere else.';
    case 'shared':
      return 'Shares cookies and logins with your other tabs.';
    case 'mixed':
      return 'Mixed: one of these tabs keeps nothing, and the rest are kept. This group cannot say one thing about all of them.';
  }
}

/**
 * The strip, split into runs of tabs that belong together.
 *
 * Runs are consecutive: a group is drawn wherever its tabs are adjacent, so a
 * group whose tabs have been dragged apart is drawn as two bands rather than
 * one band swallowing what sits between them. Two bands is honest about where
 * the tabs actually are; one would not be.
 */
export function segmentByGroup<T extends { groupId: string | null }>(
  tabs: readonly T[],
): { groupId: string | null; tabs: T[] }[] {
  const runs: { groupId: string | null; tabs: T[] }[] = [];
  for (const tab of tabs) {
    const last = runs[runs.length - 1];
    if (last && last.groupId === tab.groupId) {
      last.tabs.push(tab);
    } else {
      runs.push({ groupId: tab.groupId, tabs: [tab] });
    }
  }
  return runs;
}

/**
 * Which group a tab lands in when it is dragged somewhere.
 *
 * It joins a group only when it comes to rest *between* two tabs of that group.
 * Landing beside one is not joining it: the edge of a group is exactly where
 * someone parks a tab they want next to it and not in it, and a rule that
 * swallowed those would put tabs in a container they never chose — which for a
 * group that keeps its own browsing decides which session they load in.
 */
/**
 * Where to look after collapsing a group that holds the tab being looked at.
 *
 * A collapsed group hides its tabs, and the active tab is one of them: its page
 * stays on screen with nothing in the strip to point at it, so there is no way
 * back to it except expanding the group again. Activation moves out of the
 * group instead — rightward first, because that is where the eye already is
 * after collapsing, and leftward only if the group ends the strip.
 *
 * Null means every tab is in this group, and there is nowhere to go: the group
 * must stay open, because collapsing it would leave the window showing a page
 * it cannot name.
 */
export function tabAfterCollapsing<T extends { groupId: string | null }>(
  tabs: readonly T[],
  activeIndex: number,
  groupId: string,
): T | null {
  // Nothing is being hidden if the tab being looked at is not in the group, so
  // nothing moves. Checked here rather than at the call site: a caller that
  // forgot would silently activate a different tab for no reason.
  const active = tabs[activeIndex];
  if (active && active.groupId !== groupId) {
    return active;
  }

  for (let index = activeIndex + 1; index < tabs.length; index += 1) {
    const candidate = tabs[index];
    if (candidate && candidate.groupId !== groupId) {
      return candidate;
    }
  }
  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    const candidate = tabs[index];
    if (candidate && candidate.groupId !== groupId) {
      return candidate;
    }
  }
  return null;
}

export function groupForDrop<T extends { groupId: string | null }>(
  tabs: readonly T[],
  fromIndex: number,
  toIndex: number,
): string | null {
  const without = tabs.filter((_, index) => index !== fromIndex);
  // Where the tab actually comes to rest. TabManager.move removes it first and
  // then splices it in at the clamped target, so the index is read against the
  // strip that no longer contains it — the same for both directions of travel.
  const target = Math.min(Math.max(0, toIndex), tabs.length - 1);
  const before = without[target - 1];
  const after = without[target];

  if (before && after && before.groupId && before.groupId === after.groupId) {
    return before.groupId;
  }
  return null;
}
