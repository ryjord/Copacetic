import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const PROBE = path.resolve('smoke/fixtures/extensions/probe');

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
  // The folder dialog and the question before adding, answered as a person would.
  await copacetic.main(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
  }, PROBE);
});
afterAll(async () => copacetic?.close());

const probe = async () =>
  (await copacetic.chrome.evaluate(() => window.copacetic.extensions.list())).find(
    (extension) => extension.name === 'Copacetic smoke probe',
  );

describe('an extension', () => {
  it('is added from a folder and starts', async () => {
    expect(await copacetic.chrome.evaluate(() => window.copacetic.extensions.addFromFolder())).toBe('');
    expect(await copacetic.until(async () => (await probe()) !== undefined, 10_000)).toBe(true);
  }, 60_000);

  // The count reaches the badge only through tabs.query, its events and action.setBadgeText, all supplied here.
  it('sees the tabs, follows them, and changes its own toolbar button', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com/one'));
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com/two'));
    const tabCount = await copacetic.chrome.evaluate(
      async () => (await window.copacetic.chrome.getState()).tabs.length,
    );
    const isCounted = await copacetic.until(
      async () => (await probe())?.action?.badgeText === String(tabCount),
      30_000,
    );
    expect(isCounted, `badge ${(await probe())?.action?.badgeText ?? 'none'} for ${tabCount} tabs`).toBe(true);
  }, 60_000);

  it('never sees a Hush tab', async () => {
    const before = (await probe())?.action?.badgeText;
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.createHush());
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect((await probe())?.action?.badgeText).toBe(before);
  }, 60_000);

  it('opens its popup, which can ask which tab is in front', async () => {
    const id = (await probe())?.id ?? '';
    await copacetic.chrome.evaluate(async () => {
      const state = await window.copacetic.chrome.getState();
      const ordinary = state.tabs.find((tab) => tab.url === 'https://example.com/two');
      if (ordinary) {
        await window.copacetic.tabs.activate(ordinary.id);
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await copacetic.chrome.evaluate(
      (extensionId) => window.copacetic.extensions.press(extensionId, 600, 640, 90),
      id,
    );
    const popupTitle = () =>
      copacetic.read(
        ({ webContents }, extensionId) =>
          webContents
            .getAllWebContents()
            .find((contents) => contents.getURL() === `chrome-extension://${extensionId}/popup.html`)
            ?.getTitle(),
        id,
      );
    const isAnswered = await copacetic.until(
      async () => (await popupTitle())?.startsWith('active: ') === true,
      15_000,
    );
    // On failure, every page open, so the reason is in the report rather than another run away.
    const pages = await copacetic.read(({ webContents }) =>
      webContents.getAllWebContents().map((contents) => `${contents.getURL()} ${contents.getTitle()}`),
    );
    expect(isAnswered, pages.join('\n')).toBe(true);
    expect(await popupTitle()).toBe('active: https://example.com/two');
  }, 60_000);

  it('goes away when removed', async () => {
    const id = (await probe())?.id ?? '';
    await copacetic.chrome.evaluate((extensionId) => window.copacetic.extensions.remove(extensionId), id);
    expect(await probe()).toBeUndefined();
  }, 30_000);
});
