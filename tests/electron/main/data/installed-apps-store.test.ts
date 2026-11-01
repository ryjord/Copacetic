import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }));

const { InstalledApps } = await import('../../../../electron/main/data/installed-apps-store');

const fresh = () => new InstalledApps(mkdtempSync(path.join(tmpdir(), 'copacetic-apps-')), () => 1_000);

describe('the sites installed as apps', () => {
  it('installs a site once, however many of its pages ask', () => {
    const apps = fresh();
    const first = apps.install('Mail', 'https://mail.example.com/inbox');
    const again = apps.install('Mail, again', 'https://mail.example.com/sent');
    expect(again?.id).toBe(first?.id);
    expect(apps.list()).toHaveLength(1);
  });

  it('installs only a web page, and names one with no title after its host', () => {
    const apps = fresh();
    expect(apps.install('Files', 'file:///Users/riley')).toBeNull();
    expect(apps.install('   ', 'https://calendar.example.org/')?.name).toBe('calendar.example.org');
  });

  it('forgets one when it is removed', () => {
    const apps = fresh();
    const installed = apps.install('Mail', 'https://mail.example.com/');
    expect(apps.remove(installed?.id ?? '')).toMatchObject({ name: 'Mail' });
    expect(apps.list()).toEqual([]);
  });
});
