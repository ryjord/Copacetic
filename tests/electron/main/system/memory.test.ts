import { describe, expect, it } from 'vitest';
import { availableMemory, isMemoryLow } from '../../../../electron/main/system/memory';

const GB = 1024 * 1024;

/**
 * The figures below are this machine's own, from a 48 GB Mac with plenty to
 * spare: Electron's `free` was 4 GB of it, under a tenth, while macOS called
 * 80% free. Judging by `free` alone would have put tabs to sleep on a healthy
 * Mac all day.
 */
describe('how much memory is left to use', () => {
  const healthyMac = { total: 48 * GB, free: 4.05 * GB, fileBacked: 13.3 * GB, purgeable: 0.3 * GB };

  it('counts the file cache macOS gives back on demand', () => {
    expect(availableMemory('darwin', healthyMac)).toBeCloseTo(17.65 * GB, -3);
    expect(isMemoryLow('darwin', healthyMac)).toBe(false);
  });

  it('is low on a Mac with little free and little to take back', () => {
    expect(isMemoryLow('darwin', { total: 16 * GB, free: 0.3 * GB, fileBacked: 0.8 * GB, purgeable: 0.1 * GB })).toBe(
      true,
    );
  });

  // MemFree leaves out the page cache, which Linux hands back the moment a program asks.
  it('reads MemAvailable on Linux rather than the free figure', () => {
    const meminfo = 'MemTotal:       16000000 kB\nMemFree:          400000 kB\nMemAvailable:    9000000 kB\n';
    const memory = { total: 16_000_000, free: 400_000 };
    expect(availableMemory('linux', memory, meminfo)).toBe(9_000_000);
    expect(isMemoryLow('linux', memory, meminfo)).toBe(false);
    expect(isMemoryLow('linux', memory, '')).toBe(true);
  });

  it('takes Windows at its word, where free is what is available', () => {
    expect(isMemoryLow('win32', { total: 16 * GB, free: 1 * GB })).toBe(true);
    expect(isMemoryLow('win32', { total: 16 * GB, free: 4 * GB })).toBe(false);
  });

  it('never calls a machine low when it reports no memory at all', () => {
    expect(isMemoryLow('win32', { total: 0, free: 0 })).toBe(false);
  });
});
