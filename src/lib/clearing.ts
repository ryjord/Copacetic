// Utils
import { t } from '@shared/i18n/translate';

// Types
import type { ClearRange } from '@shared/types';

export const CLEAR_RANGES: readonly { id: ClearRange; label: string }[] = [
  { id: 'hour', label: t('shell.clearing.ranges.hour') },
  { id: 'day', label: t('shell.clearing.ranges.day') },
  { id: 'week', label: t('shell.clearing.ranges.week') },
  { id: 'all', label: t('shell.clearing.ranges.all') },
];

export function clearTitle(range: ClearRange): string {
  const label = CLEAR_RANGES.find((option) => option.id === range)?.label.toLowerCase() ?? '';
  return t('shell.clearing.title', { range: label });
}
