import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }));

const { BACKUP_BEFORE_MIGRATION, backUpBeforeMigrating } =
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
