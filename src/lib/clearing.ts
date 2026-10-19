import type { ClearRange } from '@shared/types';

export const CLEAR_RANGES: readonly { id: ClearRange; label: string }[] = [
  { id: 'hour', label: 'Last hour' },
  { id: 'day', label: 'Last 24 hours' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'all', label: 'All time' },
];

/** What a clear removes, said before it happens. A time range touches history only; all time reaches every session. */
export const WHAT_CLEARING_REMOVES: Record<ClearRange, string> = {
  hour: 'History from the last hour is removed.',
  day: 'History from the last 24 hours is removed.',
  week: 'History from the last 7 days is removed.',
  all: 'All history, cookies, site data and the cache are removed, including those of groups that keep their own. You will be signed out of sites.',
};

export function clearTitle(range: ClearRange): string {
  const label = CLEAR_RANGES.find((option) => option.id === range)?.label.toLowerCase() ?? '';
  return `Clear browsing data from ${label}?`;
}
