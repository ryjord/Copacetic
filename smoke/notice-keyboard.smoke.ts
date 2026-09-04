import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

/**
 * A fresh app, deliberately.
 *
 * This is about where the keyboard is, and focus is global state: a test that
 * ran before and clicked into a page leaves it there, and no amount of waiting
 * moves it back. Given its own window the answer is stable, and a stable answer
 * is the only kind worth asserting.
 */
beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

/**
 * A question has a button, and the overlay is a view of its own — focus does
 * not reach it by tabbing from the chrome. Without this the only way to answer
 * is a mouse, which is not a way everyone has.
 */
describe('a question the app asks', () => {
  it('can be answered with the keyboard, and holds it where there is one to hold', async () => {
    await copacetic.chrome.evaluate(async () => {
      const folder = await window.copacetic.bookmarkFolders.create('Keyboard', 'plum', null);
      for (let index = 0; index < 12; index += 1) {
        await window.copacetic.bookmarks.toggle(`https://example.com/k-${index}`, `K ${index}`);
      }
      const saved = await window.copacetic.bookmarks.list();
      for (const bookmark of saved.filter((entry) => entry.url.includes('/k-'))) {
        await window.copacetic.bookmarks.file(bookmark.id, folder.id);
      }
      await window.copacetic.bookmarkFolders.openAsGroup(folder.id);
    });

    /*
     * Sampled as a pair, because either half alone answers the wrong question.
     *
     * Measured on a machine where the app does get focus: the overlay takes it
     * within about 300ms and the window then loses focus repeatedly to whatever
     * else is on the desktop, so an overlay that is not focused at the instant
     * of a sample proves nothing. And on a build machine there is often no
     * desktop handing focus out at all — headless Linux under a virtual
     * display, a Windows runner with no interactive session — where no
     * application can take what is not being given.
     *
     * So this looks for one moment when the window holds the keyboard and the
     * overlay is the part of the window holding it. That is the feature. If the
     * window never holds it, the environment cannot answer and says so rather
     * than failing, which is what it did on two of three platforms for months —
     * and reading as flaky is how the missing Settings item beside it went
     * unnoticed for as long as it did.
     */
    const sample = () =>
      copacetic.main(({ BrowserWindow, webContents }) => ({
        window: BrowserWindow.getAllWindows()[0]?.isFocused() === true,
        overlay: webContents
          .getAllWebContents()
          .filter((contents) => contents.getURL().includes('/overlay'))
          .some((contents) => contents.isFocused()),
      }));

    let windowEverHadIt = false;
    let overlayTookIt = false;
    for (let attempt = 0; attempt < 40 && !overlayTookIt; attempt += 1) {
      const now = await sample();
      windowEverHadIt = windowEverHadIt || now.window;
      overlayTookIt = now.window && now.overlay;
      if (!overlayTookIt) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    if (windowEverHadIt) {
      expect(overlayTookIt).toBe(true);
    }

    await copacetic.overlay.keyboard.press('Tab');
    expect(await copacetic.overlay.evaluate(() => document.activeElement?.textContent ?? '')).toContain('Open');

    await copacetic.overlay.keyboard.press('Enter');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const opened = await copacetic.chrome.evaluate(async () => {
      const state = await window.copacetic.chrome.getState();
      return state.groups.some((group) => group.name === 'Keyboard');
    });
    expect(opened).toBe(true);
  }, 120_000);
});
