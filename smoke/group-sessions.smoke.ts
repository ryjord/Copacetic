import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let groupId: string;

// Electron writes a partition's folder in lower case; group ids are mixed case.
const partitionDirectory = (profile: string, id: string) =>
  path.join(profile, 'Partitions', `copacetic-group-${id}`.toLowerCase());

/** The cookies a group's own session holds, read from the real session in the main process. */
const groupCookies = (id: string) =>
  copacetic.read(
    async ({ session }, partition) =>
      (await session.fromPartition(partition).cookies.get({})).map((cookie) => cookie.name),
    `persist:copacetic-group-${id}`,
  );

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

/**
 * A group that keeps its own browsing promised "its own cookies and logins" and
 * kept that promise only for tabs opened in it later. The tab it was made from
 * stayed in the shared session. "Clear everything" then reached only the shared
 * session, and deleting the group left its session on disk for good.
 */
describe('a group with its own session', () => {
  it('moves the tab it was made from into that session', async () => {
    groupId = await copacetic.chrome.evaluate(async () => {
      const tabId = await window.copacetic.tabs.create('https://example.com/grouped');
      return window.copacetic.groups.create(tabId, 'Isolated', 'moss', true);
    });
    expect(
      await copacetic.waitForChrome(async () => {
        const state = await window.copacetic.chrome.getState();
        return state.tabs.some((tab) => tab.url.includes('grouped') && tab.groupId !== null && !tab.isLoading);
      }, 30_000),
    ).toBe(true);

    // The tab moves by getting a new page, so the old one may still be closing when this first looks.
    const isInGroupSession = () =>
      copacetic.read(({ session, webContents }, partition) => {
        const group = session.fromPartition(partition);
        return webContents
          .getAllWebContents()
          .some(
            (contents) =>
              !contents.isDestroyed() && contents.getURL().includes('/grouped') && contents.session === group,
          );
      }, `persist:copacetic-group-${groupId}`);
    const deadline = Date.now() + 15_000;
    let inGroupSession = await isInGroupSession();
    while (!inGroupSession && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      inGroupSession = await isInGroupSession();
    }
    expect(inGroupSession).toBe(true);
    // The directory name the startup sweep relies on.
    expect(existsSync(partitionDirectory(copacetic.profile, groupId))).toBe(true);
  }, 120_000);

  it('loses its cookies when everything is cleared', async () => {
    await copacetic.inOpenPage(
      'https://example.com/grouped',
      `document.cookie = 'grouped=1; max-age=3600; path=/', true`,
    );
    expect(await groupCookies(groupId)).toContain('grouped');

    await copacetic.chrome.evaluate(() => window.copacetic.history.clear('all'));
    expect(await groupCookies(groupId)).toEqual([]);
  }, 120_000);

  it('leaves nothing on disk once the group is gone and the browser restarts', async () => {
    // A cookie set again after the clear above, so ungrouping has something of its own to remove.
    await copacetic.inOpenPage(
      'https://example.com/grouped',
      `document.cookie = 'ungrouped=1; max-age=3600; path=/', true`,
    );
    expect(await groupCookies(groupId)).toContain('ungrouped');
    await copacetic.chrome.evaluate((id) => window.copacetic.groups.remove(id), groupId);
    // Its tab leaves the group's session for the shared one, so the session is no longer in use.
    expect(
      await copacetic.waitForChrome(async () => {
        const state = await window.copacetic.chrome.getState();
        return state.groups.length === 0;
      }),
    ).toBe(true);
    // Cleared now, not at the next launch.
    const deadline = Date.now() + 10_000;
    while ((await groupCookies(groupId)).length > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(await groupCookies(groupId)).toEqual([]);

    const profile = copacetic.profile;
    await copacetic.close({ keepProfile: true });
    copacetic = await SmokeApp.launch({ profile });
    await copacetic.waitForReady();

    expect(existsSync(partitionDirectory(profile, groupId))).toBe(false);
  }, 180_000);
});
