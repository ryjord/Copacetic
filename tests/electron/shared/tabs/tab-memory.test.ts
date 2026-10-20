import { describe, expect, it } from 'vitest';
import { describeMemory, formatMemory, memoryByTab } from '../../../../electron/shared/tabs/tab-memory';

describe('memoryByTab', () => {
  it('gives each tab its process, and says when the process is shared', () => {
    const measured = memoryByTab(
      [
        { id: 'docs', processId: 10 },
        { id: 'mail', processId: 10 },
        { id: 'video', processId: 11 },
      ],
      [
        { processId: 10, kilobytes: 200_000 },
        { processId: 11, kilobytes: 600_000 },
      ],
    );
    expect(measured.docs).toEqual({ kilobytes: 200_000, sharedWith: 1 });
    expect(measured.video).toEqual({ kilobytes: 600_000, sharedWith: 0 });
  });

  it('leaves out a tab whose process was not measured', () => {
    expect(memoryByTab([{ id: 'gone', processId: 99 }], [])).toEqual({});
  });
});

describe('describing it', () => {
  it('reads in megabytes until a gigabyte is the plainer number', () => {
    expect(formatMemory(84 * 1024)).toBe('84 MB');
    expect(formatMemory(1.5 * 1024 * 1024)).toBe('1.5 GB');
    expect(formatMemory(10)).toBe('1 MB');
  });

  it('says a shared figure is shared', () => {
    expect(describeMemory({ kilobytes: 84 * 1024, sharedWith: 0 })).toBe('Using 84 MB');
    expect(describeMemory({ kilobytes: 84 * 1024, sharedWith: 2 })).toBe('Using 84 MB, shared with 2 other tabs');
  });
});
