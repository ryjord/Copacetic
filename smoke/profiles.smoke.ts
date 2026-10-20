import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let workId = '';
afterAll(async () => copacetic?.close());

const until = async (condition: () => Promise<boolean>, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

const windowCount = () =>
  copacetic.read(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((window) => window.isVisible()).length);

/** What a chrome says about its own window's profile, which is the routing being tested. */
const profileIn = (index: number) =>
  copacetic.chromePages()[index]!.evaluate(async () => (await window.copacetic.chrome.getState()).profile.name);

const cookieNamesIn = (partition: string) =>
  copacetic.read(
    async ({ session }, name) => (await session.fromPartition(name).cookies.get({})).map((cookie) => cookie.name),
    partition,
  );

describe('a second profile', () => {
  it('opens in a window of its own, which says whose it is', async () => {
    copacetic = await SmokeApp.launch();
    await copacetic.waitForReady();
    const created = await copacetic.chrome.evaluate(async () => {
      const work = await window.copacetic.profiles.create('Work', 'moss');
      await window.copacetic.profiles.openWindow(work.id);
      return work;
    });
    workId = created.id;
    expect(await until(async () => (await windowCount()) === 2)).toBe(true);
    expect(await until(async () => copacetic.chromePages().length === 2)).toBe(true);
    expect(await until(async () => (await profileIn(1)) === 'Work')).toBe(true);
    expect(await profileIn(0)).toBe('Personal');
  }, 90_000);

  // The whole point: signing in to a site in one profile is not signing in to it in the other.
  it('keeps its cookies apart from the first profile', async () => {
    await copacetic.main(async ({ session }) => {
      await session.fromPartition('persist:copacetic-web').cookies.set({
        url: 'https://example.com',
        name: 'personal-only',
        value: '1',
        expirationDate: Date.now() / 1000 + 3600,
      });
    });
    expect(await cookieNamesIn('persist:copacetic-web')).toContain('personal-only');
    expect(await cookieNamesIn(`persist:copacetic-profile-${workId}-web`)).not.toContain('personal-only');
  }, 30_000);

  it('keeps its own folder', () => {
    expect(existsSync(path.join(copacetic.profile, 'profiles', workId))).toBe(true);
  });

  it('comes back after a restart, alongside the first', async () => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const profile = copacetic.profile;
    await copacetic.close({ keepProfile: true });

    copacetic = await SmokeApp.launch({ profile });
    await copacetic.waitForReady();
    expect(await until(async () => (await windowCount()) === 2)).toBe(true);
    expect(await until(async () => copacetic.chromePages().length === 2)).toBe(true);
    const names = await Promise.all([profileIn(0), profileIn(1)]);
    expect(names.sort()).toEqual(['Personal', 'Work']);
  }, 120_000);

  it('can be removed from the other profile, taking its window and its folder', async () => {
    const pages = copacetic.chromePages();
    const names = await Promise.all(
      pages.map((page) => page.evaluate(async () => (await window.copacetic.chrome.getState()).profile.name)),
    );
    const personal = pages[names.indexOf('Personal')]!;
    expect(await personal.evaluate((id) => window.copacetic.profiles.remove(id), workId)).toBe(true);
    expect(await until(async () => (await windowCount()) === 1)).toBe(true);
    expect(existsSync(path.join(copacetic.profile, 'profiles', workId))).toBe(false);
  }, 60_000);
});
