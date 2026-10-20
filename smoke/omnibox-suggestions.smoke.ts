import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const VISITED = 'https://example.com/omnibox-target';

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
  // Visited first, so typing part of it brings it back from history.
  await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), VISITED);
  await copacetic.inOpenPage(VISITED, 'document.readyState');
});
afterAll(async () => copacetic?.close());

/** Every view's URL, bounds and visibility, read from Electron itself. */
const layers = () =>
  copacetic.read(({ BrowserWindow }) =>
    (BrowserWindow.getAllWindows()[0]?.contentView.children ?? []).map((view) => ({
      url: 'webContents' in view ? (view as Electron.WebContentsView).webContents.getURL() : '',
      bounds: view.getBounds(),
      isVisible: view.getVisible?.() === true,
    })),
  );

const until = async (condition: () => Promise<boolean>, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

// By its address, because the row offering to search for the same words matches the words too.
const suggestionFor = () => copacetic.leading.locator('button', { hasText: 'example.com/omnibox-target' }).first();

/**
 * The list was chrome, so the page was resized to make room for it and laid
 * out again as results arrived: a relayout of whatever you were reading on
 * nearly every keystroke. It is drawn over the page now.
 */
describe('address suggestions', () => {
  it('appear over the page as you type, without moving it', async () => {
    const before = (await layers()).find((layer) => layer.url === VISITED)?.bounds;
    // Opened the way Cmd+L opens it, which is the path that has to move the keyboard from the page to the field.
    await copacetic.chooseMenuItem('Open address bar');
    await copacetic.chrome.keyboard.type('omnibox-target');

    expect(await until(async () => (await suggestionFor().count()) > 0)).toBe(true);
    expect(
      await until(async () =>
        (await layers()).some((layer) => layer.url.includes('region=leading') && layer.isVisible),
      ),
    ).toBe(true);
    expect((await layers()).find((layer) => layer.url === VISITED)?.bounds).toEqual(before);
  }, 90_000);

  // The field must keep the keyboard while its list is drawn somewhere else.
  it('leave the keyboard in the address field', async () => {
    const isWithChrome = await copacetic.keyboardIsWith((url) => url === 'copacetic-app://chrome/');
    if (isWithChrome !== null) {
      expect(isWithChrome).toBe(true);
    }
    expect(await copacetic.chrome.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('combobox');
  }, 60_000);

  it('go where they say when one is clicked, and then get out of the way', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com/elsewhere'));
    await copacetic.inOpenPage('https://example.com/elsewhere', 'document.readyState');
    await copacetic.chrome.getByRole('button', { name: 'Address and search' }).click();
    await copacetic.chrome.keyboard.type('omnibox-target');
    expect(await until(async () => (await suggestionFor().count()) > 0)).toBe(true);

    await suggestionFor().click();
    const isThere = await until(async () =>
      copacetic.chrome.evaluate(async (url) => {
        const state = await window.copacetic.chrome.getState();
        return state.tabs.find((tab) => tab.id === state.activeTabId)?.url === url;
      }, 'https://example.com/omnibox-target'),
    );
    expect(isThere).toBe(true);
    expect(
      await until(async () =>
        (await layers()).every((layer) => !layer.url.includes('region=leading') || !layer.isVisible),
      ),
    ).toBe(true);
  }, 90_000);
});
