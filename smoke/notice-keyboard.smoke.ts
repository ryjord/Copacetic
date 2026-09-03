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
  it('takes the keyboard, and can be answered with it', async () => {
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
     * Asked of the main process, not of Playwright: driving a page's keyboard
     * through the debugger works whether or not the view holds focus, so the
     * first version of this passed with the focus call deleted.
     */
    const holdsKeyboard = () =>
      copacetic.main(({ webContents }) =>
        webContents
          .getAllWebContents()
          .filter((contents) => contents.getURL().includes('/overlay'))
          .some((contents) => contents.isFocused()),
      );

    let focused = false;
    for (let attempt = 0; attempt < 25 && !focused; attempt += 1) {
      focused = await holdsKeyboard();
      if (!focused) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    expect(focused).toBe(true);

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
