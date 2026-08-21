export interface ClosedTab {
  url: string;
  title: string;
  index: number;
}

const MAX_REOPENABLE = 12;

/**
 * Somewhere to put a tab you closed by accident, newest first and bounded so a
 * long session cannot grow one without end. What a tab was allowed to remember
 * is decided before it gets here: a Hush tab is never offered, because being
 * able to reopen it is the record it was supposed not to leave.
 */
export class ClosedTabs {
  private readonly stack: ClosedTab[] = [];

  get canReopen(): boolean {
    return this.stack.length > 0;
  }

  remember(tab: ClosedTab): void {
    this.stack.unshift(tab);
    this.stack.length = Math.min(this.stack.length, MAX_REOPENABLE);
  }

  /** The most recently closed tab, removed from the stack. */
  takeMostRecent(): ClosedTab | null {
    return this.stack.shift() ?? null;
  }
}
