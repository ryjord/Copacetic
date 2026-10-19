import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let directory = '';
vi.mock('electron', () => ({ app: { getPath: () => directory } }));

const { ProfilesStore, reviveProfiles } = await import('../../../../electron/main/data/profiles-store');

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'copacetic-profiles-'));
});

describe('the list of profiles', () => {
  it('starts with the first profile alone, reopened at launch', () => {
    const store = new ProfilesStore();
    expect(store.list().map((profile) => profile.id)).toEqual(['default']);
    expect(store.openAtQuit()).toEqual(['default']);
  });

  it('adds a profile with an id safe to name a folder with, and keeps it across a restart', () => {
    const store = new ProfilesStore();
    const added = store.add('  Work  ', 'moss');
    store.flush();
    expect(added.id).toMatch(/^[0-9a-f]{12}$/);
    expect(new ProfilesStore().find(added.id)).toEqual({ id: added.id, name: 'Work', colour: 'moss' });
  });

  it('renames and recolours', () => {
    const store = new ProfilesStore();
    const { id } = store.add('Work', 'moss');
    store.update(id, { name: 'Office', colour: 'clay' });
    expect(store.find(id)).toEqual({ id, name: 'Office', colour: 'clay' });
  });

  // Everything from before profiles is in it, so there is nothing to fall back to without it.
  it('never removes the first profile', () => {
    const store = new ProfilesStore();
    expect(store.remove('default')).toBe(false);
    expect(store.find('default')).not.toBeNull();
  });

  it('removes another, and stops reopening it', () => {
    const store = new ProfilesStore();
    const { id } = store.add('Work', 'moss');
    store.setOpenAtQuit(['default', id]);
    expect(store.remove(id)).toBe(true);
    expect(store.find(id)).toBeNull();
    expect(store.openAtQuit()).toEqual(['default']);
  });
});

describe('a profiles file from disk', () => {
  // An id becomes a folder and a partition name, so one that could climb out of either is dropped.
  it.each(['../../escape', 'UPPERCASE123', 'a', '', 'abcdef01234/'])('drops the id %j', (id) => {
    const revived = reviveProfiles({ profiles: [{ id, name: 'Bad', colour: 'moss' }], openAtQuit: [id] });
    expect(revived?.profiles.map((profile) => profile.id)).toEqual(['default']);
    expect(revived?.openAtQuit).toEqual(['default']);
  });

  it('always has the first profile, even when the file left it out', () => {
    const revived = reviveProfiles({ profiles: [{ id: 'abcdef012345', name: 'Work', colour: 'moss' }] });
    expect(revived?.profiles.map((profile) => profile.id)).toEqual(['default', 'abcdef012345']);
  });

  it('keeps one of each id', () => {
    const twice = { id: 'abcdef012345', name: 'Work', colour: 'moss' };
    expect(reviveProfiles({ profiles: [twice, twice] })?.profiles).toHaveLength(2);
  });

  it('mends a bad name or colour rather than dropping the profile', () => {
    const revived = reviveProfiles({ profiles: [{ id: 'abcdef012345', name: 4, colour: 'neon' }] });
    expect(revived?.profiles[1]).toEqual({ id: 'abcdef012345', name: 'Profile', colour: 'ocean' });
  });

  it.each([null, 'nonsense', { profiles: 'no' }])('reads %j as no file at all', (raw) => {
    expect(reviveProfiles(raw)).toBeNull();
  });
});
