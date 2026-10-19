import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findFirefoxProfiles, profileSections } from '../../../../electron/main/import/firefox-profiles';

let home = '';

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'copacetic-home-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const firefoxOnLinux = (ini: string, profiles: string[]) => {
  const root = path.join(home, '.mozilla', 'firefox');
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'profiles.ini'), ini);
  profiles.forEach((profile) => {
    mkdirSync(path.join(root, profile), { recursive: true });
    writeFileSync(path.join(root, profile, 'places.sqlite'), '');
  });
};

describe('reading profiles.ini', () => {
  it('keeps the profile sections and ignores the rest', () => {
    const sections = profileSections(
      '[General]\r\nStartWithLastProfile=1\r\n\r\n[Profile0]\r\nName=default-release\r\nPath=abc.default-release\r\n[Install4F96]\r\nDefault=abc',
    );
    expect(sections).toEqual([{ Name: 'default-release', Path: 'abc.default-release' }]);
  });
});

describe('finding Firefox on this computer', () => {
  it('finds nothing where Firefox is not installed', () => {
    expect(findFirefoxProfiles({ platform: 'linux', home, env: {} })).toEqual([]);
  });

  it('names one profile by the browser alone, and several by their names', () => {
    firefoxOnLinux('[Profile0]\nName=Personal\nIsRelative=1\nPath=one.default\n', ['one.default']);
    expect(findFirefoxProfiles({ platform: 'linux', home, env: {} }).map((profile) => profile.label)).toEqual([
      'Firefox',
    ]);

    firefoxOnLinux(
      '[Profile0]\nName=Personal\nIsRelative=1\nPath=one.default\n[Profile1]\nName=Work\nIsRelative=1\nPath=two.work\n',
      ['one.default', 'two.work'],
    );
    expect(findFirefoxProfiles({ platform: 'linux', home, env: {} }).map((profile) => profile.label)).toEqual([
      'Firefox (Personal)',
      'Firefox (Work)',
    ]);
  });

  it('skips a profile with no places database', () => {
    firefoxOnLinux('[Profile0]\nName=Empty\nIsRelative=1\nPath=empty\n', []);
    expect(findFirefoxProfiles({ platform: 'linux', home, env: {} })).toEqual([]);
  });
});
