import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }));

const { BACKUP_BEFORE_MIGRATION, IMPORTED_KEPT_FOR_MS, backUpBeforeMigrating, forgetLegacyCopies } =
  await import('../../../../electron/main/data/legacy-import');
const { BrowserStore } = await import('../../../../electron/main/data/store');

let directory = '';

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'copacetic-migration-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const write = (name: string, value: unknown) => writeFileSync(path.join(directory, name), JSON.stringify(value));
const backedUp = (name: string) => path.join(directory, BACKUP_BEFORE_MIGRATION, name);

// 1.x cannot read the database, so this copy is the only way back to it.
describe('the copy taken before a 1.x profile is migrated', () => {
  it('holds every file the migration changes, exactly as it was', () => {
    write('history.json', [{ id: 'a', url: 'https://kept.example/' }]);
    write('settings.json', { theme: 'moss' });
    write('session.json', { tabs: [] });
    expect(backUpBeforeMigrating(directory)).toBe(path.join(directory, BACKUP_BEFORE_MIGRATION));
    expect(JSON.parse(readFileSync(backedUp('history.json'), 'utf8'))).toEqual([
      { id: 'a', url: 'https://kept.example/' },
    ]);
    expect(existsSync(backedUp('settings.json'))).toBe(true);
    expect(existsSync(backedUp('session.json'))).toBe(true);
  });

  it('is taken before the store renames anything', () => {
    write('history.json', [
      {
        id: 'a',
        url: 'https://kept.example/',
        title: 'Kept',
        lastVisitedAt: Date.now(),
        visitCount: 1,
        blockedCount: 0,
      },
    ]);
    new BrowserStore(directory);
    expect(existsSync(path.join(directory, 'history.json.imported'))).toBe(true);
    expect(existsSync(backedUp('history.json'))).toBe(true);
  });

  it('is taken once, not on every launch', () => {
    write('history.json', []);
    backUpBeforeMigrating(directory);
    write('history.json', [{ id: 'changed' }]);
    expect(backUpBeforeMigrating(directory)).toBeNull();
    expect(JSON.parse(readFileSync(backedUp('history.json'), 'utf8'))).toEqual([]);
  });

  it('is not taken for a new profile, or one already on 2.0', () => {
    expect(backUpBeforeMigrating(directory)).toBeNull();
    writeFileSync(path.join(directory, 'copacetic.db'), '');
    write('settings.json', {});
    expect(backUpBeforeMigrating(directory)).toBeNull();
  });
});

// A history.json.imported outlived every clear: history that was cleared was still on disk, in plain text.
describe('what an earlier version left behind', () => {
  const imported = (name: string, ageMs: number) => {
    const file = path.join(directory, name);
    writeFileSync(file, '[]');
    const at = (Date.now() - ageMs) / 1000;
    utimesSync(file, at, at);
    return file;
  };

  it('goes a week after the import, once the database has held', () => {
    const old = imported('history.json.imported', IMPORTED_KEPT_FOR_MS + 60_000);
    const recent = imported('bookmarks.json.imported', 60_000);
    forgetLegacyCopies(directory, { isClearingEverything: false, now: Date.now() });
    expect(existsSync(old)).toBe(false);
    expect(existsSync(recent)).toBe(true);
  });

  it('goes at once, with the copy taken before 2.0, when all history is cleared', () => {
    const recent = imported('history.json.imported', 60_000);
    mkdirSync(path.join(directory, BACKUP_BEFORE_MIGRATION));
    writeFileSync(backedUp('history.json'), '[]');
    forgetLegacyCopies(directory, { isClearingEverything: true, now: Date.now() });
    expect(existsSync(recent)).toBe(false);
    expect(existsSync(path.join(directory, BACKUP_BEFORE_MIGRATION))).toBe(false);
  });

  it('is reached by clearing all history, and not by clearing an hour', () => {
    const store = new BrowserStore(directory);
    mkdirSync(path.join(directory, BACKUP_BEFORE_MIGRATION), { recursive: true });
    const recent = imported('history.json.imported', 60_000);
    store.clearHistory('hour');
    expect(existsSync(recent)).toBe(true);
    store.clearHistory('all');
    expect(existsSync(recent)).toBe(false);
    expect(existsSync(path.join(directory, BACKUP_BEFORE_MIGRATION))).toBe(false);
    store.close();
  });
});
