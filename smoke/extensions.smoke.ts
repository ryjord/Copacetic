import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';
import { type LocalSite, startLocalSite } from './support/local-site';

let copacetic: SmokeApp;
let site: LocalSite;
const PROBE = path.resolve('smoke/fixtures/extensions/probe');

beforeAll(async () => {
  site = await startLocalSite();
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
  // The folder dialog and the question before adding, answered as a person would.
  await copacetic.main(({ dialog, session }, folder) => {
    // What the extension's worker says, kept for a failure to report.
    const said: string[] = [];
    Reflect.set(globalThis, 'workerSaid', said);
    const web = session.fromPartition('persist:copacetic-web');
    web.serviceWorkers.on('console-message', (_event, details) => said.push(`${details.level}: ${details.message}`));
    web.serviceWorkers.on('running-status-changed', (details) => said.push(`status ${details.runningStatus}`));
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
  }, PROBE);
});
afterAll(async () => {
  await copacetic?.close();
  await site?.close();
});

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
    const workerSaid = await copacetic.read(() => (Reflect.get(globalThis, 'workerSaid') as string[]).slice(0, 40));
    const logged = readFileSync(path.join(copacetic.profile, 'diagnostics.log'), 'utf8')
      .split('\n')
      .filter((line) => /extension|preload|worker/i.test(line));
    expect(
      isCounted,
      [`badge ${(await probe())?.action?.badgeText ?? 'none'} for ${tabCount} tabs`, ...workerSaid, ...logged].join(
        '\n',
      ),
    ).toBe(true);
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

  // A new one waits in the extensions menu; pinned, it is on the toolbar, and unpinned it goes back.
  it('starts off the toolbar, goes on when pinned, and comes off when unpinned', async () => {
    const id = (await probe())?.id ?? '';
    const name = (await probe())?.action?.title ?? '';
    const isOnToolbar = () =>
      copacetic.chrome.evaluate(
        (title) => [...document.querySelectorAll('button')].some((button) => button.title === title),
        name,
      );
    expect((await probe())?.isPinned).toBe(false);
    expect(await isOnToolbar()).toBe(false);
    expect(
      await copacetic.chrome.evaluate(() => Boolean(document.querySelector('button[aria-label="Extensions"]'))),
    ).toBe(true);
    await copacetic.chrome.evaluate((extensionId) => window.copacetic.extensions.setPinned(extensionId, true), id);
    expect(await copacetic.until(isOnToolbar, 5_000)).toBe(true);
    await copacetic.chrome.evaluate((extensionId) => window.copacetic.extensions.setPinned(extensionId, false), id);
    expect(await copacetic.until(async () => !(await isOnToolbar()), 5_000)).toBe(true);
  }, 30_000);

  /**
   * An extension's own page opened in a tab, as an options page or a dashboard
   * is, gets the API its popup has. Tabs otherwise carry no preload, and the
   * second half is the promise kept: once the tab leaves for a website, the
   * website is in a new view, with none of the extension's bridge.
   */
  it('gives its own page in a tab the extension API, and a website it goes on to none of it', async () => {
    const id = (await probe())?.id ?? '';
    const pageUrl = `chrome-extension://${id}/popup.html`;
    const idsAt = (url: string) =>
      copacetic.read(
        ({ webContents }, target) =>
          webContents
            .getAllWebContents()
            .filter((contents) => contents.getURL() === target)
            .map((contents) => contents.id),
        url,
      );
    // The popup from the test above can still be open at the same address, so the tab's page is the one that is new.
    const popupIds = await idsAt(pageUrl);
    const tabId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), pageUrl);
    let pageId: number | undefined;
    await copacetic.until(async () => {
      pageId = (await idsAt(pageUrl)).find((candidate) => !popupIds.includes(candidate));
      return pageId !== undefined;
    }, 15_000);
    const titleOf = (contentsId: number | undefined) =>
      copacetic.read(({ webContents }, target) => webContents.fromId(target ?? -1)?.getTitle(), contentsId);
    expect(await copacetic.until(async () => (await titleOf(pageId))?.startsWith('active: ') === true, 15_000)).toBe(
      true,
    );

    // Sent by the page itself, the way a link in a dashboard would be.
    const website = `${site.origin}/after-the-extension`;
    await copacetic.read(
      ({ webContents }, options) =>
        webContents
          .fromId(options.pageId ?? -1)
          ?.executeJavaScript(`location.href = ${JSON.stringify(options.website)}`),
      { pageId, website },
    );
    const tabUrl = async () =>
      copacetic.chrome.evaluate(
        async (tab) => (await window.copacetic.chrome.getState()).tabs.find((candidate) => candidate.id === tab)?.url,
        tabId,
      );
    expect(await copacetic.until(async () => (await tabUrl()) === website, 15_000)).toBe(true);
    const seen = await copacetic.inOpenPage<{ hasTabsApi: boolean; hasRuntimeId: boolean }>(
      website,
      '({ hasTabsApi: typeof chrome?.tabs !== "undefined", hasRuntimeId: typeof chrome?.runtime?.id === "string" })',
    );
    const websiteIds = await idsAt(website);

    expect(seen).toEqual({ hasTabsApi: false, hasRuntimeId: false });
    expect(websiteIds).toHaveLength(1);
    expect(websiteIds).not.toContain(pageId);
  }, 60_000);

  it('goes away when removed', async () => {
    const id = (await probe())?.id ?? '';
    await copacetic.chrome.evaluate((extensionId) => window.copacetic.extensions.remove(extensionId), id);
    expect(await probe()).toBeUndefined();
  }, 30_000);
});
