import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeSync, mkdtempSync, openSync, readFileSync, statSync, type PathLike } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_WRITE_DIR } }));

const { PersistedFile, REAL_DISK, asNumber, isRecord, renameOverAnyLock } =
  await import('../../electron/main/data/persistence');

interface Thing {
  name: string;
  count: number;
}
const fallback = (): Thing => ({ name: 'default', count: 0 });
const revive = (raw: unknown): Thing | null =>
  isRecord(raw) && typeof raw.name === 'string' ? { name: raw.name, count: asNumber(raw.count, 0) } : null;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'copacetic-writepath-'));
  process.env.COPA_WRITE_DIR = dir;
});

/**
 * That a flush takes the durable path, rather than that a durable path exists.
 *
 * `renameOverAnyLock` was exercised through an injected fake, which proves the
 * retry works on its own and says nothing about whether a flush calls it —
 * reverting the flush to a plain `renameSync` left every test in the suite
 * green. And the flush to disk, which is the point of the whole change, was
 * asserted nowhere: every other test passes identically whether or not it
 * happens.
 *
 * Mocking `node:fs` does not reach this module under the test runner, measured
 * rather than assumed, which is why the operations are a seam instead.
 */
describe('the write path a flush actually takes', () => {
  it('writes and then renames, in that order', () => {
    const order: string[] = [];
    const file = new PersistedFile<Thing>('ordered.json', fallback, revive, 400, undefined, {
      write: (target, contents) => {
        order.push('write');
        REAL_DISK.write(target, contents);
      },
      rename: (from, to) => {
        order.push('rename');
        REAL_DISK.rename(from, to);
      },
    });

    file.set({ name: 'ordered', count: 1 });
    file.flush();

    // Renaming first would publish a name with nothing behind it, which is what
    // the temporary file exists to prevent.
    expect(order).toEqual(['write', 'rename']);
    expect((JSON.parse(readFileSync(path.join(dir, 'ordered.json'), 'utf8')) as Thing).name).toBe('ordered');
  });

  it('goes through the retrying rename, not a bare one', () => {
    let refused = 0;
    const file = new PersistedFile<Thing>('retried.json', fallback, revive, 400, undefined, {
      write: REAL_DISK.write,
      rename: (from, to) =>
        renameOverAnyLock(from, to, (a: PathLike, b: PathLike) => {
          refused += 1;
          if (refused === 1) {
            const error = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException;
            error.code = 'EPERM';
            throw error;
          }
          return REAL_DISK.rename(a as string, b as string);
        }),
    });

    file.set({ name: 'retried', count: 7 });
    file.flush();

    expect(refused).toBe(2);
    // And the data arrived, rather than the retry merely not throwing.
    expect((JSON.parse(readFileSync(path.join(dir, 'retried.json'), 'utf8')) as Thing).name).toBe('retried');
  });

  /*
   * The real write, checked for the two properties that are not observable from
   * the file's contents: it is private, and the descriptor is flushed before it
   * is closed. The flush itself cannot be seen from out here; what can be seen
   * is that writing through the real operation produces a file that is complete
   * and 0600, which is the part a person is affected by.
   */
  it('produces a complete, private file', () => {
    const target = path.join(dir, 'direct.json');
    REAL_DISK.write(target, JSON.stringify({ name: 'direct', count: 3 }));

    expect((statSync(target).mode & 0o777).toString(8)).toBe('600');
    expect((JSON.parse(readFileSync(target, 'utf8')) as Thing).count).toBe(3);

    // Large enough that a partial write would show, since writeFileSync on a
    // descriptor is the part that has to loop until everything is out.
    const big = 'x'.repeat(3_000_000);
    REAL_DISK.write(target, JSON.stringify({ name: big, count: 0 }));
    expect((JSON.parse(readFileSync(target, 'utf8')) as Thing).name).toHaveLength(3_000_000);
  });

  /*
   * Descriptor numbers are the observable part. Written first as "open two
   * hundred files and see whether it throws", which never failed: the limit is
   * far higher than two hundred, so the test could not fail and proved nothing.
   * The next free descriptor climbing by one per write is the actual signal.
   */
  it('leaves the descriptor closed rather than leaking one per write', () => {
    const first = openSync(path.join(dir, 'probe'), 'w');
    closeSync(first);

    const WRITES = 200;
    for (let index = 0; index < WRITES; index += 1) {
      REAL_DISK.write(path.join(dir, `many-${index}.json`), '{"name":"x","count":0}');
    }

    const next = openSync(path.join(dir, 'probe2'), 'w');
    closeSync(next);
    // Leaking one per write would put `next` two hundred above `first`. A few
    // of slack, because the runner opens files of its own while this runs.
    expect(next - first).toBeLessThan(20);
  });
});
