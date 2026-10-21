import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }));

const { MIGRATIONS, openDatabase } = await import('../../../../electron/main/data/database');

let file: string;

beforeEach(() => {
  file = path.join(mkdtempSync(path.join(tmpdir(), 'copacetic-database-')), 'copacetic.db');
});

const versionOf = (database: DatabaseSync) => database.prepare('PRAGMA user_version').get()?.user_version;

describe('opening the database', () => {
  it('brings a new one up to the latest shape', () => {
    expect(versionOf(openDatabase(file))).toBe(MIGRATIONS.at(-1)?.version);
  });

  it('applies only the steps a database has not had', () => {
    const steps = [
      { version: 1, sql: 'CREATE TABLE one (id INTEGER)' },
      { version: 2, sql: 'CREATE TABLE two (id INTEGER)' },
    ];
    openDatabase(file, steps.slice(0, 1)).close();
    const database = openDatabase(file, steps);
    expect(versionOf(database)).toBe(2);
    expect(database.prepare("SELECT count(*) AS total FROM sqlite_master WHERE name = 'two'").get()?.total).toBe(1);
  });

  // The real steps run over rows an older build wrote, not just over an empty file.
  it('upgrades a populated older database without losing its rows', () => {
    openDatabase(file, MIGRATIONS.slice(0, 1)).close();
    const older = new DatabaseSync(file);
    older
      .prepare('INSERT INTO history (id, url, title, last_visited_at, visit_count) VALUES (?, ?, ?, ?, ?)')
      .run('entry-1', 'https://kept.example/', 'Kept', 1_700_000_000_000, 3);
    older.close();

    const database = openDatabase(file);
    expect(versionOf(database)).toBe(MIGRATIONS.at(-1)?.version);
    expect(database.prepare('SELECT title, visit_count FROM history WHERE id = ?').get('entry-1')).toMatchObject({
      title: 'Kept',
      visit_count: 3,
    });
    expect(database.prepare('SELECT count(*) AS total FROM history').get()?.total).toBe(1);
  });

  it('leaves a database at the last step that worked when a step fails', () => {
    const steps = [
      { version: 1, sql: 'CREATE TABLE one (id INTEGER)' },
      { version: 2, sql: 'CREATE TABLE one (id INTEGER)' },
    ];
    expect(() => openDatabase(file, steps)).toThrow();
    expect(versionOf(new DatabaseSync(file))).toBe(1);
  });

  // A newer build's database is kept, untouched, rather than read as a shape this build can only guess at.
  it('sets aside a database a newer version wrote, and starts fresh', () => {
    const newer = new DatabaseSync(file);
    newer.exec('PRAGMA user_version = 999; CREATE TABLE from_the_future (id INTEGER)');
    newer.close();

    const database = openDatabase(file);
    expect(versionOf(database)).toBe(MIGRATIONS.at(-1)?.version);
    const aside = readdirSync(path.dirname(file)).find((name) => name.startsWith(`${path.basename(file)}.newer-`));
    expect(aside).toMatch(/\.newer-\d+$/);
    expect(versionOf(new DatabaseSync(path.join(path.dirname(file), aside ?? '')))).toBe(999);
  });

  it('knows what the rest of the app means by the same site', () => {
    const database = openDatabase(file);
    const same = (url: string, site: string) =>
      database.prepare('SELECT same_site(?, ?) AS result').get(url, site)?.result;
    expect(same('https://mail.example.com/inbox', 'example.com')).toBe(1);
    expect(same('https://example.com.evil.test/', 'example.com')).toBe(0);
  });
});

// A file SQLite cannot read used to stop the app opening at all, with nothing on screen to say why.
describe('a database that cannot be read', () => {
  it('is kept aside, never deleted, and a fresh one is opened', () => {
    writeFileSync(file, 'this was never a database, and is long enough to look like one to nobody');
    const setAside: string[] = [];
    const database = openDatabase(file, MIGRATIONS, (aside) => setAside.push(aside));

    expect(versionOf(database)).toBe(MIGRATIONS.at(-1)?.version);
    expect(setAside).toHaveLength(1);
    expect(readFileSync(setAside[0]!, 'utf8')).toContain('never a database');
  });

  it('is not set aside when it opens', () => {
    openDatabase(file).close();
    const setAside: string[] = [];
    openDatabase(file, MIGRATIONS, (aside) => setAside.push(aside));
    expect(setAside).toEqual([]);
  });
});
