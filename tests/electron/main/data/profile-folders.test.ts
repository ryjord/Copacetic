import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }));

const { profileDirectory, sweepRemovedProfiles } = await import('../../../../electron/main/data/profile-folders');

let appData = '';

beforeEach(() => {
  appData = mkdtempSync(path.join(tmpdir(), 'copacetic-app-data-'));
});

afterEach(() => {
  rmSync(appData, { recursive: true, force: true });
});

const make = (...parts: string[]) => mkdirSync(path.join(appData, ...parts), { recursive: true });
const has = (...parts: string[]) => existsSync(path.join(appData, ...parts));

describe('where a profile keeps its things', () => {
  // Everything from before profiles is already there, so the first one must not move.
  it.each([
    { name: "keeps the first profile in the app's own folder", id: 'default', folder: () => appData },
    {
      name: 'gives every other profile a folder of its own',
      id: 'abcdef012345',
      folder: () => path.join(appData, 'profiles', 'abcdef012345'),
    },
  ])('$name', ({ id, folder }) => {
    expect(profileDirectory(appData, id)).toBe(folder());
  });
});

describe('what a removed profile left behind', () => {
  it('is deleted: its folder and its sessions', () => {
    make('profiles', 'aaaaaaaaaaaa');
    make('Partitions', 'copacetic-profile-aaaaaaaaaaaa-web');
    make('Partitions', 'copacetic-profile-aaaaaaaaaaaa-group-xyz');
    sweepRemovedProfiles(appData, ['default']);
    expect(has('profiles', 'aaaaaaaaaaaa')).toBe(false);
    expect(has('Partitions', 'copacetic-profile-aaaaaaaaaaaa-web')).toBe(false);
    expect(has('Partitions', 'copacetic-profile-aaaaaaaaaaaa-group-xyz')).toBe(false);
  });

  it('leaves every live profile, and the first profile, alone', () => {
    make('profiles', 'bbbbbbbbbbbb');
    make('Partitions', 'copacetic-profile-bbbbbbbbbbbb-web');
    make('Partitions', 'copacetic-web');
    make('Partitions', 'copacetic-group-abc');
    sweepRemovedProfiles(appData, ['default', 'bbbbbbbbbbbb']);
    expect(has('profiles', 'bbbbbbbbbbbb')).toBe(true);
    expect(has('Partitions', 'copacetic-profile-bbbbbbbbbbbb-web')).toBe(true);
    expect(has('Partitions', 'copacetic-web')).toBe(true);
    expect(has('Partitions', 'copacetic-group-abc')).toBe(true);
  });

  it('copes with a first launch, when neither folder exists', () => {
    expect(() => sweepRemovedProfiles(appData, ['default'])).not.toThrow();
  });
});
