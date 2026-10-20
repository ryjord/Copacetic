import { afterEach, describe, expect, it, vi } from 'vitest';

const given: { args: string[]; stdin: string }[] = [];
vi.mock('node:child_process', () => {
  const execFile = (_file: string, args: string[], _options: unknown, done: (error: Error | null) => void) => {
    const call = { args, stdin: '' };
    given.push(call);
    setTimeout(() => done(null), 0);
    return { stdin: { end: (text: string) => (call.stdin = text) } };
  };
  return { execFile, default: { execFile } };
});

const { writeConcealed } = await import('../../../../electron/main/vault/concealed-clipboard');
const platform = Object.getOwnPropertyDescriptor(process, 'platform');

afterEach(() => {
  given.length = 0;
  if (platform) {
    Object.defineProperty(process, 'platform', platform);
  }
});

describe('writeConcealed', () => {
  it('hands the password over on stdin, never in an argument', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(await writeConcealed('hunter2')).toBe(true);
    expect(given[0]?.stdin).toBe('hunter2');
    expect(given[0]?.args.join(' ')).not.toContain('hunter2');
    expect(given[0]?.args.join(' ')).toContain('org.nspasteboard.ConcealedType');
  });

  it('leaves other systems to the plain write', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(await writeConcealed('hunter2')).toBe(false);
    expect(given).toHaveLength(0);
  });
});
