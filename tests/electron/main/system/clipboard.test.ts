import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeText = vi.fn(async (_text: string) => {});
vi.mock('electron', () => ({ clipboard: { writeText: (text: string) => writeText(text) } }));

const warn = vi.fn();
vi.mock('../../../../electron/main/system/diagnostics', () => ({
  log: { warn: (...args: unknown[]) => warn(...args) },
  describeError: (error: unknown) => ({ error: String(error) }),
}));

const { copyText } = await import('../../../../electron/main/system/clipboard');

beforeEach(() => {
  writeText.mockReset();
  writeText.mockImplementation(async () => {});
  warn.mockReset();
});

describe('copying text', () => {
  it('puts the text on the clipboard and says it landed', async () => {
    expect(await copyText('https://example.com/')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://example.com/');
  });

  // A menu click has nobody to hand an error to, so a refusal is written down rather than thrown.
  it('says so, and logs it, when the clipboard refuses the write', async () => {
    writeText.mockImplementation(async () => {
      throw new Error('refused');
    });
    expect(await copyText('https://example.com/')).toBe(false);
    expect(warn).toHaveBeenCalledWith('could not copy to the clipboard', { error: 'Error: refused' });
  });
});
