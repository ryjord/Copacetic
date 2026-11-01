// Libs
import { readFileSync } from 'node:fs';

// Utils
import { systemMemoryInfo } from '../engine/system';

/** What Electron reports, in kilobytes; macOS adds what it can take back, Linux and Windows do not. */
export interface SystemMemory {
  total: number;
  free: number;
  fileBacked?: number;
  purgeable?: number;
}

// Below this share of memory left to use, background tabs start to sleep before their time.
export const LOW_MEMORY_FRACTION = 0.1;

/**
 * The memory programs could still be given, in kilobytes.
 *
 * Electron's `free` means different things: on Windows it is what is available;
 * on macOS it leaves out the file cache the system hands back on demand, so a
 * healthy Mac reads as nearly full; on Linux it is MemFree, which leaves out
 * the page cache, and MemAvailable in /proc/meminfo is the honest figure.
 */
export function availableMemory(platform: string, memory: SystemMemory, procMeminfo = ''): number {
  if (platform === 'darwin') {
    return memory.free + (memory.fileBacked ?? 0) + (memory.purgeable ?? 0);
  }
  if (platform === 'linux') {
    const available = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(procMeminfo)?.[1];
    return available === undefined ? memory.free : Number(available);
  }
  return memory.free;
}

export function isMemoryLow(platform: string, memory: SystemMemory, procMeminfo = ''): boolean {
  return memory.total > 0 && availableMemory(platform, memory, procMeminfo) < memory.total * LOW_MEMORY_FRACTION;
}

/** Asked of this machine now; anything it cannot read counts as plenty, so a failure never sleeps a tab. */
export function isThisMachineLowOnMemory(): boolean {
  try {
    const procMeminfo = process.platform === 'linux' ? readFileSync('/proc/meminfo', 'utf8') : '';
    return isMemoryLow(process.platform, systemMemoryInfo(), procMeminfo);
  } catch {
    return false;
  }
}
