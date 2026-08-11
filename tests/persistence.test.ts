import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_PERSIST_DIR } }));

const { PersistedFile, asBoolean, asNumber, asString, isRecord } = await import('../electron/main/persistence');

let dir: string;
const filePath = (name = 'thing.json') => path.join(dir, name);

interface Thing {
  name: string;
  count: number;
}

const fallback = (): Thing => ({ name: 'default', count: 0 });
const revive = (raw: unknown): Thing | null =>
  isRecord(raw) && typeof raw.name === 'string' ? { name: raw.name, count: asNumber(raw.count, 0) } : null;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'copacetic-persist-'));
  process.env.COPA_PERSIST_DIR = dir;
});

describe('a file that is not there yet', () => {
  it('starts from the fallback rather than failing', () => {
    expect(new PersistedFile<Thing>('thing.json', fallback, revive).get()).toEqual({ name: 'default', count: 0 });
  });

  it('writes nothing until something changes', () => {
    new PersistedFile<Thing>('thing.json', fallback, revive);
    expect(existsSync(filePath())).toBe(false);
  });
});

describe('reading what was written', () => {
  it('survives a round trip', () => {
    const file = new PersistedFile<Thing>('thing.json', fallback, revive);
    file.set({ name: 'kept', count: 3 });
    file.flush();

    expect(new PersistedFile<Thing>('thing.json', fallback, revive).get()).toEqual({ name: 'kept', count: 3 });
  });

  it('applies an update to what is already there', () => {
    const file = new PersistedFile<Thing>('thing.json', fallback, revive);
    file.set({ name: 'a', count: 1 });
    const updated = file.update((current) => ({ ...current, count: current.count + 1 }));

    expect(updated.count).toBe(2);
    expect(file.get().count).toBe(2);
  });
});

describe('a file the user has broken', () => {
  // Settings live in a directory people can open and edit. A malformed file
  // must never stop the browser starting.
  it('starts anyway when the JSON is malformed', () => {
    writeFileSync(filePath(), '{ not json at all');
    expect(new PersistedFile<Thing>('thing.json', fallback, revive).get()).toEqual({ name: 'default', count: 0 });
  });

  it('moves the broken file aside rather than overwriting it', () => {
    writeFileSync(filePath(), '{ not json at all');
    new PersistedFile<Thing>('thing.json', fallback, revive);

    expect(existsSync(`${filePath()}.corrupt`)).toBe(true);
    expect(readFileSync(`${filePath()}.corrupt`, 'utf8')).toBe('{ not json at all');
  });

  it('falls back when the shape is wrong even though the JSON is valid', () => {
    writeFileSync(filePath(), JSON.stringify({ unexpected: true }));
    expect(new PersistedFile<Thing>('thing.json', fallback, revive).get()).toEqual({ name: 'default', count: 0 });
  });

  it('falls back for JSON that is not an object at all', () => {
    writeFileSync(filePath(), '"just a string"');
    expect(new PersistedFile<Thing>('thing.json', fallback, revive).get()).toEqual({ name: 'default', count: 0 });
  });
});

describe('writing is atomic', () => {
  // Written to a temporary file and renamed, so a crash mid-write leaves the
  // previous file intact rather than a half-written one.
  it('leaves no temporary file behind', () => {
    const file = new PersistedFile<Thing>('thing.json', fallback, revive);
    file.set({ name: 'a', count: 1 });
    file.flush();

    const leftovers = readdirSync(dir).filter((name) => name !== 'thing.json');
    expect(leftovers).toEqual([]);
  });

  it('produces a file that parses', () => {
    const file = new PersistedFile<Thing>('thing.json', fallback, revive);
    file.set({ name: 'a', count: 1 });
    file.flush();

    expect(JSON.parse(readFileSync(filePath(), 'utf8'))).toEqual({ name: 'a', count: 1 });
  });
});

describe('flushing is debounced', () => {
  it('does not touch the disk on every change', () => {
    const file = new PersistedFile<Thing>('thing.json', fallback, revive, 10_000);
    file.set({ name: 'a', count: 1 });
    // Still only in memory; the debounce has not elapsed.
    expect(existsSync(filePath())).toBe(false);
    expect(file.get().name).toBe('a');
  });

  it('writes immediately when asked to flush, which is what quitting does', () => {
    const file = new PersistedFile<Thing>('thing.json', fallback, revive, 10_000);
    file.set({ name: 'a', count: 1 });
    file.flush();
    expect(existsSync(filePath())).toBe(true);
  });

  it('does not rewrite an unchanged file', () => {
    const file = new PersistedFile<Thing>('thing.json', fallback, revive);
    file.set({ name: 'a', count: 1 });
    file.flush();
    const first = statSync(filePath()).mtimeMs;

    file.flush();
    expect(statSync(filePath()).mtimeMs).toBe(first);
  });
});

describe('the small coercions everything else is built on', () => {
  it('asString takes strings and falls back otherwise', () => {
    expect(asString('a', 'z')).toBe('a');
    expect(asString(undefined, 'z')).toBe('z');
    expect(asString(42, 'z')).toBe('z');
    expect(asString(null, 'z')).toBe('z');
  });

  it('asNumber refuses anything that is not a finite number', () => {
    expect(asNumber(3, 0)).toBe(3);
    expect(asNumber('3', 0)).toBe(0);
    expect(asNumber(Number.NaN, 0)).toBe(0);
    expect(asNumber(Infinity, 0)).toBe(0);
  });

  it('asBoolean takes only real booleans', () => {
    expect(asBoolean(true, false)).toBe(true);
    expect(asBoolean('true', false)).toBe(false);
    expect(asBoolean(1, false)).toBe(false);
  });

  it('isRecord rejects arrays and null, which typeof does not', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });
});
