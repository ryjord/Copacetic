import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_SITE_DIR } }));

const { SettingsStore } = await import('../../../../electron/main/data/settings-store');
const { SiteSettingsStore } = await import('../../../../electron/main/data/site-settings-store');
const { openDatabase } = await import('../../../../electron/main/data/database');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'copacetic-site-settings-'));
  process.env.COPA_SITE_DIR = dir;
});
// A new connection and a new store each time, which is what a restart is.
const openSettings = () => new SettingsStore(new SiteSettingsStore(openDatabase(path.join(dir, 'copacetic.db'))));
const settingsFile = () => path.join(dir, 'settings.json');

describe('what is kept about particular sites', () => {
  it('survives a restart', () => {
    const settings = openSettings();
    settings.setPermissionDecision('https://maps.example', 'geolocation', 'allow');
    settings.setZoomForOrigin('https://small-print.example', 1.5);
    settings.updateSettings({ blockerAllowlist: ['broken-without-trackers.example'] });
    settings.flush();

    const restarted = openSettings();
    expect(restarted.getPermissionDecision('https://maps.example', 'geolocation')).toBe('allow');
    expect(restarted.getZoomForOrigin('https://small-print.example')).toBe(1.5);
    expect(restarted.getSettings().blockerAllowlist).toEqual(['broken-without-trackers.example']);
  });

  // The file is read before anything else and is the one most likely to be copied about; it should name nowhere.
  it('is never written into settings.json', () => {
    const settings = openSettings();
    settings.setPermissionDecision('https://maps.example', 'geolocation', 'allow');
    settings.setZoomForOrigin('https://small-print.example', 1.5);
    settings.updateSettings({ blockerAllowlist: ['broken-without-trackers.example'], showBookmarksBar: true });
    settings.flush();

    const written = readFileSync(settingsFile(), 'utf8');
    expect(written).not.toMatch(/maps\.example|small-print|broken-without-trackers/);
    expect(JSON.parse(written).showBookmarksBar).toBe(true);
  });

  it('is replaced whole by a patch, which is how a site is forgotten', () => {
    const settings = openSettings();
    settings.setPermissionDecision('https://a.example', 'notifications', 'deny');
    settings.setPermissionDecision('https://b.example', 'notifications', 'allow');
    settings.updateSettings({ permissionDecisions: { 'https://b.example|notifications': 'allow' } });
    expect(openSettings().getSettings().permissionDecisions).toEqual({ 'https://b.example|notifications': 'allow' });
  });

  it('forgets a zoom level that is back at the default rather than storing it', () => {
    const settings = openSettings();
    settings.setZoomForOrigin('https://example.com', 1.25);
    settings.setZoomForOrigin('https://example.com', 1);
    expect(settings.getSettings().zoomLevels).toEqual({});
  });
});

describe('the settings.json an earlier version wrote', () => {
  const legacy = {
    showBookmarksBar: true,
    permissionDecisions: { 'https://maps.example|geolocation': 'allow', 'https://bad.example|notifications': 'deny' },
    zoomLevels: { 'https://small-print.example': 1.5 },
    blockerAllowlist: ['broken-without-trackers.example'],
  };

  it('has what it held about sites moved into the database, and nothing else lost', () => {
    writeFileSync(settingsFile(), JSON.stringify(legacy));
    const settings = openSettings().getSettings();
    expect(settings.permissionDecisions).toEqual(legacy.permissionDecisions);
    expect(settings.zoomLevels).toEqual(legacy.zoomLevels);
    expect(settings.blockerAllowlist).toEqual(legacy.blockerAllowlist);
    expect(settings.showBookmarksBar).toBe(true);
  });

  it('no longer names any site once they have moved', () => {
    writeFileSync(settingsFile(), JSON.stringify(legacy));
    openSettings();
    expect(existsSync(settingsFile())).toBe(true);
    expect(readFileSync(settingsFile(), 'utf8')).not.toMatch(
      /maps\.example|bad\.example|small-print|broken-without-trackers/,
    );
  });

  // Moved once: a second start finds nothing left to move and keeps what the first one moved.
  it('is moved once, however many times the browser starts', () => {
    writeFileSync(settingsFile(), JSON.stringify(legacy));
    openSettings();
    const second = openSettings().getSettings();
    expect(second.permissionDecisions).toEqual(legacy.permissionDecisions);
    expect(second.blockerAllowlist).toEqual(legacy.blockerAllowlist);
  });
});
