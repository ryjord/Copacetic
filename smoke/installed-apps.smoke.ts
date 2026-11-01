import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';
import { type LocalSite, startLocalSite } from './support/local-site';

let copacetic: SmokeApp;
let site: LocalSite;
// Stands in for the home and application data folders, so a run never writes a shortcut anywhere real.
const folders = mkdtempSync(path.join(tmpdir(), 'copacetic-app-shortcuts-'));

beforeAll(async () => {
  site = await startLocalSite((request, response) => {
    response
      .writeHead(200, { 'content-type': 'text/html' })
      .end(`<!doctype html><title>Mail</title><p>${request.url}</p>`);
  });
  copacetic = await SmokeApp.launch({
    args: [`--host-resolver-rules=MAP elsewhere.example 127.0.0.1:${new URL(site.origin).port}`],
  });
  await copacetic.waitForReady();
  await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ httpsFirst: false }));
  await copacetic.main(({ app }, folder) => {
    app.setPath('home', folder);
    app.setPath('appData', folder);
  }, folders);
});
afterAll(async () => {
  await copacetic?.close();
  await site?.close();
  rmSync(folders, { recursive: true, force: true });
});

const windowCount = () => copacetic.main(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

/** Every shortcut written under the stand-in folders, found the way a system would list it. */
function shortcutsWritten(): string[] {
  const found: string[] = [];
  const walk = (directory: string) =>
    readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(directory, entry.name);
      if (/\.(app|lnk|desktop)$/.test(entry.name)) {
        found.push(full);
      } else if (entry.isDirectory()) {
        walk(full);
      }
    });
  walk(folders);
  return found;
}

/**
 * A site installed as an app opens in a window of its own, with a shortcut
 * where the system lists apps, and keeps to its site; only the real app,
 * its windows and the file system can show all three.
 */
describe('a site installed as an app', () => {
  it('opens in a window of its own, writes its shortcut, and sends another site to the browser', async () => {
    const page = `${site.origin}/inbox`;
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), page);
    await copacetic.inOpenPage(page, 'document.readyState');
    const before = await windowCount();
    // The browser tab stays on the same address, so the app's page is told apart by id, not by URL.
    const pagesAt = (address: string) =>
      copacetic.main(
        ({ webContents }, wanted) =>
          webContents
            .getAllWebContents()
            .filter((contents) => contents.getURL() === wanted)
            .map((contents) => contents.id),
        address,
      );
    const browserPages = await pagesAt(page);

    await copacetic.chrome.evaluate(() => window.copacetic.apps.installActive());
    expect(await copacetic.until(async () => (await windowCount()) === before + 1, 15_000)).toBe(true);
    expect(await copacetic.until(async () => shortcutsWritten().length === 1, 10_000), folders).toBe(true);
    const appPageId = async () => (await pagesAt(page)).find((id) => !browserPages.includes(id));
    expect(await copacetic.until(async () => (await appPageId()) !== undefined, 15_000)).toBe(true);
    const appPage = await appPageId();

    // The app window's page, sent to another site the way a link would send it.
    await copacetic.main(({ webContents }, id) => {
      void webContents.fromId(id)?.executeJavaScript(`location.href = 'http://elsewhere.example/from-the-app'`);
    }, appPage ?? -1);
    const browserTabs = () =>
      copacetic.chrome.evaluate(async () => (await window.copacetic.chrome.getState()).tabs.map((tab) => tab.url));
    expect(
      await copacetic.until(
        async () => (await browserTabs()).some((url) => url.includes('elsewhere.example')),
        15_000,
      ),
    ).toBe(true);
    // The other site opened in the browser, and the app stayed where it was.
    const appUrl = await copacetic.main(
      ({ webContents }, id) => webContents.fromId(id)?.getURL() ?? '',
      appPage ?? -1,
    );
    expect(appUrl).toBe(page);
  }, 90_000);

  it('closes its window and deletes its shortcut when removed', async () => {
    const [installed] = await copacetic.chrome.evaluate(() => window.copacetic.apps.list());
    const before = await windowCount();
    await copacetic.chrome.evaluate((id) => window.copacetic.apps.remove(id), installed?.id ?? '');
    expect(await copacetic.until(async () => (await windowCount()) === before - 1, 15_000)).toBe(true);
    expect(shortcutsWritten()).toEqual([]);
    expect(existsSync(folders)).toBe(true);
  }, 60_000);
});
