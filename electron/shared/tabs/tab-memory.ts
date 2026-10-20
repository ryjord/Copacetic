import { t } from '../i18n/translate';
import type { TabId } from '../types';

/** What one tab's page process holds, and how many other tabs share that process. */
export interface TabMemory {
  kilobytes: number;
  sharedWith: number;
}

/**
 * Each tab's process, measured. Pages from one site often share a process, so
 * a figure is the process's, and says how many others it is shared with rather
 * than pretending to split it.
 */
export function memoryByTab(
  tabs: readonly { id: TabId; processId: number }[],
  processes: readonly { processId: number; kilobytes: number }[],
): Record<TabId, TabMemory> {
  const kilobytesOf = new Map(processes.map((process) => [process.processId, process.kilobytes]));
  const tabsIn = new Map<number, number>();
  tabs.forEach((tab) => tabsIn.set(tab.processId, (tabsIn.get(tab.processId) ?? 0) + 1));
  return Object.fromEntries(
    tabs
      .filter((tab) => kilobytesOf.has(tab.processId))
      .map((tab) => [
        tab.id,
        { kilobytes: kilobytesOf.get(tab.processId) ?? 0, sharedWith: (tabsIn.get(tab.processId) ?? 1) - 1 },
      ]),
  );
}

export function formatMemory(kilobytes: number): string {
  const megabytes = kilobytes / 1024;
  return megabytes >= 1024 ? `${(megabytes / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(megabytes))} MB`;
}

export function describeMemory(memory: TabMemory): string {
  const amount = formatMemory(memory.kilobytes);
  return memory.sharedWith > 0
    ? t('shell.tabStrip.memoryShared', { amount, count: memory.sharedWith })
    : t('shell.tabStrip.memory', { amount });
}
