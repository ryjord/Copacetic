import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findChromiumProfiles } from '../../../../electron/main/import/chromium-profiles';

let home = '';

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'copacetic-home-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const profile = (root: string, directory: string, file = 'Bookmarks') => {
  mkdirSync(path.join(root, directory), { recursive: true });
  writeFileSync(path.join(root, directory, file), '{}');
};

const onMac = () => findChromiumProfiles({ platform: 'darwin', home, env: {} });

describe('finding other browsers on this computer', () => {
  it('finds nothing where nothing is installed', () => {
    expect(onMac()).toEqual([]);
  });

  it('names a browser with one profile by the browser alone', () => {
    profile(path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'), 'Default');
    expect(onMac().map((found) => [found.id, found.label])).toEqual([['brave:Default', 'Brave']]);
  });

  it('names each of several profiles as their owner did, the default first', () => {
    const root = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
    profile(root, 'Profile 1', 'History');
    profile(root, 'Default');
    writeFileSync(
      path.join(root, 'Local State'),
      JSON.stringify({ profile: { info_cache: { Default: { name: 'Personal' }, 'Profile 1': { name: 'Work' } } } }),
    );
    expect(onMac().map((found) => found.label)).toEqual(['Google Chrome (Personal)', 'Google Chrome (Work)']);
  });

  // System Profile, Crashpad, component folders: none hold bookmarks or history.
  it('ignores folders that are not profiles', () => {
    const root = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
    profile(root, 'Default');
    mkdirSync(path.join(root, 'Crashpad'), { recursive: true });
    expect(onMac()).toHaveLength(1);
  });

  it('looks where each platform keeps application data', () => {
    profile(path.join(home, 'local', 'Microsoft', 'Edge', 'User Data'), 'Default');
    profile(path.join(home, '.config', 'vivaldi'), 'Default');
    expect(
      findChromiumProfiles({ platform: 'win32', home, env: { LOCALAPPDATA: path.join(home, 'local') } }),
    ).toHaveLength(1);
    expect(findChromiumProfiles({ platform: 'linux', home, env: {} }).map((found) => found.label)).toEqual([
      'Vivaldi',
    ]);
  });

  it('survives an unreadable Local State', () => {
    const root = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
    profile(root, 'Default');
    profile(root, 'Profile 2');
    writeFileSync(path.join(root, 'Local State'), 'not json');
    expect(onMac().map((found) => found.label)).toEqual(['Google Chrome (Default)', 'Google Chrome (Profile 2)']);
  });
});
