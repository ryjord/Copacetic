import type { ClearRange } from './types';

/** What a clear reaches. Chromium clears cookies and the cache entirely or not at all; only history has a range. */
export interface ClearChoice {
  history: boolean;
  siteData: boolean;
  cache: boolean;
}

/** A time range used to mean history alone, and all time everything; that stays the starting point. */
export function defaultClearChoice(range: ClearRange): ClearChoice {
  const isAllTime = range === 'all';
  return { history: true, siteData: isAllTime, cache: isAllTime };
}

/** A renderer's choice, trusted only as three booleans; anything else falls back to the range's default. */
export function readClearChoice(value: unknown, range: ClearRange): ClearChoice {
  if (typeof value !== 'object' || value === null) {
    return defaultClearChoice(range);
  }
  return {
    history: Reflect.get(value, 'history') === true,
    siteData: Reflect.get(value, 'siteData') === true,
    cache: Reflect.get(value, 'cache') === true,
  };
}

export function choosesNothing(choice: ClearChoice): boolean {
  return !choice.history && !choice.siteData && !choice.cache;
}
