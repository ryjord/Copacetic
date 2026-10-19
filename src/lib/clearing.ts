import type { ClearRange } from '@shared/types';

export const CLEAR_RANGES: readonly { id: ClearRange; label: string }[] = [
  { id: 'hour', label: 'Last hour' },
  { id: 'day', label: 'Last 24 hours' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'all', label: 'All time' },
];

export function clearTitle(range: ClearRange): string {
  const label = CLEAR_RANGES.find((option) => option.id === range)?.label.toLowerCase() ?? '';
  return `Clear browsing data from ${label}?`;
}
