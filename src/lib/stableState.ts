import type { BrowserState, TabState } from '../../electron/shared/types';

// Keeping references stable across state pushes.

/** Structural equality for the shapes that cross IPC. */
export function isSameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;

  if (aIsArray) {
    const left = a as unknown[];
    const right = b as unknown[];
    if (left.length !== right.length) return false;
    return left.every((value, index) => isSameValue(value, right[index]));
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && isSameValue(left[key], right[key]));
}

/** The previous value when nothing changed, so its reference survives. */
export function keepIfSame<T>(previous: T, next: T): T {
  return isSameValue(previous, next) ? previous : next;
}

/** Tabs, each keeping its own identity. */
export function keepTabs(previous: readonly TabState[], next: readonly TabState[]): TabState[] {
  const byId = new Map(previous.map((tab) => [tab.id, tab]));

  let anyChanged = previous.length !== next.length;
  const tabs = next.map((tab, index) => {
    const before = byId.get(tab.id);
    if (before && isSameValue(before, tab)) {
      if (previous[index] !== before) anyChanged = true;
      return before;
    }
    anyChanged = true;
    return tab;
  });

  return anyChanged ? tabs : (previous as TabState[]);
}

/** A pushed state with every unchanged part still pointing at what it replaced. */
export function stabiliseState(previous: BrowserState, next: BrowserState): BrowserState {
  return {
    tabs: keepTabs(previous.tabs, next.tabs),
    tabOrder: keepIfSame(previous.tabOrder, next.tabOrder),
    activeTabId: next.activeTabId,
    downloads: keepIfSame(previous.downloads, next.downloads),
    find: keepIfSame(previous.find, next.find),
    permissionPrompts: keepIfSame(previous.permissionPrompts, next.permissionPrompts),
    authPrompts: keepIfSame(previous.authPrompts, next.authPrompts),
    settings: keepIfSame(previous.settings, next.settings),
    hasClosedTabs: next.hasClosedTabs,
    update: keepIfSame(previous.update, next.update),
  };
}
