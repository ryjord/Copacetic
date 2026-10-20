import type { GroupColourId } from '../../shared/tabs/tab-groups';

export interface ClosedTab {
  url: string;
  title: string;
  index: number;
  groupId: string | null;
  isPinned: boolean;
}

/** What a closed group was, enough to make it again; its own session's data is gone with it either way. */
export interface ClosedGroup {
  name: string;
  colour: GroupColourId;
  ownSession: boolean;
}

/** One thing to reopen: a tab, or a group closed as one, which comes back as one. */
export type ClosedEntry = { kind: 'tab'; tab: ClosedTab } | { kind: 'group'; group: ClosedGroup; tabs: ClosedTab[] };

const MAX_REOPENABLE = 12;

/**
 * Somewhere to put a tab you closed by accident, newest first and bounded so a
 * long session cannot grow one without end. One per profile, so a tab closed in
 * one window can be reopened from another. What a tab was allowed to remember
 * is decided before it gets here: a Hush tab is never offered, because being
 * able to reopen it is the record it was supposed not to leave.
 */
export class ClosedTabs {
  private readonly stack: ClosedEntry[] = [];
  // While a group closes, its tabs collect here and go on the stack as one entry.
  private closingGroup: { group: ClosedGroup; tabs: ClosedTab[] } | null = null;

  get canReopen(): boolean {
    return this.stack.length > 0;
  }

  remember(tab: ClosedTab): void {
    if (this.closingGroup) {
      this.closingGroup.tabs.push(tab);
      return;
    }
    this.push({ kind: 'tab', tab });
  }

  /** Everything remembered until `endGroup` is one entry, the group. */
  beginGroup(group: ClosedGroup): void {
    this.closingGroup = { group, tabs: [] };
  }

  endGroup(): void {
    const closing = this.closingGroup;
    this.closingGroup = null;
    if (closing && closing.tabs.length > 0) {
      this.push({ kind: 'group', group: closing.group, tabs: closing.tabs });
    }
  }

  /** Newest first, for a menu to list. */
  entries(): readonly ClosedEntry[] {
    return this.stack;
  }

  /** The most recently closed entry, removed from the stack. */
  takeMostRecent(): ClosedEntry | null {
    return this.stack.shift() ?? null;
  }

  /** One entry by its place in the list, removed from the stack. */
  take(position: number): ClosedEntry | null {
    return this.stack.splice(position, 1)[0] ?? null;
  }

  private push(entry: ClosedEntry): void {
    this.stack.unshift(entry);
    this.stack.length = Math.min(this.stack.length, MAX_REOPENABLE);
  }
}
