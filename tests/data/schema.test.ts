import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let dataDir = '';
vi.mock('electron', () => ({ app: { getPath: () => dataDir } }));

const { SchemaVersions, assertUsablePlan, forgetSchemaVersions, migrate, schemaVersionsFor } =
  await import('../../electron/main/data/schema');
const { PersistedFile } = await import('../../electron/main/data/persistence');

const renameKey = (from: string, to: string) => ({
  to: 2,
  describe: `renamed ${from} to ${to}`,
  up: (raw: unknown) => {
    const record = raw as Record<string, unknown>;
    const { [from]: moved, ...rest } = record;
    return { ...rest, [to]: moved };
  },
});

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'copacetic-schema-'));
  forgetSchemaVersions();
});
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

describe('a plan has to describe an unbroken path', () => {
  it('accepts a file whose shape has never changed', () => {
    expect(() => assertUsablePlan({ current: 1, steps: [] })).not.toThrow();
  });

  it('accepts consecutive steps', () => {
    expect(() =>
      assertUsablePlan({
        current: 3,
        steps: [
          { to: 2, describe: 'a', up: (raw) => raw },
          { to: 3, describe: 'b', up: (raw) => raw },
        ],
      }),
    ).not.toThrow();
  });

  // A gap means an upgrade skips a step without saying so, which is how a file
  // ends up half-converted.
  it('refuses a plan with a hole in it', () => {
    expect(() =>
      assertUsablePlan({ current: 3, steps: [{ to: 3, describe: 'jumps the queue', up: (raw) => raw }] }),
    ).toThrow(/steps must run/);
  });

  it('refuses steps that do not reach the current version', () => {
    expect(() => assertUsablePlan({ current: 4, steps: [{ to: 2, describe: 'a', up: (raw) => raw }] })).toThrow();
  });
});

describe('bringing a file up to date', () => {
  it('leaves a file already at the current version alone', () => {
    const outcome = migrate({ kept: 1 }, 1, { current: 1, steps: [] });
    expect(outcome).toEqual({ status: 'current', data: { kept: 1 } });
  });

  it('applies the step a file is behind by', () => {
    const outcome = migrate({ old: 'value' }, 1, { current: 2, steps: [renameKey('old', 'new')] });
    expect(outcome.status).toBe('migrated');
    expect(outcome.status === 'migrated' && outcome.data).toEqual({ new: 'value' });
  });

  it('applies every step in order when a file is several versions behind', () => {
    const order: string[] = [];
    const step = (to: number) => ({
      to,
      describe: `to ${to}`,
      up: (raw: unknown) => {
        order.push(`to ${to}`);
        return raw;
      },
    });
    const outcome = migrate({}, 1, { current: 4, steps: [step(2), step(3), step(4)] });

    expect(order).toEqual(['to 2', 'to 3', 'to 4']);
    expect(outcome.status === 'migrated' && outcome.from).toBe(1);
  });

  // Half-migrating is worse than not migrating.
  it('skips the steps a file has already had', () => {
    const ran: number[] = [];
    const step = (to: number) => ({
      to,
      describe: `to ${to}`,
      up: (raw: unknown) => {
        ran.push(to);
        return raw;
      },
    });
    migrate({}, 2, { current: 4, steps: [step(2), step(3), step(4)] });
    expect(ran).toEqual([3, 4]);
  });

  /**
   * The downgrade case: someone rolls back a release and an older build meets a
   * file it does not understand. Guessing is how a password manager loses
   * passwords, so it refuses.
   */
  it('refuses a file written by a newer version rather than guessing', () => {
    const outcome = migrate({ from: 'the future' }, 5, { current: 2, steps: [renameKey('a', 'b')] });
    expect(outcome).toEqual({ status: 'from-a-newer-version', found: 5 });
  });
});

