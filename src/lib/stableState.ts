import type { BrowserState, TabState } from '../../electron/shared/types';

/**
 * Keeping references stable across state pushes.
 *
 * The main process sends a whole `BrowserState` on every change, freshly
 * deserialised, so every field is a new object even when nothing about it
 * differs. Zustand compares selector results by reference, which means one
 * download's byte counter ticking re-renders every tab, the settings panel and
 * the connection panel — several times a second, on the thread that also
 * handles typing.
 *
 * So each slice is compared with the one it replaces, and the previous
 * reference is kept when they match. Comparing a handful of small objects
 * costs far less than re-rendering the interface, and it makes selectors mean
 * what they appear to mean.
 */

/**
 * Structural equality for the shapes that cross IPC.
 *
 * The state is structured-clone safe by contract — no functions, no classes,
 * no `undefined` in arrays — so this only has to handle plain objects, arrays
 * and primitives.
 */
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

/**
 * Tabs, each keeping its own identity.
 *
 * Per tab rather than for the array as a whole: one tab finishing loading
 * should re-render that tab, not the other twenty-nine. The array reference is
 * kept too when every tab in it is unchanged.
 */
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

/**
 * A pushed state with every unchanged part still pointing at what it replaced.
 *
 * Written out field by field rather than looped, so adding something to
 * `BrowserState` and forgetting it here is a type error rather than a slice
 * that quietly re-renders everything for the rest of the product's life.
 */
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
