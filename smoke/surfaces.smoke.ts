import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
  await copacetic.chrome.evaluate(async () => {
    await window.copacetic.tabs.create('https://example.com/first');
    await window.copacetic.tabs.create('https://example.com/second');
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));
});
afterAll(async () => copacetic?.close());

const surfaceOpen = () => copacetic.chrome.evaluate(() => document.body.innerText.includes('Kept on this machine'));

const pageVisible = () =>
  copacetic.main(({ BrowserWindow }) =>
    (BrowserWindow.getAllWindows()[0]?.contentView.children ?? []).some((view) => view.getVisible?.() === true),
  );

/**
 * Reaching for a tab is asking to see it.
 *
 * A surface covers the whole content area and hides every page view. Measured
 * before this was fixed: clicking a tab with History open switched to it and
 * highlighted it in the strip, and showed nothing — the browser looked like it
 * had ignored the click, and the only way out was the close button.
 */
describe('a surface when a tab is chosen', () => {
  it('gets out of the way, and the page comes back', async () => {
    await copacetic.chrome.getByRole('button', { name: 'History' }).click();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await surfaceOpen()).toBe(true);
    // The surface is up, so nothing is showing the page.
    expect(await pageVisible()).toBe(false);

    // A tab with a real page in it. The start page is drawn by the chrome and
    // has no view of its own, so switching to that one correctly shows nothing
    // and would prove nothing here.
    await copacetic.chrome
      .getByRole('tab', { name: /Example/ })
      .first()
      .click();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(await surfaceOpen()).toBe(false);
    // And the page it switched to is actually on screen, which is the whole
    // point: closing the surface without showing the page would look the same
    // from the DOM and be just as useless.
    expect(await pageVisible()).toBe(true);
  }, 120_000);

  /*
   * The counterweight. A surface that closed on any state change at all would
   * pass the test above and be impossible to use — every keystroke in its
   * search field would shut it.
   */
  it('stays open while it is being used', async () => {
    await copacetic.chrome.getByRole('button', { name: 'History' }).click();
    await new Promise((resolve) => setTimeout(resolve, 1200));

    await copacetic.chrome.getByRole('textbox', { name: /Search history/ }).fill('example');
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(await surfaceOpen()).toBe(true);
  }, 90_000);
});
