// Utils
import { send } from '@/lib/bridge';

// Types
import type { Settings } from '../../../../electron/shared/types';

export function updateSettings(patch: Partial<Settings>) {
  send((api) => api.settings.update(patch));
}

// A Record keyed by the union makes a new member a type error until it is labelled.
export function labelledOptions<Id extends string>(labels: Record<Id, string>) {
  const ids = Object.keys(labels) as Id[];
  return ids.map((id) => ({ id, label: labels[id] }));
}
