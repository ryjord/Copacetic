import { afterAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
afterAll(async () => copacetic?.close());

const KEPT = 'https://example.com/before-the-crash';

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

const pendingNotices = () => copacetic.chrome.evaluate(() => window.copacetic.notices.pending());

const isOpenAnywhere = () =>
  copacetic.main(
    ({ webContents }, url) => webContents.getAllWebContents().some((contents) => contents.getURL() === url),
    KEPT,
  );

/**
 * With reopening turned off, a crash used to take every tab with it: the next
 * launch started fresh, as asked, though nobody asked to lose them.
 */
describe('after a crash, with reopening tabs turned off', () => {
  it('offers the tabs back', async () => {
    copacetic = await SmokeApp.launch();
    await copacetic.waitForReady();
    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ restoreTabsOnLaunch: false }));
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), KEPT);
    // Past the session file's debounce, so the tab is on disk when the process dies.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const profile = copacetic.profile;
    await copacetic.crash();

    copacetic = await SmokeApp.launch({ profile });
    await copacetic.waitForReady();
    expect(await isOpenAnywhere()).toBe(false);
    expect(
      await until(async () => (await pendingNotices()).some((notice) => notice.id === 'reopen-after-crash')),
    ).toBe(true);
  }, 120_000);

  it('reopens them when asked', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.notices.answer('reopen-after-crash', true));
    expect(await until(isOpenAnywhere)).toBe(true);
  }, 60_000);

  // A quit is not a crash: someone who asked to start fresh is not asked again.
  it('does not ask after an ordinary quit', async () => {
    const profile = copacetic.profile;
    await copacetic.close({ keepProfile: true });

    copacetic = await SmokeApp.launch({ profile });
    await copacetic.waitForReady();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect((await pendingNotices()).some((notice) => notice.id === 'reopen-after-crash')).toBe(false);
  }, 120_000);
});