describe('the record of what version each file is at', () => {
  it('treats a file it has never heard of as the first version', () => {
    expect(new SchemaVersions(dataDir).versionOf('anything.json')).toBe(1);
  });

  it('remembers what it was told, across a reload', () => {
    new SchemaVersions(dataDir).record('settings.json', 4);
    expect(new SchemaVersions(dataDir).versionOf('settings.json')).toBe(4);
  });

  it('shares one record per profile directory', () => {
    expect(schemaVersionsFor(dataDir)).toBe(schemaVersionsFor(dataDir));
  });

  // Losing this file means every file looks like the first version, which is
  // what they all were before any of this existed.
  it('falls back to the first version when its own file is unreadable', () => {
    writeFileSync(path.join(dataDir, 'schema.json'), 'not json at all', 'utf8');
    expect(new SchemaVersions(dataDir).versionOf('settings.json')).toBe(1);
  });

  it('ignores entries that are not sensible versions', () => {
    writeFileSync(
      path.join(dataDir, 'schema.json'),
      JSON.stringify({ 'good.json': 3, 'bad.json': 'two', 'silly.json': 0 }),
      'utf8',
    );
    const versions = new SchemaVersions(dataDir);
    expect(versions.versionOf('good.json')).toBe(3);
    expect(versions.versionOf('bad.json')).toBe(1);
    expect(versions.versionOf('silly.json')).toBe(1);
  });
});

describe('a persisted file that has changed shape', () => {
  const plan = { current: 2, steps: [renameKey('name', 'title')] };
  const revive = (raw: unknown) => (raw && typeof raw === 'object' ? (raw as { title?: string }) : null);

  it('migrates what is on disk when it is read', () => {
    writeFileSync(path.join(dataDir, 'thing.json'), JSON.stringify({ name: 'a bookmark' }), 'utf8');

    const file = new PersistedFile('thing.json', () => ({}) as { title?: string }, revive, 10, plan);
    expect(file.get().title).toBe('a bookmark');
  });

  it('writes it back in the new shape, so it is migrated once and not every time', async () => {
    writeFileSync(path.join(dataDir, 'thing.json'), JSON.stringify({ name: 'a bookmark' }), 'utf8');

    new PersistedFile('thing.json', () => ({}) as { title?: string }, revive, 10, plan);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(JSON.parse(readFileSync(path.join(dataDir, 'thing.json'), 'utf8'))).toEqual({ title: 'a bookmark' });
    expect(schemaVersionsFor(dataDir).versionOf('thing.json')).toBe(2);
  });

  it('does not migrate a file that is already current', () => {
    writeFileSync(path.join(dataDir, 'thing.json'), JSON.stringify({ title: 'already right' }), 'utf8');
    schemaVersionsFor(dataDir).record('thing.json', 2);

    const file = new PersistedFile('thing.json', () => ({}) as { title?: string }, revive, 10, plan);
    expect(file.get().title).toBe('already right');
  });

  it('keeps a file from a newer version instead of overwriting it', () => {
    writeFileSync(path.join(dataDir, 'thing.json'), JSON.stringify({ somethingNew: true }), 'utf8');
    schemaVersionsFor(dataDir).record('thing.json', 9);

    const file = new PersistedFile('thing.json', () => ({ title: 'fresh' }), revive, 10, plan);

    expect(file.get().title).toBe('fresh');
    expect(JSON.parse(readFileSync(path.join(dataDir, 'thing.json.newer'), 'utf8'))).toEqual({ somethingNew: true });
  });
});

/**
 * The record saying how to read every other file was written the plain way —
 * no flush to the disk, no permissions, no retry — while the data it describes
 * had all three. The note was less safe than the files it explains, which is
 * the wrong way round: losing it makes every store look like its first version.
 */
describe('how the version record reaches the disk', () => {
  it('is readable only by the person it belongs to', () => {
    const versions = schemaVersionsFor(dataDir);
    versions.record('thing.json', 3);

    const mode = statSync(path.join(dataDir, 'schema.json')).mode & 0o777;
    expect(mode.toString(8)).toBe('600');
  });

  it('leaves no temporary file behind', () => {
    const versions = schemaVersionsFor(dataDir);
    versions.record('thing.json', 2);
    const leftovers = readFileSync(path.join(dataDir, 'schema.json'), 'utf8');
    expect(leftovers).toContain('thing.json');
    expect(readdirSync(dataDir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('reads back what it recorded', () => {
    const versions = schemaVersionsFor(dataDir);
    versions.record('thing.json', 4);
    forgetSchemaVersions();
    expect(schemaVersionsFor(dataDir).versionOf('thing.json')).toBe(4);
  });
});
